-- 4단계: 시안 적용(docs/SPEC_simulator.md 7.3)
-- 앱이 계산한 적용 계획(planApply → 추가·수정할 행, 지울 배정)을 한 번에 실행한다.
-- 전부 성공하거나 전부 취소(함수 하나 = 트랜잭션 하나). security invoker라서 기존 RLS(private.is_member())가 그대로 적용된다.
-- 추가만 하는 변경: 새 함수 하나.

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
      when 'class_progress_anchors' then array['id', 'class_id', 'course_month', 'stage', 'unit', 'memo']
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
