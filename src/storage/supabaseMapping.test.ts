import { describe, expect, it } from 'vitest';
import { createSeedAppData } from '../data/seedAppData.ts';
import { TABLE_OF, appDataToDb, dbToAppData, type DbTables } from './supabaseMapping.ts';
import { COLLECTION_KEYS, type AppData } from './types.ts';

/** DB가 하듯 행을 만들어 돌려준다(없는 값은 null, 시각은 +00:00 형식) */
function asDb(data: AppData): DbTables {
  const rows = appDataToDb(data) as Record<string, Record<string, unknown>[]>;
  const tsToDb = (v: unknown) => (typeof v === 'string' ? new Date(v).toISOString().replace('Z', '+00:00') : v);
  return {
    settings: { data: rows.settings },
    track_anchors: rows.track_anchors,
    custom_holidays: rows.custom_holidays,
    closures: rows.closures,
    session_overrides: rows.session_overrides,
    makeup_overrides: rows.makeup_overrides,
    month_plans: rows.month_plans.map((r) => ({ ...r, confirmed_at: tsToDb(r.confirmed_at) })),
    export_history: rows.export_history.map((r) => ({ ...r, created_at: tsToDb(r.created_at) })),
  };
}

function richData(): AppData {
  const d = createSeedAppData();
  return {
    ...d,
    customHolidays: [
      { date: '2027-01-02', name: '임시', type: 'add' },
      { date: '2027-03-01', name: '삼일절', type: 'ignore' },
    ],
    closures: [
      { id: 'a', kind: 'closed', startDate: '2027-01-04', endDate: '2027-01-08', weekdays: null, label: '방학', showOnCalendar: true },
      { id: 'b', kind: 'event', startDate: '2027-02-10', endDate: '2027-02-10', weekdays: [3], label: '보드게임', showOnCalendar: false },
    ],
    sessionOverrides: [
      { date: '2027-01-11', type: 'skip' },
      { date: '2027-01-18', type: 'pin', courseMonth: '2027-01', weekNo: 2, note: '메모' },
    ],
    makeupOverrides: [{ date: '2027-01-23', type: 'add' }],
    exportHistory: [
      {
        id: 'h1',
        startMonth: '2027-01',
        title: '1·2월',
        highlightText: '',
        noticeText: '안내',
        ratio: '4:5',
        layout: 'side',
        createdAt: '2026-11-04T05:06:07.000Z',
      },
      { id: 'h0', startMonth: '2026-11', title: '예전', highlightText: 'x', noticeText: '', ratio: '1:1', createdAt: '2026-10-01T00:00:00.000Z' },
    ],
  };
}

describe('Supabase 변환', () => {
  it('모든 저장 단위에 테이블이 있다', () => {
    expect(Object.keys(TABLE_OF).sort()).toEqual([...COLLECTION_KEYS].sort());
  });

  it('settings 행이 없으면 null(처음 상태)', () => {
    const empty = { ...asDb(createSeedAppData()), settings: null };
    expect(dbToAppData(empty)).toBeNull();
  });

  it('DB에 썼다 읽으면 그대로 돌아온다 (선택 속성·시각 형식 포함)', () => {
    const data = richData();
    const back = dbToAppData(asDb(data))!;
    const normalize = (d: AppData) => ({
      ...d,
      monthPlans: d.monthPlans.map((p) => ({ ...p, confirmedAt: p.confirmedAt && new Date(p.confirmedAt).toISOString() })),
    });
    expect(back).toEqual(normalize(data));
    // 없는 값이 null이 아니라 "속성 없음"으로 돌아와야 앱 코드와 맞는다
    expect('courseMonth' in back.sessionOverrides[0]).toBe(false);
    expect('layout' in back.exportHistory[1]).toBe(false);
  });

  it('없는 선택 속성은 null로 보낸다', () => {
    const rows = appDataToDb(richData()) as Record<string, Record<string, unknown>[]>;
    expect(rows.session_overrides[0]).toEqual({ date: '2027-01-11', type: 'skip', course_month: null, week_no: null, note: null });
    expect(rows.export_history[1].layout).toBeNull();
  });
});
