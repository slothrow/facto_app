// 회차 라벨(수업월 + 주차) 계산과 표시 형식.
import type { SessionLabel, WeekNo } from './types.ts';

export const WEEKDAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** 'YYYY-MM' → 연속된 정수(월 단위) */
export function monthIndex(ym: string): number {
  const [y, m] = ym.split('-').map(Number);
  return y * 12 + (m - 1);
}

export function ymFromIndex(index: number): string {
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

/** 회차를 연속된 정수로. 다음 회차 = +1 */
export const labelIndex = (l: SessionLabel) => monthIndex(l.courseMonth) * 4 + (l.weekNo - 1);

export const labelFromIndex = (index: number): SessionLabel => ({
  courseMonth: ymFromIndex(Math.floor(index / 4)),
  weekNo: ((index % 4) + 1) as WeekNo,
});

/** 1→2→3→4주, 4주 다음은 다음 수업월 1주 */
export const nextLabel = (l: SessionLabel) => labelFromIndex(labelIndex(l) + 1);

export const sameLabel = (a: SessionLabel, b: SessionLabel) =>
  a.courseMonth === b.courseMonth && a.weekNo === b.weekNo;

/** '2027-01' → '1월' */
export const monthName = (ym: string) => `${Number(ym.slice(5, 7))}월`;

/** "1월 2주" */
export const formatLabel = (l: SessionLabel) => `${monthName(l.courseMonth)} ${l.weekNo}주`;

/** 달력 칸 라벨: 같은 수업월이면 "2주", 다르면 "2월 1주" */
export const formatCellLabel = (l: SessionLabel, calendarMonth: string) =>
  l.courseMonth === calendarMonth ? `${l.weekNo}주` : formatLabel(l);

/** SPEC 7장 표기: "11-1" */
export const formatCode = (l: SessionLabel) => `${Number(l.courseMonth.slice(5, 7))}-${l.weekNo}`;

/**
 * "11-1" 같은 표기를 날짜 기준으로 해석한다. 연도는 날짜와 가까운 쪽을 고른다.
 * 예: 2026-12-28의 "1-1" → 2027-01 1주, 2027-01-08의 "12-4" → 2026-12 4주.
 */
export function parseCode(date: string, code: string): SessionLabel {
  const [m, w] = code.split('-').map(Number);
  const year = Number(date.slice(0, 4));
  const dateMonth = Number(date.slice(5, 7));
  let y = year;
  if (m - dateMonth > 6) y -= 1;
  if (dateMonth - m > 6) y += 1;
  return { courseMonth: `${y}-${String(m).padStart(2, '0')}`, weekNo: w as WeekNo };
}

/**
 * 한 달 회차 목록을 "11월 1~4주, 12월 1주" 형태로.
 * 같은 수업월끼리 묶고, 주차가 이어지면 "1~4주", 끊기면 "1·3주".
 */
export function formatSessionList(labels: SessionLabel[]): string {
  const groups: { courseMonth: string; weeks: number[] }[] = [];
  for (const l of labels) {
    const last = groups[groups.length - 1];
    if (last && last.courseMonth === l.courseMonth) last.weeks.push(l.weekNo);
    else groups.push({ courseMonth: l.courseMonth, weeks: [l.weekNo] });
  }
  return groups
    .map(({ courseMonth, weeks }) => {
      const contiguous = weeks.every((w, i) => i === 0 || w === weeks[i - 1] + 1);
      const text =
        weeks.length === 1
          ? `${weeks[0]}`
          : contiguous
            ? `${weeks[0]}~${weeks[weeks.length - 1]}`
            : weeks.join('·');
      return `${monthName(courseMonth)} ${text}주`;
    })
    .join(', ');
}

/** offset 표시: "+2 (2회 앞섬)", "−1 (1회 밀림)", "정상" */
export function formatOffset(offset: number): string {
  if (offset === 0) return '정상';
  if (offset > 0) return `+${offset} (${offset}회 앞섬)`;
  return `−${-offset} (${-offset}회 밀림)`;
}
