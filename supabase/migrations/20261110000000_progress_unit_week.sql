-- 진도 기준점에 주차 추가: "이 수업월 1회차 = B1-3"처럼 단원 중간에서 시작할 수 있게.
-- 추가만 한다. 기존 기준점은 주차 1(지금과 똑같이 계산)이 된다.

alter table public.class_progress_anchors
  add column if not exists unit_week smallint not null default 1 check (unit_week between 1 and 4);

-- 백업 복원: 주차 칸 반영(예전 백업에는 없으므로 없으면 1)
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
end;
$$;

revoke all on function public.replace_roster(jsonb) from public, anon;
grant execute on function public.replace_roster(jsonb) to authenticated;

-- 시안 적용: 기준점 주차 칸 반영
create or replace function public.apply_sim_draft(p_draft_id uuid, p_change jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status text;
  v_draft jsonb;
  t text;
  cols text[];
  col_list text;
  set_list text;
  -- 실행 순서: 참조되는 표부터
  tables constant text[] := array['classes', 'students', 'enrollments', 'counseling_notes', 'waitlist',
                                  'trial_lessons', 'class_progress_anchors', 'basic_lesson_plans'];
begin
  -- 같은 시안을 두 번 적용하지 않게 잠그고 확인
  select status into v_status from public.sim_drafts where id = p_draft_id for update;
  if not found then
    raise exception 'draft not found';
  end if;
  if v_status <> 'editing' then
    raise exception 'draft is not editable (status: %)', v_status;
  end if;

  foreach t in array tables
  loop
    if jsonb_array_length(coalesce(p_change -> 'upsert' -> t, '[]'::jsonb)) = 0 then
      continue;
    end if;
    cols := case t
      when 'classes' then array['id', 'weekday', 'start_time', 'grade_code', 'grade_basis_year', 'alias', 'opened_on', 'closed_on', 'memo']
      when 'students' then array['id', 'name', 'gender', 'birthday', 'grade_code', 'grade_basis_year', 'grade_adjust', 'school',
                                 'student_phone', 'guardians', 'address', 'registered_on', 'first_class_on', 'status',
                                 'status_from', 'status_to', 'leave_reason', 'availability', 'notice', 'needs_review', 'kakao_search']
      when 'enrollments' then array['id', 'student_id', 'class_id', 'start_date', 'end_date']
      when 'counseling_notes' then array['id', 'student_id', 'date', 'type', 'content', 'next_contact_on']
      when 'waitlist' then array['id', 'name', 'grade_code', 'grade_basis_year', 'birthday', 'guardian', 'wish', 'inquired_on',
                                 'source', 'stage', 'stage_history', 'memo', 'student_id']
      when 'trial_lessons' then array['id', 'date', 'class_id', 'waitlist_id', 'name', 'memo', 'start_time', 'grade_code', 'grade_basis_year']
      when 'class_progress_anchors' then array['id', 'class_id', 'course_month', 'stage', 'unit', 'unit_week', 'memo']
      when 'basic_lesson_plans' then array['id', 'class_id', 'date', 'title', 'text']
    end;
    select string_agg(format('%I', c), ', '), string_agg(format('%I = excluded.%I', c, c), ', ')
      into col_list, set_list
      from unnest(cols) as c;
    execute format(
      'insert into public.%1$I (%2$s) select %2$s from jsonb_populate_recordset(null::public.%1$I, $1) on conflict (id) do update set %3$s',
      t, col_list, set_list)
    using p_change -> 'upsert' -> t;
  end loop;

  -- 시작 전에 끝나는 배정은 지운다
  delete from public.enrollments
  where id in (select (x ->> 'id')::uuid from jsonb_array_elements(coalesce(p_change -> 'remove' -> 'enrollments', '[]'::jsonb)) x);

  -- 시안: 적용됨 + 적용 시각·결과 요약(이후 읽기 전용)
  v_draft := p_change -> 'upsert' -> 'sim_drafts' -> 0;
  update public.sim_drafts
     set status = 'applied',
         applied_at = coalesce((v_draft ->> 'applied_at')::timestamptz, now()),
         applied_summary = v_draft -> 'applied_summary',
         edited_at = now()
   where id = p_draft_id;
end;
$$;

revoke all on function public.apply_sim_draft(uuid, jsonb) from public, anon;
grant execute on function public.apply_sim_draft(uuid, jsonb) to authenticated;
