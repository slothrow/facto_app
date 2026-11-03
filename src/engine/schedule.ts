// 스케줄 엔진 본체. SPEC 3.1~3.2. 순수 함수: 입력만으로 결과가 정해진다.
import { buildContext, closureAt, holidayAt, type EngineContext } from './context.ts';
import { addDays, eachDay, monthOf, monthsBetween, weekdayOf } from './dates.ts';
import { nextLabel } from './label.ts';
import { makeupDaysForMonth } from './makeup.ts';
import { summarizeTrackMonth } from './offset.ts';
import type {
  DatedLabel,
  DayCell,
  ScheduleInput,
  ScheduleOutput,
  SessionLabel,
  Track,
} from './types.ts';
import { offsetWarnings, trackWarnings, validateInput } from './validate.ts';

/**
 * 요일반 한 날짜의 계산 결과.
 * - unconfirmed: 확정된 달인데 스냅샷에 없는 날(확정 후 공휴일 무시·휴원 삭제 등). 수업 없음으로 둔다.
 */
export type EntryKind = 'session' | 'holiday' | 'closed' | 'skipped' | 'unconfirmed';

export interface TrackEntry {
  date: string;
  kind: EntryKind;
  label?: SessionLabel;
  pinned: boolean;
  confirmed: boolean;
  /** 이 날짜 직전까지의 흐름대로라면 배정됐을 회차 */
  expected: SessionLabel;
  /** 확정된 날짜에 공휴일·휴원일이 겹침 */
  conflict?: boolean;
}

/** offset 계산용으로 기간 끝 이후 1년치까지 더 굴린다. */
const LOOKAHEAD_DAYS = 366;

/**
 * 요일반 하나를 시작점부터 7일 간격으로 굴린다.
 * 판정 우선순위: 확정 > 공휴일 > 휴원일 > 비우기 > (확정된 달이면 수업 없음) > 고정 > 일반
 */
export function rollTrack(track: Track, ctx: EngineContext, until: string): TrackEntry[] {
  const entries: TrackEntry[] = [];
  let current: SessionLabel = { courseMonth: track.anchor.courseMonth, weekNo: track.anchor.weekNo };

  for (let date = track.anchor.date; date <= until; date = addDays(date, 7)) {
    const base = { date, pinned: ctx.pins.has(date), confirmed: false, expected: current };

    const confirmed = ctx.confirmed.get(date);
    if (confirmed) {
      const conflict = Boolean(holidayAt(ctx, date) || closureAt(ctx, date));
      entries.push({ ...base, kind: 'session', label: confirmed, confirmed: true, conflict });
      current = nextLabel(confirmed);
      continue;
    }
    if (holidayAt(ctx, date)) {
      entries.push({ ...base, kind: 'holiday' });
      continue;
    }
    if (closureAt(ctx, date)) {
      entries.push({ ...base, kind: 'closed' });
      continue;
    }
    if (ctx.skips.has(date)) {
      entries.push({ ...base, kind: 'skipped' });
      continue;
    }
    if (ctx.confirmedMonths.has(monthOf(date))) {
      entries.push({ ...base, kind: 'unconfirmed' });
      continue;
    }
    const label = ctx.pins.get(date) ?? current;
    entries.push({ ...base, kind: 'session', label });
    current = nextLabel(label);
  }
  return entries;
}

export function schedule(input: ScheduleInput): ScheduleOutput {
  validateInput(input);
  const ctx = buildContext(input);
  const { from, to } = input.range;
  const until = addDays(to, LOOKAHEAD_DAYS);

  const rolled = input.tracks
    .filter((t) => t.active)
    .map((track) => ({ track, entries: rollTrack(track, ctx, until) }));

  const entryByDate = new Map<string, TrackEntry>();
  for (const { entries } of rolled) for (const e of entries) entryByDate.set(e.date, e);

  const months = monthsBetween(monthOf(from), monthOf(to));
  const makeupByMonth = new Map(
    months.map((ym) => [ym, makeupDaysForMonth(ym, ctx, input.makeupOverrides)]),
  );
  const makeupSet = new Set([...makeupByMonth.values()].flat());

  const days = eachDay(from, to).map((date) => toDayCell(date, ctx, entryByDate, makeupSet));

  const monthSummaries = months.map((ym) => ({
    calendarMonth: ym,
    tracks: rolled.map(({ track, entries }) => summarizeTrackMonth(ym, track, entries)),
    makeupDays: makeupByMonth.get(ym) ?? [],
  }));

  const warnings = [
    ...rolled.flatMap(({ track, entries }) => trackWarnings(track, entries, ctx)),
    ...offsetWarnings(monthSummaries, input.offsetWarningThreshold ?? 2),
  ]
    .filter((w) => w.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date) || a.weekday - b.weekday);

  return { days, monthSummaries, warnings };
}

function toDayCell(
  date: string,
  ctx: EngineContext,
  entryByDate: Map<string, TrackEntry>,
  makeupSet: Set<string>,
): DayCell {
  const holidayName = holidayAt(ctx, date);
  const closureLabel = closureAt(ctx, date)?.label;
  const cell: DayCell = {
    date,
    weekday: weekdayOf(date),
    status: 'none',
    events: ctx.events.get(date) ?? [],
    ...(holidayName ? { holidayName } : {}),
    ...(closureLabel ? { closureLabel } : {}),
  };

  const e = entryByDate.get(date);
  if (e) {
    if (e.kind === 'session') {
      cell.status = 'session';
      cell.session = { ...e.label!, pinned: e.pinned, confirmed: e.confirmed };
    } else if (e.kind === 'unconfirmed') {
      cell.status = 'none';
    } else {
      cell.status = e.kind;
    }
  } else if (makeupSet.has(date)) {
    cell.status = 'makeup';
  } else if (holidayName) {
    cell.status = 'holiday';
  } else if (closureLabel) {
    cell.status = 'closed';
  }
  return cell;
}

/** 확정할 때 저장할 스냅샷: 그 달력월의 수업일 회차 목록 */
export function snapshotMonth(output: ScheduleOutput, calendarMonth: string): DatedLabel[] {
  return output.days
    .filter((d) => monthOf(d.date) === calendarMonth && d.status === 'session' && d.session)
    .map((d) => ({ date: d.date, courseMonth: d.session!.courseMonth, weekNo: d.session!.weekNo }));
}
