// SPEC_simulator 9장 테스트 예
import { describe, expect, it } from 'vitest';
import { scheduleFor } from '../../app/scheduleInput.ts';
import { createSeedAppData } from '../../data/seedAppData.ts';
import { blankStudent } from '../../features/roster/students/studentModel.ts';
import { emptyRoster, type ClassRow, type RosterData, type SimMemberRow, type WaitlistRow } from '../../storage/rosterTypes.ts';
import type { Weekday } from '../types.ts';
import {
  canPlace,
  checkDraft,
  cloneDraft,
  diffDraft,
  draftFromReal,
  isGraduating,
  planApply,
  realChangesSince,
  scheduleLookup,
  simGradeLabel,
  summarize,
  type SimDraft,
} from './index.ts';

const BASE = '2026-11-08';
const NOW = '2026-11-08T10:00:00+09:00';

const cls = (id: string, weekday: Weekday, startTime: string, gradeCode: number | null = 8): ClassRow => ({
  id,
  weekday,
  startTime,
  gradeCode,
  gradeBasisYear: 2026,
  alias: null,
  openedOn: '2026-03-01',
  closedOn: null,
  memo: null,
});

type Person = { name: string; grade?: number; availability?: Record<number, string | null> };
function rosterWith(classes: ClassRow[], perClass: Record<string, number | Person[]>): RosterData {
  const r = emptyRoster();
  r.classes = classes;
  for (const [classId, spec] of Object.entries(perClass)) {
    const list: Person[] = typeof spec === 'number' ? Array.from({ length: spec }, (_, i) => ({ name: `${classId}학생${i}` })) : spec;
    const c = classes.find((x) => x.id === classId)!;
    list.forEach((p, i) => {
      const s = {
        ...blankStudent(p.name, BASE),
        id: `${classId}-s${i}`,
        gradeCode: p.grade ?? c.gradeCode,
        gradeBasisYear: 2026,
        availability: (p.availability ?? {}) as RosterData['students'][number]['availability'],
      };
      r.students.push(s);
      r.enrollments.push({ id: `e-${s.id}`, studentId: s.id, classId, startDate: '2026-03-02', endDate: null });
    });
  }
  return r;
}

const simOf = (d: SimDraft, sourceId: string) => d.classes.find((c) => c.sourceClassId === sourceId)!;
const moveTo = (d: SimDraft, sourceId: string, weekday: Weekday, startTime: string): SimDraft => ({
  ...d,
  classes: d.classes.map((c) => (c.sourceClassId === sourceId ? { ...c, weekday, startTime } : c)),
});

describe('canPlace (4.1)', () => {
  const roster = rosterWith([cls('a', 2, '16:30'), cls('b', 2, '15:30')], {});
  const d = draftFromReal(roster, BASE, '시안', NOW);

  it('화 16:30 반을 화 14:30으로 → ok, 14:30에 다른 반이 있으면 block', () => {
    expect(canPlace(d, simOf(d, 'a').id, 2, '14:30').kind).toBe('ok');
    const d2 = moveTo(d, 'b', 2, '14:30');
    const p = canPlace(d2, simOf(d2, 'a').id, 2, '14:30');
    expect(p.kind).toBe('block');
  });

  it('15:30 반이 있는 요일에 16:20 시작 → warn(간격 0분), 16:10 → block', () => {
    const solo = { ...d, classes: d.classes.filter((c) => c.sourceClassId === 'b') };
    const warn = canPlace(solo, null, 2, '16:20');
    expect(warn.kind).toBe('warn');
    expect(warn.kind === 'warn' && warn.reasons[0]).toContain('간격 0분');
    expect(canPlace(solo, null, 2, '16:10').kind).toBe('block');
  });

  it('운영 시간대 밖이면 warn, 10분 단위로 맞춘다', () => {
    const p = canPlace(d, null, 3, '18:00');
    expect(p.kind === 'warn' && p.reasons).toEqual(['운영 시간대 밖']);
    expect(canPlace(d, null, 3, '14:33').kind).toBe('ok');
  });
});

