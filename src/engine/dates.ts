// 날짜 도우미. 'YYYY-MM-DD' 문자열만 주고받는다.
// parseISO는 날짜만 있는 문자열을 "현지 자정"으로 읽고, format도 현지 기준으로 쓰므로
// 시간대 때문에 하루 밀리는 일이 없다(UTC 변환을 하지 않는다).
import { addDays as fnsAddDays, addMonths, endOfMonth, format, getDay, parseISO } from 'date-fns';

const fmt = (d: Date) => format(d, 'yyyy-MM-dd');

export const addDays = (date: string, n: number) => fmt(fnsAddDays(parseISO(date), n));

/** 0=일 … 6=토 */
export const weekdayOf = (date: string) => getDay(parseISO(date));

export const monthOf = (date: string) => date.slice(0, 7);

export const monthStart = (ym: string) => `${ym}-01`;

export const monthEnd = (ym: string) => fmt(endOfMonth(parseISO(monthStart(ym))));

export const addMonthsYm = (ym: string, n: number) =>
  format(addMonths(parseISO(monthStart(ym)), n), 'yyyy-MM');

/** fromYm부터 toYm까지(포함) 달력월 목록 */
export function monthsBetween(fromYm: string, toYm: string): string[] {
  const out: string[] = [];
  for (let ym = fromYm; ym <= toYm; ym = addMonthsYm(ym, 1)) out.push(ym);
  return out;
}

/** from부터 to까지(포함) 모든 날짜 */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
