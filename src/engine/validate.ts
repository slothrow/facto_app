// 입력 검사와 경고. SPEC 3.4.
import type { EngineContext } from './context.ts';
import { monthEnd, monthOf, weekdayOf } from './dates.ts';
import { WEEKDAY_NAMES, formatLabel, labelFromIndex, labelIndex, monthName, sameLabel } from './label.ts';
import type { TrackEntry } from './schedule.ts';
import type { MonthSummary, ScheduleInput, Track, Warning } from './types.ts';

const dayName = (wd: number) => `${WEEKDAY_NAMES[wd]}요일`;

/** 잘못된 입력은 계산 전에 막는다(계산 결과가 엉뚱해지지 않도록). */
export function validateInput(input: ScheduleInput): void {
  const seen = new Set<number>();
  for (const t of input.tracks) {
    if (seen.has(t.weekday)) throw new Error(`${dayName(t.weekday)} 요일반이 두 개 있습니다.`);
    seen.add(t.weekday);
    if (weekdayOf(t.anchor.date) !== t.weekday) {
      throw new Error(`${dayName(t.weekday)} 시작점 ${t.anchor.date}이(가) ${dayName(t.weekday)}이 아닙니다.`);
    }
  }
  if (input.range.from > input.range.to) throw new Error('기간의 시작이 끝보다 늦습니다.');
}

/** 누락·중복·확정 불일치 */
export function trackWarnings(track: Track, entries: TrackEntry[], ctx: EngineContext): Warning[] {
  const out: Warning[] = [];
  const name = dayName(track.weekday);

  // 누락·중복: 회차 번호가 앞으로 건너뛰면 누락, 이미 나온 번호가 다시 나오면 중복
  let prev = labelIndex(track.anchor) - 1;
  const seen = new Set<number>();
  for (const e of entries) {
    if (e.kind !== 'session') continue;
    const idx = labelIndex(e.label!);
    for (let k = prev + 1; k < idx; k++) {
      const label = labelFromIndex(k);
      out.push({
        type: 'missing',
        weekday: track.weekday,
        date: e.date,
        calendarMonth: monthOf(e.date),
        label,
        message: `${name}: ${formatLabel(label)} 누락`,
      });
    }
    if (seen.has(idx)) {
      out.push({
        type: 'duplicate',
        weekday: track.weekday,
        date: e.date,
        calendarMonth: monthOf(e.date),
        label: e.label,
        message: `${name}: ${formatLabel(e.label!)} 중복`,
      });
    }
    seen.add(idx);
    prev = idx;
  }

  // 확정 불일치: 확정된 달의 첫 회차가 앞에서 이어지는 회차와 다르거나,
  // 확정된 날짜에 공휴일·휴원일이 겹쳤거나, 확정 스냅샷에 없는 날이 수업일이 된 경우
  const firstChecked = new Set<string>();
  const flagged = new Set<string>();
  for (const e of entries) {
    const ym = monthOf(e.date);
    if (!ctx.confirmedMonths.has(ym)) continue;
    let bad = e.kind === 'unconfirmed';
    if (e.kind === 'session' && e.confirmed) {
      if (e.conflict) bad = true;
      if (!firstChecked.has(ym)) {
        firstChecked.add(ym);
        if (!sameLabel(e.label!, e.expected)) bad = true;
      }
    }
    if (bad && !flagged.has(ym)) {
      flagged.add(ym);
      out.push({
        type: 'confirmedMismatch',
        weekday: track.weekday,
        date: e.date,
        calendarMonth: ym,
        message: `${name}: 확정된 ${monthName(ym)}과 연결이 맞지 않습니다`,
      });
    }
  }
  return out;
}

/** 앞섬/밀림 기준치 초과: |offset| ≥ threshold */
export function offsetWarnings(summaries: MonthSummary[], threshold: number): Warning[] {
  const out: Warning[] = [];
  for (const m of summaries) {
    for (const t of m.tracks) {
      if (t.offset === null || Math.abs(t.offset) < threshold) continue;
      const n = Math.abs(t.offset);
      out.push({
        type: 'offset',
        weekday: t.weekday,
        date: monthEnd(m.calendarMonth),
        calendarMonth: m.calendarMonth,
        message: `${dayName(t.weekday)}: ${monthName(m.calendarMonth)} 말 ${n}회 ${t.offset > 0 ? '앞섬' : '밀림'}`,
      });
    }
  }
  return out;
}
