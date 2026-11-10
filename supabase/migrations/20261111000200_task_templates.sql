-- 5단계(SPEC_home 4.4, 4.5): 반복 할 일 템플릿(매월·매년·행사 기준) + 초기 템플릿.
-- 추가만 한다. 등록자만 접근(RLS + private.is_member()).
-- recurrence(앱과 같은 모양): {"type":"monthly","day":1~31|"last"}, {"type":"yearly","month":m,"day":d},
--                              {"type":"event","keyword":"페스티벌","offsetDays":-42}

create table if not exists public.task_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 200),
  description text,
  category text not null check (category in ('운영', '행사', '세무', '홍보')),
  recurrence jsonb not null check (recurrence ->> 'type' in ('monthly', 'yearly', 'event')),
  lead_days smallint not null default 7 check (lead_days between 0 and 60),
  enabled boolean not null default true,
  sort integer not null default 0,
  memo text,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

drop trigger if exists touch_row on public.task_templates;
create trigger touch_row before insert or update on public.task_templates
  for each row execute function public.touch_row();
alter table public.task_templates enable row level security;
revoke all on public.task_templates from anon;
drop policy if exists "members only" on public.task_templates;
create policy "members only" on public.task_templates for all to authenticated
  using ((select private.is_member())) with check ((select private.is_member()));

-- 초기 템플릿(모두 수정 가능). 이미 템플릿이 있으면 넣지 않는다
insert into public.task_templates (title, category, recurrence, lead_days, sort)
select * from (values
    ('교육비 발송(랠리즈)', '운영', '{"type": "monthly", "day": "last"}'::jsonb, 3, 1),
    ('보강데이 예약 정리', '운영', '{"type": "monthly", "day": 25}'::jsonb, 3, 2),
    ('신규생 모집 공지(블로그·인스타)', '홍보', '{"type": "yearly", "month": 11, "day": 1}'::jsonb, 7, 3),
    ('신규 대기자 연락·신규반 개설', '운영', '{"type": "yearly", "month": 11, "day": 15}'::jsonb, 7, 4),
    ('새 학기 반 편성 시작(편성 시안)', '운영', '{"type": "yearly", "month": 11, "day": 15}'::jsonb, 7, 5),
    ('겨울방학 휴원 일정 등록·공지', '운영', '{"type": "yearly", "month": 11, "day": 20}'::jsonb, 7, 6),
    ('어머니교실 준비', '행사', '{"type": "yearly", "month": 1, "day": 20}'::jsonb, 14, 7),
    ('사업장현황신고', '세무', '{"type": "yearly", "month": 2, "day": 10}'::jsonb, 14, 8),
    ('어린이날 행사 준비', '행사', '{"type": "yearly", "month": 4, "day": 10}'::jsonb, 14, 9),
    ('EGG 마스터즈 접수 안내(날짜 확인)', '행사', '{"type": "yearly", "month": 4, "day": 25}'::jsonb, 7, 10),
    ('종합소득세 신고', '세무', '{"type": "yearly", "month": 5, "day": 31}'::jsonb, 14, 11),
    ('9월 개강반 모집 공지', '홍보', '{"type": "yearly", "month": 6, "day": 15}'::jsonb, 7, 12),
    ('여름방학 보드게임 특강 공지', '행사', '{"type": "yearly", "month": 7, "day": 10}'::jsonb, 7, 13),
    ('페스티벌 준비·안내', '행사', '{"type": "event", "keyword": "페스티벌", "offsetDays": -42}'::jsonb, 7, 14),
    ('할로윈 행사 준비', '행사', '{"type": "yearly", "month": 10, "day": 15}'::jsonb, 7, 15),
    ('크리스마스 행사 준비', '행사', '{"type": "yearly", "month": 12, "day": 10}'::jsonb, 7, 16)
) as v(title, category, recurrence, lead_days, sort)
where not exists (select 1 from public.task_templates);

-- 백업 복원에 반복 할 일 반영(예전 백업에 없으면 지금 것을 남긴다)
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
                               status_from, status_to, leave_reason, availability, notice, needs_review, kakao_search)
  select id, name, gender, birthday, grade_code, grade_basis_year, coalesce(grade_adjust, 0), school,
         student_phone, coalesce(guardians, '[]'::jsonb), address, registered_on, first_class_on,
         coalesce(status, 'active'), status_from, status_to, leave_reason, coalesce(availability, '{}'::jsonb),
         notice, coalesce(needs_review, false), kakao_search
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

  insert into public.briefings (id, date, class_id, student_id, code, text_snapshot, shared_at, shared_by)
  select id, date, class_id, student_id, code, coalesce(text_snapshot, ''), coalesce(shared_at, now()), shared_by
  from jsonb_populate_recordset(null::public.briefings, coalesce(p_data -> 'briefings', '[]'::jsonb));

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
end;
$$;

revoke all on function public.replace_roster(jsonb) from public, anon;
grant execute on function public.replace_roster(jsonb) to authenticated;
