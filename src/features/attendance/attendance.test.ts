// SPEC_students 8장 결석 체크
import { describe, expect, it } from 'vitest';
import { scheduleFor } from '../../app/scheduleInput.ts';
import { createSeedAppData } from '../../data/seedAppData.ts';
import { applyChange, emptyRoster, type ClassRow, type RosterData } from '../../storage/rosterTypes.ts';
import { blankStudent, planEnroll } from '../roster/students/studentModel.ts';
import { absencesByMonth, attendanceList, classesOnDate, toggleAbsence } from './attendanceModel.ts';

const cls = (id: string, weekday: 1 | 2 | 3 | 4 | 5, startTime: string): ClassRow => ({
  id,
  weekday,
  startTime,
  gradeCode: 8,
  gradeBasisYear: 2026,
  alias: null,
  openedOn: null,
  closedOn: null,
  memo: null,
});

const data = createSeedAppData();
/** 기본 데이터에서 그 요일에 수업이 있는 첫 날, 없는 첫 날(공휴일 등) */
function findDays(weekday: number, from = '2026-11-01') {
  const days = scheduleFor(data, { from, to: '2027-03-31' }).days.filter((d) => d.weekday === weekday);
  return { session: days.find((d) => d.status === 'session')!.date, off: days.find((d) => d.status !== 'session')?.date };
}

describe('그 날짜의 수업 반', () => {
  it('회차가 있는 날: 그 요일의 운영 중인 반, 시간순', () => {
    const { session } = findDays(2);
    const roster = { classes: [cls('b', 2, '17:30'), cls('a', 2, '16:30'), cls('c', 3, '16:30'), { ...cls('d', 2, '15:30'), closedOn: '2026-01-01' }] };
    const r = classesOnDate(data, roster, session);
    expect(r.noClassReason).toBeNull();
    expect(r.classes.map((c) => c.id)).toEqual(['a', 'b']);
  });
  it('공휴일·휴원·비운 날·주말은 수업 없음', () => {
    const roster = { classes: [cls('a', 2, '16:30')] };
    const sat = '2026-11-07';
    expect(classesOnDate(data, roster, sat).classes).toEqual([]);
    expect(classesOnDate(data, roster, sat).noClassReason).not.toBeNull();
    // 비운 날(확정되지 않은 달에서)
    const { session } = findDays(2, '2027-01-01');
    const skipped = { ...data, sessionOverrides: [{ date: session, type: 'skip' as const }] };
    expect(classesOnDate(skipped, roster, session).noClassReason).toBe('휴강');
    // 설 대체공휴일(2027-02-09 화) = 공휴일
    expect(classesOnDate(data, roster, '2027-02-09').noClassReason).toMatch(/^공휴일/);
  });
});

describe('반 명단 + 결석', () => {
  function setup(): RosterData {
    let r: RosterData = {
      ...emptyRoster(),
      classes: [cls('a', 2, '16:30'), cls('b', 4, '16:30')],
      students: [
        { ...blankStudent('나', '2026-09-01'), id: 's2' },
        { ...blankStudent('가', '2026-09-01'), id: 's1' },
      ],
    };
    r = applyChange(r, planEnroll(r, 's1', r.classes[0], '2026-09-01', '2026-09-01'));
    r = applyChange(r, planEnroll(r, 's2', r.classes[0], '2026-09-01', '2026-09-01'));
    return r;
  }

  it('기본 전원 출석, 탭하면 결석, 다시 탭하면 해제', () => {
    let r = setup();
    expect(attendanceList(r, 'a', '2026-11-10').map((e) => [e.name, e.absent])).toEqual([
      ['가', false],
      ['나', false],
    ]);
    r = applyChange(r, toggleAbsence(r, '2026-11-10', 'a', 's2'));
    expect(r.absences).toEqual([{ date: '2026-11-10', classId: 'a', studentId: 's2' }]);
    expect(attendanceList(r, 'a', '2026-11-10').find((e) => e.id === 's2')!.absent).toBe(true);
    r = applyChange(r, toggleAbsence(r, '2026-11-10', 'a', 's2'));
    expect(r.absences).toEqual([]);
  });

  it('반 이동한 학생: 이동 전 날짜에는 이전 반 명단, 이동 후에는 새 반 명단', () => {
    let r = setup();
    r = applyChange(r, planEnroll(r, 's1', r.classes[1], '2026-12-03', '2026-11-05'));
    expect(attendanceList(r, 'a', '2026-12-01').map((e) => e.id)).toContain('s1');
    expect(attendanceList(r, 'b', '2026-12-01').map((e) => e.id)).not.toContain('s1');
    expect(attendanceList(r, 'a', '2026-12-08').map((e) => e.id)).not.toContain('s1');
    expect(attendanceList(r, 'b', '2026-12-03').map((e) => e.id)).toContain('s1');
  });

  it('그날 체험 학생은 "체험"으로 명단 뒤에 붙는다', () => {
    const r = { ...setup(), trialLessons: [{ id: 't', date: '2026-11-10', classId: 'a', waitlistId: null, name: '체험이', memo: null, startTime: null, gradeCode: null, gradeBasisYear: null }] };
    const list = attendanceList(r, 'a', '2026-11-10');
    expect(list).toHaveLength(3);
    expect(list[2]).toMatchObject({ kind: 'trial', name: '체험이' });
    expect(attendanceList(r, 'a', '2026-11-17')).toHaveLength(2);
  });

  it('학생 월별 결석', () => {
    const abs = [
      { date: '2026-11-10', classId: 'a', studentId: 's1' },
      { date: '2026-11-24', classId: 'a', studentId: 's1' },
      { date: '2026-12-01', classId: 'a', studentId: 's1' },
      { date: '2026-12-01', classId: 'a', studentId: 's2' },
    ];
    expect(absencesByMonth(abs, 's1')).toEqual([
      { month: '2026-12', dates: ['2026-12-01'] },
      { month: '2026-11', dates: ['2026-11-10', '2026-11-24'] },
    ]);
  });
});
