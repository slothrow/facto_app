// 하린이 시간표 순수 함수(SPEC_harin 6·7·11장). 화면·DB와 분리.
import { fromMinutes, shortTime, toMinutes } from '../classTime.ts';
import { rangesOverlap } from '../timeRange.ts';
import type { KidActivityRow, KidBlockRow, KidCategoryRow, KidTimetableRow } from '../../storage/rosterTypes.ts';

/** 입력 가능 범위 */
export const INPUT_START = '13:30';
export const INPUT_END = '23:00';
/** 보이는 범위 기본값 */
export const VIEW_START = '14:00';
export const VIEW_END = '23:00';
export const KID_WEEKDAYS = [1, 2, 3, 4, 5] as const;
export const DEFAULT_TRAVEL = 20;

const IN_START = toMinutes(INPUT_START);
const IN_END = toMinutes(INPUT_END);

export type BlockLike = Pick<KidBlockRow, 'id' | 'weekday' | 'startTime' | 'endTime'>;
type ActivityLike = Pick<KidActivityRow, 'id' | 'travelMinutes' | 'isHome'>;

export const durationOf = (b: Pick<KidBlockRow, 'startTime' | 'endTime'>) => toMinutes(b.endTime) - toMinutes(b.startTime);

// ---------------------------------------------------------------
// 이동 블록
// ---------------------------------------------------------------

export interface TravelBlock {
  weekday: number;
  startTime: string;
  endTime: string;
  minutes: number;
  /** 이 이동 값을 가진 학원 블록과 쪽(override 저장 위치). 연속 학원 사이는 뒤 학원의 before */
  ownerId: string;
  side: 'before' | 'after';
  /** 연속 학원 사이 이동이면 앞 학원 블록 id */
  fromId: string | null;
  warnings: string[];
}

/** 학원 블록의 앞·뒤 이동 시간(override → 집 수업 0 → 학원 기본값) */
export function travelOf(block: KidBlockRow, activity: ActivityLike | undefined, side: 'before' | 'after'): number {
  const ov = side === 'before' ? block.travelBeforeOverride : block.travelAfterOverride;
  if (ov !== null && ov !== undefined) return ov;
  if (!activity || activity.isHome) return 0;
  return activity.travelMinutes;
}

/**
 * 학원 블록(activityId 있음)마다 앞뒤 이동 블록을 만든다.
 * 연속된 학원(사이에 다른 블록 없음, 간격 < A 뒤 이동 + B 앞 이동, 둘 다 집 수업 아님)은 이동 하나만: A 끝부터 B 앞 이동 길이.
 */
export function buildTravelBlocks(blocks: KidBlockRow[], activities: ActivityLike[]): TravelBlock[] {
  const actById = new Map(activities.map((a) => [a.id, a]));
  const out: TravelBlock[] = [];
  for (const wd of KID_WEEKDAYS) {
    const day = blocks.filter((b) => b.weekday === wd).sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
    const isOut = (b: KidBlockRow) => {
      if (!b.activityId) return false;
      const a = actById.get(b.activityId);
      return Boolean(a && !a.isHome);
    };
    const mergedAfter = new Set<string>();
    const dayTravel: TravelBlock[] = [];
    // 뒤 이동은 다음 학원과 합쳐질 수 있어 나중에 거른다
    const pushAfter = (b: KidBlockRow, act: ActivityLike | undefined) => {
      const after = travelOf(b, act, 'after');
      if (after > 0) {
        const s = toMinutes(b.endTime);
        dayTravel.push(make(wd, s, s + after, b.id, 'after', null));
      }
    };
    day.forEach((b, i) => {
      if (!b.activityId) return;
      const act = actById.get(b.activityId);
      // 앞 이동: 바로 앞 블록이 바깥 학원이고 연속이면 하나로 합친다
      const prev = i > 0 ? day[i - 1] : null;
      const before = travelOf(b, act, 'before');
      if (prev && isOut(prev) && isOut(b)) {
        const prevAfter = travelOf(prev, actById.get(prev.activityId!), 'after');
        const gap = toMinutes(b.startTime) - toMinutes(prev.endTime);
        if (gap < prevAfter + before) {
          mergedAfter.add(prev.id);
          if (before > 0) {
            const s = toMinutes(prev.endTime);
            dayTravel.push(make(wd, s, s + before, b.id, 'before', prev.id));
          }
          return pushAfter(b, act);
        }
      }
      if (before > 0) {
        const e = toMinutes(b.startTime);
        dayTravel.push(make(wd, e - before, e, b.id, 'before', null));
      }
      pushAfter(b, act);
    });
    const kept = dayTravel.filter((t) => !(t.side === 'after' && mergedAfter.has(t.ownerId)));
    // 경고: 다른 블록과 겹침, 입력 범위 밖
    for (const t of kept) {
      const s = toMinutes(t.startTime);
      const e = toMinutes(t.endTime);
      if (day.some((b) => rangesOverlap(s, e, toMinutes(b.startTime), toMinutes(b.endTime)))) t.warnings.push('다른 일정과 겹침');
      if (s < IN_START || e > IN_END) t.warnings.push('입력 범위 밖');
    }
    out.push(...kept);
  }
  return out;
}

function make(weekday: number, s: number, e: number, ownerId: string, side: 'before' | 'after', fromId: string | null): TravelBlock {
  return {
    weekday,
    startTime: fromMinutes(Math.max(0, s)),
    endTime: fromMinutes(Math.min(24 * 60 - 10, e)),
    minutes: e - s,
    ownerId,
    side,
    fromId,
    warnings: [],
  };
}

// ---------------------------------------------------------------
// 놓기 판단
// ---------------------------------------------------------------

export type KidPlacement = { ok: true } | { ok: false; reason: string };

