// SPEC_briefing 6.2·6.3: 개인 진도(배운 내용)와 반 브리핑 현황. 회차는 SPEC 7.2 기준 입력(2027년 1월).
import { describe, expect, it } from 'vitest';
import { seedInput } from '../../data/seed.ts';
import { DEFAULT_CURRICULUM } from '../../engine/curriculum.ts';
import { schedule } from '../../engine/schedule.ts';
import { emptyRoster, type ClassRow, type RosterData } from '../../storage/rosterTypes.ts';
import { blankStudent } from '../roster/students/studentModel.ts';
import { classMonthStatus, learnedHistory } from './learnedModel.ts';

const cells = schedule(seedInput({ from: '2026-12-01', to: '2027-02-28' })).days;
const cls = (id: string, weekday: 1 | 2 | 3 | 4 | 5, startTime: string): ClassRow => ({
  id,
  weekday,
  startTime,
  gradeCode: 6,
  gradeBasisYear: 2026,
  alias: null,
  openedOn: null,
  closedOn: null,
  memo: null,
});

// 화 반(P8 기준) → 1/13부터 금 반(A3 기준)으로 이동
function movedRoster(): RosterData {
  return {
    ...emptyRoster(),
    classes: [cls('tue', 2, '16:30'), cls('fri', 5, '15:40')],
    students: [{ ...blankStudent('가', '2026-11-01'), id: 'a' }, { ...blankStudent('나', '2026-11-01'), id: 'b' }],
    enrollments: [
      { id: 'e1', studentId: 'a', classId: 'tue', startDate: '2027-01-01', endDate: '2027-01-12' },
      { id: 'e2', studentId: 'a', classId: 'fri', startDate: '2027-01-13', endDate: null },
      { id: 'e3', studentId: 'b', classId: 'tue', startDate: '2027-01-01', endDate: null },
    ],
    progressAnchors: [
      { id: 'p1', classId: 'tue', courseMonth: '2026-12', stage: 'P', unit: 8, memo: null },
      { id: 'p2', classId: 'fri', courseMonth: '2026-12', stage: 'A', unit: 3, memo: null },
    ],
    absences: [{ date: '2027-01-15', classId: 'fri', studentId: 'a' }],
  };
}

describe('배운 내용(개인 진도, 계산값)', () => {
  it('반 이동 전 날짜는 이전 반 기준 코드, 이동 후는 새 반 기준, 결석 날은 미이수', () => {
    const items = learnedHistory(movedRoster(), 'a', cells, DEFAULT_CURRICULUM, '2027-01-22');
    expect(items.map((i) => [i.date, i.label, i.kind])).toEqual([
      ['2027-01-22', 'A4-2', 'done'], // 금 반: 1월 수업월 2주
      ['2027-01-15', 'A4-1', 'absent'],
      ['2027-01-12', 'P9-4', 'done'], // 화 반: 이동 전
      ['2027-01-05', 'P9-3', 'done'],
    ]);
  });

  it('보낸 기록이 있으면 ✓, 다른 반에서 받은 브리핑([+ 아이 추가])도 이수로 넣는다', () => {
    const r = movedRoster();
    r.briefings = [
      { id: 'x', date: '2027-01-05', classId: 'tue', studentId: 'a', code: 'P9-3', textSnapshot: 't', sharedAt: '2027-01-05T08:00:00Z' },
      { id: 'y', date: '2027-01-19', classId: 'tue', studentId: 'a', code: 'P10-1', textSnapshot: 't', sharedAt: '2027-01-19T08:00:00Z' },
    ];
    const items = learnedHistory(r, 'a', cells, DEFAULT_CURRICULUM, '2027-01-22');
    expect(items.find((i) => i.date === '2027-01-05')?.sent?.id).toBe('x');
    expect(items.find((i) => i.date === '2027-01-19')).toMatchObject({ kind: 'guest', label: 'P10-1' });
  });
});

describe('반 브리핑 현황(이번 수업월 날짜별 n/m 보냄)', () => {
  it('1월 수업월 화 반: 수업월 기준(12/22부터, 화요일은 달력보다 앞섬), 오늘(1/12)까지, 그날 명단 인원', () => {
    const r = movedRoster();
    r.briefings = [{ id: 'x', date: '2027-01-05', classId: 'tue', studentId: 'b', code: 'P9-3', textSnapshot: 't', sharedAt: '2027-01-05T08:00:00Z' }];
    const st = classMonthStatus(r, r.classes[0], '2027-01', cells, DEFAULT_CURRICULUM, '2027-01-12');
    expect(st.map((s) => [s.date, s.weekNo, s.label, s.sent, s.total])).toEqual([
      ['2026-12-22', 1, 'P9-1', 0, 0], // 아이들은 1/1부터 배정
      ['2026-12-29', 2, 'P9-2', 0, 0],
      ['2027-01-05', 3, 'P9-3', 1, 2],
      ['2027-01-12', 4, 'P9-4', 0, 2],
    ]);
  });
});
