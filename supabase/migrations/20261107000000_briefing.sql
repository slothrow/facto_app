-- 3단계: 교육과정 진도 + 수업 후 브리핑 (docs/SPEC_briefing.md 8장)
-- 추가만 한다. 기존 테이블·데이터는 바꾸지 않는다(students에 빈 칸 하나 추가).
-- 단계 순서·접두어·기본 학년은 settings.data 안(curriculum)에 저장하므로 테이블을 만들지 않는다.

-- 1) 학생: 카톡 대화방 검색어(비우면 이름 사용)
alter table public.students add column if not exists kakao_search text;

-- 2) 반 진도 기준점: 이 수업월에 이 단계 몇 단원. 베이직은 단원 없음
create table if not exists public.class_progress_anchors (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  course_month text not null check (course_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  stage text not null check (stage in ('basic', 'K', 'P', 'A', 'B', 'S')),
  unit smallint check (unit between 1 and 12),
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  unique (class_id, course_month),
  check ((stage = 'basic') = (unit is null))
);

-- 3) 베이직 수업 계획: (반, 날짜)별 제목·브리핑 문구. 선생님이 미리 적는다
create table if not exists public.basic_lesson_plans (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  date date not null,
  title text not null default '',
  text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  unique (class_id, date)
);

-- 4) 브리핑 문구 저장소: 수업 코드당 문구 1개(아이 이름 없음)
create table if not exists public.briefing_texts (
  code text primary key check (length(code) between 1 and 40),
  text text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

-- 5) 보낸 기록: 실제로 보낸 문구 그대로 남긴다
create table if not exists public.briefings (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  class_id uuid not null references public.classes (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  code text not null,
  text_snapshot text not null,
  shared_at timestamptz not null default now(),
  shared_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  unique (date, class_id, student_id)
);
create index if not exists briefings_student_idx on public.briefings (student_id);

-- 수정 시각·수정한 사람 자동 기록 + 등록자만 접근(RLS)
do $$
declare t text;
begin
  foreach t in array array['class_progress_anchors', 'basic_lesson_plans', 'briefing_texts', 'briefings']
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

-- 6) 백업 복원 함수에 새 열·표 반영. 예전 백업에는 새 표가 없으므로 없으면 빈 목록으로 본다.
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
end;
$$;

revoke all on function public.replace_roster(jsonb) from public, anon;
grant execute on function public.replace_roster(jsonb) to authenticated;
