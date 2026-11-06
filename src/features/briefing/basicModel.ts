// 베이직 수업 계획(SPEC_briefing 2.1). 순수 함수.
// 베이직 반은 단원 코드가 없다. 선생님이 (반, 날짜)별 제목·문구를 미리 적고, 브리핑 때 그 날짜 계획을 쓴다.
import { isClassOpenOn } from '../../engine/classTime.ts';
import { codeFor, type CurriculumSettings } from '../../engine/curriculum.ts';
import type { DayCell, SessionLabel } from '../../engine/types.ts';
import { newId, type BasicLessonRow, type ClassRow, type RosterChange, type RosterData } from '../../storage/rosterTypes.ts';
import { anchorsOf } from '../curriculum/curriculumModel.ts';
import { compareClasses } from '../roster/rosterModel.ts';

export interface BasicSession {
  cls: ClassRow;
  date: string;
  session: SessionLabel;
  plan: BasicLessonRow | null;
}

export const planOf = (roster: Pick<RosterData, 'basicLessons'>, classId: string, date: string) =>
  roster.basicLessons.find((p) => p.classId === classId && p.date === date) ?? null;

/** 기간 안에서 베이직 진도인 반의 수업 날짜들(날짜순, 같은 날은 시간순) */
export function basicSessions(
  roster: Pick<RosterData, 'classes' | 'progressAnchors' | 'basicLessons'>,
  cells: DayCell[],
  settings: CurriculumSettings,
): BasicSession[] {
  const out: BasicSession[] = [];
  const classes = [...roster.classes].sort(compareClasses);
  for (const cell of cells) {
    if (cell.status !== 'session' || !cell.session) continue;
    for (const cls of classes) {
      if (cls.weekday !== cell.weekday || !isClassOpenOn(cls, cell.date)) continue;
      if (codeFor(anchorsOf(roster, cls.id), cell.session, settings).kind !== 'basic') continue;
      out.push({ cls, date: cell.date, session: cell.session, plan: planOf(roster, cls.id, cell.date) });
    }
  }
  return out;
}

export const planFilled = (p: BasicLessonRow | null) => Boolean(p && (p.title.trim() || p.text.trim()));

/** 브리핑 기록에 남길 코드: "베이직 · 제목" */
export const basicCode = (p: BasicLessonRow | null) => (p?.title.trim() ? `베이직 · ${p.title.trim()}`.slice(0, 40) : '베이직');

/** 저장(제목·문구가 모두 비면 지운다) */
export function savePlanChange(existing: BasicLessonRow | null, classId: string, date: string, title: string, text: string): RosterChange {
  const t = title.trim();
  const body = text.replace(/\r\n?/g, '\n').trimEnd();
  if (!t && !body.trim()) return existing ? { remove: { basicLessons: [existing] } } : {};
  return { upsert: { basicLessons: [{ id: existing?.id ?? newId(), classId, date, title: t, text: body }] } };
}
