// 하린이 시간표 화면용 순수 함수: 블록 조작, 시간표 버전 조작, 저장할 변경(RosterChange) 만들기.
import { fromMinutes, toMinutes } from '../../engine/classTime.ts';
import { INPUT_END, KID_WEEKDAYS, canPlaceKid, durationOf } from '../../engine/harin/index.ts';
import {
  newId,
  type KidBlockRow,
  type KidCategoryRow,
  type KidTimetableRow,
  type RosterChange,
  type RosterData,
} from '../../storage/rosterTypes.ts';

export const WEEKDAY_LABEL = ['', '월', '화', '수', '목', '금'];

/** 시간표의 블록(요일·시작 순) */
export const blocksOf = (roster: Pick<RosterData, 'kidBlocks'>, timetableId: string) =>
  roster.kidBlocks
    .filter((b) => b.timetableId === timetableId)
    .sort((a, b) => a.weekday - b.weekday || toMinutes(a.startTime) - toMinutes(b.startTime));

/** 블록 목록 두 개의 차이 → 저장할 변경 */
export function blocksChange(before: KidBlockRow[], after: KidBlockRow[]): RosterChange {
  const prev = new Map(before.map((b) => [b.id, b]));
  const nextIds = new Set(after.map((b) => b.id));
  const upsert = after.filter((b) => {
    const p = prev.get(b.id);
    return !p || JSON.stringify(p) !== JSON.stringify(b);
  });
  const remove = before.filter((b) => !nextIds.has(b.id));
  return { upsert: { kidBlocks: upsert }, remove: { kidBlocks: remove } };
}

export const isEmptyChange = (c: RosterChange) => !c.upsert?.kidBlocks?.length && !c.remove?.kidBlocks?.length;

/** 새 블록 기본 끝 시간: 종류 기본 길이, 23:00을 넘으면 23:00까지 */
export function defaultEnd(start: string, minutes: number): string {
  return fromMinutes(Math.min(toMinutes(INPUT_END), toMinutes(start) + minutes));
}

export function makeBlock(input: {
  timetableId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  category: KidCategoryRow;
  activityId?: string | null;
  title?: string | null;
  memo?: string | null;
}): KidBlockRow {
  return {
    id: newId(),
    timetableId: input.timetableId,
    weekday: input.weekday,
    startTime: input.startTime,
    endTime: input.endTime,
    categoryId: input.category.id,
    activityId: input.category.isActivity ? (input.activityId ?? null) : null,
    title: input.title?.trim() || null,
    memo: input.memo?.trim() || null,
    travelBeforeOverride: null,
    travelAfterOverride: null,
  };
}

export const replaceBlock = (list: KidBlockRow[], b: KidBlockRow) => list.map((x) => (x.id === b.id ? b : x));

/** 길이를 유지한 채 옮기기 */
export function moveBlock(b: KidBlockRow, weekday: number, start: string): KidBlockRow {
  const d = durationOf(b);
  return { ...b, weekday, startTime: start, endTime: fromMinutes(toMinutes(start) + d) };
}

/**
 * 한 블록을 여러 요일에 같은 시간으로 복사. 겹치거나 범위 밖인 요일은 건너뛴다.
 * 학원·이동 override도 그대로 복사한다.
 */
export function copyToDays(list: KidBlockRow[], src: KidBlockRow, weekdays: number[]): { next: KidBlockRow[]; added: number[]; skipped: number[] } {
  let next = list;
  const added: number[] = [];
  const skipped: number[] = [];
  for (const wd of weekdays) {
    if (wd === src.weekday) continue;
    const copy: KidBlockRow = { ...src, id: newId(), weekday: wd };
    if (canPlaceKid(next, copy, wd, copy.startTime, copy.endTime).ok) {
      next = [...next, copy];
      added.push(wd);
    } else skipped.push(wd);
  }
  return { next, added, skipped };
}

