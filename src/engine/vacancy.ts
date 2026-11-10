// 빈자리 현황(SPEC_home 2장). 상담용: 기준일 기준으로 학년별 기존 반 빈자리, 새 반 개설 가능 시각, 맞는 대기자 수.
// 순수 함수. 기존 시간 검사(checkClassTime), 학년 계산, 시안 모델을 그대로 쓴다.
import { CLASS_MINUTES, checkClassTime, fromMinutes, isClassOpenOn, toMinutes } from './classTime.ts';
import { classGradeCodeOn, gradeCodeOn, schoolYearOf } from './grade.ts';
import { monthIndex } from './label.ts';
import { GRADUATE_CODE, SIM_CAPACITY, SIM_WEEKDAYS, headcount, liveClasses, type OperatingHours, type SimDraft } from './simulator/model.ts';
import type { Weekday } from './types.ts';
import { OPEN_STAGES, fitsWish } from '../features/roster/waitlist/waitlistModel.ts';
import type { ClassRow, EnrollmentRow, StudentRow, WaitlistRow } from '../storage/rosterTypes.ts';

/** 곧 생길 자리를 찾는 기간(기준일 이후 일수) */
export const SOON_DAYS = 60;

/** 학년별 선호 시간대 기본값: 5·6·7세는 16:00 이후, 초등은 없음 */
export const DEFAULT_PREFERRED_AFTER: Partial<Record<number, string | null>> = { 4: '16:00', 5: '16:00', 6: '16:00' };

export type VacancySource =
  | { kind: 'real'; classes: ClassRow[]; enrollments: EnrollmentRow[]; students: StudentRow[] }
  | { kind: 'draft'; draft: SimDraft };

export interface VacancyInput {
  baseDate: string;
  /** 기준일 학년 코드(4=5세 … 9=초3) */
  grade: number;
  source: VacancySource;
  waitlist: WaitlistRow[];
  hours: OperatingHours;
  /** 학년 코드 → 'HH:MM' 이후가 선호. 없으면 DEFAULT_PREFERRED_AFTER */
  preferredAfter?: Partial<Record<number, string | null>>;
}

export interface ClassVacancy {
  /** 실제 반 id 또는 시안 반 id */
  id: string;
  /** 실제 반 id(시안 반이면 원래 반, 새 반이면 null). 체험 예약용 */
  realClassId: string | null;
  weekday: Weekday;
  startTime: string;
  grade: number | null;
  alias: string | null;
  count: number;
  /** 정원(4) 기준 남은 자리. 0 이하면 꽉 참 */
  seats: number;
  /** 곧 생길 자리: date부터 seats자리 (실제 시간표만) */
  soon: { date: string; seats: number }[];
  /** 이 반에 맞는 대기자 id */
  waitIds: string[];
}

export interface SlotOption {
  weekday: Weekday;
  startTime: string;
  /** :30 시작(기본 시각) */
  basic: boolean;
  /** 학년별 선호 시간대에 맞음 */
  preferred: boolean;
  waitIds: string[];
}

export interface VacancyResult {
  /** A. 같은 학년 반: 빈자리 있거나 곧 생기는 반 */
  same: ClassVacancy[];
  /** 참고: 바로 위아래 학년 반 */
  nearby: ClassVacancy[];
  /** 곧 비는 시간: 기준일에 초4가 되는 반(졸업 대상, 운영 여부 확인) */
  graduating: ClassVacancy[];
  /** B. 새 반 개설 가능 시각(요일 순, 같은 요일 안에서는 선호 → 시각 순) */
  slots: SlotOption[];
}

// ---------------------------------------------------------------

/** 출생연도 → 기준일 학년 코드 */
export const gradeFromBirthYear = (birthYear: number, baseDate: string) => schoolYearOf(baseDate) - birthYear;

/** 희망 시작 시기가 기준일의 달 ±1개월 안인지(비어 있으면 항상) */
export function wishMonthFits(wishStartMonth: string | null | undefined, baseDate: string): boolean {
  if (!wishStartMonth) return true;
  return Math.abs(monthIndex(wishStartMonth) - monthIndex(baseDate.slice(0, 7))) <= 1;
}

/** 이 학년·시간에 맞는 대기자(진행 중, 같은 학년, 희망 요일·시간, 희망 시작 시기) */
export function matchingWaitlist(waitlist: WaitlistRow[], grade: number | null, slot: { weekday: Weekday; startTime: string }, baseDate: string): WaitlistRow[] {
  if (grade === null) return [];
  return waitlist.filter(
    (w) =>
      OPEN_STAGES.includes(w.stage) &&
      gradeCodeOn({ birthday: w.birthday, gradeCode: w.gradeCode, gradeBasisYear: w.gradeBasisYear }, baseDate) === grade &&
      fitsWish(w.wish, slot) &&
      wishMonthFits(w.wishStartMonth, baseDate),
  );
}

