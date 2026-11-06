// 수업 후 브리핑 계산(SPEC_briefing 5장, 6.1). 순수 함수.
import { CLASS_MINUTES, toMinutes } from '../../engine/classTime.ts';
import type { CodeResult, CurriculumSettings } from '../../engine/curriculum.ts';
import { codeFor } from '../../engine/curriculum.ts';
import type { DayCell } from '../../engine/types.ts';
import { newId, type BasicLessonRow, type BriefingRow, type ClassRow, type RosterChange, type RosterData, type StudentRow } from '../../storage/rosterTypes.ts';
import { anchorsOf } from '../curriculum/curriculumModel.ts';
import { classMembersOn } from '../roster/rosterModel.ts';
import { basicCode, planOf } from './basicModel.ts';

/** 기본 선택: 지금 시각 기준 가장 최근에 끝난 반, 없으면 첫 반 (classes는 시간순) */
export function defaultClass(classes: ClassRow[], nowMinutes: number | null): ClassRow | null {
  if (classes.length === 0) return null;
  if (nowMinutes === null) return classes[0];
  const ended = classes.filter((c) => toMinutes(c.startTime) + CLASS_MINUTES <= nowMinutes);
  return ended[ended.length - 1] ?? classes[0];
}

export interface ClassBriefing {
  result: CodeResult;
  /** 기록에 남길 코드(문구 저장소 키 또는 "베이직 · 제목"). 진도 미설정 등은 null */
  code: string | null;
  /** 보낼 문구. 없으면 null */
  text: string | null;
  /** 베이직이면 그 날짜 계획 */
  plan: BasicLessonRow | null;
}

export function classBriefing(
  roster: Pick<RosterData, 'progressAnchors' | 'briefingTexts' | 'basicLessons'>,
  cls: ClassRow,
  cell: DayCell,
  settings: CurriculumSettings,
): ClassBriefing {
  const session = cell.status === 'session' && cell.weekday === cls.weekday ? cell.session : null;
  const result = codeFor(anchorsOf(roster, cls.id), session, settings);
  if (result.kind === 'code') {
    const text = roster.briefingTexts.find((t) => t.code === result.code)?.text ?? null;
    return { result, code: result.code, text: text?.trim() ? text : null, plan: null };
  }
  if (result.kind === 'basic') {
    const plan = planOf(roster, cls.id, cell.date);
    return { result, code: basicCode(plan), text: plan?.text.trim() ? plan.text : null, plan };
  }
  return { result, code: null, text: null, plan: null };
}

export interface Recipient {
  student: StudentRow;
  absent: boolean;
  /** 다른 반에서 [+ 아이 추가]로 온 아이 */
  guest: boolean;
  /** 같은 날 수업 오는 형제가 있음 */
  sibling: boolean;
  sent: BriefingRow | null;
}

/**
 * 아이 목록: 그날 기준 반 명단 − 결석(맨 아래 "결석") + 추가한 아이.
 * 추가한 아이 = 이번 화면에서 고른 아이(guestIds) + 그날 이 반으로 이미 브리핑을 받은 다른 반 아이.
 */
export function recipients(
  roster: Pick<RosterData, 'students' | 'enrollments' | 'absences' | 'briefings' | 'siblings'>,
  classId: string,
  date: string,
  guestIds: string[],
  /** 그날 수업 있는 반들(형제 표시용) */
  dayClassIds: string[],
): Recipient[] {
  const members = classMembersOn(roster, classId, date);
  const memberIds = new Set(members.map((s) => s.id));
  const absent = new Set(roster.absences.filter((a) => a.date === date && a.classId === classId).map((a) => a.studentId));
  const sentBy = new Map(roster.briefings.filter((b) => b.date === date && b.classId === classId).map((b) => [b.studentId, b]));
  const byId = new Map(roster.students.map((s) => [s.id, s]));
  const guests = [...new Set([...guestIds, ...sentBy.keys()])]
    .filter((id) => !memberIds.has(id))
    .map((id) => byId.get(id))
    .filter((s): s is StudentRow => Boolean(s));

  // 그날 수업 오는 아이(모든 반, 결석 제외) — 형제가 그중에 있으면 표시
  const comingToday = new Set<string>();
  for (const cid of dayClassIds) {
    const off = new Set(roster.absences.filter((a) => a.date === date && a.classId === cid).map((a) => a.studentId));
    for (const s of classMembersOn(roster, cid, date)) if (!off.has(s.id)) comingToday.add(s.id);
  }
  for (const g of guests) comingToday.add(g.id);
  const hasSiblingToday = (id: string) =>
    roster.siblings.some((p) => (p.studentId === id && comingToday.has(p.siblingId)) || (p.siblingId === id && comingToday.has(p.studentId)));

  const make = (s: StudentRow, guest: boolean): Recipient => ({
    student: s,
    absent: !guest && absent.has(s.id),
    guest,
    sibling: hasSiblingToday(s.id),
    sent: sentBy.get(s.id) ?? null,
  });
  const list = [...members.map((s) => make(s, false)), ...guests.map((s) => make(s, true))];
  return [...list.filter((r) => !r.absent), ...list.filter((r) => r.absent)];
}

/** 진행 표시: 보낸 수 / 보낼 아이 수(결석 제외) */
export function progressCount(list: Recipient[]): { sent: number; total: number } {
  const targets = list.filter((r) => !r.absent);
  return { sent: targets.filter((r) => r.sent).length, total: targets.length };
}

/** 카톡 검색어(비우면 이름) */
export const kakaoSearchOf = (s: StudentRow) => s.kakaoSearch?.trim() || s.name;

/** 보냄 기록(같은 날·반·아이 기록이 있으면 그 행을 고친다) */
export function recordSent(
  roster: Pick<RosterData, 'briefings'>,
  date: string,
  classId: string,
  studentId: string,
  code: string,
  text: string,
  nowIso: string,
): RosterChange {
  const existing = roster.briefings.find((b) => b.date === date && b.classId === classId && b.studentId === studentId);
  const row: BriefingRow = { id: existing?.id ?? newId(), date, classId, studentId, code, textSnapshot: text, sharedAt: nowIso };
  return { upsert: { briefings: [row] } };
}

export const cancelSent = (row: BriefingRow): RosterChange => ({ remove: { briefings: [row] } });
