// 변경 목록: 원본(시안 만들 때의 실제 반) 대비 자동 계산(SPEC_simulator 6.2). 순수 함수.
import { toMinutes } from '../classTime.ts';
import { classGradeCodeOn, gradeLabel } from '../grade.ts';
import type { SimSnapshot } from '../../storage/rosterTypes.ts';
import { membersOf, simClassName, slotText, type SimDraft } from './model.ts';

export type ChangeKind = 'move' | 'new' | 'removed' | 'merged' | 'grade' | 'alias' | 'tags';

export interface DraftChange {
  kind: ChangeKind;
  /** 누르면 선택할 시안 반 */
  simClassId: string;
  text: string;
}

/**
 * labelDate: 반 이름에 쓸 학년 기준 날짜(보통 기준일).
 * 순서: 반 요일·시간 순.
 */
export function diffDraft(snapshot: SimSnapshot, draft: Pick<SimDraft, 'classes' | 'members'>, labelDate: string): DraftChange[] {
  const src = new Map(snapshot.classes.map((c) => [c.id, c]));
  const byId = new Map(draft.classes.map((c) => [c.id, c]));
  const out: { order: number; change: DraftChange }[] = [];
  const order = (c: { weekday: number; startTime: string }) => c.weekday * 10000 + toMinutes(c.startTime);

  for (const c of draft.classes) {
    const s = c.sourceClassId ? src.get(c.sourceClassId) : undefined;
    const before = s ?? c;
    const name = simClassName(s ?? c, labelDate);
    const push = (kind: ChangeKind, text: string) => out.push({ order: order(before), change: { kind, simClassId: c.id, text } });

    if (c.mergedInto) {
      const target = byId.get(c.mergedInto);
      push('merged', `${name} → ${target ? simClassName(target, labelDate) : '다른 반'} 합침`);
      continue;
    }
    if (!s) {
      if (!c.removed) push('new', `${name} 신규 (${slotText(c.weekday, c.startTime)})`);
      continue;
    }
    if (c.removed) {
      push('removed', `${name} 빼놓음 (${slotText(s.weekday, s.startTime)})`);
      continue;
    }
    if (s.weekday !== c.weekday || s.startTime !== c.startTime) {
      push('move', `${name} ${slotText(s.weekday, s.startTime)} → ${slotText(c.weekday, c.startTime)}`);
    }
    const g0 = classGradeCodeOn(s, labelDate);
    const g1 = classGradeCodeOn(c, labelDate);
    if (g0 !== g1) push('grade', `${name} 학년 ${gradeLabel(g0)} → ${gradeLabel(g1)}`);
    if ((s.alias ?? '') !== (c.alias ?? '')) push('alias', `${name} 별칭 ${s.alias || '없음'} → ${c.alias || '없음'}`);
  }

  // 아이 태그 변경(시간표에 있는 반 + 빼놓은 반)
  for (const c of draft.classes) {
    if (c.mergedInto) continue;
    const ms = membersOf(draft, c.id);
    const count = (pred: (m: (typeof ms)[number]) => boolean) => ms.filter(pred).length;
    const parts: string[] = [];
    const leaving = count((m) => m.tag === 'leaving');
    const fresh = count((m) => m.tag === 'new');
    const moving = count((m) => m.tag === 'move');
    const undecided = count((m) => m.tag === 'undecided');
    if (leaving) parts.push(`퇴원 예정 ${leaving}명`);
    if (fresh) parts.push(`신규 ${fresh}명`);
    if (moving) parts.push(`이동 ${moving}명`);
    if (undecided) parts.push(`미정 ${undecided}명`);
    if (parts.length) {
      out.push({ order: order(c) + 0.5, change: { kind: 'tags', simClassId: c.id, text: `${simClassName(c, labelDate)} (${slotText(c.weekday, c.startTime)}): ${parts.join(', ')}` } });
    }
  }
  return out.sort((a, b) => a.order - b.order).map((x) => x.change);
}
