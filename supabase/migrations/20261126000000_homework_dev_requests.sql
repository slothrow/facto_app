-- 35~41단계(PROMPTS_8): 하린이 숙제·숙제 체크, 앱 개선 요청 메모. 표 추가만 한다. 기존 데이터는 건드리지 않는다.

-- 1) 숙제 목록(학원 목록처럼 한 번 등록)
create table if not exists public.kid_homeworks (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 40),
  subject text not null default 'other' check (subject in ('korean', 'english', 'math', 'reading', 'other')),
  emoji text not null default '' check (length(emoji) <= 16),
  minutes int check (minutes is null or minutes between 5 and 300),
  memo text check (memo is null or length(memo) <= 200),
  active boolean not null default true,
  repeat_type text not null check (repeat_type in ('daily', 'academy', 'once')),
  weekdays int[] check (weekdays is null or weekdays <@ array[1, 2, 3, 4, 5]),
  activity_id uuid references public.kid_activities (id) on delete restrict,
  due_rule text check (due_rule is null or due_rule in ('day_before', 'same_day')),
  due_date date,
  sort double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
create index if not exists kid_homeworks_activity_idx on public.kid_homeworks (activity_id);

-- 2) 숙제 체크(날짜별). date = 그 숙제를 해야 하는 날
create table if not exists public.kid_homework_checks (
  date date not null,
  homework_id uuid not null references public.kid_homeworks (id) on delete cascade,
  done_at timestamptz not null default now(),
  done_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (date, homework_id)
);

-- 3) 앱 개선 요청 메모
create table if not exists public.dev_requests (
  id uuid primary key default gen_random_uuid(),
  text text not null check (length(text) between 1 and 2000),
  done boolean not null default false,
  done_at timestamptz,
  sort double precision not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

-- 4) 보안: 등록자만(모든 표 같은 정책)
do $$
declare t text;
begin
  foreach t in array array['kid_homeworks', 'kid_homework_checks', 'dev_requests']
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

-- 5) 백업 복원: 하린이 표들(숙제 포함). 숙제는 학원(kid_activities)을 참조하므로 같은 함수에서 함께 바꾼다.
--    백업에 숙제 항목이 없으면(예전 백업) 지금 숙제를 그대로 다시 넣는다. 복원된 학원 목록에 없는 학원을 가리키던 숙제는 학원 연결만 끊는다.
create or replace function public.replace_kid_timetable(p_data jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_hw jsonb;
  v_chk jsonb;
begin
  if not (p_data ? 'kid_timetables' and p_data ? 'kid_categories' and p_data ? 'kid_activities' and p_data ? 'kid_blocks') then
    return;
  end if;

  v_hw := coalesce(p_data -> 'kid_homeworks', (select jsonb_agg(to_jsonb(h)) from public.kid_homeworks h), '[]'::jsonb);
  v_chk := coalesce(p_data -> 'kid_homework_checks', (select jsonb_agg(to_jsonb(c)) from public.kid_homework_checks c), '[]'::jsonb);

  delete from public.kid_homework_checks where true;
  delete from public.kid_homeworks where true;
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

  insert into public.kid_homeworks (id, name, subject, emoji, minutes, memo, active, repeat_type, weekdays, activity_id,
                                    due_rule, due_date, sort)
  select h.id, h.name, coalesce(h.subject, 'other'), coalesce(h.emoji, ''), h.minutes, h.memo, coalesce(h.active, true),
         h.repeat_type, h.weekdays,
         case when h.activity_id in (select a.id from public.kid_activities a) then h.activity_id else null end,
         h.due_rule, h.due_date, coalesce(h.sort, 0)
  from jsonb_populate_recordset(null::public.kid_homeworks, v_hw) h;

  insert into public.kid_homework_checks (date, homework_id, done_at, done_by)
  select c.date, c.homework_id, coalesce(c.done_at, now()), c.done_by
  from jsonb_populate_recordset(null::public.kid_homework_checks, v_chk) c
  where c.homework_id in (select x.id from public.kid_homeworks x);
end;
$$;

revoke all on function public.replace_kid_timetable(jsonb) from public, anon;
grant execute on function public.replace_kid_timetable(jsonb) to authenticated;

-- 6) 백업 복원: 개선 요청 메모. 예전 백업(항목 없음)을 복원해도 지금 메모는 남긴다
create or replace function public.replace_dev_requests(p_data jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not (p_data ? 'dev_requests') then
    return;
  end if;
  delete from public.dev_requests where true;
  insert into public.dev_requests (id, text, done, done_at, sort, created_by, created_at)
  select id, text, coalesce(done, false), done_at, coalesce(sort, 0), created_by, coalesce(created_at, now())
  from jsonb_populate_recordset(null::public.dev_requests, p_data -> 'dev_requests');
end;
$$;

revoke all on function public.replace_dev_requests(jsonb) from public, anon;
grant execute on function public.replace_dev_requests(jsonb) to authenticated;