/** 이동 override 바꾸기(null = 학원 기본값으로) */
export function setTravel(b: KidBlockRow, side: 'before' | 'after', minutes: number | null): KidBlockRow {
  return side === 'before' ? { ...b, travelBeforeOverride: minutes } : { ...b, travelAfterOverride: minutes };
}

// ---------------------------------------------------------------
// 시간표 버전
// ---------------------------------------------------------------

const nextSort = (list: KidTimetableRow[]) => list.reduce((m, t) => Math.max(m, t.sort), 0) + 1;

/** 새 시간표. 처음 만드는 것이면 대표 */
export function newTimetable(list: KidTimetableRow[], name: string, memo: string | null = null): KidTimetableRow {
  return { id: newId(), name: name.trim() || '새 시간표', memo: memo?.trim() || null, isMain: list.length === 0, sort: nextSort(list) };
}

/** 복제: 시간표와 블록을 새 id로 복사(대표는 아님) */
export function duplicateTimetable(roster: Pick<RosterData, 'kidTimetables' | 'kidBlocks'>, srcId: string, name: string): RosterChange {
  const src = roster.kidTimetables.find((t) => t.id === srcId);
  if (!src) return {};
  const t: KidTimetableRow = { id: newId(), name: name.trim() || `${src.name} 복사본`, memo: src.memo, isMain: false, sort: nextSort(roster.kidTimetables) };
  const blocks = blocksOf(roster, srcId).map((b) => ({ ...b, id: newId(), timetableId: t.id }));
  return { upsert: { kidTimetables: [t], kidBlocks: blocks } };
}

/** 대표 바꾸기. 기존 대표를 먼저 끄고 새 대표를 켠다(DB의 "대표 하나" 규칙 때문에 순서가 중요) */
export function setMainChange(list: KidTimetableRow[], id: string): RosterChange {
  const off = list.filter((t) => t.isMain && t.id !== id).map((t) => ({ ...t, isMain: false }));
  const target = list.find((t) => t.id === id);
  if (!target || target.isMain) return { upsert: { kidTimetables: off } };
  return { upsert: { kidTimetables: [...off, { ...target, isMain: true }] } };
}

/** 삭제: 블록은 DB에서 함께 지워진다(화면용으로 같이 뺀다). 대표였으면 남은 것 중 맨 위가 대표 */
export function deleteTimetableChange(roster: Pick<RosterData, 'kidTimetables' | 'kidBlocks'>, id: string): RosterChange {
  const t = roster.kidTimetables.find((x) => x.id === id);
  if (!t) return {};
  const rest = roster.kidTimetables.filter((x) => x.id !== id).sort((a, b) => a.sort - b.sort);
  const upsert = t.isMain && rest[0] ? [{ ...rest[0], isMain: true }] : [];
  return {
    // 대표 하나 규칙: 지우는 것이 먼저(삭제가 저장소에서 나중에 실행돼도, 지울 시간표를 아래에서 먼저 끈다)
    upsert: { kidTimetables: t.isMain ? [{ ...t, isMain: false }, ...upsert] : [] },
    remove: { kidTimetables: [t], kidBlocks: blocksOf(roster, id) },
  };
}

// ---------------------------------------------------------------
// 학원·종류 삭제 가능 여부
// ---------------------------------------------------------------

export const activityUseCount = (roster: Pick<RosterData, 'kidBlocks'>, id: string) => roster.kidBlocks.filter((b) => b.activityId === id).length;
export const categoryUseCount = (roster: Pick<RosterData, 'kidBlocks'>, id: string) => roster.kidBlocks.filter((b) => b.categoryId === id).length;

/** 10분 단위 시각 목록(from~to 포함) */
export function timeOptions(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = toMinutes(from); m <= toMinutes(to); m += 10) out.push(fromMinutes(m));
  return out;
}

export const ALL_WEEKDAYS = [...KID_WEEKDAYS];
