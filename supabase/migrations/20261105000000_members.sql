-- 6단계-①: 앱 사용자 명단(app_members)과 is_member() 함수
-- 이 파일은 명단 표와 함수만 만든다. 보안 규칙 교체는 다음 파일(…_students.sql)에서 한다.
-- 순서: 이 파일 적용 → 두 계정 등록(supabase/members.sql.example 참고) → 다음 파일 적용.
-- (명단이 비어 있는 상태에서 규칙을 바꾸면 두 계정 모두 데이터가 안 보이게 된다)

create table if not exists public.app_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  role text not null default 'member' check (role in ('owner', 'developer', 'member')),
  created_at timestamptz not null default now()
);

alter table public.app_members enable row level security;
revoke all on public.app_members from anon;
-- 앱에서는 내 행만 읽을 수 있다. 추가·삭제는 대시보드 SQL Editor에서만 한다.
drop policy if exists "read own row" on public.app_members;
create policy "read own row" on public.app_members
  for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.app_members from authenticated;

-- 로그인한 사람이 명단에 있는지 확인한다.
-- security definer: 위 규칙과 상관없이 명단 표를 직접 확인하기 위해 필요하다.
create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_members where user_id = (select auth.uid()));
$$;

revoke all on function public.is_member() from public, anon;
grant execute on function public.is_member() to authenticated;
