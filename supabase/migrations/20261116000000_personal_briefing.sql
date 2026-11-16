-- 27단계(개인브리핑, docs/SPEC_personal_briefing.md 6~7장)
-- 데이터는 지우지 않는다. briefings 고유키만 (date, class_id, student_id) → (date, class_id, student_id, kind)로 넓힌다.

-- 1) 학생: 부르는 이름(비면 앱이 이름에서 자동으로 만든다)
alter table public.students add column if not exists call_name text;

-- 2) 보낸 기록 종류: class(전체브리핑) / personal(개인브리핑). 기존 행은 모두 class
alter table public.briefings add column if not exists kind text not null default 'class';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'briefings_kind_check') then
    alter table public.briefings add constraint briefings_kind_check check (kind in ('class', 'personal'));
  end if;
end;
$$;
alter table public.briefings drop constraint if exists briefings_date_class_id_student_id_key;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'briefings_date_class_id_student_id_kind_key') then
    alter table public.briefings add constraint briefings_date_class_id_student_id_kind_key unique (date, class_id, student_id, kind);
  end if;
end;
$$;

-- 3) 개인 문구 저장소: 수업 코드당 1개, {이름} 자리 포함
create table if not exists public.personal_briefing_texts (
  code text primary key check (length(code) between 1 and 40),
  text text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
drop trigger if exists touch_row on public.personal_briefing_texts;
create trigger touch_row before insert or update on public.personal_briefing_texts
  for each row execute function public.touch_row();
alter table public.personal_briefing_texts enable row level security;
revoke all on public.personal_briefing_texts from anon;
drop policy if exists "members only" on public.personal_briefing_texts;
create policy "members only" on public.personal_briefing_texts for all to authenticated
  using ((select private.is_member())) with check ((select private.is_member()));

-- 4) 백업 복원에 부르는 이름·기록 종류·개인 문구 추가(나머지는 20261112000000과 같음)
create or replace function public.replace_roster(p_data jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare k text;
begin
  foreach k in array array['classes', 'students', 'student_siblings', 'enrollments', 'counseling_notes',
                           'waitlist', 'trial_lessons', 'absences']
  loop
    if not (p_data ? k) then
      raise exception 'missing collection: %', k;
    end if;
  end loop;

  delete from public.sim_drafts where true; -- 시안 반·아이는 함께 지워진다(cascade)
  delete from public.briefings where true;
  delete from public.basic_lesson_plans where true;
  delete from public.class_progress_anchors where true;
  delete from public.makeup_bookings where true;
  delete from public.absences where true;
  delete from public.trial_lessons where true;
  delete from public.waitlist where true;
  delete from public.counseling_notes where true;
  delete from public.enrollments where true;
  delete from public.student_siblings where true;
  delete from public.students where true;
  delete from public.classes where true;

  insert into public.classes (id, weekday, start_time, grade_code, grade_basis_year, alias, opened_on, closed_on, memo)
  select id, weekday, start_time, grade_code, grade_basis_year, alias, opened_on, closed_on, memo
  from jsonb_populate_recordset(null::public.classes, p_data -> 'classes');

  insert into public.students (id, name, gender, birthday, grade_code, grade_basis_year, grade_adjust, school,
                               student_phone, guardians, address, registered_on, first_class_on, status,
                               status_from, status_to, leave_reason, availability, notice, needs_review, kakao_search, call_name)
  select id, name, gender, birthday, grade_code, grade_basis_year, coalesce(grade_adjust, 0), school,
         student_phone, coalesce(guardians, '[]'::jsonb), address, registered_on, first_class_on,
         coalesce(status, 'active'), status_from, status_to, leave_reason, coalesce(availability, '{}'::jsonb),
         notice, coalesce(needs_review, false), kakao_search, call_name
  from jsonb_populate_recordset(null::public.students, p_data -> 'students');

  insert into public.student_siblings (student_id, sibling_id)
  select student_id, sibling_id
  from jsonb_populate_recordset(null::public.student_siblings, p_data -> 'student_siblings');

  insert into public.enrollments (id, student_id, class_id, start_date, end_date)
  select id, student_id, class_id, start_date, end_date
  from jsonb_populate_recordset(null::public.enrollments, p_data -> 'enrollments');

  insert into public.counseling_notes (id, student_id, date, type, content, next_contact_on)
  select id, student_id, date, type, coalesce(content, ''), next_contact_on
  from jsonb_populate_recordset(null::public.counseling_notes, p_data -> 'counseling_notes');

  insert into public.waitlist (id, name, grade_code, grade_basis_year, birthday, guardian, wish, inquired_on,
                               source, stage, stage_history, memo, student_id, wish_start_month)
  select id, name, grade_code, grade_basis_year, birthday, guardian, coalesce(wish, '{}'::jsonb), inquired_on,
         source, coalesce(stage, 'inquiry'), coalesce(stage_history, '[]'::jsonb), memo, student_id, wish_start_month
  from jsonb_populate_recordset(null::public.waitlist, p_data -> 'waitlist');

  insert into public.trial_lessons (id, date, class_id, waitlist_id, name, memo, start_time, grade_code, grade_basis_year)
  select id, date, class_id, waitlist_id, coalesce(name, ''), memo, start_time, grade_code, grade_basis_year
  from jsonb_populate_recordset(null::public.trial_lessons, p_data -> 'trial_lessons');

  insert into public.absences (date, class_id, student_id)
  select date, class_id, student_id
  from jsonb_populate_recordset(null::public.absences, p_data -> 'absences');

  insert into public.makeup_bookings (id, student_id, date, start_time, memo)
  select id, student_id, date, start_time, memo
  from jsonb_populate_recordset(null::public.makeup_bookings, coalesce(p_data -> 'makeup_bookings', '[]'::jsonb));

  insert into public.class_progress_anchors (id, class_id, course_month, stage, unit, unit_week, memo)
  select id, class_id, course_month, stage, unit, coalesce(unit_week, 1), memo
  from jsonb_populate_recordset(null::public.class_progress_anchors, coalesce(p_data -> 'class_progress_anchors', '[]'::jsonb));

  insert into public.basic_lesson_plans (id, class_id, date, title, text)
  select id, class_id, date, coalesce(title, ''), coalesce(text, '')
  from jsonb_populate_recordset(null::public.basic_lesson_plans, coalesce(p_data -> 'basic_lesson_plans', '[]'::jsonb));

  -- 문구 저장소는 반·학생과 연결이 없다. 예전 백업(문구 없음)을 복원해도 지금 문구는 남긴다
  if p_data ? 'briefing_texts' then
    delete from public.briefing_texts where true;
    insert into public.briefing_texts (code, text)
    select code, coalesce(text, '')
    from jsonb_populate_recordset(null::public.briefing_texts, p_data -> 'briefing_texts');
  end if;

  insert into public.briefings (id, date, class_id, student_id, kind, code, text_snapshot, shared_at, shared_by)
  select id, date, class_id, student_id, coalesce(kind, 'class'), code, coalesce(text_snapshot, ''), coalesce(shared_at, now()), shared_by
  from jsonb_populate_recordset(null::public.briefings, coalesce(p_data -> 'briefings', '[]'::jsonb));

  -- 27단계 개인 문구. 예전 백업(없음)을 복원해도 지금 문구는 남긴다
  if p_data ? 'personal_briefing_texts' then
    delete from public.personal_briefing_texts where true;
    insert into public.personal_briefing_texts (code, text)
    select code, coalesce(text, '')
    from jsonb_populate_recordset(null::public.personal_briefing_texts, p_data -> 'personal_briefing_texts');
  end if;

  -- 4단계 시안. 예전 백업에는 없으므로 없으면 빈 목록
  insert into public.sim_drafts (id, name, base_date, source_draft_id, status, grade_view, memo, edited_at,
                                 applied_at, applied_summary, base_snapshot)
  select id, name, base_date, null, coalesce(status, 'editing'), coalesce(grade_view, 'current'), memo,
         coalesce(edited_at, now()), applied_at, applied_summary, coalesce(base_snapshot, '{"classes":[],"members":[]}'::jsonb)
  from jsonb_populate_recordset(null::public.sim_drafts, coalesce(p_data -> 'sim_drafts', '[]'::jsonb));
  update public.sim_drafts d set source_draft_id = r.source_draft_id
  from jsonb_populate_recordset(null::public.sim_drafts, coalesce(p_data -> 'sim_drafts', '[]'::jsonb)) r
  where d.id = r.id and r.source_draft_id is not null
    and exists (select 1 from public.sim_drafts x where x.id = r.source_draft_id);

  insert into public.sim_classes (id, draft_id, source_class_id, weekday, start_time, grade_code, grade_basis_year,
                                  alias, memo, removed, merged_into, start_stage, start_unit)
  select id, draft_id, source_class_id, weekday, start_time, grade_code, grade_basis_year,
         alias, memo, coalesce(removed, false), merged_into, start_stage, start_unit
  from jsonb_populate_recordset(null::public.sim_classes, coalesce(p_data -> 'sim_classes', '[]'::jsonb));

  insert into public.sim_members (id, draft_id, sim_class_id, student_id, waitlist_id, temp_name, tag, memo)
  select id, draft_id, sim_class_id, student_id, waitlist_id, temp_name, coalesce(tag, 'keep'), memo
  from jsonb_populate_recordset(null::public.sim_members, coalesce(p_data -> 'sim_members', '[]'::jsonb));

  -- 5단계: 출석 확인(반이 지워지며 함께 지워짐). 예전 백업에는 없으면 빈 목록
  insert into public.attendance_checks (date, class_id, checked_at, checked_by)
  select date, class_id, coalesce(checked_at, now()), checked_by
  from jsonb_populate_recordset(null::public.attendance_checks, coalesce(p_data -> 'attendance_checks', '[]'::jsonb));

  -- 할 일·할 일 상태는 반·학생과 연결이 없다. 예전 백업(없음)을 복원해도 지금 것은 남긴다
  if p_data ? 'tasks' then
    delete from public.tasks where true;
    insert into public.tasks (id, title, due_date, memo, category, created_at, created_by)
    select id, title, due_date, memo, category, coalesce(created_at, now()), created_by
    from jsonb_populate_recordset(null::public.tasks, p_data -> 'tasks');
  end if;
  if p_data ? 'task_templates' then
    delete from public.task_templates where true;
    insert into public.task_templates (id, title, description, category, recurrence, lead_days, enabled, sort, memo)
    select id, title, description, category, recurrence, coalesce(lead_days, 0), coalesce(enabled, true), coalesce(sort, 0), memo
    from jsonb_populate_recordset(null::public.task_templates, p_data -> 'task_templates');
  end if;
  if p_data ? 'task_states' then
    delete from public.task_states where true;
    insert into public.task_states (task_key, status, snooze_until, memo, done_at, done_by)
    select task_key, status, snooze_until, memo, done_at, done_by
    from jsonb_populate_recordset(null::public.task_states, p_data -> 'task_states');
  end if;
  -- 26단계 할 일 달력. 예전 백업(없음)을 복원해도 지금 것은 남긴다
  if p_data ? 'todos' then
    delete from public.todos where true;
    insert into public.todos (id, date, text, done, starred, sort, created_by)
    select id, date, text, coalesce(done, false), coalesce(starred, false), coalesce(sort, 0), created_by
    from jsonb_populate_recordset(null::public.todos, p_data -> 'todos');
  end if;
end;
$$;

revoke all on function public.replace_roster(jsonb) from public, anon;
grant execute on function public.replace_roster(jsonb) to authenticated;
