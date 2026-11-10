// 화면 뒤쪽 로직(저장 데이터 → 엔진 입력, 수정 함수, 영향 미리보기, 저장소) 테스트.
import { describe, expect, it } from 'vitest';
import { createSeedAppData } from '../data/seedAppData.ts';
import { actualAt, actualList, expectedList } from '../engine/testUtils.ts';
import { snapshotMonth } from '../engine/schedule.ts';
import { parseBackup, toBackupJson } from '../storage/backup.ts';
import { LocalStorageRepository, type KeyValueStorage } from '../storage/localStorageRepository.ts';
import { describeImpact } from './impact.ts';
import {
  confirmMonth,
  makeupDaysOf,
  setHolidayIgnored,
  setMakeup,
  setPin,
  setSkip,
  unconfirmMonth,
  updateSettings,
  upsertClosure,
} from './mutations.ts';
import { scheduleFor } from './scheduleInput.ts';

const RANGE = { from: '2026-11-01', to: '2027-02-28' };

describe('초기 데이터(AppData) → 엔진', () => {
  const seed = createSeedAppData();
  const out = scheduleFor(seed, RANGE);

  it('2026년 11·12월이 SPEC 7.1과 같다', () => {
    expect(actualList(out, 1, ['2026-11', '2026-12'])).toEqual(
      expectedList(
        2026,
        '11/2 11-1, 11/9 11-2, 11/16 11-3, 11/23 11-4, 11/30 12-1, 12/7 12-2, 12/14 12-3, 12/21 12-4, 12/28 1-1',
      ),
    );
    expect(actualList(out, 5, ['2026-11', '2026-12'])).toEqual(
      expectedList(2026, '11/6 11-1, 11/13 11-2, 11/20 11-3, 11/27 11-4, 12/4 12-1, 12/11 12-2, 12/18 12-3, 12/25 공휴일'),
    );
    expect(actualAt(out, ['2026-11-28', '2026-12-19'])).toEqual(['2026-11-28 makeup', '2026-12-19 makeup']);
    expect(out.days.find((d) => d.date === '2026-11-14')?.events).toEqual(['2026 수원 플레이팩토 보드게임 페스티벌']);
  });

  it('2027년 1·2월이 SPEC 7.2와 같다(금요일)', () => {
    expect(actualList(out, 5, ['2027-01', '2027-02'])).toEqual(
      expectedList(2027, '1/1 공휴일, 1/8 12-4, 1/15 1-1, 1/22 1-2, 1/29 1-3, 2/5 1-4, 2/12 2-1, 2/19 2-2, 2/26 2-3'),
    );
  });

  it('운영 요일에서 끈 요일은 회차가 없다', () => {
    const next = updateSettings(seed, { operatingWeekdays: [1, 2, 4, 5] });
    expect(actualAt(scheduleFor(next, RANGE), ['2027-01-06'])).toEqual(['2027-01-06 none']);
  });
});

