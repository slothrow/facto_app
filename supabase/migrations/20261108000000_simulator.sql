-- 4단계: 반 편성 시뮬레이터 (docs/SPEC_simulator.md 8장)
-- 추가만 한다. 기존 테이블·데이터는 바꾸지 않는다.
-- 운영 시간대는 settings.data 안(operatingHours)에 저장하므로 테이블을 만들지 않는다(교육과정 설정과 같은 방식).

-- 1) 시안
create table if not exists public.sim_drafts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  base_date date not null,
  source_draft_id uuid references public.sim_drafts (id) on delete set null,
  status text not null default 'editing' check (status in ('editing', 'applied', 'archived')),
  grade_view text not null default 'current' check (grade_view in ('current', 'next')),
  memo text,
  -- 반·아이를 고쳐도 앱이 함께 바꾸는 "마지막 수정" 시각
  edited_at timestamptz not null default now(),
  applied_at timestamptz,
  -- { option, lines[] }
  applied_summary jsonb,
  -- 시안을 만들 때의 실제 반·배정 { classes[], members[] } (변경 목록·바뀐 내용 비교용)
  base_snapshot jsonb not null default '{"classes":[],"members":[]}'::jsonb check (jsonb_typeof(base_snapshot) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

-- 2) 시안 반
create table if not exists public.sim_classes (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.sim_drafts (id) on delete cascade,
  -- 원래 실제 반(시안에서 새로 만든 반이면 null)
  source_class_id uuid references public.classes (id) on delete set null,
  weekday smallint not null check (weekday between 1 and 5),
  start_time text not null check (start_time ~ '^([01]\d|2[0-3]):[0-5]0$'),
  grade_code smallint check (grade_code between 1 and 13),
  grade_basis_year smallint,
  alias text,
  memo text,
  removed boolean not null default false,
  merged_into uuid references public.sim_classes (id) on delete set null,
  start_stage text check (start_stage in ('basic', 'K', 'P', 'A', 'B', 'S')),
  start_unit smallint check (start_unit between 1 and 12),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
create index if not exists sim_classes_draft_idx on public.sim_classes (draft_id);
create index if not exists sim_classes_source_idx on public.sim_classes (source_class_id);
create index if not exists sim_classes_merged_idx on public.sim_classes (merged_into);

-- 3) 시안 아이: 학생 / 대기자 / 임시 이름 중 하나
create table if not exists public.sim_members (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.sim_drafts (id) on delete cascade,
  sim_class_id uuid not null references public.sim_classes (id) on delete cascade,
  student_id uuid references public.students (id) on delete cascade,
  waitlist_id uuid references public.waitlist (id) on delete cascade,
  temp_name text,
  tag text not null default 'keep' check (tag in ('keep', 'move', 'leaving', 'new', 'undecided')),
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  check (num_nonnulls(student_id, waitlist_id, temp_name) = 1)
);
create index if not exists sim_members_draft_idx on public.sim_members (draft_id);
create index if not exists sim_members_class_idx on public.sim_members (sim_class_id);
create index if not exists sim_members_student_idx on public.sim_members (student_id);
create index if not exists sim_members_waitlist_idx on public.sim_members (waitlist_id);
create index if not exists sim_drafts_source_idx on public.sim_drafts (source_draft_id);

-- 수정 시각·수정한 사람 자동 기록 + 등록자만 접근(RLS)
do $$
declare t text;
begin
  foreach t in array array['sim_drafts', 'sim_classes', 'sim_members']
  loop
    execute format('drop trigger if exists touch_row on public.%I', t);
    execute format('create trigger touch_row before insert or update on public.%I
                    for each row execute function public.touch_row()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop policy if exists "members only" on public.%I', t);
    execute format('create policy "members only" on public.%I for all to authenticated
                    using ((select private.is_member())) with check ((select private.is_member()))', t);
  end loop;
end;
$$;

-- 4) 백업 복원 함수에 시안 표 반영
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
                               source, stage, stage_history, memo, student_id)
  select id, name, grade_code, grade_basis_year, birthday, guardian, coalesce(wish, '{}'::jsonb), inquired_on,
         source, coalesce(stage, 'inquiry'), coalesce(stage_history, '[]'::jsonb), memo, student_id
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

  insert into public.class_progress_anchors (id, class_id, course_month, stage, unit, memo)
  select id, class_id, course_month, stage, unit, memo
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
end;
$$;

revoke all on function public.replace_roster(jsonb) from public, anon;
grant execute on function public.replace_roster(jsonb) to authenticated;