describe('checkDraft (6.1)', () => {
  it('가능 시간 "화 15:00 이후"인 아이가 있는 반을 화 14:30으로 → 충돌 1명', () => {
    const roster = rosterWith([cls('a', 2, '16:30')], {
      a: [{ name: '가나', availability: { 2: '15:00' } }, { name: '다라', availability: { 2: null } }, { name: '마바' }],
    });
    const d = moveTo(draftFromReal(roster, BASE, '시안', NOW), 'a', 2, '14:30');
    const ws = checkDraft(d, roster);
    const conflict = ws.find((w) => w.kind === 'availability');
    expect(conflict?.names).toEqual(['가나']);
    expect(conflict?.text).toContain('이 시간 안 되는 아이 1명: 가나');
    expect(ws.find((w) => w.kind === 'availabilityMissing')?.names).toEqual(['마바']);
    // 원래 시간(16:30)에서는 충돌 없음
    expect(checkDraft(draftFromReal(roster, BASE, '시안', NOW), roster).some((w) => w.kind === 'availability')).toBe(false);
  });

  it('정원 초과·인원 부족·학생 없음·학년 불일치', () => {
    const roster = rosterWith([cls('a', 1, '14:30'), cls('b', 1, '15:30'), cls('c', 1, '16:30')], {
      a: 5,
      b: [{ name: '초3아이', grade: 9 }],
    });
    const kinds = checkDraft(draftFromReal(roster, BASE, '시안', NOW), roster).map((w) => w.kind);
    expect(kinds).toContain('over');
    expect(kinds).toContain('few');
    expect(kinds).toContain('empty');
    expect(kinds).toContain('gradeMismatch');
  });
});

describe('학년 보기 (3.1)', () => {
  it('다음 학년도 보기에서 2026학년도 7세반 → 초1(예비), 초3반 → 졸업 대상', () => {
    const roster = rosterWith([cls('seven', 2, '16:30', 6), cls('third', 4, '17:30', 9)], {});
    const d = draftFromReal(roster, BASE, '시안', NOW);
    const seven = simOf(d, 'seven');
    const third = simOf(d, 'third');
    expect(simGradeLabel(seven, d.draft)).toBe('7세');
    expect(simGradeLabel(seven, { ...d.draft, gradeView: 'next' })).toBe('초1(예비)');
    expect(isGraduating(third, d.draft)).toBe(true);
    expect(isGraduating(seven, d.draft)).toBe(false);
    expect(simGradeLabel(third, { ...d.draft, gradeView: 'next' })).toBe('졸업 대상');
  });
});

describe('diffDraft / summarize (6.2, 6.3)', () => {
  it('이동·신규·빼놓음·합침·태그 변경', () => {
    const roster = rosterWith([cls('seven', 2, '16:30', 6), cls('third', 4, '17:30', 9), cls('a', 1, '14:30'), cls('b', 1, '15:30')], {
      seven: 3,
      third: 2,
      a: 2,
      b: 2,
    });
    let d = draftFromReal(roster, BASE, '시안', NOW);
    d = moveTo(d, 'seven', 2, '14:30');
    const a = simOf(d, 'a');
    const b = simOf(d, 'b');
    d = {
      ...d,
      classes: [
        ...d.classes.map((c) => (c.sourceClassId === 'third' ? { ...c, removed: true } : c.id === a.id ? { ...c, mergedInto: b.id } : c)),
        { ...a, id: 'new1', sourceClassId: null, weekday: 1, startTime: '13:30', gradeCode: 4, mergedInto: null },
      ],
      members: d.members.map((m) => (m.simClassId === a.id ? { ...m, simClassId: b.id } : m)),
    };
    const firstSeven = d.members.find((m) => m.simClassId === simOf(d, 'seven').id)!;
    d.members = d.members.map((m) => (m.id === firstSeven.id ? { ...m, tag: 'leaving' } : m));

    const texts = diffDraft(d.draft.baseSnapshot, d, BASE).map((c) => c.text);
    expect(texts).toContain('7세반 화 4:30 → 화 2:30');
    expect(texts).toContain('5세반 신규 (월 1:30)');
    expect(texts).toContain('초3반 빼놓음 (목 5:30)');
    expect(texts).toContain('초2반 → 초2반 합침');
    expect(texts.some((t) => t.includes('퇴원 예정 1명'))).toBe(true);

    const s = summarize(d);
    // 7세(2) + 초2 합친 반(4) + 새 반(0)
    expect(s.classCount).toBe(3);
    expect(s.studentCount).toBe(6);
    expect(s.emptySeats).toBe(2 + 0 + 4);
  });

  it('시안 복제는 새 id, 합침 연결 유지', () => {
    const roster = rosterWith([cls('a', 1, '14:30'), cls('b', 1, '15:30')], { a: 1, b: 1 });
    const d = draftFromReal(roster, BASE, '시안', NOW);
    const merged = { ...d, classes: d.classes.map((c) => (c.sourceClassId === 'a' ? { ...c, mergedInto: simOf(d, 'b').id } : c)) };
    const copy = cloneDraft(merged, '복제', NOW);
    expect(copy.draft.id).not.toBe(d.draft.id);
    const ca = copy.classes.find((c) => c.sourceClassId === 'a')!;
    const cb = copy.classes.find((c) => c.sourceClassId === 'b')!;
    expect(ca.mergedInto).toBe(cb.id);
    expect(copy.members.every((m) => copy.classes.some((c) => c.id === m.simClassId))).toBe(true);
  });

  it('시안 만든 뒤 실제 데이터가 바뀌면 알려준다', () => {
    const roster = rosterWith([cls('a', 1, '14:30')], { a: 2 });
    const d = draftFromReal(roster, BASE, '시안', NOW);
    expect(realChangesSince(d.draft.baseSnapshot, roster, BASE)).toEqual([]);
    const later = { ...roster, enrollments: roster.enrollments.slice(1) };
    expect(realChangesSince(d.draft.baseSnapshot, later, BASE)).toEqual(['월 2:30 초2반: 학생 1명 빠짐']);
  });
});

