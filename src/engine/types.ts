// 스케줄 엔진 타입. 용어는 CLAUDE.md 용어 사전, 구조는 SPEC 3.2를 따른다.
// 날짜는 모두 'YYYY-MM-DD', 월은 'YYYY-MM' 문자열.

export type WeekNo = 1 | 2 | 3 | 4;
/** 요일반 요일. 1=월 … 5=금 (date-fns getDay 기준) */
export type Weekday = 1 | 2 | 3 | 4 | 5;

export type SessionLabel = { courseMonth: string; weekNo: WeekNo };
export type DatedLabel = { date: string } & SessionLabel;

export interface Track {
  weekday: Weekday;
  active: boolean;
  anchor: DatedLabel;
}

export interface Holiday {
  date: string;
  name: string;
}

export interface Closure {
  from: string;
  to: string;
  label: string;
  /** 적용 요일(0=일 … 6=토). 없으면 전체 요일 */
  weekdays?: number[];
}

export interface CalendarEvent {
  date: string;
  label: string;
  showOnCalendar: boolean;
}

export type SessionOverride =
  | { date: string; type: 'skip' }
  | ({ date: string; type: 'pin' } & SessionLabel);

export interface MakeupOverride {
  date: string;
  type: 'add' | 'remove';
}

export interface ScheduleInput {
  range: { from: string; to: string };
  tracks: Track[];
  holidays: Holiday[];
  ignoredHolidays: string[];
  closures: Closure[];
  events: CalendarEvent[];
  overrides: SessionOverride[];
  /** 확정된 달의 스냅샷. 이 목록에 날짜가 있는 달력월 = 확정된 달 */
  confirmedSessions: DatedLabel[];
  makeupOverrides: MakeupOverride[];
  /** 앞섬/밀림 경고 기준(|offset| ≥ 이 값). 기본 2 */
  offsetWarningThreshold?: number;
}

export type DayStatus = 'session' | 'holiday' | 'closed' | 'skipped' | 'makeup' | 'none';

export interface DayCell {
  date: string;
  /** 0=일 … 6=토 */
  weekday: number;
  status: DayStatus;
  session?: SessionLabel & { pinned: boolean; confirmed: boolean };
  holidayName?: string;
  closureLabel?: string;
  events: string[];
}

export interface TrackMonthSummary {
  weekday: Weekday;
  count: number;
  sessions: DatedLabel[];
  /** 예: "11월 1~4주, 12월 1주" */
  sessionsText: string;
  /** 달력월이 끝난 뒤 첫 회차 */
  nextSession: DatedLabel | null;
  /** SPEC 3.3. 계산할 수 없으면(시작점 이전 등) null */
  offset: number | null;
}

export interface MonthSummary {
  calendarMonth: string;
  tracks: TrackMonthSummary[];
  makeupDays: string[];
}

export type WarningType = 'missing' | 'duplicate' | 'offset' | 'confirmedMismatch';

export interface Warning {
  type: WarningType;
  weekday: Weekday;
  /** 문제가 드러난 날짜(누락·중복·확정 불일치) 또는 달력월 말일(offset) */
  date: string;
  calendarMonth: string;
  message: string;
  /** 누락·중복된 회차 */
  label?: SessionLabel;
}

export interface ScheduleOutput {
  days: DayCell[];
  monthSummaries: MonthSummary[];
  warnings: Warning[];
}