describe('수정 함수', () => {
  const seed = createSeedAppData();

  it('비우기 → 취소하면 원래대로', () => {
    const skipped = setSkip(seed, '2027-01-11', true);
    expect(actualAt(scheduleFor(skipped, RANGE), ['2027-01-11', '2027-01-18'])).toEqual([
      '2027-01-11 skipped',
      '2027-01-18 2027-01/3',
    ]);
    const undone = setSkip(skipped, '2027-01-11', false);
    expect(actualAt(scheduleFor(undone, RANGE), ['2027-01-11'])).toEqual(['2027-01-11 2027-01/3']);
  });

  it('바꾸지 않은 표는 그대로(같은 객체) 둔다', () => {
    const next = setSkip(seed, '2027-01-11', true);
    expect(next.closures).toBe(seed.closures);
    expect(next.sessionOverrides).not.toBe(seed.sessionOverrides);
  });

  it('휴원 추가하면 바로 다시 계산된다', () => {
    const next = upsertClosure(seed, {
      id: 'x',
      kind: 'closed',
      startDate: '2027-01-04',
      endDate: '2027-01-08',
      weekdays: null,
      label: '겨울방학',
      showOnCalendar: true,
    });
    expect(actualAt(scheduleFor(next, RANGE), ['2027-01-04', '2027-01-11', '2027-01-15'])).toEqual([
      '2027-01-04 closed',
      '2027-01-11 2027-01/2',
      '2027-01-15 2026-12/4',
    ]);
  });

  it('보강데이 지정: 다른 토요일을 지정하면 자동 제안이 빠진다', () => {
    const next = setMakeup(seed, '2027-01-23', true);
    expect(makeupDaysOf(next, '2027-01')).toEqual(['2027-01-23']);
    expect(next.makeupOverrides).toContainEqual({ date: '2027-01-23', type: 'add' });
  });

  it('보강데이 해제: 자동 제안을 끄면 remove가 생기고, 다시 켜면 사라진다', () => {
    const off = setMakeup(seed, '2027-01-30', false);
    expect(makeupDaysOf(off, '2027-01')).toEqual([]);
    expect(off.makeupOverrides).toContainEqual({ date: '2027-01-30', type: 'remove' });
    const on = setMakeup(off, '2027-01-30', true);
    expect(makeupDaysOf(on, '2027-01')).toEqual(['2027-01-30']);
    expect(on.makeupOverrides.some((o) => o.date === '2027-01-30')).toBe(false);
  });

  it('보강데이 해제: 수동 지정(12/19)을 끄면 add가 지워지고 자동 제안(12/26)이 돌아온다', () => {
    const off = setMakeup(seed, '2026-12-19', false);
    expect(makeupDaysOf(off, '2026-12')).toEqual(['2026-12-26']);
  });

  it('확정 → 해제', () => {
    const out = scheduleFor(seed, RANGE);
    const confirmed = confirmMonth(seed, '2027-01', snapshotMonth(out, '2027-01'), '2026-11-04T00:00:00Z');
    // 1월 확정 후 12월을 해제하고 12/14를 비우면 1월은 그대로 + 경고
    const changed = setSkip(unconfirmMonth(confirmed, '2026-12'), '2026-12-14', true);
    const after = scheduleFor(changed, RANGE);
    expect(actualAt(after, ['2027-01-04'])).toEqual(['2027-01-04 2027-01/2']);
    expect(after.warnings.map((w) => w.message)).toContain('월요일: 1월 1주 누락');
  });

  it('공휴일 무시 켜고 끄기', () => {
    const on = setHolidayIgnored(seed, '2027-02-09', '대체공휴일(설날)', true);
    expect(actualAt(scheduleFor(on, RANGE), ['2027-02-09'])).toEqual(['2027-02-09 2027-02/4']);
    const off = setHolidayIgnored(on, '2027-02-09', '대체공휴일(설날)', false);
    expect(actualAt(scheduleFor(off, RANGE), ['2027-02-09'])).toEqual(['2027-02-09 holiday']);
  });
});

describe('영향 미리보기', () => {
  const seed = createSeedAppData();

  it('비우기: "이후 월요일 N회가 1회씩 밀립니다"', () => {
    const lines = describeImpact(seed, setSkip(seed, '2027-01-11', true), '2027-01-11');
    expect(lines[0]).toMatch(/^이후 월요일 \d+회가 1회씩 밀립니다$/);
    expect(lines.some((l) => l.startsWith('이후 화요일'))).toBe(false);
  });

  it('고정으로 누락이 생기면 새 경고로 알려 준다', () => {
    const lines = describeImpact(
      seed,
      setPin(seed, '2027-01-08', { courseMonth: '2027-01', weekNo: 1 }),
      '2027-01-08',
    );
    expect(lines[0]).toMatch(/^이후 금요일 \d+회가 1회씩 당겨집니다$/);
    expect(lines).toContain('새 경고: 금요일: 12월 4주 누락');
  });

  it('변화가 없으면 그렇게 말한다', () => {
    expect(describeImpact(seed, seed, '2027-01-04')).toEqual(['다른 수업 날짜에는 영향이 없습니다']);
  });
});

describe('저장소', () => {
  const fakeStorage = (): KeyValueStorage & { map: Map<string, string> } => {
    const map = new Map<string, string>();
    return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
  };

  it('처음엔 비어 있고, 전체 저장 후 표 단위로 저장된다', async () => {
    const repo = new LocalStorageRepository(fakeStorage());
    expect(await repo.load()).toBeNull();
    const seed = createSeedAppData();
    await repo.replaceAll(seed);
    await repo.save('sessionOverrides', [{ date: '2027-01-11', type: 'skip' }]);
    const loaded = await repo.load();
    expect(loaded?.sessionOverrides).toEqual([{ date: '2027-01-11', type: 'skip' }]);
    expect(loaded?.monthPlans).toEqual(seed.monthPlans);
  });

  it('백업 → 복원하면 같은 데이터', () => {
    const seed = createSeedAppData();
    expect(parseBackup(toBackupJson(seed))).toEqual(seed);
  });

  it('형식이 틀린 백업은 거부한다', () => {
    expect(() => parseBackup('hello')).toThrow('JSON 파일이 아닙니다');
    expect(() => parseBackup('{"version":2}')).toThrow('지원하지 않는 백업 버전');
    expect(() => parseBackup('{"version":1,"settings":{}}')).toThrow('trackAnchors');
  });
});
