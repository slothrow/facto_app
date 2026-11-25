import { describe, expect, it } from 'vitest';
import { applyChange, emptyRoster, type KidBlockRow, type KidCategoryRow, type KidTimetableRow } from '../../storage/rosterTypes.ts';
import {
  blocksChange,
  copyToDays,
  defaultEnd,
  deleteTimetableChange,
  duplicateTimetable,
  makeBlock,
  moveBlock,
  newTimetable,
  setMainChange,
} from './harinModel.ts';

const meal: KidCategoryRow = { id: 'meal', name: '식사', color: '#fed7aa', emoji: '🍚', isTravel: false, isActivity: false, defaultMinutes: 30, sort: 3 };
const tt = (id: string, isMain: boolean, sort: number): KidTimetableRow => ({ id, name: id, memo: null, isMain, sort });
const blk = (id: string, weekday: number, s: string, e: string, timetableId = 't1'): KidBlockRow => ({
  id, timetableId, weekday, startTime: s, endTime: e, categoryId: 'meal', activityId: null, title: null, memo: null,
  travelBeforeOverride: null, travelAfterOverride: null,
});

describe('블록 조작', () => {
  it('새 블록: 학원이 아니면 activityId 없음, 빈 이름은 null', () => {
    const b = makeBlock({ timetableId: 't1', weekday: 2, startTime: '18:00', endTime: defaultEnd('18:00', 30), category: meal, activityId: 'x', title: '  ' });
    expect(b.endTime).toBe('18:30');
    expect(b.activityId).toBeNull();
    expect(b.title).toBeNull();
    expect(defaultEnd('22:40', 50)).toBe('23:00');
  });
  it('옮기면 길이 유지', () => {
    expect(moveBlock(blk('a', 1, '15:00', '15:50'), 3, '16:20')).toMatchObject({ weekday: 3, startTime: '16:20', endTime: '17:10' });
  });
  it('여러 요일 복사: 겹치는 요일은 건너뜀', () => {
    const src = blk('a', 1, '18:00', '18:30');
    const list = [src, blk('b', 3, '18:10', '18:40')];
    const r = copyToDays(list, src, [1, 2, 3, 4, 5]);
    expect(r.added).toEqual([2, 4, 5]);
    expect(r.skipped).toEqual([3]);
    expect(r.next).toHaveLength(5);
  });
  it('변경분: 바뀐 것만 저장, 빠진 것은 삭제', () => {
    const a = blk('a', 1, '15:00', '15:50');
    const b = blk('b', 2, '15:00', '15:50');
    const c = blocksChange([a, b], [a, { ...b, startTime: '16:00', endTime: '16:50' }, blk('c', 3, '15:00', '15:30')]);
    expect(c.upsert?.kidBlocks?.map((x) => x.id)).toEqual(['b', 'c']);
    expect(blocksChange([a, b], [a]).remove?.kidBlocks?.map((x) => x.id)).toEqual(['b']);
  });
});

describe('시간표 버전', () => {
  it('처음 만든 시간표는 대표', () => {
    expect(newTimetable([], '2학기').isMain).toBe(true);
    expect(newTimetable([tt('a', true, 1)], '겨울방학')).toMatchObject({ isMain: false, sort: 2 });
  });
  it('복제: 블록까지 새 id로', () => {
    const r = { ...emptyRoster(), kidTimetables: [tt('t1', true, 1)], kidBlocks: [blk('a', 1, '15:00', '15:50'), blk('z', 1, '15:00', '15:50', 'other')] };
    const c = duplicateTimetable(r, 't1', '겨울방학');
    const t = c.upsert!.kidTimetables![0];
    expect(t).toMatchObject({ name: '겨울방학', isMain: false });
    expect(c.upsert!.kidBlocks).toHaveLength(1);
    expect(c.upsert!.kidBlocks![0]).toMatchObject({ timetableId: t.id, startTime: '15:00' });
    expect(c.upsert!.kidBlocks![0].id).not.toBe('a');
  });
  it('대표 바꾸기: 기존 대표를 먼저 끈다', () => {
    const c = setMainChange([tt('a', true, 1), tt('b', false, 2)], 'b');
    expect(c.upsert!.kidTimetables!.map((t) => [t.id, t.isMain])).toEqual([['a', false], ['b', true]]);
  });
  it('대표 삭제: 남은 것 중 맨 위가 대표, 블록도 함께', () => {
    const r = { ...emptyRoster(), kidTimetables: [tt('a', true, 1), tt('c', false, 3), tt('b', false, 2)], kidBlocks: [blk('x', 1, '15:00', '15:50', 'a')] };
    const after = applyChange(r, deleteTimetableChange(r, 'a'));
    expect(after.kidTimetables.map((t) => [t.id, t.isMain])).toEqual([['c', false], ['b', true]]);
    expect(after.kidBlocks).toHaveLength(0);
  });
});
