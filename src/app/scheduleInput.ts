// 저장된 데이터(AppData) → 엔진 입력(ScheduleInput) 변환.
import { builtInHolidays } from '../data/holidays/index.ts';
import { eachDay } from '../engine/dates.ts';
import { schedule } from '../engine/schedule.ts';
import type { ScheduleInput, ScheduleOutput, SessionOverride } from '../engine/types.ts';
import type { AppData } from '../storage/types.ts';

export function buildScheduleInput(data: AppData, range: { from: string; to: string }): ScheduleInput {
  const { settings } = data;
  const overrides: SessionOverride[] = [];
  for (const o of data.sessionOverrides) {
    if (o.type === 'skip') overrides.push({ date: o.date, type: 'skip' });
    else if (o.courseMonth && o.weekNo) {
      overrides.push({ date: o.date, type: 'pin', courseMonth: o.courseMonth, weekNo: o.weekNo });
    }
  }

  return {
    range,
    tracks: data.trackAnchors.map((a) => ({
      weekday: a.weekday,
      active: settings.operatingWeekdays.includes(a.weekday),
      anchor: { date: a.startDate, courseMonth: a.courseMonth, weekNo: a.weekNo },
    })),
    holidays: [
      ...builtInHolidays,
      ...data.customHolidays.filter((h) => h.type === 'add').map((h) => ({ date: h.date, name: h.name })),
    ],
    ignoredHolidays: data.customHolidays.filter((h) => h.type === 'ignore').map((h) => h.date),
    closures: data.closures
      .filter((c) => c.kind === 'closed')
      .map((c) => ({
        from: c.startDate,
        to: c.endDate,
        label: c.label,
        ...(c.weekdays && c.weekdays.length > 0 ? { weekdays: c.weekdays } : {}),
      })),
    events: data.closures
      .filter((c) => c.kind === 'event')
      .flatMap((c) =>
        eachDay(c.startDate, c.endDate).map((date) => ({
          date,
          label: c.label,
          showOnCalendar: c.showOnCalendar,
        })),
      ),
    overrides,
    confirmedSessions: data.monthPlans
      .filter((p) => p.status === 'confirmed')
      .flatMap((p) => p.snapshot),
    makeupOverrides: data.makeupOverrides,
    offsetWarningThreshold: settings.offsetWarningThreshold,
  };
}

export function scheduleFor(data: AppData, range: { from: string; to: string }): ScheduleOutput {
  return schedule(buildScheduleInput(data, range));
}
