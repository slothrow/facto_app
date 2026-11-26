// 하린이 숙제 순수 함수(SPEC_harin 15장). 날짜 → 그날 해야 할 숙제. 화면·DB와 분리.
import { addDays, weekdayOf } from '../dates.ts';
import type { KidActivityRow, KidBlockRow, KidHomeworkCheckRow, KidHomeworkRow, KidSubject } from '../../storage/rosterTypes.ts';

export const HOMEWORK_SUBJECTS: { id: KidSubject; label: string; emoji: string }[] = [
  { id: 'korean', label: '국어', emoji: '📖' },
  { id: 'english', label: '영어', emoji: '🔤' },
  { id: 'math', label: '수학', emoji: '➕' },
  { id: 'reading', label: '독서', emoji: '📚' },
  { id: 'other', label: '기타', emoji: '⭐' },
];
export const subjectOf = (id: KidSubject) => HOMEWORK_SUBJECTS.find((s) => s.id === id) ?? HOMEWORK_SUBJECTS[4];

/** 'YYYY-MM-DD' → 1(월)~5(금), 주말이면 null */
export function workdayOf(date: string): number | null {
  const d = weekdayOf(date);
  return d >= 1 && d <= 5 ? d : null;
}

/** 직전 평일(월요일이면 금요일). 주말 날짜는 null */
export function previousWorkday(date: string): string | null {
  const wd = workdayOf(date);
  if (wd === null) return null;
  return addDays(date, wd === 1 ? -3 : -1);
}

/** 그날 또는 그 뒤 첫 평일(토·일이면 다음 월요일). "오늘의 숙제" 카드가 보여 줄 날짜 */
export function nextWorkdayOnOrAfter(date: string): string {
  const wd = weekdayOf(date);
  return wd === 6 ? addDays(date, 2) : wd === 0 ? addDays(date, 1) : date;
}

type BlockLike = Pick<KidBlockRow, 'weekday' | 'activityId'>;

/** 그 학원 블록이 있는 요일들(대표 시간표 기준) */
export function academyDays(blocks: BlockLike[], activityId: string): number[] {
  return [...new Set(blocks.filter((b) => b.activityId === activityId).map((b) => b.weekday))].sort((a, b) => a - b);
}

/** 수업 요일 → 숙제가 뜨는 요일. 전날 = 직전 평일(월요일 수업이면 금요일) */
const dueWeekday = (classDay: number, rule: 'day_before' | 'same_day') => (rule === 'same_day' ? classDay : classDay === 1 ? 5 : classDay - 1);

/** 숙제 하나가 그 날짜에 해당하는지(사용 여부는 보지 않는다) */
export function homeworkAppliesOn(
  hw: KidHomeworkRow,
  date: string,
  blocks: BlockLike[],
  activities: Pick<KidActivityRow, 'id'>[],
): boolean {
  const wd = workdayOf(date);
  if (wd === null) return false;
  switch (hw.repeatType) {
    case 'daily':
      return (hw.weekdays ?? []).includes(wd);
    case 'once':
      return hw.dueDate === date;
    case 'academy': {
      if (!hw.activityId || !activities.some((a) => a.id === hw.activityId)) return false;
      const rule = hw.dueRule ?? 'day_before';
      return academyDays(blocks, hw.activityId).some((d) => dueWeekday(d, rule) === wd);
    }
  }
}

/**
 * 그 날짜에 해야 할 숙제(사용 중인 것만, 숙제 순서대로).
 * blocks는 **대표 시간표**의 블록. 주말 날짜는 빈 목록.
 */
export function homeworksForDate(
  date: string,
  homeworks: KidHomeworkRow[],
  blocks: BlockLike[],
  activities: Pick<KidActivityRow, 'id'>[],
): KidHomeworkRow[] {
  return homeworks
    .filter((h) => h.active && homeworkAppliesOn(h, date, blocks, activities))
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'ko'));
}

export const isHomeworkDone = (checks: KidHomeworkCheckRow[], date: string, homeworkId: string) =>
  checks.some((c) => c.date === date && c.homeworkId === homeworkId);

/** 어제(직전 평일)에 못 한 숙제. date가 주말이면 빈 목록 */
export function missedHomeworks(
  date: string,
  homeworks: KidHomeworkRow[],
  checks: KidHomeworkCheckRow[],
  blocks: BlockLike[],
  activities: Pick<KidActivityRow, 'id'>[],
): { date: string; homeworks: KidHomeworkRow[] } {
  const prev = previousWorkday(date);
  if (!prev) return { date: '', homeworks: [] };
  return {
    date: prev,
    homeworks: homeworksForDate(prev, homeworks, blocks, activities).filter((h) => !isHomeworkDone(checks, prev, h.id)),
  };
}

/** 어떤 날짜가 든 주의 월~금 날짜(일요일은 그 전 주로 본다) */
export function weekDates(anyDateInWeek: string): string[] {
  const wd = weekdayOf(anyDateInWeek);
  const monday = addDays(anyDateInWeek, wd === 0 ? -6 : 1 - wd);
  return [0, 1, 2, 3, 4].map((i) => addDays(monday, i));
}

/** 이번 주 월~금 날짜. 토·일이면 곧 시작할 다음 주를 돌려준다(주말에 다음 주 숙제를 미리 확인) */
export function currentWeekDates(today: string): string[] {
  const wd = weekdayOf(today);
  return weekDates(wd === 6 ? addDays(today, 2) : wd === 0 ? addDays(today, 1) : today);
}

/** 숙제 목록 화면용: 반복 방식 한 줄 설명 */
export function repeatLabel(hw: KidHomeworkRow, activityName?: string): string {
  const days = ['', '월', '화', '수', '목', '금'];
  if (hw.repeatType === 'daily') return `매일 · ${(hw.weekdays ?? []).map((d) => days[d]).join('')}`;
  if (hw.repeatType === 'once') return `한 번만 · ${hw.dueDate ? `${Number(hw.dueDate.slice(5, 7))}/${Number(hw.dueDate.slice(8, 10))}까지` : '날짜 없음'}`;
  return `${activityName ?? '학원'} 숙제 · ${hw.dueRule === 'same_day' ? '수업 당일 학원 가기 전' : '수업 전날'}`;
}
