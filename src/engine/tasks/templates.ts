// 반복 할 일(SPEC_home 4.4, 4.5). 템플릿(매월·매년·행사 기준) → 기간 안의 발생 건. 순수 함수.
import type { TaskStateRow, TaskTemplateRow } from '../../storage/rosterTypes.ts';
import type { Task } from './types.ts';

export interface EventDay {
  /** 행사일 이름 */
  label: string;
  date: string;
}

export interface Occurrence {
  template: TaskTemplateRow;
  due: string;
  key: string;
}

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
/** 없는 날짜(예: 2월 30일)는 그 달 말일로 */
const dateOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(Math.min(d, lastDay(y, m)))}`;

export const templateKey = (id: string, due: string) => `tpl:${id}:${due}`;

/** 행사 기준 템플릿에 맞는 행사가 있는지(없으면 "행사 날짜를 등록하면 표시됩니다") */
export const eventMatches = (t: TaskTemplateRow, events: EventDay[]) =>
  t.recurrence.type === 'event' ? events.filter((e) => e.label.includes((t.recurrence as { keyword: string }).keyword)) : [];

/** 기간 [from, to] 안에 기한이 있는 발생 건(꺼진 템플릿 제외) */
export function expandTemplates(templates: TaskTemplateRow[], events: EventDay[], range: { from: string; to: string }): Occurrence[] {
  const out: Occurrence[] = [];
  const y0 = Number(range.from.slice(0, 4));
  const y1 = Number(range.to.slice(0, 4));
  const inRange = (d: string) => d >= range.from && d <= range.to;
  for (const t of templates) {
    if (!t.enabled) continue;
    const r = t.recurrence;
    const dues: string[] = [];
    if (r.type === 'monthly') {
      for (let y = y0; y <= y1; y++)
        for (let m = 1; m <= 12; m++) dues.push(r.day === 'last' ? dateOf(y, m, 31) : dateOf(y, m, r.day));
    } else if (r.type === 'yearly') {
      for (let y = y0; y <= y1; y++) dues.push(dateOf(y, r.month, r.day));
    } else {
      for (const e of eventMatches(t, events)) dues.push(addDays(e.date, r.offsetDays));
    }
    for (const due of [...new Set(dues)].filter(inRange).sort()) out.push({ template: t, due, key: templateKey(t.id, due) });
  }
  return out;
}

/** 지난번 메모: 같은 템플릿의 이전 발생 건 중 가장 최근에 남긴 메모(매년 할 일이면 작년 메모) */
export function lastMemoFor(templateId: string, due: string, states: TaskStateRow[]): string | null {
  const prefix = `tpl:${templateId}:`;
  let best: { date: string; memo: string } | null = null;
  for (const s of states) {
    if (!s.taskKey.startsWith(prefix) || !s.memo) continue;
    const date = s.taskKey.slice(prefix.length);
    if (date < due && (!best || date > best.date)) best = { date, memo: s.memo };
  }
  return best?.memo ?? null;
}

/** 발생 건 → 홈 할 일 */
export function templateTasksFrom(occurrences: Occurrence[], states: TaskStateRow[]): Task[] {
  return occurrences.map((o) => ({
    key: o.key,
    kind: 'tpl',
    title: o.template.title,
    due: o.due,
    visibleFrom: addDays(o.due, -o.template.leadDays),
    detail: o.template.description ?? undefined,
    category: o.template.category,
    lastMemo: lastMemoFor(o.template.id, o.due, states),
  }));
}

/** 초기 템플릿(SPEC_home 4.5). 모두 수정 가능. DB에는 마이그레이션이 같은 내용으로 넣는다 */
export const SEED_TEMPLATES: Omit<TaskTemplateRow, 'id'>[] = [
  { title: '교육비 발송(랠리즈)', category: '운영', recurrence: { type: 'monthly', day: 'last' }, leadDays: 3 },
  { title: '보강데이 예약 정리', category: '운영', recurrence: { type: 'monthly', day: 25 }, leadDays: 3 },
  { title: '신규생 모집 공지(블로그·인스타)', category: '홍보', recurrence: { type: 'yearly', month: 11, day: 1 }, leadDays: 7 },
  { title: '신규 대기자 연락·신규반 개설', category: '운영', recurrence: { type: 'yearly', month: 11, day: 15 }, leadDays: 7 },
  { title: '새 학기 반 편성 시작(편성 시안)', category: '운영', recurrence: { type: 'yearly', month: 11, day: 15 }, leadDays: 7 },
  { title: '겨울방학 휴원 일정 등록·공지', category: '운영', recurrence: { type: 'yearly', month: 11, day: 20 }, leadDays: 7 },
  { title: '어머니교실 준비', category: '행사', recurrence: { type: 'yearly', month: 1, day: 20 }, leadDays: 14 },
  { title: '사업장현황신고', category: '세무', recurrence: { type: 'yearly', month: 2, day: 10 }, leadDays: 14 },
  { title: '어린이날 행사 준비', category: '행사', recurrence: { type: 'yearly', month: 4, day: 10 }, leadDays: 14 },
  { title: 'EGG 마스터즈 접수 안내(날짜 확인)', category: '행사', recurrence: { type: 'yearly', month: 4, day: 25 }, leadDays: 7 },
  { title: '종합소득세 신고', category: '세무', recurrence: { type: 'yearly', month: 5, day: 31 }, leadDays: 14 },
  { title: '9월 개강반 모집 공지', category: '홍보', recurrence: { type: 'yearly', month: 6, day: 15 }, leadDays: 7 },
  { title: '여름방학 보드게임 특강 공지', category: '행사', recurrence: { type: 'yearly', month: 7, day: 10 }, leadDays: 7 },
  { title: '페스티벌 준비·안내', category: '행사', recurrence: { type: 'event', keyword: '페스티벌', offsetDays: -42 }, leadDays: 7 },
  { title: '할로윈 행사 준비', category: '행사', recurrence: { type: 'yearly', month: 10, day: 15 }, leadDays: 7 },
  { title: '크리스마스 행사 준비', category: '행사', recurrence: { type: 'yearly', month: 12, day: 10 }, leadDays: 7 },
].map((t, i) => ({ ...t, description: null, enabled: true, sort: i + 1, memo: null }) as Omit<TaskTemplateRow, 'id'>);

/** "매월 말일", "매년 2월 10일", "행사 '페스티벌' 42일 전" */
export function recurrenceText(r: TaskTemplateRow['recurrence']): string {
  if (r.type === 'monthly') return r.day === 'last' ? '매월 말일' : `매월 ${r.day}일`;
  if (r.type === 'yearly') return `매년 ${r.month}월 ${r.day}일`;
  const n = Math.abs(r.offsetDays);
  return `행사 "${r.keyword}" ${r.offsetDays === 0 ? '당일' : `${n}일 ${r.offsetDays < 0 ? '전' : '후'}`}`;
}
