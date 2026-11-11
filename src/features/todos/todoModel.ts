// 공용 할 일 달력(26단계, SPEC_home 8장)의 계산. 화면·저장과 분리된 순수 함수.
import { builtInHolidays } from '../../data/holidays/index.ts';
import { addDays, eachDay, monthEnd, monthStart, weekdayOf } from '../../engine/dates.ts';
import { newId, type TodoRow } from '../../storage/rosterTypes.ts';
import type { AppData, AppSettings } from '../../storage/types.ts';

export type TodoView = 'month' | 'week' | 'day' | 'list';
export const TODO_VIEWS: { id: TodoView; label: string }[] = [
  { id: 'month', label: '월' },
  { id: 'week', label: '주' },
  { id: 'day', label: '일' },
  { id: 'list', label: '목록' },
];

/** 예전 할 일 알림(보관 중)이 켜져 있는지. 기본은 꺼짐 */
export const remindersOn = (settings: AppSettings) => settings.features?.reminders === true;

/** 하루 안의 순서: 안 한 일 먼저, 그 안에서 별표 먼저, 그다음 sort */
export function sortDay(todos: TodoRow[]): TodoRow[] {
  return [...todos].sort(
    (a, b) => Number(a.done) - Number(b.done) || Number(b.starred) - Number(a.starred) || a.sort - b.sort,
  );
}

/** 날짜별로 묶고 하루 순서대로 정렬 */
export function groupByDate(todos: TodoRow[]): Map<string, TodoRow[]> {
  const map = new Map<string, TodoRow[]>();
  for (const t of todos) map.set(t.date, [...(map.get(t.date) ?? []), t]);
  for (const [d, list] of map) map.set(d, sortDay(list));
  return map;
}

export interface DayStat {
  total: number;
  remaining: number;
  /** 남은 일 중 별표 있는 것이 있는지 */
  starred: boolean;
}

export function dayStat(list: TodoRow[] | undefined): DayStat {
  const rest = (list ?? []).filter((t) => !t.done);
  return { total: list?.length ?? 0, remaining: rest.length, starred: rest.some((t) => t.starred) };
}

/** 지난 날짜의 안 한 일(날짜 순) */
export function overdueTodos(todos: TodoRow[], today: string): TodoRow[] {
  return todos.filter((t) => !t.done && t.date < today).sort((a, b) => a.date.localeCompare(b.date) || a.sort - b.sort);
}

/** 그 날짜 맨 아래에 붙일 sort 값 */
export function nextSort(todos: TodoRow[], date: string): number {
  const sorts = todos.filter((t) => t.date === date).map((t) => t.sort);
  return sorts.length ? Math.max(...sorts) + 1 : 1;
}

export function makeTodo(todos: TodoRow[], date: string, text: string): TodoRow {
  return { id: newId(), date, text: text.trim().slice(0, 500), done: false, starred: false, sort: nextSort(todos, date) };
}

/** 여러 할 일을 한 날짜로 옮긴다(그 날짜 맨 아래에 순서대로 붙임) */
export function moveTodos(todos: TodoRow[], moving: TodoRow[], date: string): TodoRow[] {
  const base = nextSort(todos, date);
  return moving.map((t, i) => ({ ...t, date, sort: base + i }));
}

/** 그 날짜가 들어 있는 주의 월~일 */
export function weekDays(date: string): string[] {
  const monday = addDays(date, -((weekdayOf(date) + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** 월 달력 칸(일요일 시작, 7의 배수). 앞뒤 빈칸은 null */
export function monthCells(ym: string): (string | null)[] {
  const days = eachDay(monthStart(ym), monthEnd(ym));
  const cells: (string | null)[] = [...Array(weekdayOf(days[0])).fill(null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** 날짜별 공휴일·휴원일·행사일 이름(작게 표시용) */
export function dayLabels(data: AppData, from: string, to: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (d: string, name: string) => {
    if (d < from || d > to) return;
    const list = out.get(d) ?? [];
    if (!list.includes(name)) out.set(d, [...list, name]);
  };
  const ignored = new Set(data.customHolidays.filter((h) => h.type === 'ignore').map((h) => h.date));
  for (const h of builtInHolidays) if (!ignored.has(h.date)) add(h.date, h.name);
  for (const h of data.customHolidays) if (h.type === 'add') add(h.date, h.name);
  for (const c of data.closures) {
    const start = c.startDate > from ? c.startDate : from;
    const end = c.endDate < to ? c.endDate : to;
    if (start > end) continue;
    for (const d of eachDay(start, end)) {
      if (c.weekdays && c.weekdays.length > 0 && !c.weekdays.includes(weekdayOf(d))) continue;
      add(d, c.label);
    }
  }
  return out;
}
