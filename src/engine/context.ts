// 엔진 입력을 날짜로 빠르게 찾을 수 있게 정리한 것.
import { monthOf, weekdayOf } from './dates.ts';
import type { Closure, ScheduleInput, SessionLabel } from './types.ts';

export interface EngineContext {
  /** 무시하지 않은 공휴일만 */
  holidays: Map<string, string>;
  closures: Closure[];
  skips: Set<string>;
  pins: Map<string, SessionLabel>;
  confirmed: Map<string, SessionLabel>;
  confirmedMonths: Set<string>;
  events: Map<string, string[]>;
}

export function buildContext(input: ScheduleInput): EngineContext {
  const ignored = new Set(input.ignoredHolidays);
  const holidays = new Map<string, string>();
  for (const h of input.holidays) if (!ignored.has(h.date)) holidays.set(h.date, h.name);

  const skips = new Set<string>();
  const pins = new Map<string, SessionLabel>();
  for (const o of input.overrides) {
    if (o.type === 'skip') skips.add(o.date);
    else pins.set(o.date, { courseMonth: o.courseMonth, weekNo: o.weekNo });
  }

  const confirmed = new Map<string, SessionLabel>();
  const confirmedMonths = new Set<string>();
  for (const s of input.confirmedSessions) {
    confirmed.set(s.date, { courseMonth: s.courseMonth, weekNo: s.weekNo });
    confirmedMonths.add(monthOf(s.date));
  }

  const events = new Map<string, string[]>();
  for (const e of input.events) events.set(e.date, [...(events.get(e.date) ?? []), e.label]);

  return { holidays, closures: input.closures, skips, pins, confirmed, confirmedMonths, events };
}

export const holidayAt = (ctx: EngineContext, date: string) => ctx.holidays.get(date);

/** 그 날짜(요일 포함)에 적용되는 휴원일 */
export function closureAt(ctx: EngineContext, date: string): Closure | undefined {
  const wd = weekdayOf(date);
  return ctx.closures.find(
    (c) =>
      c.from <= date &&
      date <= c.to &&
      (!c.weekdays || c.weekdays.length === 0 || c.weekdays.includes(wd)),
  );
}
