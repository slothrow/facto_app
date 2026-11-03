// SPEC 7장 기준 데이터(골든 테스트). 이 파일의 테스트는 절대 깨지면 안 된다.
import { describe, expect, it } from 'vitest';
import { seedInput } from '../data/seed.ts';
import { schedule, snapshotMonth } from './schedule.ts';
import { actualAt, actualList, expectedList, offsetOf } from './testUtils.ts';
import type { ScheduleInput } from './types.ts';

const RANGE = { from: '2026-11-01', to: '2027-02-28' };
const run = (patch: Partial<ScheduleInput> = {}) => schedule({ ...seedInput(RANGE), ...patch });

const types = (out: ReturnType<typeof run>, type: string) =>
  out.warnings.filter((w) => w.type === type).map((w) => w.message);

describe('SPEC 7.1 — 2026년 11~12월 실제 배포본', () => {
  const NOV_DEC = ['2026-11', '2026-12'];
  const expected: Record<number, string> = {
    1: '11/2 11-1, 11/9 11-2, 11/16 11-3, 11/23 11-4, 11/30 12-1, 12/7 12-2, 12/14 12-3, 12/21 12-4, 12/28 1-1',
    2: '11/3 11-2, 11/10 11-3, 11/17 11-4, 11/24 12-1, 12/1 12-2, 12/8 12-3, 12/15 12-4, 12/22 1-1, 12/29 1-2',
    3: '11/4 11-2, 11/11 11-3, 11/18 11-4, 11/25 12-1, 12/2 12-2, 12/9 12-3, 12/16 12-4, 12/23 1-1, 12/30 1-2',
    4: '11/5 11-2, 11/12 11-3, 11/19 11-4, 11/26 12-1, 12/3 12-2, 12/10 12-3, 12/17 12-4, 12/24 1-1, 12/31 1-2',
    5: '11/6 11-1, 11/13 11-2, 11/20 11-3, 11/27 11-4, 12/4 12-1, 12/11 12-2, 12/18 12-3, 12/25 공휴일',
  };
  const names = ['', '월', '화', '수', '목', '금'];

  // 확정 스냅샷을 넣은 시드 상태
  const confirmed = run();
  // 확정 없이 규칙만으로 계산해도 같은 결과여야 한다(시드 스냅샷이 규칙과 일치하는지 검증)
  const rulesOnly = run({ confirmedSessions: [] });

  for (const wd of [1, 2, 3, 4, 5]) {
    it(`${names[wd]}요일 (확정 시드)`, () => {
      expect(actualList(confirmed, wd, NOV_DEC)).toEqual(expectedList(2026, expected[wd]));
    });
    it(`${names[wd]}요일 (규칙만으로 계산)`, () => {
      expect(actualList(rulesOnly, wd, NOV_DEC)).toEqual(expectedList(2026, expected[wd]));
    });
  }

  it('보강데이: 11/28, 12/19', () => {
    const md = (ym: string) => confirmed.monthSummaries.find((m) => m.calendarMonth === ym)?.makeupDays;
    expect(md('2026-11')).toEqual(['2026-11-28']);
    expect(md('2026-12')).toEqual(['2026-12-19']);
    expect(actualAt(confirmed, ['2026-11-28', '2026-12-19', '2026-12-26'])).toEqual([
      '2026-11-28 makeup',
      '2026-12-19 makeup',
      '2026-12-26 none',
    ]);
  });

  it('11·12월 회차는 확정 표시가 붙는다', () => {
    const c = confirmed.days.find((d) => d.date === '2026-12-21');
    expect(c?.session).toMatchObject({ courseMonth: '2026-12', weekNo: 4, confirmed: true });
  });

  it('행사 11/14 표시', () => {
    const c = confirmed.days.find((d) => d.date === '2026-11-14');
    expect(c?.events).toEqual(['2026 수원 플레이팩토 보드게임 페스티벌']);
  });

  it('시드 상태에는 누락·중복·확정 불일치 경고가 없다', () => {
    expect(confirmed.warnings.filter((w) => w.type !== 'offset')).toEqual([]);
  });
});

describe('SPEC 7.2 — 2027년 1~2월 계산값', () => {
  const JAN_FEB = ['2027-01', '2027-02'];
  const expected: Record<number, string> = {
    1: '1/4 1-2, 1/11 1-3, 1/18 1-4, 1/25 2-1, 2/1 2-2, 2/8 공휴일, 2/15 2-3, 2/22 2-4',
    2: '1/5 1-3, 1/12 1-4, 1/19 2-1, 1/26 2-2, 2/2 2-3, 2/9 공휴일, 2/16 2-4, 2/23 3-1',
    3: '1/6 1-3, 1/13 1-4, 1/20 2-1, 1/27 2-2, 2/3 2-3, 2/10 2-4, 2/17 3-1, 2/24 3-2',
    4: '1/7 1-3, 1/14 1-4, 1/21 2-1, 1/28 2-2, 2/4 2-3, 2/11 2-4, 2/18 3-1, 2/25 3-2',
    5: '1/1 공휴일, 1/8 12-4, 1/15 1-1, 1/22 1-2, 1/29 1-3, 2/5 1-4, 2/12 2-1, 2/19 2-2, 2/26 2-3',
  };
  const out = run();

  for (const wd of [1, 2, 3, 4, 5]) {
    it(`요일 ${wd}`, () => {
      expect(actualList(out, wd, JAN_FEB)).toEqual(expectedList(2027, expected[wd]));
    });
  }

  it('보강데이 자동 제안: 1/30, 2/27', () => {
    const md = (ym: string) => out.monthSummaries.find((m) => m.calendarMonth === ym)?.makeupDays;
    expect(md('2027-01')).toEqual(['2027-01-30']);
    expect(md('2027-02')).toEqual(['2027-02-27']);
  });
});

