-- 6단계-②: 반·학생·대기자·체험·결석 테이블 + 모든 테이블 보안 규칙을 is_member() 방식으로 교체
-- 표 구조는 docs/SPEC_students.md 10장, 보안은 11장과 같다.
-- 적용 전에 app_members에 두 계정이 등록돼 있어야 한다(…_members.sql 참고).

-- ---------------------------------------------------------------
-- 1) 테이블
--    id는 앱에서 만든다(crypto.randomUUID). 비어 있으면 DB가 만든다.
--    학년 코드(grade_code) = SPEC 2.1의 n: 4=5세, 5=6세, 6=7세, 7=초1 … 10=초4
-- ---------------------------------------------------------------

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  weekday smallint not null check (weekday between 1 and 5),
  start_time text not null check (start_time ~ '^([01]\d|2[0-3]):[0-5]0$'),
  grade_code smallint not null check (grade_code between 4 and 10),
  grade_basis_year smallint not null,
  alias text,
  opened_on date,
  closed_on date,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  gender text check (gender in ('M', 'F')),
  birthday date,
  grade_code smallint check (grade_code between 1 and 13),
  grade_basis_year smallint,
  grade_adjust smallint not null default 0 check (grade_adjust between -1 and 1),
  school text,
  student_phone text check (student_phone ~ '^\d*$'),
  -- [{ name, relation: 'mom'|'dad'|'other', phone(숫자만), is_primary }] 최대 2개
  guardians jsonb not null default '[]'::jsonb check (jsonb_typeof(guardians) = 'array' and jsonb_array_length(guardians) <= 2),
  address text,
  registered_on date,
  first_class_on date,
  status text not null default 'active' check (status in ('active', 'paused', 'left')),
  status_from date,
  status_to date,
  leave_reason text,
  -- { "1": "15:00", "3": null } = 월 15시 이후, 수 아무 때나. 없는 요일은 불가
  availability jsonb not null default '{}'::jsonb check (jsonb_typeof(availability) = 'object'),
  notice text,
  needs_review boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

-- 형제자매: 한 쌍을 한 줄로(작은 id가 student_id). 양방향 조회는 앱에서 한다.
create table if not exists public.student_siblings (
  student_id uuid not null references public.students (id) on delete cascade,
  sibling_id uuid not null references public.students (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (student_id, sibling_id),
  check (student_id < sibling_id)
);

create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  -- 반은 삭제하지 않고 폐반 처리하므로, 배정 기록이 있는 반은 지울 수 없게 막는다
  class_id uuid not null references public.classes (id) on delete restrict,
  start_date date not null,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  check (end_date is null or end_date >= start_date)
);
create index if not exists enrollments_student_idx on public.enrollments (student_id);
create index if not exists enrollments_class_idx on public.enrollments (class_id);

create table if not exists public.counseling_notes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  date date not null,
  type text not null check (type in ('new', 'regular', 'parent', 'move', 'other')),
  content text not null default '',
  next_contact_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
create index if not exists counseling_notes_student_idx on public.counseling_notes (student_id);

create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  grade_code smallint check (grade_code between 1 and 13),
  grade_basis_year smallint,
  birthday date,
  -- { name, relation, phone }
  guardian jsonb,
  -- students.availability와 같은 모양
  wish jsonb not null default '{}'::jsonb check (jsonb_typeof(wish) = 'object'),
  inquired_on date,
  source text check (source in ('referral', 'blog', 'flyer', 'other')),
  stage text not null default 'inquiry' check (stage in ('inquiry', 'trial_booked', 'trial_done', 'enrolled', 'dropped')),
  -- [{ stage, date }]
  stage_history jsonb not null default '[]'::jsonb check (jsonb_typeof(stage_history) = 'array'),
  memo text,
  student_id uuid references public.students (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
create index if not exists waitlist_student_idx on public.waitlist (student_id);

create table if not exists public.trial_lessons (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  class_id uuid references public.classes (id) on delete restrict,
  waitlist_id uuid references public.waitlist (id) on delete set null,
  name text not null default '',
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
create index if not exists trial_lessons_class_idx on public.trial_lessons (class_id);
create index if not exists trial_lessons_waitlist_idx on public.trial_lessons (waitlist_id);

create table if not exists public.absences (
  date date not null,
  class_id uuid not null references public.classes (id) on delete restrict,
  student_id uuid not null references public.students (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (date, class_id, student_id)
);
create index if not exists absences_student_idx on public.absences (student_id);
create index if not exists absences_class_idx on public.absences (class_id);

-- ---------------------------------------------------------------
-- 2) 누가 언제 바꿨는지 자동 기록 (1단계와 같은 touch_row 함수)
-- ---------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['classes', 'students', 'student_siblings', 'enrollments', 'counseling_notes',
                           'waitlist', 'trial_lessons', 'absences']
  loop
    execute format('drop trigger if exists touch_row on public.%I', t);
    execute format('create trigger touch_row before insert or update on public.%I
                    for each row execute function public.touch_row()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------
-- 3) 보안 규칙: 1단계·2단계 모든 테이블을 "로그인 + app_members 등록자"만으로 제한
--    예전 규칙("logged in users" = 로그인만 하면 허용)은 지운다.
-- ---------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['settings', 'track_anchors', 'custom_holidays', 'closures',
                           'session_overrides', 'makeup_overrides', 'month_plans', 'export_history',
                           'classes', 'students', 'student_siblings', 'enrollments', 'counseling_notes',
                           'waitlist', 'trial_lessons', 'absences']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop policy if exists "logged in users" on public.%I', t);
    execute format('drop policy if exists "members only" on public.%I', t);
    execute format('create policy "members only" on public.%I
                    for all to authenticated
                    using ((select public.is_member()))
                    with check ((select public.is_member()))', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------
-- 4) 2단계 데이터 전체 교체(백업 복원용). 한 번에 처리되어 실패하면 전부 취소된다.
--    security invoker → 위 보안 규칙이 그대로 적용된다.
--    p_data = { "classes": [...], "students": [...], ... } (DB 열 이름 그대로)
-- ---------------------------------------------------------------

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

  -- 참조하는 쪽부터 지운다
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
                               status_from, status_to, leave_reason, availability, notice, needs_review)
  select id, name, gender, birthday, grade_code, grade_basis_year, coalesce(grade_adjust, 0), school,
         student_phone, coalesce(guardians, '[]'::jsonb), address, registered_on, first_class_on,
         coalesce(status, 'active'), status_from, status_to, leave_reason, coalesce(availability, '{}'::jsonb),
         notice, coalesce(needs_review, false)
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

  insert into public.trial_lessons (id, date, class_id, waitlist_id, name, memo)
  select id, date, class_id, waitlist_id, coalesce(name, ''), memo
  from jsonb_populate_recordset(null::public.trial_lessons, p_data -> 'trial_lessons');

  insert into public.absences (date, class_id, student_id)
  select date, class_id, student_id
  from jsonb_populate_recordset(null::public.absences, p_data -> 'absences');
end;
$$;

revoke all on function public.replace_roster(jsonb) from public, anon;
grant execute on function public.replace_roster(jsonb) to authenticated;
