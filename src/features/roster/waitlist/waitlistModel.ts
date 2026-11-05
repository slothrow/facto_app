// 대기자 빈자리 매칭. SPEC_students 6.3. 순수 함수.
// 조건: 운영 중인 반 중 인원 < 4, 반 학년 = 대기자 학년, 희망 요일·시간과 맞음(희망이 비어 있으면 학년만 비교)
import { isClassActive, toMinutes } from '../../../engine/classTime.ts';
import { classGradeCodeOn, gradeCodeOn } from '../../../engine/grade.ts';
import type { Weekday } from '../../../engine/types.ts';
import type { ClassRow, RosterData, WaitlistRow, WaitlistStage } from '../../../storage/rosterTypes.ts';
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
