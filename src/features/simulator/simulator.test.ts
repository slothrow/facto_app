// 편성 화면 조작·저장 차이 계산
import { describe, expect, it } from 'vitest';
import { draftFromReal, diffDraft, summarize } from '../../engine/simulator/index.ts';
import { blankStudent } from '../roster/students/studentModel.ts';
import { emptyRoster, applyChange, type ClassRow } from '../../storage/rosterTypes.ts';
import { changeBetween, draftInsertChange, draftOf, gridRange } from './simModel.ts';
import { addClass, addMember, deleteNewClass, mergeClass, moveClass, removeClass, removeMember } from './simOps.ts';
import { withHoursDefaults } from '../../engine/simulator/index.ts';

const BASE = '2026-11-08';
const NOW = '2026-11-08T10:00:00+09:00';
const cls = (id: string, weekday: 1 | 2 | 3 | 4 | 5, startTime: string, gradeCode = 6): ClassRow => ({
  id, weekday, startTime, gradeCode, gradeBasisYear: 2026, alias: null, openedOn: null, closedOn: null, memo: null,
});

function setup() {
  const r = emptyRoster();
  r.classes = [cls('seven', 2, '16:30'), cls('third', 4, '17:30', 9)];
  for (const [classId, n] of [['seven', 3], ['third', 2]] as const) {
    for (let i = 0; i < n; i++) {
      const s = { ...blankStudent(`${classId}${i}`, BASE), id: `${classId}-${i}` };
      r.students.push(s);
      r.enrollments.push({ id: `e-${s.id}`, studentId: s.id, classId, startDate: '2026-03-02', endDate: null });
    }
  }
  const d = draftFromReal(r, BASE, 'A안', NOW);
  return { roster: applyChange(r, draftInsertChange(d)), d };
}

describe('시안 조작 (17단계 완료 기준)', () => {
  it('7세반 4:30 → 2:30, 새 반 만들기, 초3반 빼놓기, 되돌리기 — 실제 반 데이터는 그대로', () => {
    const { roster, d } = setup();
    const seven = d.classes.find((c) => c.sourceClassId === 'seven')!;
    const third = d.classes.find((c) => c.sourceClassId === 'third')!;

    const s1 = moveClass(d, seven.id, 2, '14:30');
    const { next: s2 } = addClass(s1, { weekday: 1, startTime: '13:30', gradeCode: 4, gradeBasisYear: 2026, alias: '예비', memo: null, startStage: null, startUnit: null });
    const s3 = removeClass(s2, third.id);
    expect(diffDraft(d.draft.baseSnapshot, s3, BASE).map((c) => c.kind)).toEqual(['new', 'move', 'removed']);

    // 저장(바뀐 행만)
    let saved = roster;
    for (const [a, b] of [[d, s1], [s1, s2], [s2, s3]] as const) saved = applyChange(saved, changeBetween(a, b, NOW));
    expect(draftOf(saved, d.draft.id)!.classes).toHaveLength(3);
    expect(saved.classes).toEqual(roster.classes);
    expect(saved.enrollments).toEqual(roster.enrollments);

    // 되돌리기: 이전 상태를 다시 저장
    saved = applyChange(saved, changeBetween(s3, s2, NOW));
    expect(draftOf(saved, d.draft.id)!.classes.find((c) => c.id === third.id)!.removed).toBe(false);
    saved = applyChange(saved, changeBetween(s2, s1, NOW));
    expect(draftOf(saved, d.draft.id)!.classes).toHaveLength(2);
  });

  it('빼놓은 반을 다시 격자로 옮기면 복귀', () => {
    const { d } = setup();
    const third = d.classes.find((c) => c.sourceClassId === 'third')!;
    const back = moveClass(removeClass(d, third.id), third.id, 4, '17:30');
    expect(diffDraft(d.draft.baseSnapshot, back, BASE)).toEqual([]);
  });

  it('합치기: 아이가 옮겨 가고 합친 반은 사라진다', () => {
    const { d } = setup();
    const seven = d.classes.find((c) => c.sourceClassId === 'seven')!;
    const third = d.classes.find((c) => c.sourceClassId === 'third')!;
    const m = mergeClass(d, third.id, seven.id);
    expect(summarize(m).classCount).toBe(1);
    expect(m.members.filter((x) => x.simClassId === seven.id)).toHaveLength(5);
  });

  it('시안에서 추가한 반·아이만 지울 수 있다', () => {
    const { d } = setup();
    const seven = d.classes.find((c) => c.sourceClassId === 'seven')!;
    expect(deleteNewClass(d, seven.id)).toBe(d);
    const withTemp = addMember(d, seven.id, { tempName: '상담' });
    const temp = withTemp.members.find((x) => x.tempName)!;
    expect(removeMember(withTemp, temp.id).members).toHaveLength(d.members.length);
    expect(removeMember(d, d.members[0].id)).toBe(d);
  });

  it('격자 범위는 운영 시간대 ±30분, 10분 단위', () => {
    const { d } = setup();
    expect(gridRange(d, withHoursDefaults())).toEqual({ start: 13 * 60, end: 19 * 60 });
  });
});

describe('대기자 연결 (5.2)', async () => {
  const { waitlistMatches, waitDots } = await import('./simReview.ts');
  it('학년·희망 시간이 맞는 대기자, 시안에 넣으면 목록에서 빠진다', () => {
    const { roster, d } = setup();
    const seven = d.classes.find((c) => c.sourceClassId === 'seven')!;
    const w = {
      id: 'w1', name: '대기', gradeCode: 6, gradeBasisYear: 2026, birthday: null, guardian: null, wish: { 2: '14:00' },
      inquiredOn: BASE, source: null, stage: 'inquiry' as const, stageHistory: [], memo: null, studentId: null,
    };
    const r = { ...roster, waitlist: [w] };
    expect(waitlistMatches(d, seven, r).map((x) => x.id)).toEqual(['w1']);
    // 다음 학년도 보기에서는 학년이 맞지 않는다(대기자도 같이 진급하므로 그대로 맞음)
    expect(waitlistMatches({ ...d, draft: { ...d.draft, gradeView: 'next' } }, seven, r)).toHaveLength(1);
    // 화 13:30은 희망(14:00 이후) 밖
    expect(waitlistMatches(d, { ...seven, startTime: '13:30' }, r)).toHaveLength(0);
    const dots = waitDots(d, seven, r, [1, 2], { start: 13 * 60, end: 19 * 60 });
    expect(dots.get('2|14:00')).toBe(1);
    expect(dots.has('2|13:30')).toBe(false);
    expect(dots.has('1|14:00')).toBe(false);
    expect(waitlistMatches(addMember(d, seven.id, { waitlistId: 'w1' }), seven, r)).toHaveLength(0);
  });
});