/**
 * block을 (weekday, start~end)에 놓을 수 있는지. end를 안 주면 길이를 유지한다.
 * 같은 요일 다른 블록과 겹치면 불가, 13:30~23:00 밖 불가, 10분 단위가 아니면 불가.
 */
export function canPlaceKid(
  blocks: BlockLike[],
  block: Pick<BlockLike, 'id' | 'startTime' | 'endTime'>,
  weekday: number,
  start: string,
  end?: string,
): KidPlacement {
  const s = toMinutes(start);
  const e = end ? toMinutes(end) : s + durationOf(block);
  if (s % 10 !== 0 || e % 10 !== 0) return { ok: false, reason: '10분 단위로만 놓을 수 있어요' };
  if (e <= s) return { ok: false, reason: '끝 시간이 시작보다 늦어야 해요' };
  if (s < IN_START || e > IN_END) return { ok: false, reason: `${shortTime(INPUT_START)}~${shortTime(INPUT_END)} 안에만 놓을 수 있어요` };
  const hit = blocks.find((b) => b.id !== block.id && b.weekday === weekday && rangesOverlap(s, e, toMinutes(b.startTime), toMinutes(b.endTime)));
  if (hit) return { ok: false, reason: `${shortTime(hit.startTime)}~${shortTime(hit.endTime)} 일정과 겹쳐요` };
  return { ok: true };
}

// ---------------------------------------------------------------
// 표시
// ---------------------------------------------------------------

export interface BlockLook {
  emoji: string;
  name: string;
  color: string;
  place: string | null;
}

/** 블록의 이모지·이름·색(학원이면 학원 값, 아니면 종류 값. 이름이 비면 종류 이름) */
export function blockLook(b: KidBlockRow, activities: KidActivityRow[], categories: KidCategoryRow[]): BlockLook {
  const cat = categories.find((c) => c.id === b.categoryId);
  const act = b.activityId ? activities.find((a) => a.id === b.activityId) : undefined;
  if (act) return { emoji: act.emoji, name: b.title?.trim() || act.name, color: act.color, place: act.place };
  return { emoji: cat?.emoji ?? '', name: b.title?.trim() || cat?.name || '일정', color: cat?.color ?? '#e7e5e4', place: null };
}

/** 30분 이상이면 여러 줄(이름 / 시간 / 장소), 10~20분은 한 줄 */
export const isShortBlock = (minutes: number) => minutes < 30;

/** 보이는 범위: 설정값(없으면 14:00~23:00)을 블록·이동이 밖에 있으면 30분 단위로 넓힌다 */
export function visibleRange(
  view: { viewStart?: string; viewEnd?: string } | undefined,
  items: { startTime: string; endTime: string }[],
): { start: number; end: number } {
  let start = toMinutes(view?.viewStart ?? VIEW_START);
  let end = toMinutes(view?.viewEnd ?? VIEW_END);
  for (const it of items) {
    start = Math.min(start, Math.floor(toMinutes(it.startTime) / 30) * 30);
    end = Math.max(end, Math.ceil(toMinutes(it.endTime) / 30) * 30);
  }
  return { start: Math.max(0, start), end: Math.min(24 * 60, end) };
}

// ---------------------------------------------------------------
// [오늘] 목록
// ---------------------------------------------------------------

export interface AgendaItem {
  kind: 'block' | 'travel';
  startTime: string;
  endTime: string;
  emoji: string;
  name: string;
  minutes: number;
  place: string | null;
}

/** 그 요일 일정을 시간순으로(이동 포함) */
export function dayAgenda(
  blocks: KidBlockRow[],
  activities: KidActivityRow[],
  categories: KidCategoryRow[],
  weekday: number,
): AgendaItem[] {
  const travelCat = categories.find((c) => c.isTravel);
  const items: AgendaItem[] = blocks
    .filter((b) => b.weekday === weekday)
    .map((b) => {
      const look = blockLook(b, activities, categories);
      return { kind: 'block', startTime: b.startTime, endTime: b.endTime, emoji: look.emoji, name: look.name, minutes: durationOf(b), place: look.place };
    });
  for (const t of buildTravelBlocks(blocks, activities).filter((t) => t.weekday === weekday)) {
    items.push({ kind: 'travel', startTime: t.startTime, endTime: t.endTime, emoji: travelCat?.emoji ?? '🚶', name: travelCat?.name ?? '이동', minutes: t.minutes, place: null });
  }
  // 같은 시각이면 이동이 먼저(학원 앞 이동이 학원 끝 시각과 같을 수는 없지만, 순서를 고정해 둔다)
  return items.sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime) || (a.kind === 'travel' ? -1 : 1));
}

/** 예: "3:00 🎹 피아노 (3:00~3:50) → 3:50 🚶 이동 20분" */
export function agendaText(items: AgendaItem[]): string {
  return items
    .map((it) =>
      it.kind === 'travel'
        ? `${shortTime(it.startTime)} ${it.emoji} ${it.name} ${it.minutes}분`
        : `${shortTime(it.startTime)} ${it.emoji} ${it.name} (${shortTime(it.startTime)}~${shortTime(it.endTime)})`,
    )
    .join(' → ');
}

/** [오늘]이 볼 요일: 월~금은 그날, 주말은 월요일. date는 'YYYY-MM-DD' */
export function agendaWeekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd >= 1 && wd <= 5 ? wd : 1;
}

// ---------------------------------------------------------------
// 시간표 버전
// ---------------------------------------------------------------

/** 대표 시간표(없으면 맨 위) */
export function mainTimetable(list: KidTimetableRow[]): KidTimetableRow | null {
  const sorted = [...list].sort((a, b) => a.sort - b.sort);
  return sorted.find((t) => t.isMain) ?? sorted[0] ?? null;
}
