// 테스트 도우미: SPEC 7장 표기("11/2 11-1, 12/25 공휴일")와 엔진 결과를 같은 모양의 문자열로 맞춰 비교한다.
import { monthOf } from './dates.ts';
import { parseCode } from './label.ts';
import type { DayCell, ScheduleOutput } from './types.ts';

const STATUS_WORDS: Record<string, DayCell['status']> = {
  공휴일: 'holiday',
  휴원: 'closed',
  비움: 'skipped',
  없음: 'none',
};

const describeCell = (c: DayCell) =>
  c.status === 'session' && c.session
    ? `${c.date} ${c.session.courseMonth}/${c.session.weekNo}`
    : `${c.date} ${c.status}`;

/** SPEC 표기를 "2026-11-02 2026-11/1" 또는 "2026-12-25 holiday" 목록으로 */
export function expectedList(year: number, text: string): string[] {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((item) => {
      const [md, code] = item.split(/\s+/);
      const [m, d] = md.split('/').map(Number);
      const date = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (STATUS_WORDS[code]) return `${date} ${STATUS_WORDS[code]}`;
      const l = parseCode(date, code);
      return `${date} ${l.courseMonth}/${l.weekNo}`;
    });
}

/** 엔진 결과에서 해당 요일, 해당 달력월들의 칸만 같은 형식으로 */
export function actualList(output: ScheduleOutput, weekday: number, months: string[]): string[] {
  return output.days
    .filter((c) => c.weekday === weekday && months.includes(monthOf(c.date)))
    .map(describeCell);
}

/** 지정한 날짜들만 */
export function actualAt(output: ScheduleOutput, dates: string[]): string[] {
  return dates.map((date) => {
    const c = output.days.find((d) => d.date === date);
    if (!c) throw new Error(`${date}가 결과 범위에 없습니다`);
    return describeCell(c);
  });
}

export function offsetOf(output: ScheduleOutput, calendarMonth: string, weekday: number) {
  return output.monthSummaries
    .find((m) => m.calendarMonth === calendarMonth)
    ?.tracks.find((t) => t.weekday === weekday)?.offset;
}
