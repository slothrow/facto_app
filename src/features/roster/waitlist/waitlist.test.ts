// SPEC_students 6.3 빈자리 매칭, 7장 체험 → 대기자 단계 자동 변경
import { describe, expect, it } from 'vitest';
import { emptyRoster, type ClassRow, type RosterData, type WaitlistRow } from '../../../storage/rosterTypes.ts';
import { blankStudent } from '../students/studentModel.ts';
import { classMatchesForWaitlist, fitsWish, trialChange, waitlistMatchesForClass } from './waitlistModel.ts';

const today = '2026-11-05';
const cls = (id: string, weekday: 1 | 2 | 3 | 4 | 5, startTime: string, gradeCode: number | null = 8): ClassRow => ({
  id,
  weekday,
  startTime,
  gradeCode,
  gradeBasisYear: gradeCode === null ? null : 2026,
  alias: null,
  openedOn: null,
  closedOn: null,
  memo: null,
});
const wait = (over: Partial<WaitlistRow> = {}): WaitlistRow => ({
  id: 'w1',
  name: '대기',
  gradeCode: 8,
  gradeBasisYear: 2026,
  birthday: null,
  guardian: null,
  wish: {},
  inquiredOn: today,
  source: null,
  stage: 'inquiry',
  stageHistory: [],
  memo: null,
  studentId: null,
  ...over,
});

function withMembers(r: RosterData, classId: string, n: number): RosterData {
  const students = Array.from({ length: n }, (_, i) => ({ ...blankStudent(`학생${i}`, today), id: `${classId}-s${i}` }));
  return {
    ...r,
    students: [...r.students, ...students],
    enrollments: [...r.enrollments, ...students.map((s) => ({ id: `e-${s.id}`, studentId: s.id, classId, startDate: '2026-09-01', endDate: null }))],
  };
}

describe('희망 요일·시간', () => {
  it('비어 있으면 항상 맞음, 요일이 없으면 안 맞음, 시각 이후만', () => {
    expect(fitsWish({}, { weekday: 2, startTime: '16:30' })).toBe(true);
    expect(fitsWish({ 3: null }, { weekday: 2, startTime: '16:30' })).toBe(false);
    expect(fitsWish({ 2: '15:00' }, { weekday: 2, startTime: '16:30' })).toBe(true);
    expect(fitsWish({ 2: '17:00' }, { weekday: 2, startTime: '16:30' })).toBe(false);
  });
});

describe('빈자리 매칭 (SPEC 6.3)', () => {
  it('학년이 같고 인원 < 4인 운영 중인 반만', () => {
    let r: RosterData = {
      ...emptyRoster(),
      classes: [cls('a', 2, '16:30'), cls('b', 3, '16:30'), cls('c', 4, '16:30', 9), { ...cls('d', 5, '16:30'), closedOn: '2026-10-01' }, cls('e', 1, '16:30', null)],
      waitlist: [wait()],
    };
    r = withMembers(r, 'a', 3);
    r = withMembers(r, 'b', 4);
    expect(classMatchesForWaitlist(r, r.waitlist[0], today).map((c) => c.id)).toEqual(['a']);
    expect(waitlistMatchesForClass(r, r.classes[0], today)).toHaveLength(1);
    expect(waitlistMatchesForClass(r, r.classes[1], today)).toHaveLength(0);
  });
  it('등록·포기한 대기자는 매칭하지 않음', () => {
    const r: RosterData = { ...emptyRoster(), classes: [cls('a', 2, '16:30')], waitlist: [wait({ stage: 'dropped' })] };
    expect(waitlistMatchesForClass(r, r.classes[0], today)).toHaveLength(0);
  });
  it('생일이 있으면 생일 기준 학년으로 비교', () => {
    const r: RosterData = { ...emptyRoster(), classes: [cls('a', 2, '16:30', 6)], waitlist: [wait({ birthday: '2020-05-01', gradeCode: null, gradeBasisYear: null })] };
    expect(waitlistMatchesForClass(r, r.classes[0], today)).toHaveLength(1);
  });
});

describe('체험수업 (SPEC 7)', () => {
  const trial = { id: 't', date: '2026-11-10', classId: 'a', waitlistId: 'w1', name: '', memo: null, startTime: '18:30', gradeCode: null, gradeBasisYear: null };
  it('대기자에 연결하면 문의 → 체험 예약', () => {
    const ch = trialChange(trial, [wait()], today);
    expect(ch.upsert.waitlist[0].stage).toBe('trial_booked');
    expect(ch.upsert.waitlist[0].stageHistory.at(-1)).toEqual({ stage: 'trial_booked', date: today });
  });
  it('이미 체험 완료면 단계를 되돌리지 않음', () => {
    expect(trialChange(trial, [wait({ stage: 'trial_done' })], today).upsert.waitlist).toEqual([]);
  });
});
