import { describe, expect, it } from 'vitest';
import { confirmMonth } from '../../app/mutations.ts';
import { createSeedAppData } from '../../data/seedAppData.ts';
import {
  DEFAULT_LAYOUT,
  DEFAULT_RATIO,
  ratioForLayout,
  addExportHistory,
  defaultStartMonth,
  defaultTitle,
  draftMonthsIn,
  eventLabelsByDate,
  eventsInPeriod,
  fileNameFor,
} from './exportModel.ts';

describe('달력 만들기 계산', () => {
  const seed = createSeedAppData();

  it('기본 시작 월: 기록이 없으면 처음 나오는 미확정 달(초기 데이터 → 2027-01)', () => {
    expect(defaultStartMonth(seed, '2026-11')).toBe('2027-01');
    const janConfirmed = confirmMonth(seed, '2027-01', [], '2026-11-04T00:00:00Z');
    expect(defaultStartMonth(janConfirmed, '2026-11')).toBe('2027-02');
  });

  it('기본 시작 월: 기록이 있으면 가장 최근 기록의 다음 두 달', () => {
    const withHistory = addExportHistory(
      seed,
      { startMonth: '2027-01', title: 't', highlightText: '', noticeText: '', ratio: '1:1' },
      '2026-12-20T00:00:00Z',
    );
    expect(defaultStartMonth(withHistory, '2026-11')).toBe('2027-03');
  });

  it('기본 제목과 파일 이름(연도 넘김 포함)', () => {
    expect(defaultTitle('2027-01')).toBe('1월, 2월 수업 안내');
    expect(defaultTitle('2026-12')).toBe('12월, 1월 수업 안내');
    expect(fileNameFor('2026-12')).toBe('수업안내_2026-12_01.png');
  });

  it('기간 안의 행사만, 고른 것만 날짜별로', () => {
    const events = eventsInPeriod(seed, '2026-11');
    expect(events.map((e) => e.label)).toEqual(['2026 수원 플레이팩토 보드게임 페스티벌']);
    expect(eventsInPeriod(seed, '2027-01')).toEqual([]);
    const map = eventLabelsByDate(events, new Set(events.map((e) => e.id)));
    expect(map.get('2026-11-14')).toEqual(['2026 수원 플레이팩토 보드게임 페스티벌']);
    expect(eventLabelsByDate(events, new Set()).size).toBe(0);
  });

  it('미확정 달 안내', () => {
    expect(draftMonthsIn(seed, '2026-11')).toEqual([]);
    expect(draftMonthsIn(seed, '2026-12')).toEqual(['2027-01']);
  });

  it('기본 배치는 나란히, 위아래를 고르면 4:5로', () => {
    expect(DEFAULT_LAYOUT).toBe('side');
    expect(DEFAULT_RATIO).toBe('1:1');
    expect(ratioForLayout('stack', '1:1')).toBe('4:5');
    expect(ratioForLayout('side', '4:5')).toBe('4:5');
    expect(ratioForLayout('side', '1:1')).toBe('1:1');
  });

  it('내보낸 기록은 최신이 앞, 20개까지', () => {
    let d = seed;
    for (let i = 0; i < 25; i++) {
      d = addExportHistory(
        d,
        { startMonth: '2027-01', title: `t${i}`, highlightText: '', noticeText: '', ratio: '1:1' },
        `2026-12-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
      );
    }
    expect(d.exportHistory).toHaveLength(20);
    expect(d.exportHistory[0].title).toBe('t24');
  });
});
