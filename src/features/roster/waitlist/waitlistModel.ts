// 대기자 빈자리 매칭. SPEC_students 6.3. 순수 함수.
// 조건: 운영 중인 반 중 인원 < 4, 반 학년 = 대기자 학년, 희망 요일·시간과 맞음(희망이 비어 있으면 학년만 비교)
import { isClassActive, shortTime, toMinutes } from '../../../engine/classTime.ts';
import { classGradeCodeOn, gradeCodeOn, gradeLabel } from '../../../engine/grade.ts';
import type { Weekday } from '../../../engine/types.ts';
import type { ClassRow, RosterData, TrialLessonRow, WaitlistRow, WaitlistStage } from '../../../storage/rosterTypes.ts';
import { CAPACITY, classHeadcount } from '../rosterModel.ts';

/** 아직 진행 중인 대기자 */
export const OPEN_STAGES: WaitlistStage[] = ['inquiry', 'trial_booked', 'trial_done'];

export const STAGE_LABEL: Record<WaitlistStage, string> = {
  inquiry: '문의',
  trial_booked: '체험 예약',
  trial_done: '체험 완료',
  enrolled: '등록',
  dropped: '포기',
};

export const STAGE_ORDER: WaitlistStage[] = ['inquiry', 'trial_booked', 'trial_done', 'enrolled', 'dropped'];

export const waitlistGradeOn = (w: WaitlistRow, date: string) =>
  gradeCodeOn({ birthday: w.birthday, gradeCode: w.gradeCode, gradeBasisYear: w.gradeBasisYear }, date);

/** 희망 요일·시간에 맞는 반인지. 희망이 비어 있으면 항상 맞음 */
export function fitsWish(wish: WaitlistRow['wish'], cls: Pick<ClassRow, 'weekday' | 'startTime'>): boolean {
  const days = Object.keys(wish);
  if (days.length === 0) return true;
  if (!(cls.weekday in wish)) return false;
  const after = wish[cls.weekday as Weekday];
  return !after || toMinutes(cls.startTime) >= toMinutes(after);
}

export function isMatch(roster: Pick<RosterData, 'enrollments' | 'students'>, cls: ClassRow, w: WaitlistRow, today: string): boolean {
  if (!OPEN_STAGES.includes(w.stage) || !isClassActive(cls, today)) return false;
  const g = waitlistGradeOn(w, today);
  const cg = classGradeCodeOn(cls, today);
  if (g === null || cg === null || g !== cg) return false;
  if (classHeadcount(roster, cls.id, today) >= CAPACITY) return false;
  return fitsWish(w.wish, cls);
}

export const waitlistMatchesForClass = (roster: RosterData, cls: ClassRow, today: string) =>
  roster.waitlist.filter((w) => isMatch(roster, cls, w, today));

export const classMatchesForWaitlist = (roster: RosterData, w: WaitlistRow, today: string) =>
  roster.classes.filter((c) => isMatch(roster, c, w, today));

/** 체험 기록 저장 변경. 대기자에 연결하면 "문의" → "체험 예약"(SPEC 7) */
export function trialChange(trial: TrialLessonRow, waitlist: WaitlistRow[], today: string) {
  const w = trial.waitlistId ? waitlist.find((x) => x.id === trial.waitlistId) : null;
  const waitUpd = w && w.stage === 'inquiry' ? [{ ...w, stage: 'trial_booked' as const, stageHistory: [...w.stageHistory, { stage: 'trial_booked' as const, date: today }] }] : [];
  return { upsert: { trialLessons: [trial], waitlist: waitUpd } };
}

/** 체험 대상 이름·학년(대기자에 연결됐으면 대기자 정보) */
export function trialPerson(roster: Pick<RosterData, 'waitlist'>, t: TrialLessonRow, date: string): { name: string; grade: string | null } {
  const w = t.waitlistId ? roster.waitlist.find((x) => x.id === t.waitlistId) : null;
  if (w) {
    const g = waitlistGradeOn(w, date);
    return { name: w.name, grade: g === null ? null : gradeLabel(g) };
  }
  const g = t.gradeCode !== null && t.gradeBasisYear !== null ? gradeCodeOn({ birthday: null, gradeCode: t.gradeCode, gradeBasisYear: t.gradeBasisYear }, date) : null;
  return { name: t.name || '체험', grade: g === null ? null : gradeLabel(g) };
}

/** 달력 칸 표시용: "체험 6:30 김하준(7세)" */
export function trialCalendarText(roster: Pick<RosterData, 'waitlist'>, t: TrialLessonRow): string {
  const p = trialPerson(roster, t, t.date);
  return `체험 ${t.startTime ? `${shortTime(t.startTime)} ` : ''}${p.name}${p.grade ? `(${p.grade})` : ''}`;
}

/** 좁은 달력 칸용 3줄: ["6:50", "이서안", "5세"] (하늘색이 체험 표시). 빈 줄은 뺀다 */
export function trialLines(roster: Pick<RosterData, 'waitlist'>, t: TrialLessonRow): string[] {
  const p = trialPerson(roster, t, t.date);
  return [t.startTime ? shortTime(t.startTime) : '', p.name, p.grade ?? ''].filter(Boolean);
}
