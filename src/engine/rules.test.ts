// SPEC 3장 세부 규칙(0단계에서 결정한 내용 포함) 테스트.
import { describe, expect, it } from 'vitest';
import { seedInput } from '../data/seed.ts';
import { computeOffset } from './offset.ts';
import { schedule } from './schedule.ts';
import { actualAt, offsetOf } from './testUtils.ts';
import {
  formatCellLabel,
  formatOffset,
  formatSessionList,
  nextLabel,
  parseCode,
} from './label.ts';
import type { ScheduleInput } from './types.ts';

const RANGE = { from: '2026-11-01', to: '2027-02-28' };
const run = (patch: Partial<ScheduleInput> = {}) => schedule({ ...seedInput(RANGE), ...patch });
const messages = (out: ReturnType<typeof run>, type: string) =>
  out.warnings.filter((w) => w.type === type).map((w) => w.message);

describe('회차 라벨', () => {
  it('4주 다음은 다음 수업월 1주(연도 넘김 포함)', () => {
    expect(nextLabel({ courseMonth: '2026-11', weekNo: 3 })).toEqual({ courseMonth: '2026-11', weekNo: 4 });
    expect(nextLabel({ courseMonth: '2026-12', weekNo: 4 })).toEqual({ courseMonth: '2027-01', weekNo: 1 });
  });
  it('SPEC 표기 해석은 가까운 연도를 고른다', () => {
    expect(parseCode('2026-12-28', '1-1')).toEqual({ courseMonth: '2027-01', weekNo: 1 });
    expect(parseCode('2027-01-08', '12-4')).toEqual({ courseMonth: '2026-12', weekNo: 4 });
  });
  it('달력 칸 라벨: 같은 수업월이면 "2주", 다르면 "2월 1주"', () => {
    expect(formatCellLabel({ courseMonth: '2027-01', weekNo: 2 }, '2027-01')).toBe('2주');
    expect(formatCellLabel({ courseMonth: '2027-02', weekNo: 1 }, '2027-01')).toBe('2월 1주');
  });
  it('한 달 회차 내역 문구', () => {
    expect(
      formatSessionList([
        { courseMonth: '2026-11', weekNo: 1 },
        { courseMonth: '2026-11', weekNo: 2 },
        { courseMonth: '2026-11', weekNo: 3 },
        { courseMonth: '2026-11', weekNo: 4 },
        { courseMonth: '2026-12', weekNo: 1 },
      ]),
    ).toBe('11월 1~4주, 12월 1주');
    expect(
      formatSessionList([
        { courseMonth: '2027-02', weekNo: 1 },
        { courseMonth: '2027-02', weekNo: 3 },
      ]),
    ).toBe('2월 1·3주');
  });
  it('offset 표시와 공식', () => {
    expect(formatOffset(2)).toBe('+2 (2회 앞섬)');
    expect(formatOffset(-1)).toBe('−1 (1회 밀림)');
    expect(formatOffset(0)).toBe('정상');
    expect(computeOffset('2026-11', { courseMonth: '2026-12', weekNo: 2 })).toBe(1);
    expect(computeOffset('2026-12', { courseMonth: '2026-12', weekNo: 4 })).toBe(-1);
  });
});

describe('달력월 요약', () => {
  it('2026-11 월요일: 5회, 11월 1~4주, 12월 1주', () => {
    const out = run();
    const t = out.monthSummaries.find((m) => m.calendarMonth === '2026-11')!.tracks.find((x) => x.weekday === 1)!;
    expect(t.count).toBe(5);
    expect(t.sessionsText).toBe('11월 1~4주, 12월 1주');
    expect(t.nextSession).toMatchObject({ date: '2026-12-07', courseMonth: '2026-12', weekNo: 2 });
  });
  it('시작점 이전 달은 offset을 계산하지 않는다', () => {
    const out = schedule(seedInput({ from: '2026-10-01', to: '2026-11-30' }));
    expect(offsetOf(out, '2026-10', 1)).toBeNull();
    expect(actualAt(out, ['2026-10-26'])).toEqual(['2026-10-26 none']);
  });
});

