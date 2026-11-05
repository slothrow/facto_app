-- 6단계-③: is_member()를 API로 노출되지 않는 private 스키마로 옮긴다.
-- (public 스키마의 함수는 /rest/v1/rpc/is_member 로 누구나 부를 수 있어 Security Advisor 경고가 뜬다)
-- 보안 규칙("members only")은 그대로이고, 확인 함수 위치만 바뀐다.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_members where user_id = (select auth.uid()));
$$;

revoke all on function private.is_member() from public, anon;
grant execute on function private.is_member() to authenticated;

do $$
declare t text;
begin
  foreach t in array array['settings', 'track_anchors', 'custom_holidays', 'closures',
                           'session_overrides', 'makeup_overrides', 'month_plans', 'export_history',
                           'classes', 'students', 'student_siblings', 'enrollments', 'counseling_notes',
                           'waitlist', 'trial_lessons', 'absences']
  loop
    execute format('drop policy if exists "members only" on public.%I', t);
    execute format('create policy "members only" on public.%I
                    for all to authenticated
                    using ((select private.is_member()))
                    with check ((select private.is_member()))', t);
  end loop;
end;
$$;

drop function if exists public.is_member();

create index if not exists student_siblings_sibling_idx on public.student_siblings (sibling_id);
