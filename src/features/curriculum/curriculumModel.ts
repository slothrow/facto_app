// 교육과정 진도를 앱 데이터에 연결하는 계산(SPEC_briefing 3장). 순수 함수.
// 엔진(curriculum.ts)은 회차만 받으므로, 여기서 회차 엔진을 돌려 그 날짜·요일의 회차를 넘겨준다.
import { scheduleFor } from '../../app/scheduleInput.ts';
import { classGradeCodeOn } from '../../engine/grade.ts';
import { addDays, monthStart } from '../../engine/dates.ts';
import {
  codeFor,
  progressAt,
  stageForGrade,
  withCurriculumDefaults,
  type CodeResult,
  type CurriculumSettings,
  type Progress,
  type StageId,
} from '../../engine/curriculum.ts';
import { monthName } from '../../engine/label.ts';
import type { DayCell, SessionLabel } from '../../engine/types.ts';
import type { ClassRow, ProgressAnchorRow, RosterData } from '../../storage/rosterTypes.ts';
import type { AppData } from '../../storage/types.ts';

export const curriculumOf = (data: AppData): CurriculumSettings => withCurriculumDefaults(data.settings.curriculum);

export const anchorsOf = (roster: Pick<RosterData, 'progressAnchors'>, classId: string): ProgressAnchorRow[] =>
  roster.progressAnchors.filter((a) => a.classId === classId).sort((a, b) => b.courseMonth.localeCompare(a.courseMonth));

export const courseMonthLabel = (ym: string) => `${monthName(ym)} 수업월`;
export const courseMonthFull = (ym: string) => `${ym.slice(0, 4)}년 ${monthName(ym)} 수업월`;

/** 기간 안의 날짜별 칸(회차 엔진 결과) */
export function cellsByDate(data: AppData, from: string, to: string): Map<string, DayCell> {
  return new Map(scheduleFor(data, { from, to }).days.map((d) => [d.date, d]));
}

/** 그 날짜 그 반의 수업 코드 */
export function classCodeOn(
  data: AppData,
  roster: Pick<RosterData, 'progressAnchors'>,
  cls: ClassRow,
  date: string,
  cells?: Map<string, DayCell>,
): CodeResult {
  const cell = cells?.get(date) ?? scheduleFor(data, { from: date, to: date }).days[0];
  const session = cell && cell.status === 'session' && cell.weekday === cls.weekday ? cell.session : null;
  return codeFor(anchorsOf(roster, cls.id), session, curriculumOf(data));
}

/** 요일마다 "이번 회차": 오늘 이후 첫 회차(6주 안), 없으면 최근 6주 안 마지막 회차 */
export function currentSessionByWeekday(data: AppData, today: string): Map<number, SessionLabel> {
  const days = scheduleFor(data, { from: addDays(today, -42), to: addDays(today, 42) }).days;
  const map = new Map<number, SessionLabel>();
  for (const d of days) if (d.date >= today && d.session && d.status === 'session' && !map.has(d.weekday)) map.set(d.weekday, d.session);
  for (const d of [...days].reverse()) if (d.date < today && d.session && d.status === 'session' && !map.has(d.weekday)) map.set(d.weekday, d.session);
  return map;
}

export interface ClassProgressNow {
  session: SessionLabel | null;
  progress: Progress;
}

export function classProgressNow(
  roster: Pick<RosterData, 'progressAnchors'>,
  cls: ClassRow,
  current: Map<number, SessionLabel>,
): ClassProgressNow {
  const session = current.get(cls.weekday) ?? null;
  return { session, progress: session ? progressAt(anchorsOf(roster, cls.id), session.courseMonth) : { kind: 'unset' } };
}

/** 그 수업월의 반 학년 → 기본 단계 */
export const suggestedStage = (cls: ClassRow, courseMonth: string, settings: CurriculumSettings): StageId | null =>
  stageForGrade(classGradeCodeOn(cls, monthStart(courseMonth)), settings);
