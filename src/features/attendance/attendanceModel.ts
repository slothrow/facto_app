// 결석 체크 계산(SPEC_students 8장). 순수 함수.
// - 그 날짜의 수업 반: 그 요일반에 회차가 있는 날만. 공휴일·휴원·비운 날은 "수업 없음".
// - 반 명단: 그날 기준 배정(3.3) + 그날 체험 학생. 기본은 전원 출석, 결석만 저장.
import { scheduleFor } from '../../app/scheduleInput.ts';
import { isClassOpenOn, toMinutes } from '../../engine/classTime.ts';
import type { DayCell } from '../../engine/types.ts';
import type { AbsenceRow, ClassRow, RosterData, StudentRow, TrialLessonRow, WaitlistRow } from '../../storage/rosterTypes.ts';
import type { AppData } from '../../storage/types.ts';
import { classMembersOn } from '../roster/rosterModel.ts';

export interface DayClasses {
  /** 수업이 있으면 null, 없으면 이유 */
  noClassReason: string | null;
  classes: ClassRow[];
  cell: DayCell;
}

export function noClassReasonOf(cell: DayCell): string | null {
  if (cell.status === 'session') return null;
  if (cell.status === 'holiday') return `공휴일${cell.holidayName ? `(${cell.holidayName})` : ''}`;
  if (cell.status === 'closed') return `휴원${cell.closureLabel ? `(${cell.closureLabel})` : ''}`;
  if (cell.status === 'skipped') return '휴강';
  if (cell.status === 'makeup') return '보강데이';
  return cell.weekday === 0 || cell.weekday === 6 ? '주말' : '수업 없음';
}

export function classesOnDate(data: AppData, roster: Pick<RosterData, 'classes'>, date: string): DayClasses {
  const cell = scheduleFor(data, { from: date, to: date }).days[0];
  const reason = noClassReasonOf(cell);
  const classes = reason
    ? []
    : roster.classes
        .filter((c) => c.weekday === cell.weekday && isClassOpenOn(c, date))
        .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
  return { noClassReason: reason, classes, cell };
}

export interface AttendanceEntry {
  kind: 'student' | 'trial';
  id: string;
  name: string;
  student?: StudentRow;
  trial?: TrialLessonRow;
  absent: boolean;
}

/** 그날 그 반 명단: 배정 학생(이름순) + 체험(뒤에) */
export function attendanceList(roster: RosterData, classId: string, date: string): AttendanceEntry[] {
  const absent = new Set(roster.absences.filter((a) => a.date === date && a.classId === classId).map((a) => a.studentId));
  const waitById = new Map<string, WaitlistRow>(roster.waitlist.map((w) => [w.id, w]));
  const members: AttendanceEntry[] = classMembersOn(roster, classId, date).map((s) => ({
    kind: 'student',
    id: s.id,
    name: s.name,
    student: s,
    absent: absent.has(s.id),
  }));
  const trials: AttendanceEntry[] = roster.trialLessons
    .filter((t) => t.date === date && t.classId === classId)
    .map((t) => ({
      kind: 'trial',
      id: t.id,
      name: (t.waitlistId && waitById.get(t.waitlistId)?.name) || t.name || '체험',
      trial: t,
      absent: false,
    }));
  return [...members, ...trials];
}

/** 결석 표시/해제 → 저장할 변경 */
export function toggleAbsence(roster: RosterData, date: string, classId: string, studentId: string) {
  const row: AbsenceRow = { date, classId, studentId };
  const exists = roster.absences.some((a) => a.date === date && a.classId === classId && a.studentId === studentId);
  return exists ? { remove: { absences: [row] } } : { upsert: { absences: [row] } };
}

/** 학생 월별 결석 */
export function absencesByMonth(absences: AbsenceRow[], studentId: string): { month: string; dates: string[] }[] {
  const map = new Map<string, string[]>();
  for (const a of absences.filter((x) => x.studentId === studentId).sort((x, y) => x.date.localeCompare(y.date))) {
    const ym = a.date.slice(0, 7);
    map.set(ym, [...(map.get(ym) ?? []), a.date]);
  }
  return [...map].map(([month, dates]) => ({ month, dates })).sort((a, b) => b.month.localeCompare(a.month));
}