/** 기준일 인원(실제): 그날을 포함하는 배정(예정 배정 포함), 그날 퇴원한 학생 제외, 휴원생은 포함 */
export function headcountOn(enrollments: EnrollmentRow[], students: StudentRow[], classId: string, date: string): number {
  const byId = new Map(students.map((s) => [s.id, s]));
  const ids = new Set<string>();
  for (const e of enrollments) {
    if (e.classId !== classId || e.startDate > date || (e.endDate && e.endDate < date)) continue;
    const s = byId.get(e.studentId);
    if (!s) continue;
    const left = s.status === 'left' && (!s.statusFrom || s.statusFrom <= date);
    if (!left) ids.add(s.id);
  }
  return ids.size;
}

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** 기준일 이후 SOON_DAYS일 안에 자리가 늘어나는 날짜들 */
function soonSeats(enrollments: EnrollmentRow[], students: StudentRow[], classId: string, baseDate: string, seatsNow: number): { date: string; seats: number }[] {
  const until = addDays(baseDate, SOON_DAYS);
  const dates = new Set<string>();
  const byId = new Map(students.map((s) => [s.id, s]));
  for (const e of enrollments) {
    if (e.classId !== classId) continue;
    if (e.endDate && e.endDate >= baseDate && e.endDate < until) dates.add(addDays(e.endDate, 1));
    const s = byId.get(e.studentId);
    if (s?.status === 'left' && s.statusFrom && s.statusFrom > baseDate && s.statusFrom <= until) dates.add(s.statusFrom);
  }
  const out: { date: string; seats: number }[] = [];
  let best = Math.max(seatsNow, 0);
  for (const d of [...dates].sort()) {
    const seats = SIM_CAPACITY - headcountOn(enrollments, students, classId, d);
    if (seats > best) {
      out.push({ date: d, seats });
      best = seats;
    }
  }
  return out;
}

interface ClassLike {
  id: string;
  realClassId: string | null;
  weekday: Weekday;
  startTime: string;
  grade: number | null;
  alias: string | null;
  count: number;
  soon: (seatsNow: number) => { date: string; seats: number }[];
}

/** 기준일에 운영 중인 반(데이터 기준별) */
function classesAt(input: VacancyInput): ClassLike[] {
  const { source, baseDate } = input;
  if (source.kind === 'real') {
    return source.classes
      .filter((c) => isClassOpenOn(c, baseDate))
      .map((c) => ({
        id: c.id,
        realClassId: c.id,
        weekday: c.weekday,
        startTime: c.startTime,
        grade: classGradeCodeOn(c, baseDate),
        alias: c.alias,
        count: headcountOn(source.enrollments, source.students, c.id, baseDate),
        soon: (seatsNow: number) => soonSeats(source.enrollments, source.students, c.id, baseDate, seatsNow),
      }));
  }
  // 시안: 빼놓은 반·합쳐진 반 제외, 퇴원 예정 아이는 빈자리, 신규·임시 이름은 인원에 포함(headcount)
  const d = source.draft;
  return liveClasses(d).map((c) => ({
    id: c.id,
    realClassId: c.sourceClassId,
    weekday: c.weekday,
    startTime: c.startTime,
    grade: classGradeCodeOn(c, baseDate),
    alias: c.alias,
    count: headcount(d, c.id),
    soon: () => [],
  }));
}

const byTime = (a: { weekday: number; startTime: string }, b: { weekday: number; startTime: string }) =>
  a.weekday - b.weekday || toMinutes(a.startTime) - toMinutes(b.startTime);

export function computeVacancies(input: VacancyInput): VacancyResult {
  const { baseDate, grade, waitlist, hours } = input;
  const preferred = input.preferredAfter ?? DEFAULT_PREFERRED_AFTER;
  const classes = classesAt(input).sort(byTime);

  const view = (c: ClassLike): ClassVacancy => {
    const seats = SIM_CAPACITY - c.count;
    return {
      id: c.id,
      realClassId: c.realClassId,
      weekday: c.weekday,
      startTime: c.startTime,
      grade: c.grade,
      alias: c.alias,
      count: c.count,
      seats,
      soon: c.soon(seats),
      waitIds: matchingWaitlist(waitlist, c.grade, c, baseDate).map((w) => w.id),
    };
  };
  const withRoom = (v: ClassVacancy) => v.seats > 0 || v.soon.length > 0;

  const graduating = classes.filter((c) => c.grade !== null && c.grade >= GRADUATE_CODE).map(view);
  const same = classes.filter((c) => c.grade === grade).map(view).filter(withRoom);
  const nearby = classes
    .filter((c) => c.grade !== null && c.grade < GRADUATE_CODE && Math.abs(c.grade - grade) === 1)
    .map(view)
    .filter(withRoom);

  // B. 새 반: 운영 시간 안, 기존 반과 겹치지 않고 앞뒤 간격 10분 이상(졸업 대상 반도 자리를 차지한다)
  const after = preferred[grade] ?? null;
  const others = classes.map((c) => ({ id: c.id, weekday: c.weekday, startTime: c.startTime, openedOn: null, closedOn: null }));
  const slots: SlotOption[] = [];
  for (const wd of SIM_WEEKDAYS) {
    const h = hours[wd];
    const day: SlotOption[] = [];
    for (let m = toMinutes(h.start); m + CLASS_MINUTES <= toMinutes(h.end); m += 10) {
      const startTime = fromMinutes(m);
      const { conflicts, tight } = checkClassTime({ id: '__new__', weekday: wd, startTime, openedOn: null, closedOn: null }, others, baseDate);
      if (conflicts.length > 0 || tight.length > 0) continue;
      day.push({
        weekday: wd,
        startTime,
        basic: m % 60 === 30,
        preferred: after !== null && m >= toMinutes(after),
        waitIds: matchingWaitlist(waitlist, grade, { weekday: wd, startTime }, baseDate).map((w) => w.id),
      });
    }
    day.sort((a, b) => Number(b.preferred) - Number(a.preferred) || toMinutes(a.startTime) - toMinutes(b.startTime));
    slots.push(...day);
  }

  return { same, nearby, graduating, slots };
}
