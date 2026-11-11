// 공용 할 일 달력(SPEC_home 8장) 계산 테스트
import { describe, expect, it } from 'vitest';
import { createSeedAppData } from '../../data/seedAppData.ts';
import type { TodoRow } from '../../storage/rosterTypes.ts';
import { dayLabels, dayStat, groupByDate, makeTodo, monthCells, moveTodos, nextSort, overdueTodos, remindersOn, sortDay, weekDays } from './todoModel.ts';

const t = (id: string, date: string, over: Partial<TodoRow> = {}): TodoRow => ({
  id,
  date,
  text: id,
  done: false,
  starred: false,
  sort: 1,
  ...over,
});

describe('할 일 달력', () => {
  it('하루 순서: 안 한 일 → 별표 먼저 → sort, 완료는 아래', () => {
    const list = [
      t('a', '2026-11-12', { sort: 1, done: true }),
      t('b', '2026-11-12', { sort: 2 }),
      t('c', '2026-11-12', { sort: 3, starred: true }),
      t('d', '2026-11-12', { sort: 0 }),
    ];
    expect(sortDay(list).map((x) => x.id)).toEqual(['c', 'd', 'b', 'a']);
  });

  it('날짜별 남은 개수·별표', () => {
    const g = groupByDate([t('a', '2026-11-12', { done: true }), t('b', '2026-11-12', { starred: true }), t('c', '2026-11-13')]);
    expect(dayStat(g.get('2026-11-12'))).toEqual({ total: 2, remaining: 1, starred: true });
    expect(dayStat(g.get('2026-11-13'))).toEqual({ total: 1, remaining: 1, starred: false });
    expect(dayStat(g.get('2026-11-14'))).toEqual({ total: 0, remaining: 0, starred: false });
    // 별표가 완료된 일에만 있으면 표시하지 않음
    expect(dayStat([t('x', '2026-11-12', { starred: true, done: true })]).starred).toBe(false);
  });

  it('밀린 할 일 = 오늘 전 날짜의 안 한 일', () => {
    const list = [t('a', '2026-11-10'), t('b', '2026-11-09'), t('c', '2026-11-10', { done: true }), t('d', '2026-11-11')];
    expect(overdueTodos(list, '2026-11-11').map((x) => x.id)).toEqual(['b', 'a']);
  });

  it('새 할 일은 그 날짜 맨 아래, 옮긴 할 일도 맨 아래에 순서대로', () => {
    const list = [t('a', '2026-11-11', { sort: 4 }), t('b', '2026-11-10', { sort: 9 })];
    expect(nextSort(list, '2026-11-11')).toBe(5);
    expect(nextSort(list, '2026-11-20')).toBe(1);
    const n = makeTodo(list, '2026-11-11', '  우유 사기  ');
    expect(n).toMatchObject({ date: '2026-11-11', text: '우유 사기', done: false, starred: false, sort: 5 });
    const moved = moveTodos(list, [t('x', '2026-11-01'), t('y', '2026-11-02')], '2026-11-11');
    expect(moved.map((m) => [m.id, m.date, m.sort])).toEqual([
      ['x', '2026-11-11', 5],
      ['y', '2026-11-11', 6],
    ]);
  });

  it('주 = 월~일, 월 달력은 일요일 시작', () => {
    expect(weekDays('2026-11-11')).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']);
    expect(weekDays('2026-11-15')[0]).toBe('2026-11-09'); // 일요일은 그 주의 마지막
    const cells = monthCells('2026-11'); // 2026-11-01은 일요일
    expect(cells[0]).toBe('2026-11-01');
    expect(cells.length % 7).toBe(0);
    expect(monthCells('2026-12')[2]).toBe('2026-12-01'); // 화요일
  });

  it('공휴일·휴원일 이름', () => {
    const data = createSeedAppData();
    data.closures = [{ id: 'c', kind: 'closed', startDate: '2026-12-28', endDate: '2027-01-01', weekdays: null, label: '겨울방학', showOnCalendar: true }];
    const labels = dayLabels(data, '2026-12-01', '2026-12-31');
    expect(labels.get('2026-12-25')).toContain('성탄절');
    expect(labels.get('2026-12-28')).toEqual(['겨울방학']);
    expect(labels.has('2027-01-01')).toBe(false); // 범위 밖
  });

  it('예전 할 일 알림은 기본 꺼짐', () => {
    const s = createSeedAppData().settings;
    expect(remindersOn(s)).toBe(false);
    expect(remindersOn({ ...s, features: { reminders: true } })).toBe(true);
  });
});
