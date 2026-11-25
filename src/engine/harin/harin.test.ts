import { describe, expect, it } from 'vitest';
import type { KidActivityRow, KidBlockRow, KidCategoryRow } from '../../storage/rosterTypes.ts';
import { dropStart, grabOffset, rangesOverlap, snapMinutes } from '../timeRange.ts';
import {
  agendaText,
  agendaWeekday,
  buildTravelBlocks,
  canPlaceKid,
  dayAgenda,
  mainTimetable,
  visibleRange,
} from './harin.ts';
import { SEED_KID_CATEGORIES } from './seed.ts';

const cats: KidCategoryRow[] = SEED_KID_CATEGORIES.map((c, i) => ({ ...c, id: `c${i}` }));
const ACADEMY = 'c0';
const MEAL = 'c2';

const act = (id: string, over: Partial<KidActivityRow> = {}): KidActivityRow => ({
  id,
  name: id,
  emoji: '🎹',
  color: '#fbcfe8',
  place: null,
  memo: null,
  travelMinutes: 20,
  isHome: false,
  sort: 0,
  ...over,
});

let n = 0;
const blk = (weekday: number, start: string, end: string, over: Partial<KidBlockRow> = {}): KidBlockRow => ({
  id: `b${++n}`,
  timetableId: 't1',
  weekday,
  startTime: start,
  endTime: end,
  categoryId: over.activityId ? ACADEMY : MEAL,
  activityId: null,
  title: null,
  memo: null,
  travelBeforeOverride: null,
  travelAfterOverride: null,
  ...over,
});

const span = (t: { startTime: string; endTime: string }) => `${t.startTime}~${t.endTime}`;

describe('buildTravelBlocks', () => {
  it('학원 15:00~15:50, 이동 20 → 14:40~15:00, 15:50~16:10', () => {
    const t = buildTravelBlocks([blk(1, '15:00', '15:50', { activityId: 'piano' })], [act('piano')]);
    expect(t.map(span)).toEqual(['14:40~15:00', '15:50~16:10']);
    expect(t.every((x) => x.warnings.length === 0)).toBe(true);
  });

  it('집 수업이면 이동 없음', () => {
    const t = buildTravelBlocks([blk(1, '15:00', '15:50', { activityId: 'eng' })], [act('eng', { isHome: true })]);
    expect(t).toEqual([]);
  });

  it('연속 학원 A 15:00~15:50, B 16:20~17:10 → 사이 이동 하나(15:50~16:10), B 뒤 17:10~17:30', () => {
    const a = blk(2, '15:00', '15:50', { activityId: 'A' });
    const b = blk(2, '16:20', '17:10', { activityId: 'B' });
    const t = buildTravelBlocks([b, a], [act('A'), act('B')]);
    expect(t.map(span)).toEqual(['14:40~15:00', '15:50~16:10', '17:10~17:30']);
    const mid = t[1];
    expect(mid.ownerId).toBe(b.id);
    expect(mid.side).toBe('before');
    expect(mid.fromId).toBe(a.id);
  });

  it('연속 이동 길이는 B의 이동 시간', () => {
    const t = buildTravelBlocks(
      [blk(2, '15:00', '15:50', { activityId: 'A' }), blk(2, '16:20', '17:10', { activityId: 'B' })],
      [act('A', { travelMinutes: 10 }), act('B', { travelMinutes: 25 })],
    );
    expect(t.map(span)).toEqual(['14:50~15:00', '15:50~16:15', '17:10~17:35']);
  });

  it('간격이 길면(집에 다녀옴) 따로 붙는다', () => {
    const t = buildTravelBlocks(
      [blk(3, '15:00', '15:50', { activityId: 'A' }), blk(3, '17:00', '17:50', { activityId: 'B' })],
      [act('A'), act('B')],
    );
    expect(t.map(span)).toEqual(['14:40~15:00', '15:50~16:10', '16:40~17:00', '17:50~18:10']);
  });

  it('사이에 다른 블록이 있으면 연속이 아니다', () => {
    const t = buildTravelBlocks(
      [blk(3, '15:00', '15:50', { activityId: 'A' }), blk(3, '16:00', '16:10'), blk(3, '16:20', '17:10', { activityId: 'B' })],
      [act('A'), act('B')],
    );
    // 각자 이동 → 간식과 겹침 경고
    expect(t.map(span)).toEqual(['14:40~15:00', '15:50~16:10', '16:00~16:20', '17:10~17:30']);
    expect(t[1].warnings).toContain('다른 일정과 겹침');
  });

  it('override 0이면 그쪽 이동 없음, 다른 값이면 그 길이', () => {
    const t = buildTravelBlocks(
      [blk(4, '15:00', '15:50', { activityId: 'A', travelBeforeOverride: 0, travelAfterOverride: 30 })],
      [act('A')],
    );
    expect(t.map(span)).toEqual(['15:50~16:20']);
  });

  it('연속 학원 사이 이동을 "이번만 이동 없음"(B 앞 0)으로 하면 사이 이동이 없어진다', () => {
    const t = buildTravelBlocks(
      [blk(2, '15:00', '15:50', { activityId: 'A' }), blk(2, '16:20', '17:10', { activityId: 'B', travelBeforeOverride: 0 })],
      [act('A'), act('B')],
    );
    expect(t.map(span)).toEqual(['14:40~15:00', '17:10~17:30']);
  });

  it('첫 학원 13:40 시작 → 13:20~13:40 이동 + 입력 범위 밖 경고', () => {
    const t = buildTravelBlocks([blk(5, '13:40', '14:30', { activityId: 'A' })], [act('A')]);
    expect(span(t[0])).toBe('13:20~13:40');
    expect(t[0].warnings).toContain('입력 범위 밖');
  });

  it('학원 기본 이동 시간을 바꾸면 다시 계산된다', () => {
    const blocks = [blk(1, '16:00', '16:50', { activityId: 'A' })];
    expect(buildTravelBlocks(blocks, [act('A', { travelMinutes: 30 })]).map(span)).toEqual(['15:30~16:00', '16:50~17:20']);
  });
});

