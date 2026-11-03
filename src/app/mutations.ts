// 데이터 수정 함수(순수 함수). 원본은 건드리지 않고 바뀐 표만 새로 만든 AppData를 돌려준다.
// 저장하기 전에 "바뀐 결과"로 영향 미리보기를 계산하는 데도 쓴다.
import { buildContext } from '../engine/context.ts';
import { monthEnd, monthOf, monthStart } from '../engine/dates.ts';
import { makeupDaysForMonth } from '../engine/makeup.ts';
import type { DatedLabel, SessionLabel } from '../engine/types.ts';
import type {
  AppData,
  AppSettings,
  ClosureRow,
  CustomHolidayRow,
  MakeupOverrideRow,
  TrackAnchorRow,
} from '../storage/types.ts';
import { buildScheduleInput } from './scheduleInput.ts';

/** 보안 연결(https)이 아니어도 동작하는 간단한 id (폰에서 http로 접속할 때 crypto.randomUUID가 없을 수 있음) */
export const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// ---------- 회차 조정 ----------

export function setSkip(data: AppData, date: string, on: boolean): AppData {
  const rest = data.sessionOverrides.filter((o) => o.date !== date);
  return { ...data, sessionOverrides: on ? [...rest, { date, type: 'skip' }] : rest };
}

/** label이 null이면 고정 해제 */
export function setPin(data: AppData, date: string, label: SessionLabel | null): AppData {
  const rest = data.sessionOverrides.filter((o) => o.date !== date);
  return {
    ...data,
    sessionOverrides: label
      ? [...rest, { date, type: 'pin', courseMonth: label.courseMonth, weekNo: label.weekNo }]
      : rest,
  };
}

// ---------- 보강데이 ----------

export function makeupDaysOf(data: AppData, calendarMonth: string, overrides = data.makeupOverrides): string[] {
  const range = { from: monthStart(calendarMonth), to: monthEnd(calendarMonth) };
  const ctx = buildContext(buildScheduleInput(data, range));
  return makeupDaysForMonth(calendarMonth, ctx, overrides);
}

/** 토요일을 보강데이로 지정(on) 또는 해제(off). 자동 제안과의 관계는 알아서 맞춘다. */
export function setMakeup(data: AppData, date: string, on: boolean): AppData {
  const ym = monthOf(date);
  let overrides: MakeupOverrideRow[] = data.makeupOverrides.filter((o) => o.date !== date);
  const included = makeupDaysOf(data, ym, overrides).includes(date);
  if (on && !included) overrides = [...overrides, { date, type: 'add' }];
  if (!on && included) overrides = [...overrides, { date, type: 'remove' }];
  return { ...data, makeupOverrides: overrides };
}

// ---------- 휴원일·행사일 ----------

export function upsertClosure(data: AppData, row: ClosureRow): AppData {
  const rest = data.closures.filter((c) => c.id !== row.id);
  return { ...data, closures: [...rest, row].sort((a, b) => a.startDate.localeCompare(b.startDate)) };
}

export function deleteClosure(data: AppData, id: string): AppData {
  return { ...data, closures: data.closures.filter((c) => c.id !== id) };
}

// ---------- 확정 ----------

export function confirmMonth(data: AppData, calendarMonth: string, snapshot: DatedLabel[], now: string): AppData {
  const rest = data.monthPlans.filter((p) => p.calendarMonth !== calendarMonth);
  return {
    ...data,
    monthPlans: [...rest, { calendarMonth, status: 'confirmed' as const, confirmedAt: now, snapshot }].sort((a, b) =>
      a.calendarMonth.localeCompare(b.calendarMonth),
    ),
  };
}

export function unconfirmMonth(data: AppData, calendarMonth: string): AppData {
  return { ...data, monthPlans: data.monthPlans.filter((p) => p.calendarMonth !== calendarMonth) };
}

export const isConfirmedMonth = (data: AppData, calendarMonth: string) =>
  data.monthPlans.some((p) => p.calendarMonth === calendarMonth && p.status === 'confirmed');

// ---------- 설정 ----------

export function updateSettings(data: AppData, patch: Partial<AppSettings>): AppData {
  return { ...data, settings: { ...data.settings, ...patch } };
}

export function setTrackAnchor(data: AppData, row: TrackAnchorRow): AppData {
  const rest = data.trackAnchors.filter((a) => a.weekday !== row.weekday);
  return { ...data, trackAnchors: [...rest, row].sort((a, b) => a.weekday - b.weekday) };
}

export function addCustomHoliday(data: AppData, date: string, name: string): AppData {
  const rest = data.customHolidays.filter((h) => h.date !== date);
  const row: CustomHolidayRow = { date, name, type: 'add' };
  return { ...data, customHolidays: [...rest, row].sort((a, b) => a.date.localeCompare(b.date)) };
}

export function deleteCustomHoliday(data: AppData, date: string): AppData {
  return { ...data, customHolidays: data.customHolidays.filter((h) => h.date !== date) };
}

/** 내장 공휴일 무시(수업함) 켜기/끄기 */
export function setHolidayIgnored(data: AppData, date: string, name: string, ignored: boolean): AppData {
  const rest = data.customHolidays.filter((h) => !(h.date === date && h.type === 'ignore'));
  const row: CustomHolidayRow = { date, name, type: 'ignore' };
  return {
    ...data,
    customHolidays: ignored ? [...rest, row].sort((a, b) => a.date.localeCompare(b.date)) : rest,
  };
}