describe('SPEC 7.3 — 월말 offset', () => {
  const out = run();
  const table: Record<string, number[]> = {
    '2026-11': [1, 1, 1, 1, 0],
    '2026-12': [1, 2, 2, 2, -1],
    '2027-01': [1, 2, 2, 2, -1],
    '2027-02': [0, 1, 2, 2, -1],
  };
  for (const [ym, row] of Object.entries(table)) {
    it(ym, () => {
      expect([1, 2, 3, 4, 5].map((wd) => offsetOf(out, ym, wd))).toEqual(row);
    });
  }
});

describe('SPEC 7.4 — 시나리오', () => {
  it('A. 비우기: 월 2027-01-11', () => {
    const out = run({ overrides: [{ date: '2027-01-11', type: 'skip' }] });
    expect(actualList(out, 1, ['2027-01', '2027-02'])).toEqual(
      expectedList(2027, '1/4 1-2, 1/11 비움, 1/18 1-3, 1/25 1-4, 2/1 2-1, 2/8 공휴일, 2/15 2-2, 2/22 2-3'),
    );
    expect(offsetOf(out, '2027-01', 1)).toBe(0);
  });

  it('A-2. 비우기 취소하면 다시 당겨진다', () => {
    const out = run({ overrides: [] });
    expect(actualAt(out, ['2027-01-11', '2027-01-18'])).toEqual(['2027-01-11 2027-01/3', '2027-01-18 2027-01/4']);
  });

  it('B. 휴원 기간: 2027-01-04~01-08 겨울방학(전체 요일)', () => {
    const out = run({ closures: [{ from: '2027-01-04', to: '2027-01-08', label: '겨울방학' }] });
    expect(actualAt(out, ['2027-01-04', '2027-01-08', '2027-01-11', '2027-01-15'])).toEqual([
      '2027-01-04 closed',
      '2027-01-08 closed',
      '2027-01-11 2027-01/2',
      '2027-01-15 2026-12/4',
    ]);
    // 화·수·목도 1주씩 밀림
    expect(actualAt(out, ['2027-01-12', '2027-01-13', '2027-01-14'])).toEqual([
      '2027-01-12 2027-01/3',
      '2027-01-13 2027-01/3',
      '2027-01-14 2027-01/3',
    ]);
    expect(out.days.find((d) => d.date === '2027-01-05')?.closureLabel).toBe('겨울방학');
  });

  it('C. 확정 후 상류 변경: 1월 확정 → 12월 확정 해제 → 월 12/14 비우기', () => {
    const base = run();
    const janSnapshot = snapshotMonth(base, '2027-01');
    const novOnly = seedInput(RANGE).confirmedSessions.filter((s) => s.date < '2026-12-01');

    const out = run({
      confirmedSessions: [...novOnly, ...janSnapshot],
      overrides: [{ date: '2026-12-14', type: 'skip' }],
    });

    expect(actualAt(out, ['2026-12-14', '2026-12-21', '2026-12-28', '2027-01-04'])).toEqual([
      '2026-12-14 skipped',
      '2026-12-21 2026-12/3',
      '2026-12-28 2026-12/4',
      '2027-01-04 2027-01/2',
    ]);
    expect(out.days.find((d) => d.date === '2027-01-04')?.session?.confirmed).toBe(true);
    expect(types(out, 'missing')).toEqual(['월요일: 1월 1주 누락']);
    expect(types(out, 'confirmedMismatch')).toEqual(['월요일: 확정된 1월과 연결이 맞지 않습니다']);
  });

  it('D. 공휴일 무시: 2027-02-09', () => {
    const out = run({ ignoredHolidays: ['2027-02-09'] });
    expect(actualAt(out, ['2027-02-09', '2027-02-16', '2027-02-23'])).toEqual([
      '2027-02-09 2027-02/4',
      '2027-02-16 2027-03/1',
      '2027-02-23 2027-03/2',
    ]);
  });

  it('E. 고정: 금 2027-01-08을 1월 1주로', () => {
    const out = run({ overrides: [{ date: '2027-01-08', type: 'pin', courseMonth: '2027-01', weekNo: 1 }] });
    expect(actualAt(out, ['2027-01-08', '2027-01-15', '2027-01-22'])).toEqual([
      '2027-01-08 2027-01/1',
      '2027-01-15 2027-01/2',
      '2027-01-22 2027-01/3',
    ]);
    expect(out.days.find((d) => d.date === '2027-01-08')?.session?.pinned).toBe(true);
    expect(types(out, 'missing')).toEqual(['금요일: 12월 4주 누락']);
  });
});
