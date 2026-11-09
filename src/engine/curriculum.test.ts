// SPEC_briefing 3.3 테스트 기준. 회차는 SPEC 7.2(휴원 없는 기준 입력)의 2027년 1~2월 결과를 쓴다.
import { describe, expect, it } from 'vitest';
import { seedInput } from '../data/seed.ts';
import {
  DEFAULT_CURRICULUM,
  codeFor,
  formatAnchor,
  formatProgress,
  normalizeUnitCode,
  parseUnitCode,
  progressAt,
  stageForGrade,
  stageFromText,
  withCurriculumDefaults,
  type ProgressAnchor,
} from './curriculum.ts';
import { schedule } from './schedule.ts';
import type { SessionLabel } from './types.ts';

const out = schedule(seedInput({ from: '2026-11-01', to: '2027-04-30' }));
const sessionOn = (date: string) => out.days.find((d) => d.date === date)?.session;
const codeOn = (anchors: ProgressAnchor[], date: string) => {
  const r = codeFor(anchors, sessionOn(date));
  return r.kind === 'code' ? r.code : r.kind;
};
const P8 = [{ courseMonth: '2026-12', stage: 'P', unit: 8 }] as ProgressAnchor[];
const label = (courseMonth: string, weekNo: 1 | 2 | 3 | 4): SessionLabel => ({ courseMonth, weekNo });

describe('3.3 화 반, 기준점 2026-12 = P8', () => {
  it('2027-01-05(화) = 1월 수업월 3주 → P9-3', () => {
    expect(sessionOn('2027-01-05')).toMatchObject(label('2027-01', 3));
    expect(codeOn(P8, '2027-01-05')).toBe('P9-3');
  });
  it('2027-02-23(화) = 3월 수업월 1주 → P11-1', () => {
    expect(sessionOn('2027-02-23')).toMatchObject(label('2027-03', 1));
    expect(codeOn(P8, '2027-02-23')).toBe('P11-1');
  });
});

describe('3.3 금 반, 기준점 2026-12 = P8', () => {
  it('2027-01-08(금) = 12월 수업월 4주 → P8-4 (달력은 1월이지만 수업월은 12월)', () => {
    expect(sessionOn('2027-01-08')).toMatchObject(label('2026-12', 4));
    expect(codeOn(P8, '2027-01-08')).toBe('P8-4');
  });
  it('2027-01-15(금) = 1월 수업월 1주 → P9-1', () => {
    expect(codeOn(P8, '2027-01-15')).toBe('P9-1');
  });
});

describe('3.3 단계 넘어가기·과정 완료', () => {
  it('기준점 2027-01 = P12 → 2027-02 수업월 = A1', () => {
    const r = codeFor([{ courseMonth: '2027-01', stage: 'P', unit: 12 }], label('2027-02', 2));
    expect(r).toMatchObject({ kind: 'code', code: 'A1-2', stage: 'A', unit: 1 });
  });
  it('기준점 2027-01 = S12 → 2027-02 수업월 = 과정 완료', () => {
    expect(codeFor([{ courseMonth: '2027-01', stage: 'S', unit: 12 }], label('2027-02', 1)).kind).toBe('done');
  });
});

describe('3.3 기준점 2개: 2026-12 = P8, 2027-03 = P5', () => {
  const two = [...P8, { courseMonth: '2027-03', stage: 'P', unit: 5 }] as ProgressAnchor[];
  it('2027-02 수업월 P10, 2027-03 수업월 P5, 2027-04 수업월 P6', () => {
    expect(progressAt(two, '2027-02')).toEqual({ kind: 'unit', stage: 'P', unit: 10, week: 1 });
    expect(progressAt(two, '2027-03')).toEqual({ kind: 'unit', stage: 'P', unit: 5, week: 1 });
    expect(progressAt(two, '2027-04')).toEqual({ kind: 'unit', stage: 'P', unit: 6, week: 1 });
  });
});

describe('3.3 회차 없는 날', () => {
  it('공휴일(2027-02-09 화) → 코드 없음', () => {
    expect(out.days.find((d) => d.date === '2027-02-09')?.status).toBe('holiday');
    expect(codeOn(P8, '2027-02-09')).toBe('noSession');
  });
});

