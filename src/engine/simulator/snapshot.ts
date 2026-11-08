// 시안 만들기·복제, 원본 상태 기록, "시안 만든 뒤 바뀐 내용"(SPEC_simulator 2.1, 7.2). 순수 함수.
import { isClassOpenOn } from '../classTime.ts';
import { classGradeCodeOn } from '../grade.ts';
import { classMembersOn, compareClasses } from '../../features/roster/rosterModel.ts';
import {
  newId,
  type RosterData,
  type SimClassRow,
  type SimDraftRow,
  type SimMemberRow,
  type SimSnapshot,
} from '../../storage/rosterTypes.ts';
import { simClassName, slotText, type SimDraft } from './model.ts';

/** 그 날짜에 운영 중인 반과 그날 배정된(재원) 학생 */
export function takeSnapshot(roster: Pick<RosterData, 'classes' | 'enrollments' | 'students'>, baseDate: string): SimSnapshot {
  const classes = roster.classes.filter((c) => isClassOpenOn(c, baseDate)).sort(compareClasses);
  return {
    classes: classes.map((c) => ({
      id: c.id,
      weekday: c.weekday,
      startTime: c.startTime,
      gradeCode: c.gradeCode,
      gradeBasisYear: c.gradeBasisYear,
      alias: c.alias,
    })),
    members: classes.flatMap((c) => classMembersOn(roster, c.id, baseDate).map((s) => ({ classId: c.id, studentId: s.id }))),
  };
}

/** 현재 시간표에서 새 시안 */
export function draftFromReal(
  roster: Pick<RosterData, 'classes' | 'enrollments' | 'students'>,
  baseDate: string,
  name: string,
  now: string,
): SimDraft {
  const snapshot = takeSnapshot(roster, baseDate);
  const draft: SimDraftRow = {
    id: newId(),
    name,
    baseDate,
    sourceDraftId: null,
    status: 'editing',
    gradeView: 'current',
    memo: null,
    editedAt: now,
    appliedAt: null,
    appliedSummary: null,
    baseSnapshot: snapshot,
  };
  const realById = new Map(roster.classes.map((c) => [c.id, c]));
  const idOf = new Map<string, string>();
  const classes: SimClassRow[] = snapshot.classes.map((c) => {
    const id = newId();
    idOf.set(c.id, id);
    return {
      id,
      draftId: draft.id,
      sourceClassId: c.id,
      weekday: c.weekday,
      startTime: c.startTime,
      gradeCode: c.gradeCode,
      gradeBasisYear: c.gradeBasisYear,
      alias: c.alias,
      memo: realById.get(c.id)?.memo ?? null,
      removed: false,
      mergedInto: null,
      startStage: null,
      startUnit: null,
    };
  });
  const members: SimMemberRow[] = snapshot.members.map((m) => ({
    id: newId(),
    draftId: draft.id,
    simClassId: idOf.get(m.classId)!,
    studentId: m.studentId,
    waitlistId: null,
    tempName: null,
    tag: 'keep',
    memo: null,
  }));
  return { draft, classes, members };
}

/** 다른 시안 복제(원본 상태·기준일은 그대로, 새 id) */
export function cloneDraft(src: SimDraft, name: string, now: string): SimDraft {
  const draft: SimDraftRow = {
    ...src.draft,
    id: newId(),
    name,
    sourceDraftId: src.draft.id,
    status: 'editing',
    editedAt: now,
    appliedAt: null,
    appliedSummary: null,
  };
  const idOf = new Map(src.classes.map((c) => [c.id, newId()]));
  const classes = src.classes.map((c) => ({
    ...c,
    id: idOf.get(c.id)!,
    draftId: draft.id,
    mergedInto: c.mergedInto ? (idOf.get(c.mergedInto) ?? null) : null,
  }));
  const members = src.members.map((m) => ({ ...m, id: newId(), draftId: draft.id, simClassId: idOf.get(m.simClassId)! }));
  return { draft, classes, members };
}

/** 시안을 처음 상태로: 원본 상태에서 다시 만든 반·아이(시안 id·이름은 유지) */
export function resetDraft(d: SimDraft, roster: Pick<RosterData, 'classes'>): SimDraft {
  const realById = new Map(roster.classes.map((c) => [c.id, c]));
  const idOf = new Map<string, string>();
  const classes: SimClassRow[] = d.draft.baseSnapshot.classes.map((c) => {
    const id = newId();
    idOf.set(c.id, id);
    return {
      id,
      draftId: d.draft.id,
      sourceClassId: c.id,
      weekday: c.weekday,
      startTime: c.startTime,
      gradeCode: c.gradeCode,
      gradeBasisYear: c.gradeBasisYear,
      alias: c.alias,
      memo: realById.get(c.id)?.memo ?? null,
      removed: false,
      mergedInto: null,
      startStage: null,
      startUnit: null,
    };
  });
  const members: SimMemberRow[] = d.draft.baseSnapshot.members.map((m) => ({
    id: newId(),
    draftId: d.draft.id,
    simClassId: idOf.get(m.classId)!,
    studentId: m.studentId,
    waitlistId: null,
    tempName: null,
    tag: 'keep',
    memo: null,
  }));
  return { draft: d.draft, classes, members };
}

/** 시안을 만든 뒤 실제 데이터가 바뀐 내용(기준일 기준으로 다시 찍어 비교) */
export function realChangesSince(snapshot: SimSnapshot, roster: Pick<RosterData, 'classes' | 'enrollments' | 'students'>, baseDate: string): string[] {
  const now = takeSnapshot(roster, baseDate);
  const out: string[] = [];
  const before = new Map(snapshot.classes.map((c) => [c.id, c]));
  const after = new Map(now.classes.map((c) => [c.id, c]));
  const name = (c: SimSnapshot['classes'][number]) => `${slotText(c.weekday, c.startTime)} ${simClassName(c, baseDate)}`;
  for (const [id, c] of before) {
    const a = after.get(id);
    if (!a) out.push(`${name(c)}: 폐반되었거나 없어짐`);
    else if (a.weekday !== c.weekday || a.startTime !== c.startTime) out.push(`${name(c)}: 시간이 ${slotText(a.weekday, a.startTime)}로 바뀜`);
    else if (classGradeCodeOn(a, baseDate) !== classGradeCodeOn(c, baseDate) || a.alias !== c.alias) out.push(`${name(c)}: 학년·별칭이 바뀜`);
  }
  for (const [id, c] of after) if (!before.has(id)) out.push(`${name(c)}: 새로 생긴 반`);
  const key = (m: { classId: string; studentId: string }) => `${m.classId}|${m.studentId}`;
  const b = new Set(snapshot.members.map(key));
  const a = new Set(now.members.map(key));
  const added = new Map<string, number>();
  const gone = new Map<string, number>();
  for (const m of now.members) if (!b.has(key(m))) added.set(m.classId, (added.get(m.classId) ?? 0) + 1);
  for (const m of snapshot.members) if (!a.has(key(m))) gone.set(m.classId, (gone.get(m.classId) ?? 0) + 1);
  const label = (id: string) => {
    const c = after.get(id) ?? before.get(id);
    return c ? name(c) : '반';
  };
  for (const [id, n] of added) out.push(`${label(id)}: 학생 ${n}명 들어옴`);
  for (const [id, n] of gone) out.push(`${label(id)}: 학생 ${n}명 빠짐`);
  return out;
}
