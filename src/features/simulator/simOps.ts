// 시안 조작(순수 함수). 화면은 이 함수로 다음 상태를 만들고, 되돌리기는 이전 상태를 다시 저장한다.
import { snapTo10, type SimDraft } from '../../engine/simulator/index.ts';
import type { Weekday } from '../../engine/types.ts';
import { newId, type SimClassRow, type SimMemberRow, type SimTag } from '../../storage/rosterTypes.ts';

const mapClass = (d: SimDraft, id: string, f: (c: SimClassRow) => SimClassRow): SimDraft => ({
  ...d,
  classes: d.classes.map((c) => (c.id === id ? f(c) : c)),
});

/** 옮기기(빼놓은 반이면 시간표로 복귀) */
export const moveClass = (d: SimDraft, id: string, weekday: Weekday, start: string): SimDraft =>
  mapClass(d, id, (c) => ({ ...c, weekday, startTime: snapTo10(start), removed: false }));

export const removeClass = (d: SimDraft, id: string): SimDraft => mapClass(d, id, (c) => ({ ...c, removed: true }));

export function addClass(
  d: SimDraft,
  fields: Pick<SimClassRow, 'weekday' | 'startTime' | 'gradeCode' | 'gradeBasisYear' | 'alias' | 'memo' | 'startStage' | 'startUnit'>,
): { next: SimDraft; id: string } {
  const id = newId();
  const row: SimClassRow = { id, draftId: d.draft.id, sourceClassId: null, removed: false, mergedInto: null, ...fields, startTime: snapTo10(fields.startTime) };
  return { next: { ...d, classes: [...d.classes, row] }, id };
}

export const updateClass = (d: SimDraft, id: string, patch: Partial<SimClassRow>): SimDraft => mapClass(d, id, (c) => ({ ...c, ...patch, id: c.id }));

/** 시안에서 만든 반 지우기(원래 있던 반은 지우지 않고 빼놓기만 한다) */
export function deleteNewClass(d: SimDraft, id: string): SimDraft {
  const c = d.classes.find((x) => x.id === id);
  if (!c || c.sourceClassId) return d;
  return { ...d, classes: d.classes.filter((x) => x.id !== id), members: d.members.filter((m) => m.simClassId !== id) };
}

/** A반을 B반에 합치기: A반 아이는 B반으로, A반은 시간표에서 사라진다 */
export function mergeClass(d: SimDraft, fromId: string, intoId: string): SimDraft {
  if (fromId === intoId) return d;
  return {
    ...d,
    classes: d.classes.map((c) =>
      c.id === fromId ? { ...c, mergedInto: intoId, removed: false } : c.mergedInto === fromId ? { ...c, mergedInto: intoId } : c,
    ),
    members: d.members.map((m) => (m.simClassId === fromId ? { ...m, simClassId: intoId } : m)),
  };
}

export const setMember = (d: SimDraft, id: string, patch: Partial<SimMemberRow>): SimDraft => ({
  ...d,
  members: d.members.map((m) => (m.id === id ? { ...m, ...patch, id: m.id } : m)),
});

export const setTag = (d: SimDraft, id: string, tag: SimTag) => setMember(d, id, { tag });

export function addMember(d: SimDraft, simClassId: string, who: { waitlistId: string } | { tempName: string }): SimDraft {
  const row: SimMemberRow = {
    id: newId(),
    draftId: d.draft.id,
    simClassId,
    studentId: null,
    waitlistId: 'waitlistId' in who ? who.waitlistId : null,
    tempName: 'tempName' in who ? who.tempName : null,
    tag: 'new',
    memo: null,
  };
  return { ...d, members: [...d.members, row] };
}

/** 시안에서 추가한 아이(대기자·임시 이름)만 뺄 수 있다. 재원생은 태그로 표시 */
export function removeMember(d: SimDraft, id: string): SimDraft {
  const m = d.members.find((x) => x.id === id);
  if (!m || m.studentId) return d;
  return { ...d, members: d.members.filter((x) => x.id !== id) };
}
