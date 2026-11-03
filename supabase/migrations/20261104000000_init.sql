-- 4단계: 학사운영 앱 테이블 + 보안 규칙(RLS)
-- Supabase 대시보드 > SQL Editor에 이 파일 내용을 통째로 붙여 넣고 Run 하면 된다.
-- 여러 번 실행해도 안전하다(이미 있으면 건너뜀).
-- 표 구조는 docs/SPEC.md 10.1과 같다.

-- ---------------------------------------------------------------
-- 1) 테이블
-- ---------------------------------------------------------------

create table if not exists public.settings (
  id smallint primary key default 1 check (id = 1),
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

create table if not exists public.track_anchors (
  weekday smallint primary key check (weekday between 1 and 5),
  start_date date not null,
  course_month text not null check (course_month ~ '^\d{4}-\d{2}$'),
  week_no smallint not null check (week_no between 1 and 4),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

-- 같은 날짜에 '추가'와 '무시'가 함께 있을 수 있어 (date, type)을 키로 쓴다
create table if not exists public.custom_holidays (
  date date not null,
  name text not null,
  type text not null check (type in ('add', 'ignore')),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (date, type)
);

create table if not exists public.closures (
  id text primary key,
  kind text not null check (kind in ('closed', 'event')),
  start_date date not null,
  end_date date not null,
  weekdays smallint[],
  label text not null,
  show_on_calendar boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

create table if not exists public.session_overrides (
  date date primary key,
  type text not null check (type in ('skip', 'pin')),
  course_month text,
  week_no smallint check (week_no between 1 and 4),
  note text,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

create table if not exists public.makeup_overrides (
  date date primary key,
  type text not null check (type in ('add', 'remove')),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

create table if not exists public.month_plans (
  calendar_month text primary key check (calendar_month ~ '^\d{4}-\d{2}$'),
  status text not null check (status in ('draft', 'confirmed')),
  confirmed_at timestamptz,
  snapshot jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

create table if not exists public.export_history (
  id text primary key,
  start_month text not null,
  title text not null,
  highlight_text text not null default '',
  notice_text text not null default '',
  ratio text not null check (ratio in ('1:1', '4:5')),
  layout text check (layout in ('side', 'stack')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

-- ---------------------------------------------------------------
-- 2) 누가 언제 바꿨는지 자동 기록
-- ---------------------------------------------------------------

create or replace function public.touch_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['settings', 'track_anchors', 'custom_holidays', 'closures',
                           'session_overrides', 'makeup_overrides', 'month_plans', 'export_history']
  loop
    execute format('drop trigger if exists touch_row on public.%I', t);
    execute format('create trigger touch_row before insert or update on public.%I
                    for each row execute function public.touch_row()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------
-- 3) 보안 규칙(RLS): 로그인한 사용자만 읽고 쓸 수 있다
--    로그인 안 한 사람(anon)은 아무것도 못 본다.
-- ---------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['settings', 'track_anchors', 'custom_holidays', 'closures',
                           'session_overrides', 'makeup_overrides', 'month_plans', 'export_history']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop policy if exists "logged in users" on public.%I', t);
    execute format('create policy "logged in users" on public.%I
                    for all to authenticated using (true) with check (true)', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------
-- 4) 저장 함수: 표 하나를 통째로 바꾼다(지우고 다시 넣기를 한 번에 처리).
--    중간에 실패하면 전부 취소되므로 반쯤 지워진 상태가 생기지 않는다.
--    security invoker → 위 RLS 규칙이 그대로 적용된다.
-- ---------------------------------------------------------------

create or replace function public.save_collection(p_key text, p_rows jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  case p_key
  when 'settings' then
    insert into public.settings (id, data) values (1, p_rows)
    on conflict (id) do update set data = excluded.data;

  when 'track_anchors' then
    delete from public.track_anchors where true;
    insert into public.track_anchors (weekday, start_date, course_month, week_no)
    select weekday, start_date, course_month, week_no
    from jsonb_to_recordset(p_rows) as r(weekday smallint, start_date date, course_month text, week_no smallint);

  when 'custom_holidays' then
    delete from public.custom_holidays where true;
    insert into public.custom_holidays (date, name, type)
    select date, name, type
    from jsonb_to_recordset(p_rows) as r(date date, name text, type text);

  when 'closures' then
    delete from public.closures where true;
    insert into public.closures (id, kind, start_date, end_date, weekdays, label, show_on_calendar)
    select id, kind, start_date, end_date, weekdays, label, show_on_calendar
    from jsonb_to_recordset(p_rows) as r(id text, kind text, start_date date, end_date date,
                                         weekdays smallint[], label text, show_on_calendar boolean);

  when 'session_overrides' then
    delete from public.session_overrides where true;
    insert into public.session_overrides (date, type, course_month, week_no, note)
    select date, type, course_month, week_no, note
    from jsonb_to_recordset(p_rows) as r(date date, type text, course_month text, week_no smallint, note text);

  when 'makeup_overrides' then
    delete from public.makeup_overrides where true;
    insert into public.makeup_overrides (date, type)
    select date, type
    from jsonb_to_recordset(p_rows) as r(date date, type text);

  when 'month_plans' then
    delete from public.month_plans where true;
    insert into public.month_plans (calendar_month, status, confirmed_at, snapshot)
    select calendar_month, status, confirmed_at, coalesce(snapshot, '[]'::jsonb)
    from jsonb_to_recordset(p_rows) as r(calendar_month text, status text, confirmed_at timestamptz, snapshot jsonb);

  when 'export_history' then
    delete from public.export_history where true;
    insert into public.export_history (id, start_month, title, highlight_text, notice_text, ratio, layout, created_at)
    select id, start_month, title, coalesce(highlight_text, ''), coalesce(notice_text, ''), ratio, layout, created_at
    from jsonb_to_recordset(p_rows) as r(id text, start_month text, title text, highlight_text text,
                                         notice_text text, ratio text, layout text, created_at timestamptz);

  else
    raise exception 'unknown collection: %', p_key;
  end case;
end;
$$;

-- 전체 교체(백업 복원, 초기 데이터 불러오기). 한 번에 처리되어 실패하면 전부 취소된다.
-- p_data = { "settings": {...}, "track_anchors": [...], ... }
create or replace function public.replace_all(p_data jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare k text;
begin
  foreach k in array array['settings', 'track_anchors', 'custom_holidays', 'closures',
                           'session_overrides', 'makeup_overrides', 'month_plans', 'export_history']
  loop
    if not (p_data ? k) then
      raise exception 'missing collection: %', k;
    end if;
    perform public.save_collection(k, p_data -> k);
  end loop;
end;
$$;

revoke all on function public.save_collection(text, jsonb) from public, anon;
revoke all on function public.replace_all(jsonb) from public, anon;
grant execute on function public.save_collection(text, jsonb) to authenticated;
grant execute on function public.replace_all(jsonb) to authenticated;