describe('planApply (7장)', () => {
  const app = createSeedAppData();
  const days = scheduleFor(app, { from: '2026-11-01', to: '2027-08-31' }).days;
  const sched = scheduleLookup(days);
  const week1 = (wd: number, cm: string) => days.find((x) => x.weekday === wd && x.session?.courseMonth === cm && x.session.weekNo === 1 && x.status === 'session')!.date;

  it('수업월 기준: 수요일 반의 2027-03 수업월 1주 날짜가 회차 엔진 결과와 같다', () => {
    const roster = rosterWith([cls('wed', 3, '15:30')], { wed: 2 });
    let d = draftFromReal(roster, BASE, '시안', NOW);
    d = moveTo(d, 'wed', 3, '14:30');
    const plan = planApply({ draft: d, roster, sched, option: { mode: 'month', courseMonth: '2027-03' }, today: BASE, now: NOW });
    expect(plan.ok).toBe(true);
    expect(sched.week1Of(3, '2027-03')).toBe(week1(3, '2027-03'));
    expect(plan.classes[0].applyDate).toBe(week1(3, '2027-03'));
  });

  it('옮긴 반: 기존 반 폐반 + 새 반 개설 + 배정 이동 + 진도 이어받기(새 기준점 = 기존 반의 적용 수업월 진도)', () => {
    const roster = rosterWith([cls('seven', 2, '16:30', 6)], { seven: 3 });
    roster.progressAnchors.push({ id: 'pa', classId: 'seven', courseMonth: '2026-11', stage: 'P', unit: 5, memo: null });
    roster.basicLessons.push({ id: 'bl-old', classId: 'seven', date: '2026-12-01', title: '', text: '' });
    let d = moveTo(draftFromReal(roster, BASE, '시안', NOW), 'seven', 2, '14:30');
    const date = week1(2, '2027-03');
    roster.basicLessons.push({ id: 'bl-new', classId: 'seven', date, title: '', text: '' });
    const plan = planApply({ draft: d, roster, sched, option: { mode: 'month', courseMonth: '2027-03' }, today: BASE, now: NOW });
    const up = plan.change.upsert!;
    const old = up.classes!.find((c) => c.id === 'seven')!;
    const fresh = up.classes!.find((c) => c.id !== 'seven')!;
    expect(old.closedOn).toBe(date);
    expect(fresh).toMatchObject({ weekday: 2, startTime: '14:30', openedOn: date, gradeCode: 6 });
    // 2026-11 P5 → 2027-03 P9
    expect(up.progressAnchors).toEqual([expect.objectContaining({ classId: fresh.id, courseMonth: '2027-03', stage: 'P', unit: 9 })]);
    // 기존 배정은 전날까지, 새 배정은 적용일부터
    const ended = up.enrollments!.filter((e) => e.classId === 'seven');
    const added = up.enrollments!.filter((e) => e.classId === fresh.id);
    expect(ended).toHaveLength(3);
    expect(ended.every((e) => e.endDate! < date)).toBe(true);
    expect(added).toHaveLength(3);
    expect(added.every((e) => e.startDate === date)).toBe(true);
    // 적용일 이후 베이직 계획만 새 반으로
    expect(up.basicLessons).toEqual([expect.objectContaining({ id: 'bl-new', classId: fresh.id })]);
    expect(up.simDrafts![0]).toMatchObject({ status: 'applied', appliedAt: NOW });
    d = { ...d };
  });

  it('빼놓은 반·합친 반·퇴원 예정·신규 대기자·임시 이름', () => {
    const roster = rosterWith([cls('a', 1, '14:30'), cls('b', 1, '15:30'), cls('third', 4, '17:30', 9)], { a: 2, b: 2, third: 2 });
    const wait: WaitlistRow = {
      id: 'w1', name: '새아이', gradeCode: 8, gradeBasisYear: 2026, birthday: null, guardian: null, wish: {},
      inquiredOn: BASE, source: null, stage: 'inquiry', stageHistory: [], memo: null, studentId: null,
    };
    roster.waitlist.push(wait);
    let d = draftFromReal(roster, BASE, '시안', NOW);
    const a = simOf(d, 'a');
    const b = simOf(d, 'b');
    const extra = (over: Partial<SimMemberRow>): SimMemberRow => ({
      id: `m-${over.waitlistId ?? over.tempName}`, draftId: d.draft.id, simClassId: b.id, studentId: null, waitlistId: null, tempName: null, tag: 'new', memo: null, ...over,
    });
    d = {
      ...d,
      classes: d.classes.map((c) => (c.id === a.id ? { ...c, mergedInto: b.id } : c.sourceClassId === 'third' ? { ...c, removed: true } : c)),
      members: [
        ...d.members.map((m) => (m.simClassId === a.id ? { ...m, simClassId: b.id } : m)).map((m) => (m.studentId === 'b-s0' ? { ...m, tag: 'leaving' as const } : m)),
        extra({ waitlistId: 'w1' }),
        extra({ tempName: '상담중' }),
      ],
    };
    const plan = planApply({ draft: d, roster, sched, option: { mode: 'date', date: '2027-03-02' }, today: BASE, now: NOW });
    expect(plan.ok).toBe(true);
    const up = plan.change.upsert!;
    expect(up.classes!.find((c) => c.id === 'a')!.closedOn).toBe('2027-03-02');
    expect(up.classes!.find((c) => c.id === 'third')!.closedOn).toBe('2027-03-02');
    expect(up.classes!.find((c) => c.id === 'b')).toBeUndefined();
    // a반 학생 2명 → b반
    const toB = up.enrollments!.filter((e) => e.classId === 'b' && e.startDate === '2027-03-02').map((e) => e.studentId);
    expect(toB).toHaveLength(3); // a반 2명 + 신규 대기자 1명
    expect(toB).toEqual(expect.arrayContaining(['a-s0', 'a-s1']));
    // 퇴원 예정
    expect(up.students!.find((s) => s.id === 'b-s0')).toMatchObject({ status: 'left', statusFrom: '2027-03-02' });
    // 신규 대기자 → 학생 등록 + 배정 + 대기자 "등록"
    const registered = up.students!.find((s) => s.name === '새아이')!;
    expect(up.waitlist![0]).toMatchObject({ stage: 'enrolled', studentId: registered.id });
    // 임시 이름은 안내만
    expect(plan.notes.some((n) => n.includes('상담중'))).toBe(true);
    // 빼놓은 반 학생은 배정 종료 + 경고
    expect(up.enrollments!.filter((e) => e.classId === 'third').every((e) => e.endDate === '2027-03-01')).toBe(true);
    expect(plan.warnings[0]).toContain('반 없이 남아요');
    expect(plan.leavers).toHaveLength(1);
    expect(plan.newcomers).toHaveLength(1);

    // 체크 해제하면 반영하지 않음
    const skipped = planApply({ draft: d, roster, sched, option: { mode: 'date', date: '2027-03-02' }, skip: plan.leavers.concat(plan.newcomers).map((p) => p.memberId), today: BASE, now: NOW });
    expect(skipped.change.upsert!.students).toEqual([]);
    expect(skipped.change.upsert!.waitlist).toEqual([]);
  });

  it('새 반 시작 진도: 기본은 학년 기본 단계 1단원', () => {
    const roster = rosterWith([], {});
    const d = draftFromReal(roster, BASE, '시안', NOW);
    d.classes.push({
      id: 'n', draftId: d.draft.id, sourceClassId: null, weekday: 1, startTime: '13:30', gradeCode: 5, gradeBasisYear: 2026,
      alias: null, memo: null, removed: false, mergedInto: null, startStage: null, startUnit: null,
    });
    const plan = planApply({ draft: d, roster, sched, option: { mode: 'month', courseMonth: '2027-03' }, today: BASE, now: NOW });
    // 2026학년도 6세(5) → 2027-03에는 7세 → P단계 1단원
    expect(plan.change.upsert!.progressAnchors).toEqual([expect.objectContaining({ stage: 'P', unit: 1, courseMonth: '2027-03' })]);
  });

  it('원래 반이 폐반되었으면 적용할 수 없다', () => {
    const roster = rosterWith([cls('a', 1, '14:30')], { a: 1 });
    const d = moveTo(draftFromReal(roster, BASE, '시안', NOW), 'a', 1, '15:30');
    const closed = { ...roster, classes: [{ ...roster.classes[0], closedOn: '2026-11-01' }] };
    expect(planApply({ draft: d, roster: closed, sched, option: { mode: 'month', courseMonth: '2027-03' }, today: BASE, now: NOW }).ok).toBe(false);
  });
});
