// SPEC_students 2.4(학년 계산), 3.2(시간 겹침·간격) 테스트 기준
import { describe, expect, it } from 'vitest';
import { checkClassTime, formatTimeKo, gapMinutes, isClassOpenOn, type TimedClass } from './classTime.ts';
import { classGradeCodeOn, gradeCodeOn, gradeLabel, schoolYearOf } from './grade.ts';
import { freeStandardSlots, timetableRange } from '../features/roster/rosterModel.ts';

const born = (birthday: string, gradeAdjust = 0) => ({ birthday, gradeCode: null, gradeBasisYear: null, gradeAdjust });
const labelOn = (src: Parameters<typeof gradeCodeOn>[0], date: string) => gradeLabel(gradeCodeOn(src, date));

describe('학년도', () => {
  it('3월 1일부터 새 학년도', () => {
    expect(schoolYearOf('2027-02-28')).toBe(2026);
    expect(schoolYearOf('2027-03-01')).toBe(2027);
  });
});

describe('학년 계산 (SPEC 2.4)', () => {
  it('생일 2020-05-01', () => {
    expect(labelOn(born('2020-05-01'), '2026-11-05')).toBe('7세');
    expect(labelOn(born('2020-05-01'), '2027-02-28')).toBe('7세');
    expect(labelOn(born('2020-05-01'), '2027-03-01')).toBe('초1');
  });
  it('생일 2022-01-10 → 5세', () => {
    expect(labelOn(born('2022-01-10'), '2026-11-05')).toBe('5세');
  });
  it('생일 2016-12-31 → 초4, 다음 학년도엔 운영 대상 외', () => {
    expect(labelOn(born('2016-12-31'), '2026-11-05')).toBe('초4');
    expect(labelOn(born('2016-12-31'), '2027-03-01')).toBe('운영 대상 외');
  });
  it('보정 -1(유예)', () => {
    expect(labelOn(born('2020-05-01', -1), '2027-03-01')).toBe('7세');
  });
  it('생일이 없으면 입력한 학년에서 자동 진급', () => {
    const src = { birthday: null, gradeCode: 8, gradeBasisYear: 2026 };
    expect(labelOn(src, '2026-11-05')).toBe('초2');
    expect(labelOn(src, '2027-03-01')).toBe('초3');
  });
  it('학년 정보가 없으면 미정', () => {
    expect(labelOn({ birthday: null, gradeCode: null, gradeBasisYear: null }, '2026-11-05')).toBe('학년 미정');
  });
  it('반 학년 자동 진급: 2026학년도 7세반 → 2027년 3월부터 초1반', () => {
    const cls = { gradeCode: 6, gradeBasisYear: 2026 };
    expect(gradeLabel(classGradeCodeOn(cls, '2027-02-28'))).toBe('7세');
    expect(gradeLabel(classGradeCodeOn(cls, '2027-03-01'))).toBe('초1');
  });
});

const cls = (id: string, startTime: string, extra: Partial<TimedClass> = {}): TimedClass => ({
  id,
  weekday: 2,
  startTime,
  openedOn: null,
  closedOn: null,
  ...extra,
});

describe('반 시간 검사 (SPEC 3.2)', () => {
  const today = '2026-11-05';
  it('16:30 + 17:30 → 정상(간격 10분)', () => {
    expect(gapMinutes('16:30', '17:30')).toBe(10);
    expect(checkClassTime(cls('b', '17:30'), [cls('a', '16:30')], today)).toEqual({ conflicts: [], tight: [] });
  });
  it('16:30 + 17:20 → 경고(간격 0분)', () => {
    const r = checkClassTime(cls('b', '17:20'), [cls('a', '16:30')], today);
    expect(r.conflicts).toEqual([]);
    expect(r.tight.map((c) => c.id)).toEqual(['a']);
  });
  it('16:30 + 17:10 → 저장 불가(겹침)', () => {
    const r = checkClassTime(cls('b', '17:10'), [cls('a', '16:30')], today);
    expect(r.conflicts.map((c) => c.id)).toEqual(['a']);
  });
  it('앞에 있는 반과도 비교한다(새 반이 더 이른 시간)', () => {
    expect(checkClassTime(cls('b', '15:50'), [cls('a', '16:30')], today).conflicts).toHaveLength(1);
  });
  it('다른 요일, 폐반한 반, 자기 자신은 비교하지 않는다', () => {
    const others = [
      cls('a', '16:30', { weekday: 3 }),
      cls('c', '16:30', { closedOn: '2026-10-01' }),
      cls('b', '16:30'),
    ];
    expect(checkClassTime(cls('b', '16:40'), others, today)).toEqual({ conflicts: [], tight: [] });
  });
  it('폐반 예정(미래 폐반일)인 반은 아직 운영 중', () => {
    expect(checkClassTime(cls('b', '16:30'), [cls('a', '16:30', { closedOn: '2026-12-01' })], today).conflicts).toHaveLength(1);
  });
});

describe('기타', () => {
  it('시간 표시', () => {
    expect(formatTimeKo('16:30')).toBe('오후 4:30');
    expect(formatTimeKo('10:00')).toBe('오전 10:00');
    expect(formatTimeKo('12:10')).toBe('오후 12:10');
  });
  it('운영 기간: 폐반일부터 운영하지 않음', () => {
    const c = { openedOn: '2026-03-02', closedOn: '2026-12-01' };
    expect(isClassOpenOn(c, '2026-03-01')).toBe(false);
    expect(isClassOpenOn(c, '2026-11-30')).toBe(true);
    expect(isClassOpenOn(c, '2026-12-01')).toBe(false);
  });
});

describe('시간표 배치(10분 단위)', () => {
  it('세로 범위: 기본 1:30~6:20, 더 이른·늦은 반이 있으면 넓힘', () => {
    expect(timetableRange([])).toEqual({ start: 810, end: 1100 });
    expect(timetableRange([{ startTime: '13:40' }])).toEqual({ start: 810, end: 1100 });
    expect(timetableRange([{ startTime: '18:30' }, { startTime: '12:00' }])).toEqual({ start: 720, end: 1160 });
  });
  it('1:40반(~2:30)이 있으면 겹치는 1:30 빈칸만 숨김', () => {
    expect(freeStandardSlots([{ startTime: '13:40' }])).toEqual(['14:30', '15:30', '16:30', '17:30']);
    expect(freeStandardSlots([{ startTime: '13:50' }])).toEqual(['15:30', '16:30', '17:30']);
    expect(freeStandardSlots([{ startTime: '16:30' }])).toEqual(['13:30', '14:30', '15:30', '17:30']);
  });
});
