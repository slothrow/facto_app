import { describe, expect, it } from 'vitest';
import { createSeedAppData } from '../../data/seedAppData.ts';
import { applyChange, emptyRoster, type RosterData } from '../../storage/rosterTypes.ts';
import { blankStudent } from '../roster/students/studentModel.ts';
import { makeupDaysIn, makeupSlots, monthMakeup, planBooking, planCancelBooking } from './makeupModel.ts';

const data = createSeedAppData();

function roster(): RosterData {
  return {
    ...emptyRoster(),
    students: [
      { ...blankStudent('가', '2026-09-01'), id: 's1' },
      { ...blankStudent('나', '2026-09-01'), id: 's2' },
      { ...blankStudent('다', '2026-09-01'), id: 's3', status: 'left' },
    ],
    absences: [
      { date: '2026-11-10', classId: 'c', studentId: 's1' },
      { date: '2026-11-24', classId: 'c', studentId: 's1' },
      { date: '2026-11-12', classId: 'c', studentId: 's2' },
      { date: '2026-11-12', classId: 'c', studentId: 's3' },
      { date: '2026-10-30', classId: 'c', studentId: 's2' },
    ],
  };
}

describe('토요보강', () => {
  it('타임: 9:00~14:00, 30분씩 10개', () => {
    expect(makeupSlots()).toEqual(['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30']);
  });

  it('보강 날짜는 그 달 보강데이(시드: 11/28, 12/19)', () => {
    expect(makeupDaysIn(data, '2026-11')).toEqual(['2026-11-28']);
    expect(makeupDaysIn(data, '2026-12')).toEqual(['2026-12-19']);
  });

  it('미정: 그 달 결석한 학생, 여러 번 결석해도 1번, 퇴원생·다른 달 제외', () => {
    const m = monthMakeup(data, roster(), '2026-11');
    expect(m.pending.map((p) => [p.student.id, p.absenceDates])).toEqual([
      ['s1', ['2026-11-10', '2026-11-24']],
      ['s2', ['2026-11-12']],
    ]);
    expect(m.days[0].slots.every((s) => s.booking === null)).toBe(true);
  });

  it('예약하면 미정에서 빠지고 타임에 올라간다', () => {
    let r = roster();
    r = applyChange(r, planBooking(r, 's1', '2026-11-28', '10:00')!);
    const m = monthMakeup(data, r, '2026-11');
    expect(m.pending.map((p) => p.student.id)).toEqual(['s2']);
    expect(m.days[0].slots.find((s) => s.time === '10:00')!.student!.id).toBe('s1');
  });

  it('한 타임에 1명: 이미 찬 타임은 예약 불가', () => {
    let r = roster();
    r = applyChange(r, planBooking(r, 's1', '2026-11-28', '10:00')!);
    expect(planBooking(r, 's2', '2026-11-28', '10:00')).toBeNull();
  });

  it('학생당 그 달 1번: 다시 예약하면 시간을 옮긴다', () => {
    let r = roster();
    r = applyChange(r, planBooking(r, 's1', '2026-11-28', '10:00')!);
    r = applyChange(r, planBooking(r, 's1', '2026-11-28', '11:30')!);
    expect(r.makeupBookings).toHaveLength(1);
    expect(r.makeupBookings[0].startTime).toBe('11:30');
  });

  it('취소하면 다시 미정', () => {
    let r = roster();
    r = applyChange(r, planBooking(r, 's1', '2026-11-28', '10:00')!);
    r = applyChange(r, planCancelBooking(r.makeupBookings[0]));
    expect(monthMakeup(data, r, '2026-11').pending.map((p) => p.student.id)).toContain('s1');
  });

  it('보강데이가 바뀌면 그 예약은 "날짜 확인 필요"', () => {
    let r = roster();
    r = applyChange(r, planBooking(r, 's1', '2026-11-28', '10:00')!);
    const moved = { ...data, makeupOverrides: [...data.makeupOverrides, { date: '2026-11-28', type: 'remove' as const }, { date: '2026-11-21', type: 'add' as const }] };
    const m = monthMakeup(moved, r, '2026-11');
    expect(m.misplaced.map((x) => x.booking.studentId)).toEqual(['s1']);
  });
});