describe('기준점 주차(B1-3처럼 단원 중간에서 시작)', () => {
  const B13 = [{ courseMonth: '2027-01', stage: 'B', unit: 1, unitWeek: 3 }] as ProgressAnchor[];
  it('1월 수업월 1~4회 = B1-3, B1-4, B2-1, B2-2', () => {
    expect([1, 2, 3, 4].map((w) => codeFor(B13, label('2027-01', w as 1 | 2 | 3 | 4)))).toMatchObject([
      { code: 'B1-3', unit: 1 },
      { code: 'B1-4', unit: 1 },
      { code: 'B2-1', unit: 2 },
      { code: 'B2-2', unit: 2 },
    ]);
  });
  it('다음 수업월 1회 = B2-3, 표시는 "B2-3"', () => {
    expect(codeFor(B13, label('2027-02', 1))).toMatchObject({ code: 'B2-3' });
    expect(formatProgress(progressAt(B13, '2027-02'))).toBe('B2-3');
  });
  it('주차 1은 예전과 같다(표시 "B1")', () => {
    const b = [{ courseMonth: '2027-01', stage: 'B', unit: 1, unitWeek: 1 }] as ProgressAnchor[];
    expect(codeFor(b, label('2027-02', 3))).toMatchObject({ code: 'B2-3' });
    expect(formatProgress(progressAt(b, '2027-01'))).toBe('B1');
  });
  it('단계 끝 넘어가기: B12-4 다음 회차 = S1-1, S12-4 다음 = 과정 완료', () => {
    const a = [{ courseMonth: '2027-01', stage: 'B', unit: 12, unitWeek: 4 }] as ProgressAnchor[];
    expect(codeFor(a, label('2027-01', 2))).toMatchObject({ code: 'S1-1', stage: 'S', unit: 1 });
    const s = [{ courseMonth: '2027-01', stage: 'S', unit: 12, unitWeek: 3 }] as ProgressAnchor[];
    expect(codeFor(s, label('2027-01', 2))).toMatchObject({ code: 'S12-4' });
    expect(codeFor(s, label('2027-01', 3)).kind).toBe('done');
  });
  it('기준점 표시', () => {
    expect(formatAnchor(B13[0])).toBe('B1-3');
    expect(formatAnchor({ stage: 'P', unit: 8 })).toBe('P8-1');
    expect(formatAnchor({ stage: 'basic', unit: null })).toBe('베이직');
  });
});

describe('진도 미설정·베이직', () => {
  it('기준점이 없거나 그 수업월보다 뒤에만 있으면 진도 미설정', () => {
    expect(codeFor([], label('2027-01', 1)).kind).toBe('unset');
    expect(codeFor([{ courseMonth: '2027-03', stage: 'P', unit: 1 }], label('2027-01', 1)).kind).toBe('unset');
  });
  it('베이직 기준점은 다음 기준점 전까지 계속 베이직(코드 없음), 그 뒤 K1부터 자동 계산', () => {
    const a = [
      { courseMonth: '2026-11', stage: 'basic', unit: null },
      { courseMonth: '2027-03', stage: 'K', unit: 1 },
    ] as ProgressAnchor[];
    expect(codeFor(a, label('2027-02', 3)).kind).toBe('basic');
    expect(codeFor(a, label('2027-04', 2))).toMatchObject({ kind: 'code', code: 'K2-2' });
  });
});

describe('코드 읽기·설정', () => {
  it('코드 형식 검사(대소문자·공백 허용, 단원 1~12, 주차 1~4)', () => {
    expect(parseUnitCode('p8-1')).toEqual({ stage: 'P', unit: 8, weekNo: 1 });
    expect(normalizeUnitCode(' s12-4 ')).toBe('S12-4');
    expect(parseUnitCode('P13-1')).toBeNull();
    expect(parseUnitCode('P1-5')).toBeNull();
    expect(parseUnitCode('X1-1')).toBeNull();
  });
  it('접두어를 바꾸면 바뀐 접두어로 계산', () => {
    const s = withCurriculumDefaults({ P: { prefix: 'PF' } });
    expect(codeFor(P8, label('2027-01', 1), s)).toMatchObject({ code: 'PF9-1' });
    expect(parseUnitCode('PF9-1', s)).toEqual({ stage: 'P', unit: 9, weekNo: 1 });
  });
  it('학년 기본 매칭: 7세(6) → P, 초1(7) → A, 5세(4) → 베이직, 초4(10) → 없음', () => {
    expect(stageForGrade(6)).toBe('P');
    expect(stageForGrade(7)).toBe('A');
    expect(stageForGrade(4)).toBe('basic');
    expect(stageForGrade(10)).toBeNull();
  });
  it('단계 입력값 읽기', () => {
    expect(stageFromText('p', DEFAULT_CURRICULUM)).toBe('P');
    expect(stageFromText('베이직', DEFAULT_CURRICULUM)).toBe('basic');
    expect(stageFromText('Z', DEFAULT_CURRICULUM)).toBeNull();
  });
});
