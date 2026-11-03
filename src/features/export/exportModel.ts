// 달력 만들기 탭의 계산(순수 함수). 화면과 분리해서 테스트한다.
import { addMonthsYm, eachDay, monthEnd, monthStart } from '../../engine/dates.ts';
import { monthName } from '../../engine/label.ts';
import type { AppData, ClosureRow, ExportHistoryRow } from '../../storage/types.ts';
import { isConfirmedMonth, newId } from '../../app/mutations.ts';

export type Ratio = ExportHistoryRow['ratio'];
/** side = 나란히(기본, 2026-11-04 결정), stack = 위아래(세로형 4:5 전용 권장) */
export type PosterLayout = NonNullable<ExportHistoryRow['layout']>;
export const DEFAULT_LAYOUT: PosterLayout = 'side';
export const DEFAULT_RATIO: Ratio = '1:1';

/** 배치를 바꿀 때 어울리는 비율: 위아래는 정사각형에 다 안 들어가므로 4:5 */
export const ratioForLayout = (layout: PosterLayout, current: Ratio): Ratio =>
  layout === 'stack' ? '4:5' : current;

export const POSTER_WIDTH = 1080;
export const posterHeight = (ratio: Ratio) => (ratio === '1:1' ? 1080 : 1350);

/** 두 달 묶음 [시작 월, 다음 월] */
export const pairOf = (startMonth: string): [string, string] => [startMonth, addMonthsYm(startMonth, 1)];

/**
 * 기본 시작 월: 아직 내보내지 않은 다음 두 달.
 * - 내보낸 기록이 있으면 가장 최근 기록의 다음 두 달
 * - 없으면 이번 달부터 보면서 처음 나오는 초안(미확정) 달
 *   (초기 데이터는 11·12월이 이미 배포·확정 상태 → 2027년 1월)
 */
export function defaultStartMonth(data: AppData, todayYm: string): string {
  const latest = [...data.exportHistory].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (latest) return addMonthsYm(latest.startMonth, 2);
  let ym = todayYm;
  for (let i = 0; i < 24 && isConfirmedMonth(data, ym); i++) ym = addMonthsYm(ym, 1);
  return ym;
}

/** "1월, 2월 수업 안내" */
export const defaultTitle = (startMonth: string) => {
  const [a, b] = pairOf(startMonth);
  return `${monthName(a)}, ${monthName(b)} 수업 안내`;
};

/** 두 달 기간에 걸치는 행사 */
export function eventsInPeriod(data: AppData, startMonth: string): ClosureRow[] {
  const from = monthStart(startMonth);
  const to = monthEnd(addMonthsYm(startMonth, 1));
  return data.closures
    .filter((c) => c.kind === 'event' && c.startDate <= to && c.endDate >= from)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/** 고른 행사만 날짜별 이름 목록으로 */
export function eventLabelsByDate(events: ClosureRow[], selectedIds: Set<string>): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const e of events) {
    if (!selectedIds.has(e.id)) continue;
    for (const d of eachDay(e.startDate, e.endDate)) map.set(d, [...(map.get(d) ?? []), e.label]);
  }
  return map;
}

export const draftMonthsIn = (data: AppData, startMonth: string) =>
  pairOf(startMonth).filter((ym) => !isConfirmedMonth(data, ym));

export const fileNameFor = (startMonth: string) => {
  const [a, b] = pairOf(startMonth);
  return `수업안내_${a}_${b.slice(5)}.png`;
};

const HISTORY_LIMIT = 20;

export function addExportHistory(
  data: AppData,
  row: Omit<ExportHistoryRow, 'id' | 'createdAt'>,
  now: string,
): AppData {
  const entry: ExportHistoryRow = { ...row, id: newId(), createdAt: now };
  const list = [entry, ...data.exportHistory].slice(0, HISTORY_LIMIT);
  return { ...data, exportHistory: list };
}
