// 보강데이. SPEC 3.5.
import { closureAt, holidayAt, type EngineContext } from './context.ts';
import { addDays, monthEnd, monthOf, weekdayOf } from './dates.ts';
import type { MakeupOverride } from './types.ts';

/**
 * 자동 제안: 그 달 마지막 토요일. 공휴일·휴원일이면 그 전 토요일로 계속 거슬러 간다.
 * 가능한 토요일이 없으면 null.
 */
export function suggestMakeupDay(calendarMonth: string, ctx: EngineContext): string | null {
  let d = monthEnd(calendarMonth);
  while (weekdayOf(d) !== 6) d = addDays(d, -1);
  for (; monthOf(d) === calendarMonth; d = addDays(d, -7)) {
    if (!holidayAt(ctx, d) && !closureAt(ctx, d)) return d;
  }
  return null;
}

/**
 * 그 달의 보강데이 목록.
 * - 같은 달에 'add'가 하나라도 있으면 자동 제안은 숨기고 add한 날만 쓴다.
 * - 'remove'는 자동 제안이나 add한 날을 없앤다.
 */
export function makeupDaysForMonth(
  calendarMonth: string,
  ctx: EngineContext,
  overrides: MakeupOverride[],
): string[] {
  const inMonth = overrides.filter((o) => monthOf(o.date) === calendarMonth);
  const adds = inMonth.filter((o) => o.type === 'add').map((o) => o.date);
  const removes = new Set(inMonth.filter((o) => o.type === 'remove').map((o) => o.date));
  const suggested = suggestMakeupDay(calendarMonth, ctx);
  const candidates = adds.length > 0 ? adds : suggested ? [suggested] : [];
  return [...new Set(candidates)].filter((d) => !removes.has(d)).sort();
}
