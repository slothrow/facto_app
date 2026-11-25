-- 30단계(하린이 시간표, docs/SPEC_harin.md 10장). 표 추가만 한다. 기존 데이터는 건드리지 않는다.

-- 1) 시간표 버전. 대표(is_main)는 하나만
create table if not exists public.kid_timetables (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 40),
  memo text check (memo is null or length(memo) <= 200),
  is_main boolean not null default false,
  sort double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
create unique index if not exists kid_timetables_one_main on public.kid_timetables (is_main) where is_main;

-- 2) 종류(학원·이동·식사·휴식·숙제·기타 + 추가)
create table if not exists public.kid_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 20),
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  emoji text not null default '' check (length(emoji) <= 16),
  is_travel boolean not null default false,
  is_activity boolean not null default false,
  default_minutes int not null default 50 check (default_minutes between 10 and 570 and default_minutes % 10 = 0),
  sort double precision not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

-- 3) 학원(수업) 목록
create table if not exists public.kid_activities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 30),
  emoji text not null default '' check (length(emoji) <= 16),
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  place text check (place is null or length(place) <= 60),
  memo text check (memo is null or length(memo) <= 200),
  travel_minutes int not null default 20 check (travel_minutes between 0 and 120),
  is_home boolean not null default false,
  sort double precision not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

-- 4) 블록. 이동 블록은 저장하지 않고 계산한다(학원 블록 + 학원 기본값 + override)
create table if not exists public.kid_blocks (
  id uuid primary key default gen_random_uuid(),
  timetable_id uuid not null references public.kid_timetables (id) on delete cascade,
  weekday int not null check (weekday between 1 and 5),
  start_time text not null check (start_time ~ '^([01][0-9]|2[0-3]):[0-5]0$'),
  end_time text not null check (end_time ~ '^([01][0-9]|2[0-3]):[0-5]0$'),
  category_id uuid not null references public.kid_categories (id) on delete restrict,
  activity_id uuid references public.kid_activities (id) on delete restrict,
  title text check (title is null or length(title) <= 30),
  memo text check (memo is null or length(memo) <= 200),
  travel_before_override int check (travel_before_override is null or travel_before_override between 0 and 120),
  travel_after_override int check (travel_after_override is null or travel_after_override between 0 and 120),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  check (start_time < end_time)
);
create index if not exists kid_blocks_timetable_idx on public.kid_blocks (timetable_id);

-- 5) 보안: 등록자만(모든 표 같은 정책)
do $$
declare t text;
begin
  foreach t in array array['kid_timetables', 'kid_categories', 'kid_activities', 'kid_blocks']
  loop
    execute format('drop trigger if exists touch_row on public.%I', t);
    execute format('create trigger touch_row before insert or update on public.%I for each row execute function public.touch_row()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop policy if exists "members only" on public.%I', t);
    execute format('create policy "members only" on public.%I for all to authenticated using ((select private.is_member())) with check ((select private.is_member()))', t);
  end loop;
end;
$$;

-- 6) 기본 종류(한 번만)
insert into public.kid_categories (name, color, emoji, is_travel, is_activity, default_minutes, sort)
select * from (values
  ('학원', '#fbcfe8', '🏫', false, true, 50, 1),
  ('이동', '#e7e5e4', '🚶', true, false, 20, 2),
  ('식사', '#fed7aa', '🍚', false, false, 30, 3),
  ('휴식', '#d9f99d', '🧸', false, false, 20, 4),
  ('숙제', '#bae6fd', '✏️', false, false, 50, 5),
  ('기타', '#e9d5ff', '⭐', false, false, 50, 6)
) as v(name, color, emoji, is_travel, is_activity, default_minutes, sort)
where not exists (select 1 from public.kid_categories);

-- 7) 백업 복원: 하린이 시간표 표들. 공부방 데이터와 연결이 없어서 따로 둔다.
--    예전 백업(이 표들 없음)을 복원해도 지금 하린이 시간표는 남긴다. replace_roster 뒤에 앱이 이어서 부른다.
create or replace function public.replace_kid_timetable(p_data jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not (p_data ? 'kid_timetables' and p_data ? 'kid_categories' and p_data ? 'kid_activities' and p_data ? 'kid_blocks') then
    return;
  end if;
  delete from public.kid_blocks where true;
  delete from public.kid_timetables where true;
  delete from public.kid_activities where true;
  delete from public.kid_categories where true;

  insert into public.kid_categories (id, name, color, emoji, is_travel, is_activity, default_minutes, sort)
  select id, name, color, coalesce(emoji, ''), coalesce(is_travel, false), coalesce(is_activity, false), coalesce(default_minutes, 50), coalesce(sort, 0)
  from jsonb_populate_recordset(null::public.kid_categories, p_data -> 'kid_categories');

  insert into public.kid_activities (id, name, emoji, color, place, memo, travel_minutes, is_home, sort)
  select id, name, coalesce(emoji, ''), color, place, memo, coalesce(travel_minutes, 20), coalesce(is_home, false), coalesce(sort, 0)
  from jsonb_populate_recordset(null::public.kid_activities, p_data -> 'kid_activities');

  insert into public.kid_timetables (id, name, memo, is_main, sort, created_at)
  select id, name, memo, coalesce(is_main, false), coalesce(sort, 0), coalesce(created_at, now())
  from jsonb_populate_recordset(null::public.kid_timetables, p_data -> 'kid_timetables');

  insert into public.kid_blocks (id, timetable_id, weekday, start_time, end_time, category_id, activity_id, title, memo,
                                 travel_before_override, travel_after_override)
  select id, timetable_id, weekday, start_time, end_time, category_id, activity_id, title, memo,
         travel_before_override, travel_after_override
  from jsonb_populate_recordset(null::public.kid_blocks, p_data -> 'kid_blocks');
end;
$$;

revoke all on function public.replace_kid_timetable(jsonb) from public, anon;
grant execute on function public.replace_kid_timetable(jsonb) to authenticated;
