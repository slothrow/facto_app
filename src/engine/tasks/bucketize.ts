// 할 일 나누기(SPEC_home 3.1): 오늘(지난 것 포함, 지난 것 먼저) / 이번 주(일요일까지) / 다가오는 일(14일 안).
import type { TaskStateRow } from '../../storage/rosterTypes.ts';
import type { Task } from './types.ts';

export const UPCOMING_DAYS = 14;

export interface ShownTask extends Task {
  /** 기한이 지남(빨간 표시) */
  overdue: boolean;
  /** 미뤘다가 다시 뜬 경우 미룬 날짜가 기한 대신 */
  effectiveDue: string;
}

export interface Buckets {
  today: ShownTask[];
  week: ShownTask[];
  upcoming: ShownTask[];
}

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

/** 이번 주 일요일(오늘이 일요일이면 오늘) */
export const sundayOf = (today: string) => addDays(today, (7 - weekdayOf(today)) % 7);
/** 다음 주 월요일 */
export const nextMonday = (today: string) => addDays(today, ((8 - weekdayOf(today)) % 7) || 7);

export function bucketize(tasks: Task[], states: TaskStateRow[], today: string): Buckets {
  const byKey = new Map(states.map((s) => [s.taskKey, s]));
  const sunday = sundayOf(today);
  const limit = addDays(today, UPCOMING_DAYS);
  const out: Buckets = { today: [], week: [], upcoming: [] };

  for (const t of tasks) {
    const st = byKey.get(t.key);
    if (st?.status === 'done' || st?.status === 'hidden') continue;
    let due = t.due;
    if (st?.status === 'snoozed' && st.snoozeUntil) {
      if (today < st.snoozeUntil) continue;
      if (st.snoozeUntil > due) due = st.snoozeUntil;
    }
    if (t.visibleFrom && today < t.visibleFrom) continue;
    const shown: ShownTask = { ...t, overdue: due < today, effectiveDue: due };
    if (due <= today) out.today.push(shown);
    else if (due <= sunday) out.week.push(shown);
    else if (due <= limit) out.upcoming.push(shown);
  }
  const order = (a: ShownTask, b: ShownTask) => a.effectiveDue.localeCompare(b.effectiveDue) || a.title.localeCompare(b.title, 'ko');
  out.today.sort((a, b) => Number(b.overdue) - Number(a.overdue) || order(a, b));
  out.week.sort(order);
  out.upcoming.sort(order);
  return out;
}
