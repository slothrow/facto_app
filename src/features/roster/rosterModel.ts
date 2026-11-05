// 반·학생 화면에서 쓰는 계산(순수 함수). 화면 코드와 분리해서 테스트한다.
import { CLASS_MINUTES, checkClassTime, fromMinutes, isClassActive, shortTime, toMinutes } from '../../engine/classTime.ts';
import { classGradeCodeOn, gradeCodeOn, gradeLabel } from '../../engine/grade.ts';
import type { ClassRow, EnrollmentRow, RosterData, StudentRow } from '../../storage/rosterTypes.ts';

export const WEEKDAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
export const CLASS_WEEKDAYS = [1, 2, 3, 4, 5] as const;
/** 기본 정원. 확인 후 5명까지 */
export const CAPACITY = 4;
export const CAPACITY_MAX = 5;
export const MIN_HEADCOUNT = 2;

export const classGradeLabel = (cls: ClassRow, date: string) => gradeLabel(classGradeCodeOn(cls, date));

/** 예: "화 4:30 초2" (+ 별칭) */
export function classDisplayName(cls: ClassRow, date: string): string {
  const base = `${WEEKDAY_NAMES[cls.weekday]} ${shortTime(cls.startTime)} ${classGradeLabel(cls, date)}`;
  return cls.alias ? `${base} ${cls.alias}` : base;
}

export const classEndTime = (cls: Pick<ClassRow, 'startTime'>) => fromMinutes(toMinutes(cls.startTime) + CLASS_MINUTES);

export const compareClasses = (a: ClassRow, b: ClassRow) =>
  a.weekday - b.weekday || toMinutes(a.startTime) - toMinutes(b.startTime);

// ---------------------------------------------------------------
// 배정·상태
// ---------------------------------------------------------------

export const enrollmentCovers = (e: EnrollmentRow, date: string) => e.startDate <= date && (!e.endDate || date <= e.endDate);

/** 그 날짜의 학생 상태 */
export function studentStatusOn(s: StudentRow, date: string): StudentRow['status'] {
  if (s.status === 'left') return !s.statusFrom || s.statusFrom <= date ? 'left' : 'active';
  if (s.status === 'paused') {
    const started = !s.statusFrom || s.statusFrom <= date;
    const ended = s.statusTo !== null && date > s.statusTo;
    return started && !ended ? 'paused' : 'active';
  }
  return 'active';
}

/** 그 날짜의 반 명단(SPEC 3.3): 그 날짜를 포함하는 배정 중 그날 재원인 학생 */
export function classMembersOn(roster: Pick<RosterData, 'enrollments' | 'students'>, classId: string, date: string): StudentRow[] {
  const byId = new Map(roster.students.map((s) => [s.id, s]));
  const seen = new Set<string>();
  const out: StudentRow[] = [];
  for (const e of roster.enrollments) {
    if (e.classId !== classId || !enrollmentCovers(e, date) || seen.has(e.studentId)) continue;
    const s = byId.get(e.studentId);
    if (s && studentStatusOn(s, date) === 'active') {
      seen.add(s.id);
      out.push(s);
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

/**
 * 정원 계산용 인원: 오늘 이후에도 이어지는 배정(예정 포함) 중 퇴원하지 않은 학생 수.
 * 휴원 중인 학생도 자리를 차지한다고 본다.
 */
export function classHeadcount(roster: Pick<RosterData, 'enrollments' | 'students'>, classId: string, today: string): number {
  const byId = new Map(roster.students.map((s) => [s.id, s]));
  const ids = new Set<string>();
  for (const e of roster.enrollments) {
    if (e.classId !== classId || (e.endDate && e.endDate < today)) continue;
    const s = byId.get(e.studentId);
    if (s && s.status !== 'left') ids.add(s.id);
  }
  return ids.size;
}

/** 학생의 현재 배정(오늘 포함). 없으면 가장 가까운 예정 배정 */
export function currentEnrollment(enrollments: EnrollmentRow[], studentId: string, today: string): EnrollmentRow | null {
  const mine = enrollments.filter((e) => e.studentId === studentId && (!e.endDate || e.endDate >= today));
  return mine.find((e) => enrollmentCovers(e, today)) ?? mine.sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null;
}

export const studentGradeLabel = (s: StudentRow, date: string) => gradeLabel(gradeCodeOn(s, date));

// ---------------------------------------------------------------
// 반 경고
// ---------------------------------------------------------------

export interface ClassBadge {
  kind: 'few' | 'over' | 'tight' | 'gradeMismatch' | 'noGrade';
  text: string;
}

export function classBadges(roster: RosterData, cls: ClassRow, today: string): ClassBadge[] {
  if (!isClassActive(cls, today)) return [];
  const out: ClassBadge[] = [];
  const count = classHeadcount(roster, cls.id, today);
  if (count < MIN_HEADCOUNT) out.push({ kind: 'few', text: `${MIN_HEADCOUNT}명 미만` });
  if (count > CAPACITY) out.push({ kind: 'over', text: `정원 초과` });
  if (checkClassTime(cls, roster.classes, today).tight.length > 0) out.push({ kind: 'tight', text: '간격 10분 미만' });
  const classGrade = classGradeCodeOn(cls, today);
  if (classGrade === null) out.push({ kind: 'noGrade', text: '학년 미정' });
  const mismatch = classGrade !== null && classMembersOn(roster, cls.id, today).some((s) => {
    const g = gradeCodeOn(s, today);
    return g !== null && g !== classGrade;
  });
  if (mismatch) out.push({ kind: 'gradeMismatch', text: '학년 다른 학생' });
  return out;
}
