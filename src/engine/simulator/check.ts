// 경고 패널(SPEC_simulator 6.1)과 요약(6.3). 항상 계산하고 막지는 않는다(겹침만 막음). 순수 함수.
import { UNITS_PER_STAGE, UNIT_STAGES, formatProgress, type CurriculumSettings, type Progress } from '../curriculum.ts';
import { gradeCodeOn } from '../grade.ts';
import { fitsWish } from '../../features/roster/waitlist/waitlistModel.ts';
import type { Availability, RosterData, SimMemberRow } from '../../storage/rosterTypes.ts';
import { canPlace } from './canPlace.ts';
import {
  SIM_CAPACITY,
  SIM_MIN,
  headcount,
  liveClasses,
  membersOf,
  simGradeCode,
  simGradeLabel,
  slotText,
  viewDateOf,
  withHoursDefaults,
  type OperatingHours,
  type SimDraft,
} from './model.ts';

export type WarningKind =
  | 'over'
  | 'few'
  | 'empty'
  | 'gradeMismatch'
  | 'availability'
  | 'availabilityMissing'
  | 'tight'
  | 'outsideHours'
  | 'overlap'
  | 'progressGap';

export interface DraftWarning {
  kind: WarningKind;
  simClassId: string;
  text: string;
  /** 해당 아이 이름(화면 표시용) */
  names?: string[];
}

export interface CheckOptions {
  hours?: OperatingHours;
  /** 시안 반의 다음 수업월 진도(합친 반 진도 차이용). 없으면 진도 비교를 하지 않는다 */
  progressOf?: (simClassId: string) => Progress;
  curriculum?: CurriculumSettings;
}

type People = Pick<RosterData, 'students' | 'waitlist'>;

/** 시안 아이 → 이름·학년·가능 시간 */
export function memberInfo(m: SimMemberRow, people: People, date: string): { name: string; grade: number | null; availability: Availability | null } {
  if (m.studentId) {
    const s = people.students.find((x) => x.id === m.studentId);
    return s ? { name: s.name, grade: gradeCodeOn(s, date), availability: s.availability } : { name: '(없는 학생)', grade: null, availability: null };
  }
  if (m.waitlistId) {
    const w = people.waitlist.find((x) => x.id === m.waitlistId);
    return w
      ? { name: w.name, grade: gradeCodeOn({ birthday: w.birthday, gradeCode: w.gradeCode, gradeBasisYear: w.gradeBasisYear }, date), availability: w.wish }
      : { name: '(없는 대기자)', grade: null, availability: null };
  }
  return { name: m.tempName ?? '', grade: null, availability: null };
}

/** 두 진도의 단원 차이(같은 단계 체계일 때만). 비교할 수 없으면 null */
export function progressGap(a: Progress, b: Progress): number | null {
  if (a.kind !== 'unit' || b.kind !== 'unit') return a.kind === b.kind ? 0 : null;
  const idx = (p: { stage: (typeof UNIT_STAGES)[number]; unit: number }) => UNIT_STAGES.indexOf(p.stage) * UNITS_PER_STAGE + p.unit;
  return Math.abs(idx(a) - idx(b));
}

export function checkDraft(d: SimDraft, people: People, opts: CheckOptions = {}): DraftWarning[] {
  const hours = opts.hours ?? withHoursDefaults();
  const viewDate = viewDateOf(d.draft);
  const out: DraftWarning[] = [];

  for (const c of liveClasses(d)) {
    const name = `${slotText(c.weekday, c.startTime)} ${simGradeLabel(c, d.draft)}`;
    const push = (kind: WarningKind, text: string, names?: string[]) => out.push({ kind, simClassId: c.id, text: `${name}: ${text}`, names });
    const ms = membersOf(d, c.id).filter((m) => m.tag !== 'leaving');
    const n = headcount(d, c.id);

    if (n > SIM_CAPACITY) push('over', `정원 초과 (${n}/${SIM_CAPACITY})`);
    if (n === 0) push('empty', '학생 없음');
    else if (n < SIM_MIN) push('few', `인원 ${SIM_MIN}명 미만 (${n}명)`);

    const classGrade = simGradeCode(c, viewDate);
    const infos = ms.map((m) => ({ m, ...memberInfo(m, people, viewDate) }));
    const wrongGrade = infos.filter((i) => classGrade !== null && i.grade !== null && i.grade !== classGrade);
    if (wrongGrade.length) push('gradeMismatch', `학년 다른 아이 ${wrongGrade.length}명: ${wrongGrade.map((i) => i.name).join(', ')}`, wrongGrade.map((i) => i.name));

    const withPerson = infos.filter((i) => i.availability !== null);
    const missing = withPerson.filter((i) => Object.keys(i.availability!).length === 0);
    const conflict = withPerson.filter((i) => Object.keys(i.availability!).length > 0 && !fitsWish(i.availability!, c));
    if (conflict.length) push('availability', `이 시간 안 되는 아이 ${conflict.length}명: ${conflict.map((i) => i.name).join(', ')}`, conflict.map((i) => i.name));
    if (missing.length) push('availabilityMissing', `가능 시간 미입력 ${missing.length}명`, missing.map((i) => i.name));

    const place = canPlace(d, c.id, c.weekday, c.startTime, hours);
    if (place.kind === 'block') push('overlap', place.reasons.join(', '));
    if (place.kind === 'warn') {
      for (const r of place.reasons) push(r === '운영 시간대 밖' ? 'outsideHours' : 'tight', r);
    }

    if (opts.progressOf) {
      const mine = opts.progressOf(c.id);
      for (const a of d.classes.filter((x) => x.mergedInto === c.id)) {
        const theirs = opts.progressOf(a.id);
        const gap = progressGap(mine, theirs);
        if (gap !== 0) {
          const text = `${formatProgress(mine, opts.curriculum)} / ${formatProgress(theirs, opts.curriculum)}`;
          push('progressGap', gap === null ? `합친 반 진도 다름 (${text})` : `합친 반 진도 차이 ${gap}단원 (${text})`);
        }
      }
    }
  }
  return out;
}

export interface DraftSummary {
  classCount: number;
  /** 퇴원 예정 제외, 신규 포함 */
  studentCount: number;
  /** 정원 4 기준 빈자리 합계 */
  emptySeats: number;
  byGrade: { label: string; count: number }[];
  warningCount: number;
}

export function summarize(d: SimDraft, warnings: DraftWarning[] = []): DraftSummary {
  const live = liveClasses(d);
  let studentCount = 0;
  let emptySeats = 0;
  const grades = new Map<string, { code: number; count: number }>();
  for (const c of live) {
    const n = headcount(d, c.id);
    studentCount += n;
    emptySeats += Math.max(0, SIM_CAPACITY - n);
    const label = simGradeLabel(c, d.draft);
    const code = simGradeCode(c, viewDateOf(d.draft)) ?? 99;
    const g = grades.get(label) ?? { code, count: 0 };
    g.count += 1;
    grades.set(label, g);
  }
  return {
    classCount: live.length,
    studentCount,
    emptySeats,
    byGrade: [...grades.entries()].sort((a, b) => a[1].code - b[1].code).map(([label, g]) => ({ label, count: g.count })),
    warningCount: warnings.length,
  };
}

/** 상단 한 줄: "반 18 · 학생 61 · 빈자리 11 · 경고 3" */
export const summaryLine = (s: DraftSummary) => `반 ${s.classCount} · 학생 ${s.studentCount} · 빈자리 ${s.emptySeats} · 경고 ${s.warningCount}`;
