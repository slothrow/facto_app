// 반복 할 일(템플릿) → 홈 할 일. 행사일(달력의 행사)을 행사 기준 템플릿에 쓴다.
import { addDays } from '../../engine/dates.ts';
import { expandTemplates, templateTasksFrom, type EventDay, type Task } from '../../engine/tasks/index.ts';
import type { RosterData } from '../../storage/rosterTypes.ts';
import type { AppData } from '../../storage/types.ts';

/** 달력에 등록한 행사일 */
export const eventDaysOf = (data: AppData): EventDay[] =>
  data.closures.filter((c) => c.kind === 'event').map((c) => ({ label: c.label, date: c.startDate }));

/** 지난 7일 ~ 앞으로 14일 안에 기한이 있는 반복 할 일(더 지난 건 처음 쓸 때 쌓이지 않게 뺀다) */
export function templateTasks(data: AppData, roster: RosterData, today: string): Task[] {
  const occ = expandTemplates(roster.taskTemplates, eventDaysOf(data), { from: addDays(today, -7), to: addDays(today, 14) });
  return templateTasksFrom(occ, roster.taskStates);
}