describe('우선순위와 금지 규칙', () => {
  it('공휴일에는 고정할 수 없다(고정 무시)', () => {
    const out = run({ overrides: [{ date: '2027-02-08', type: 'pin', courseMonth: '2027-02', weekNo: 3 }] });
    expect(actualAt(out, ['2027-02-08', '2027-02-15'])).toEqual(['2027-02-08 holiday', '2027-02-15 2027-02/3']);
  });
  it('휴원일에도 고정할 수 없다(휴원 우선)', () => {
    const out = run({
      closures: [{ from: '2027-01-11', to: '2027-01-11', label: '연수' }],
      overrides: [{ date: '2027-01-11', type: 'pin', courseMonth: '2027-01', weekNo: 3 }],
    });
    expect(actualAt(out, ['2027-01-11', '2027-01-18'])).toEqual(['2027-01-11 closed', '2027-01-18 2027-01/3']);
  });
  it('확정된 달 안의 비우기·고정은 무시하고 확정값을 쓴다', () => {
    const out = run({
      overrides: [
        { date: '2026-12-14', type: 'skip' },
        { date: '2026-12-15', type: 'pin', courseMonth: '2027-01', weekNo: 1 },
      ],
    });
    expect(actualAt(out, ['2026-12-14', '2026-12-15'])).toEqual(['2026-12-14 2026-12/3', '2026-12-15 2026-12/4']);
  });
  it('확정된 날짜에 나중에 휴원이 겹치면 확정 유지 + 불일치 경고', () => {
    const out = run({ closures: [{ from: '2026-12-21', to: '2026-12-21', label: '연수' }] });
    expect(actualAt(out, ['2026-12-21'])).toEqual(['2026-12-21 2026-12/4']);
    expect(messages(out, 'confirmedMismatch')).toEqual(['월요일: 확정된 12월과 연결이 맞지 않습니다']);
  });
  it('확정된 달에서 공휴일을 무시해도 그 날은 수업이 생기지 않는다 + 불일치 경고', () => {
    const out = run({ ignoredHolidays: ['2026-12-25'] });
    expect(actualAt(out, ['2026-12-25', '2027-01-08'])).toEqual(['2026-12-25 none', '2027-01-08 2026-12/4']);
    expect(messages(out, 'confirmedMismatch')).toEqual(['금요일: 확정된 12월과 연결이 맞지 않습니다']);
  });
  it('휴원일 요일 지정: 수요일만 적용', () => {
    const out = run({ closures: [{ from: '2027-01-04', to: '2027-01-08', label: '수요 휴강', weekdays: [3] }] });
    expect(actualAt(out, ['2027-01-04', '2027-01-06', '2027-01-13'])).toEqual([
      '2027-01-04 2027-01/2',
      '2027-01-06 closed',
      '2027-01-13 2027-01/3',
    ]);
  });
  it('비활성 요일반은 회차를 만들지 않는다', () => {
    const input = seedInput(RANGE);
    const out = schedule({ ...input, tracks: input.tracks.map((t) => (t.weekday === 3 ? { ...t, active: false } : t)) });
    expect(actualAt(out, ['2027-01-06'])).toEqual(['2027-01-06 none']);
    expect(out.monthSummaries[0].tracks.map((t) => t.weekday)).toEqual([1, 2, 4, 5]);
  });
  it('시작점 요일이 틀리면 오류', () => {
    const input = seedInput(RANGE);
    const bad = input.tracks.map((t) => (t.weekday === 1 ? { ...t, anchor: { ...t.anchor, date: '2026-11-03' } } : t));
    expect(() => schedule({ ...input, tracks: bad })).toThrow();
  });
});

describe('경고', () => {
  it('중복: 고정으로 회차가 뒤로 돌아가면', () => {
    const out = run({ overrides: [{ date: '2027-01-18', type: 'pin', courseMonth: '2027-01', weekNo: 3 }] });
    expect(messages(out, 'duplicate')).toEqual(['월요일: 1월 3주 중복']);
  });
  it('offset 경고: |offset| ≥ 2 (앞섬·밀림 모두)', () => {
    const out = run();
    const dec = out.warnings.filter((w) => w.type === 'offset' && w.calendarMonth === '2026-12').map((w) => w.message);
    expect(dec).toEqual(['화요일: 12월 말 2회 앞섬', '수요일: 12월 말 2회 앞섬', '목요일: 12월 말 2회 앞섬']);
    const strict = run({ offsetWarningThreshold: 1 });
    expect(strict.warnings.some((w) => w.message === '금요일: 12월 말 1회 밀림')).toBe(true);
  });
});

describe('보강데이', () => {
  it('마지막 토요일이 휴원이면 그 전, 그것도 안 되면 또 그 전 토요일', () => {
    const out = run({ closures: [{ from: '2027-01-23', to: '2027-01-31', label: '겨울방학' }] });
    expect(out.monthSummaries.find((m) => m.calendarMonth === '2027-01')?.makeupDays).toEqual(['2027-01-16']);
  });
  it('가능한 토요일이 없으면 보강데이 없음', () => {
    const out = run({ closures: [{ from: '2027-01-01', to: '2027-01-31', label: '방학' }] });
    expect(out.monthSummaries.find((m) => m.calendarMonth === '2027-01')?.makeupDays).toEqual([]);
  });
  it('수동 지정(add)이 있으면 자동 제안은 숨긴다, add 두 개면 월 2회', () => {
    const out = run({
      makeupOverrides: [
        { date: '2027-01-09', type: 'add' },
        { date: '2027-01-23', type: 'add' },
      ],
    });
    expect(out.monthSummaries.find((m) => m.calendarMonth === '2027-01')?.makeupDays).toEqual([
      '2027-01-09',
      '2027-01-23',
    ]);
  });
  it('remove는 자동 제안을 없앤다', () => {
    const out = run({ makeupOverrides: [{ date: '2027-01-30', type: 'remove' }] });
    expect(out.monthSummaries.find((m) => m.calendarMonth === '2027-01')?.makeupDays).toEqual([]);
    expect(actualAt(out, ['2027-01-30'])).toEqual(['2027-01-30 none']);
  });
});
