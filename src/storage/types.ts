// 앱이 저장하는 데이터. SPEC 10.1 테이블과 1:1로 대응한다(4단계에서 Supabase 테이블이 된다).
// 회차 결과는 저장하지 않고, 이 입력값으로 매번 엔진이 계산한다.
import type { DatedLabel, WeekNo, Weekday } from '../engine/types.ts';

export interface AppSettings {
  academyName: string;
  slogan: string;
  noticeTemplate: string;
  /** 운영 요일(1=월 … 5=금). 빠진 요일은 요일반 비활성 */
  operatingWeekdays: Weekday[];
  /** 앞섬/밀림 경고 기준 */
  offsetWarningThreshold: number;
}

/** track_anchors */
export interface TrackAnchorRow {
  weekday: Weekday;
  startDate: string;
  courseMonth: string;
  weekNo: WeekNo;
}

/** custom_holidays: 임시공휴일 추가(add) 또는 내장 공휴일 무시(ignore) */
export interface CustomHolidayRow {
  date: string;
  name: string;
  type: 'add' | 'ignore';
}

/** closures: 휴원일(closed)과 행사일(event) */
export interface ClosureRow {
  id: string;
  kind: 'closed' | 'event';
  startDate: string;
  endDate: string;
  /** 적용 요일(0=일 … 6=토). null이면 전체 */
  weekdays: number[] | null;
  label: string;
  showOnCalendar: boolean;
}

/** session_overrides */
export interface SessionOverrideRow {
  date: string;
  type: 'skip' | 'pin';
  courseMonth?: string;
  weekNo?: WeekNo;
  note?: string;
}

/** makeup_overrides */
export interface MakeupOverrideRow {
  date: string;
  type: 'add' | 'remove';
}

/** month_plans */
export interface MonthPlanRow {
  calendarMonth: string;
  status: 'draft' | 'confirmed';
  confirmedAt: string | null;
  snapshot: DatedLabel[];
}

/** export_history (3단계에서 사용) */
export interface ExportHistoryRow {
  id: string;
  startMonth: string;
  title: string;
  highlightText: string;
  noticeText: string;
  ratio: '1:1' | '4:5';
  createdAt: string;
}

export interface AppData {
  version: 1;
  settings: AppSettings;
  trackAnchors: TrackAnchorRow[];
  customHolidays: CustomHolidayRow[];
  closures: ClosureRow[];
  sessionOverrides: SessionOverrideRow[];
  makeupOverrides: MakeupOverrideRow[];
  monthPlans: MonthPlanRow[];
  exportHistory: ExportHistoryRow[];
}

/** 저장 단위(= 테이블) */
export type CollectionKey = Exclude<keyof AppData, 'version'>;

export const COLLECTION_KEYS: CollectionKey[] = [
  'settings',
  'trackAnchors',
  'customHolidays',
  'closures',
  'sessionOverrides',
  'makeupOverrides',
  'monthPlans',
  'exportHistory',
];
