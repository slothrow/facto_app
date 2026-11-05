// 토요보강 예약 계산(순수 함수).
// - 보강 날짜: 그 달의 보강데이(달력에서 자동 제안·지정된 토요일)만
// - 타임: 9:00~14:00, 30분, 한 타임에 학생 1명
// - 미정: 그 달(결석 날짜의 달력월)에 결석했는데 그 달 보강 예약이 없는 학생. 결석이 여러 번이어도 학생당 1번(보강 월 1회)
import { scheduleFor } from '../../app/scheduleInput.ts';
import { fromMinutes, toMinutes } from '../../engine/classTime.ts';
import { monthEnd, monthOf, monthStart } from '../../engine/dates.ts';
import { newId, type MakeupBookingRow, type RosterChange, type RosterData, type StudentRow } from '../../storage/rosterTypes.ts';
import type { AppData } from '../../storage/types.ts';

export const MAKEUP_START = '09:00';
export const MAKEUP_END = '14:00';
export const MAKEUP_MINUTES = 30;

export function makeupSlots(start = MAKEUP_START, end = MAKEUP_END): string[] {
  const out: string[] = [];
  for (let m = toMinutes(start); m + MAKEUP_MINUTES <= toMinutes(end); m += MAKEUP_MINUTES) out.push(fromMinutes(m));
  return out;
}

/** 그 달의 보강데이 */
export function makeupDaysIn(data: AppData, ym: string): string[] {
  const out = scheduleFor(data, { from: monthStart(ym), to: monthEnd(ym) });
  return out.monthSummaries.find((s) => s.calendarMonth === ym)?.makeupDays ?? [];
}

export interface SlotView {
  time: string;
  booking: MakeupBookingRow | null;
  student: StudentRow | null;
}

export interface PendingStudent {
  student: StudentRow;
  /** 그 달 결석 날짜 */
  absenceDates: string[];
}

export interface MonthMakeup {
  days: { date: string; slots: SlotView[] }[];
  pending: PendingStudent[];
  /** 그 달 예약인데 날짜가 보강데이가 아니게 된 것(보강데이를 바꾼 경우) */
  misplaced: { booking: MakeupBookingRow; student: StudentRow | null }[];
}

export function monthMakeup(data: AppData, roster: Pick<RosterData, 'students' | 'absences' | 'makeupBookings'>, ym: string): MonthMakeup {
  const byId = new Map(roster.students.map((s) => [s.id, s]));
  const days = makeupDaysIn(data, ym);
  const bookings = roster.makeupBookings.filter((b) => monthOf(b.date) === ym);
  const bookedStudents = new Set(bookings.map((b) => b.studentId));

  const absMap = new Map<string, string[]>();
  for (const a of roster.absences) {
    if (monthOf(a.date) !== ym) continue;
    absMap.set(a.studentId, [...(absMap.get(a.studentId) ?? []), a.date]);
  }
  const pending: PendingStudent[] = [];
  for (const [sid, dates] of absMap) {
    const s = byId.get(sid);
    if (!s || s.status === 'left' || bookedStudents.has(sid)) continue;
    pending.push({ student: s, absenceDates: [...new Set(dates)].sort() });
  }
  pending.sort((a, b) => a.absenceDates[0].localeCompare(b.absenceDates[0]) || a.student.name.localeCompare(b.student.name, 'ko'));

  return {
    days: days.map((date) => ({
      date,
      slots: makeupSlots().map((time) => {
        const booking = bookings.find((b) => b.date === date && b.startTime === time) ?? null;
        return { time, booking, student: booking ? (byId.get(booking.studentId) ?? null) : null };
      }),
    })),
    pending,
    misplaced: bookings
      .filter((b) => !days.includes(b.date) || !makeupSlots().includes(b.startTime))
      .map((b) => ({ booking: b, student: byId.get(b.studentId) ?? null })),
  };
}

/**
 * 예약(또는 옮기기). 한 타임에 1명, 학생당 그 달 1번.
 * 이미 그 달 예약이 있으면 그 예약을 새 날짜·시간으로 옮긴다. 타임이 차 있으면 null.
 */
export function planBooking(
  roster: Pick<RosterData, 'makeupBookings'>,
  studentId: string,
  date: string,
  startTime: string,
): RosterChange | null {
  const taken = roster.makeupBookings.find((b) => b.date === date && b.startTime === startTime);
  if (taken && taken.studentId !== studentId) return null;
  const mine = roster.makeupBookings.find((b) => b.studentId === studentId && monthOf(b.date) === monthOf(date));
  const row: MakeupBookingRow = mine ? { ...mine, date, startTime } : { id: newId(), studentId, date, startTime, memo: null };
  return { upsert: { makeupBookings: [row] } };
}

export const planCancelBooking = (b: MakeupBookingRow): RosterChange => ({ remove: { makeupBookings: [b] } });
