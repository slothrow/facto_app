// 앱 데이터(camelCase) ↔ Supabase 테이블 행(snake_case) 변환. 순수 함수라 테스트로 확인한다.
import type { WeekNo, Weekday } from '../engine/types.ts';
import type {
  AppData,
  AppSettings,
  ClosureRow,
  CollectionKey,
  CustomHolidayRow,
  ExportHistoryRow,
  MakeupOverrideRow,
  MonthPlanRow,
  SessionOverrideRow,
  TrackAnchorRow,
} from './types.ts';

/** 앱 저장 단위 → DB 테이블 이름 */
export const TABLE_OF: Record<CollectionKey, string> = {
  settings: 'settings',
  trackAnchors: 'track_anchors',
  customHolidays: 'custom_holidays',
  closures: 'closures',
  sessionOverrides: 'session_overrides',
  makeupOverrides: 'makeup_overrides',
  monthPlans: 'month_plans',
  exportHistory: 'export_history',
};

/** 불러올 때 정렬 기준(앱이 쓰던 순서와 맞춘다) */
export const ORDER_OF: Record<Exclude<CollectionKey, 'settings'>, { column: string; ascending: boolean }> = {
  trackAnchors: { column: 'weekday', ascending: true },
  customHolidays: { column: 'date', ascending: true },
  closures: { column: 'start_date', ascending: true },
  sessionOverrides: { column: 'date', ascending: true },
  makeupOverrides: { column: 'date', ascending: true },
  monthPlans: { column: 'calendar_month', ascending: true },
  exportHistory: { column: 'created_at', ascending: false },
};

type Row = Record<string, unknown>;

/** DB가 돌려주는 시각 문자열(+00:00, 마이크로초)을 toISOString 형식으로 통일 */
const iso = (v: unknown) => new Date(String(v)).toISOString();
/** null → 속성 없음(앱 타입의 선택 속성과 맞추기 위해) */
const opt = <T,>(v: unknown) => (v === null || v === undefined ? undefined : (v as T));

// ---------- 앱 → DB ----------

export function toDb<K extends CollectionKey>(key: K, value: AppData[K]): unknown {
  switch (key) {
    case 'settings':
      return value;
    case 'trackAnchors':
      return (value as TrackAnchorRow[]).map((r) => ({
        weekday: r.weekday,
        start_date: r.startDate,
        course_month: r.courseMonth,
        week_no: r.weekNo,
      }));
    case 'customHolidays':
      return (value as CustomHolidayRow[]).map((r) => ({ date: r.date, name: r.name, type: r.type }));
    case 'closures':
      return (value as ClosureRow[]).map((r) => ({
        id: r.id,
        kind: r.kind,
        start_date: r.startDate,
        end_date: r.endDate,
        weekdays: r.weekdays,
        label: r.label,
        show_on_calendar: r.showOnCalendar,
      }));
    case 'sessionOverrides':
      return (value as SessionOverrideRow[]).map((r) => ({
        date: r.date,
        type: r.type,
        course_month: r.courseMonth ?? null,
        week_no: r.weekNo ?? null,
        note: r.note ?? null,
      }));
    case 'makeupOverrides':
      return (value as MakeupOverrideRow[]).map((r) => ({ date: r.date, type: r.type }));
    case 'monthPlans':
      return (value as MonthPlanRow[]).map((r) => ({
        calendar_month: r.calendarMonth,
        status: r.status,
        confirmed_at: r.confirmedAt,
        snapshot: r.snapshot,
      }));
    case 'exportHistory':
      return (value as ExportHistoryRow[]).map((r) => ({
        id: r.id,
        start_month: r.startMonth,
        title: r.title,
        highlight_text: r.highlightText,
        notice_text: r.noticeText,
        ratio: r.ratio,
        layout: r.layout ?? null,
        created_at: r.createdAt,
      }));
  }
  throw new Error(`알 수 없는 저장 단위: ${String(key)}`);
}

/** replace_all 함수에 넘길 전체 데이터 { 테이블이름: 행들 } */
export function appDataToDb(data: AppData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(TABLE_OF) as CollectionKey[]) out[TABLE_OF[key]] = toDb(key, data[key]);
  return out;
}

// ---------- DB → 앱 ----------

export interface DbTables {
  settings: Row | null;
  track_anchors: Row[];
  custom_holidays: Row[];
  closures: Row[];
  session_overrides: Row[];
  makeup_overrides: Row[];
  month_plans: Row[];
  export_history: Row[];
}

/** settings 행이 없으면 아직 아무것도 저장하지 않은 상태 → null */
export function dbToAppData(t: DbTables): AppData | null {
  if (!t.settings) return null;
  return {
    version: 1,
    settings: t.settings.data as AppSettings,
    trackAnchors: t.track_anchors.map((r) => ({
      weekday: r.weekday as Weekday,
      startDate: r.start_date as string,
      courseMonth: r.course_month as string,
      weekNo: r.week_no as WeekNo,
    })),
    customHolidays: t.custom_holidays.map((r) => ({
      date: r.date as string,
      name: r.name as string,
      type: r.type as CustomHolidayRow['type'],
    })),
    closures: t.closures.map((r) => ({
      id: r.id as string,
      kind: r.kind as ClosureRow['kind'],
      startDate: r.start_date as string,
      endDate: r.end_date as string,
      weekdays: (r.weekdays as number[] | null) ?? null,
      label: r.label as string,
      showOnCalendar: r.show_on_calendar as boolean,
    })),
    sessionOverrides: t.session_overrides.map((r) => {
      const row: SessionOverrideRow = { date: r.date as string, type: r.type as SessionOverrideRow['type'] };
      const courseMonth = opt<string>(r.course_month);
      const weekNo = opt<WeekNo>(r.week_no);
      const note = opt<string>(r.note);
      if (courseMonth !== undefined) row.courseMonth = courseMonth;
      if (weekNo !== undefined) row.weekNo = weekNo;
      if (note !== undefined) row.note = note;
      return row;
    }),
    makeupOverrides: t.makeup_overrides.map((r) => ({
      date: r.date as string,
      type: r.type as MakeupOverrideRow['type'],
    })),
    monthPlans: t.month_plans.map((r) => ({
      calendarMonth: r.calendar_month as string,
      status: r.status as MonthPlanRow['status'],
      confirmedAt: r.confirmed_at === null || r.confirmed_at === undefined ? null : iso(r.confirmed_at),
      snapshot: (r.snapshot ?? []) as MonthPlanRow['snapshot'],
    })),
    exportHistory: t.export_history.map((r) => {
      const row: ExportHistoryRow = {
        id: r.id as string,
        startMonth: r.start_month as string,
        title: r.title as string,
        highlightText: r.highlight_text as string,
        noticeText: r.notice_text as string,
        ratio: r.ratio as ExportHistoryRow['ratio'],
        createdAt: iso(r.created_at),
      };
      const layout = opt<ExportHistoryRow['layout']>(r.layout);
      if (layout !== undefined) row.layout = layout;
      return row;
    }),
  };
}