describe('canPlaceKid', () => {
  const a = blk(1, '15:00', '15:50');
  const b = blk(1, '16:00', '16:30');
  const all = [a, b];
  it('겹치면 불가', () => {
    expect(canPlaceKid(all, b, 1, '15:30').ok).toBe(false);
    expect(canPlaceKid(all, b, 1, '15:50').ok).toBe(true);
    expect(canPlaceKid(all, b, 2, '15:30').ok).toBe(true);
  });
  it('자기 자리와는 겹쳐도 된다(길이 조절)', () => {
    expect(canPlaceKid(all, a, 1, '15:00', '15:30').ok).toBe(true);
    expect(canPlaceKid(all, a, 1, '15:00', '16:10').ok).toBe(false);
  });
  it('13:30~23:00 밖 불가', () => {
    expect(canPlaceKid(all, b, 3, '13:20').ok).toBe(false);
    expect(canPlaceKid(all, b, 3, '13:30').ok).toBe(true);
    expect(canPlaceKid(all, b, 3, '22:30').ok).toBe(true);
    expect(canPlaceKid(all, b, 3, '22:40').ok).toBe(false);
  });
  it('10분 단위만', () => {
    expect(canPlaceKid(all, b, 3, '15:05').ok).toBe(false);
  });
});

describe('dayAgenda', () => {
  it('이동 포함 시간순 텍스트', () => {
    const piano = act('piano', { name: '피아노', emoji: '🎹' });
    const blocks = [
      blk(1, '16:10', '16:30', { title: '간식', categoryId: MEAL }),
      blk(1, '15:00', '15:50', { activityId: 'piano' }),
      blk(2, '15:00', '15:30'),
    ];
    const items = dayAgenda(blocks, [piano], cats, 1);
    expect(agendaText(items)).toBe('2:40 🚶 이동 20분 → 3:00 🎹 피아노 (3:00~3:50) → 3:50 🚶 이동 20분 → 4:10 🍚 간식 (4:10~4:30)');
  });
  it('주말이면 월요일', () => {
    expect(agendaWeekday('2026-11-25')).toBe(3);
    expect(agendaWeekday('2026-11-28')).toBe(1);
    expect(agendaWeekday('2026-11-29')).toBe(1);
  });
});

describe('visibleRange / mainTimetable / timeRange', () => {
  it('기본 14:00~23:00, 밖에 있으면 넓힌다', () => {
    expect(visibleRange(undefined, [])).toEqual({ start: 840, end: 1380 });
    expect(visibleRange({ viewStart: '15:00', viewEnd: '21:00' }, [{ startTime: '13:40', endTime: '14:00' }])).toEqual({ start: 810, end: 1260 });
  });
  it('대표 시간표', () => {
    const t = (id: string, isMain: boolean, sort: number) => ({ id, name: id, memo: null, isMain, sort });
    expect(mainTimetable([t('a', false, 1), t('b', true, 2)])?.id).toBe('b');
    expect(mainTimetable([t('a', false, 2), t('b', false, 1)])?.id).toBe('b');
    expect(mainTimetable([])).toBeNull();
  });
  it('공통 시간 계산', () => {
    expect(rangesOverlap(0, 50, 50, 60)).toBe(false);
    expect(rangesOverlap(0, 51, 50, 60)).toBe(true);
    expect(snapMinutes(904)).toBe(900);
    expect(grabOffset(130, 100, 100, 50)).toBe(10);
    expect(grabOffset(199, 100, 100, 50)).toBe(40);
    expect(dropStart(900, 20, 50, 840, 1380)).toBe(880);
    expect(dropStart(1370, 0, 50, 840, 1380)).toBe(1330);
  });
});
