// 반 편성 시뮬레이터 공통 모델(SPEC_simulator 2·3장). 순수 함수.
// 시안 = 시안 정보(SimDraftRow) + 시안 반(SimClassRow) + 시안 아이(SimMemberRow).
import { classGradeCodeOn, gradeLabel, schoolYearOf } from '../grade.ts';
import { shortTime } from '../classTime.ts';
import type { Weekday } from '../types.ts';
import type { SimClassRow, SimDraftRow, SimMemberRow, SimTag } from '../../storage/rosterTypes.ts';

export interface SimDraft {
  draft: SimDraftRow;
  classes: SimClassRow[];
  members: SimMemberRow[];
}

export type OperatingHours = Record<Weekday, { start: string; end: string }>;
export const DEFAULT_OPERATING_HOURS = { start: '13:30', end: '18:30' };
export const SIM_WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5];
const WD = ['일', '월', '화', '수', '목', '금', '토'];

/** 저장된 운영 시간대(일부만 있을 수 있음)에 기본값을 채운다 */
export function withHoursDefaults(saved?: Partial<Record<Weekday, { start: string; end: string }>> | null): OperatingHours {
  const out = {} as OperatingHours;
  for (const wd of SIM_WEEKDAYS) out[wd] = { ...DEFAULT_OPERATING_HOURS, ...(saved?.[wd] ?? {}) };
  return out;
}

/** 정원 기준(이 인원이면 꽉 참) */
export const SIM_CAPACITY = 4;
/** 이 인원을 넘게 담을 수 없다(6명 이상 저장 불가) */
export const SIM_HARD_MAX = 5;
export const SIM_MIN = 2;
/** 다음 학년도 보기에서 이 학년 이상이면 졸업 대상(초4) */
export const GRADUATE_CODE = 10;

export const TAG_LABEL: Record<SimTag, string> = {
  keep: '유지',
  move: '이동',
  leaving: '퇴원 예정',
  new: '신규',
  undecided: '미정 ??',
};
export const TAG_ORDER: SimTag[] = ['keep', 'move', 'leaving', 'new', 'undecided'];

/** 시간표에 있는 반(빼놓거나 합쳐진 반 제외) */
export const liveClasses = (d: Pick<SimDraft, 'classes'>) => d.classes.filter((c) => !c.removed && !c.mergedInto);
export const removedClasses = (d: Pick<SimDraft, 'classes'>) => d.classes.filter((c) => c.removed && !c.mergedInto);

export const membersOf = (d: Pick<SimDraft, 'members'>, simClassId: string) => d.members.filter((m) => m.simClassId === simClassId);

/** 인원: 퇴원 예정 제외, 신규·임시 이름 포함 */
export const headcount = (d: Pick<SimDraft, 'members'>, simClassId: string) =>
  membersOf(d, simClassId).filter((m) => m.tag !== 'leaving').length;

/** 학년 보기 기준 날짜: 현재 = 기준일, 다음 = 기준일 다음 학년도 3월 1일 */
export function viewDateOf(draft: Pick<SimDraftRow, 'baseDate' | 'gradeView'>, view = draft.gradeView): string {
  return view === 'next' ? `${schoolYearOf(draft.baseDate) + 1}-03-01` : draft.baseDate;
}

export const simGradeCode = (cls: Pick<SimClassRow, 'gradeCode' | 'gradeBasisYear'>, viewDate: string) => classGradeCodeOn(cls, viewDate);

/** "7세", 다음 학년도 보기면 "초1(예비)" */
export function simGradeLabel(cls: Pick<SimClassRow, 'gradeCode' | 'gradeBasisYear'>, draft: Pick<SimDraftRow, 'baseDate' | 'gradeView'>, view = draft.gradeView): string {
  const code = simGradeCode(cls, viewDateOf(draft, view));
  if (view === 'next' && code !== null && code >= GRADUATE_CODE) return '졸업 대상';
  const label = gradeLabel(code);
  return view === 'next' && code !== null ? `${label}(예비)` : label;
}

/** 다음 학년도 보기에서 초4가 되는 반 */
export const isGraduating = (cls: Pick<SimClassRow, 'gradeCode' | 'gradeBasisYear'>, draft: Pick<SimDraftRow, 'baseDate'>) => {
  const code = simGradeCode(cls, viewDateOf({ baseDate: draft.baseDate, gradeView: 'next' }));
  return code !== null && code >= GRADUATE_CODE;
};

/** "7세반", "초2반 A" (기준일 학년) */
export function simClassName(cls: Pick<SimClassRow, 'gradeCode' | 'gradeBasisYear' | 'alias'>, date: string): string {
  const g = gradeLabel(classGradeCodeOn(cls, date));
  return `${g}반${cls.alias ? ` ${cls.alias}` : ''}`;
}

export const slotText = (weekday: number, startTime: string) => `${WD[weekday]} ${shortTime(startTime)}`;
