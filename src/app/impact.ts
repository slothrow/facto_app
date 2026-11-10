// 변경 전에 보여줄 영향 미리보기. 예: "이후 월요일 7회가 1회씩 밀립니다"
import { addDays } from '../engine/dates.ts';
import { WEEKDAY_NAMES, labelIndex } from '../engine/label.ts';
import type { AppData } from '../storage/types.ts';
import { scheduleFor } from './scheduleInput.ts';

/** 미리보기로 비교하는 기간(바꾸는 날부터 약 6개월) */
export const IMPACT_HORIZON_DAYS = 182;

export function describeImpact(before: AppData, after: AppData, fromDate: string): string[] {
  const range = { from: fromDate, to: addDays(fromDate, IMPACT_HORIZON_DAYS) };
  const a = scheduleFor(before, range);
  const b = scheduleFor(after, range);
  const lines: string[] = [];

  for (const wd of [1, 2, 3, 4, 5]) {
    const diffs: number[] = [];
    a.days.forEach((dayA, i) => {
      const dayB = b.days[i];
      if (dayA.weekday !== wd || !dayA.session || !dayB.session) return;
      const d = labelIndex(dayB.session) - labelIndex(dayA.session);
      if (d !== 0) diffs.push(d);
    });
    if (diffs.length === 0) continue;
    const name = `${WEEKDAY_NAMES[wd]}요일`;
    const allSame = diffs.every((d) => d === diffs[0]);
    if (allSame && diffs[0] < 0) lines.push(`이후 ${name} ${diffs.length}회가 ${-diffs[0]}회씩 밀립니다`);
    else if (allSame) lines.push(`이후 ${name} ${diffs.length}회가 ${diffs[0]}회씩 당겨집니다`);
    else lines.push(`${name} 수업 ${diffs.length}개가 바뀝니다`);
  }

  const beforeMsgs = new Set(a.warnings.map((w) => w.message));
  const afterMsgs = new Set(b.warnings.map((w) => w.message));
  for (const m of afterMsgs) if (!beforeMsgs.has(m)) lines.push(`새 경고: ${m}`);
  for (const m of beforeMsgs) if (!afterMsgs.has(m)) lines.push(`사라지는 경고: ${m}`);

  return lines.length > 0 ? lines : ['다른 수업 날짜에는 영향이 없습니다'];
}
