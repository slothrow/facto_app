// 20단계 점검: 적용 후 과거 기록 보존, 새 반 첫 브리핑 코드가 진도를 이어받음, 두 번 적용 불가
import { describe, expect, it } from 'vitest';
import { createSeedAppData } from '../../data/seedAppData.ts';
import { draftFromReal, planApply } from '../../engine/simulator/index.ts';
import { isClassOpenOn } from '../../engine/classTime.ts';
import { addDays } from '../../engine/dates.ts';
import { applyChange, emptyRoster, type ClassRow, type RosterData } from '../../storage/rosterTypes.ts';
import { LocalRosterRepository, applyDraftPayload } from '../../storage/rosterRepository.ts';
import { classCodeOn } from '../curriculum/curriculumModel.ts';
import { classMembersOn } from '../roster/rosterModel.ts';
import { blankStudent } from '../roster/students/studentModel.ts';
import { draftInsertChange, lookupFor } from './simModel.ts';
import { moveClass } from './simOps.ts';

const BASE = '2026-11-08';
const NOW = '2026-11-08T10:00:00+09:00';
const app = createSeedAppData();

function setup(): RosterData {
  const r = emptyRoster();
  const seven: ClassRow = { id: 'seven', weekday: 2, startTime: '16:30', gradeCode: 6, gradeBasisYear: 2026, alias: null, openedOn: '2026-03-01', closedOn: null, memo: '메모' };
  r.classes = [seven];
  for (let i = 0; i < 3; i++) {
    const s = { ...blankStudent(`아이${i}`, BASE), id: `s${i}` };
    r.students.push(s);
    r.enrollments.push({ id: `e${i}`, studentId: s.id, classId: 'seven', startDate: '2026-03-03', endDate: null });
  }
  r.progressAnchors.push({ id: 'pa', classId: 'seven', courseMonth: '2026-11', stage: 'P', unit: 5, memo: null });
  // 과거 기록
  r.absences.push({ date: '2026-11-03', classId: 'seven', studentId: 's0' });
  r.briefings.push({ id: 'b1', date: '2026-11-03', classId: 'seven', studentId: 's1', code: 'P5-1', textSnapshot: '문구', sharedAt: NOW });
  return r;
}

function applied() {
  const real = setup();
  const d0 = draftFromReal(real, BASE, 'A안', NOW);
  const roster = applyChange(real, draftInsertChange(d0));
  const seven = d0.classes[0];
  const d = moveClass(d0, seven.id, 2, '14:30');
  const sched = lookupFor(app, BASE);
  const plan = planApply({ draft: d, roster, sched, option: { mode: 'month', courseMonth: '2027-03' }, today: BASE, now: NOW });
  return { roster, d, plan, sched, after: applyChange(roster, plan.change) };
}

describe('적용 후 점검 (20단계)', () => {
  it('과거 출석·브리핑 기록은 이전 반 기준으로 그대로', () => {
    const { roster, after, plan } = applied();
    expect(plan.change.upsert!.absences).toBeUndefined();
    expect(plan.change.upsert!.briefings).toBeUndefined();
    expect(after.absences).toEqual(roster.absences);
    expect(after.briefings).toEqual(roster.briefings);
    // 과거 날짜의 이전 반 명단도 그대로
    expect(classMembersOn(after, 'seven', '2026-11-03').map((s) => s.id)).toEqual(['s0', 's1', 's2']);
  });

  it('반 목록: 적용일부터 새 반이 운영되고 학생이 옮겨 간다', () => {
    const { after, sched } = applied();
    const date = sched.week1Of(2, '2027-03')!;
    const fresh = after.classes.find((c) => c.id !== 'seven')!;
    const old = after.classes.find((c) => c.id === 'seven')!;
    expect(isClassOpenOn(old, date)).toBe(false);
    expect(isClassOpenOn(old, addDays(date, -1))).toBe(true);
    expect(isClassOpenOn(fresh, date)).toBe(true);
    expect(fresh).toMatchObject({ startTime: '14:30', memo: '메모' });
    expect(classMembersOn(after, fresh.id, date).map((s) => s.id)).toEqual(['s0', 's1', 's2']);
    expect(classMembersOn(after, 'seven', date)).toEqual([]);
  });

  it('새 반의 첫 브리핑 코드가 진도를 이어받는다(2026-11 P5 → 2027-03 P9-1)', () => {
    const { after, sched } = applied();
    const date = sched.week1Of(2, '2027-03')!;
    const fresh = after.classes.find((c) => c.id !== 'seven')!;
    const code = classCodeOn(app, after, fresh, date);
    expect(code).toMatchObject({ kind: 'code', code: 'P9-1' });
    // 이전 반이 그대로 갔다면 받았을 코드와 같다
    expect(classCodeOn(app, after, { ...fresh, id: 'seven' }, date)).toMatchObject({ code: 'P9-1' });
  });

  it('적용된 시안은 다시 적용할 수 없다(로컬 저장소)', async () => {
    const { roster, d, plan } = applied();
    const store = new Map<string, string>();
    const repo = new LocalRosterRepository({ getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) });
    await repo.replaceAll(roster);
    await repo.applyDraft(d.draft.id, plan.change);
    expect((await repo.load()).simDrafts[0].status).toBe('applied');
    await expect(repo.applyDraft(d.draft.id, plan.change)).rejects.toThrow('not editable');
  });

  it('DB 함수에 넘길 모양: 표 이름 + snake_case, 지울 배정은 id만', () => {
    const { plan } = applied();
    const payload = applyDraftPayload(plan.change);
    expect(Object.keys(payload.upsert).sort()).toEqual(['class_progress_anchors', 'classes', 'counseling_notes', 'enrollments', 'sim_drafts']);
    expect(payload.upsert.classes[0]).toHaveProperty('start_time');
    expect(payload.upsert.sim_drafts[0]).toHaveProperty('applied_summary');
    expect(payload.remove.enrollments).toEqual([]);
  });
});

describe('시간표 날짜 보기 (적용 후 반 목록)', async () => {
  const { timetableChangeDates, timetableClasses } = await import('../roster/rosterModel.ts');
  it('지금 = 오늘 운영 반(겹치는 예정 반 제외), 적용일 보기 = 바뀐 시간표', () => {
    const { after, sched } = applied();
    const date = sched.week1Of(2, '2027-03')!;
    expect(timetableChangeDates(after.classes, BASE)).toEqual([date]);
    expect(timetableClasses(after.classes, BASE, date).map((c) => c.startTime)).toEqual(['14:30']);
    // 겹치지 않는 예정 반은 지금 보기에도 보인다(예전과 같음)
    expect(timetableClasses(after.classes, BASE).map((c) => c.startTime)).toEqual(['14:30', '16:30']);
    // 같은 시간대로 옮긴 반(16:00)은 지금 보기에서 숨긴다
    const overlap = after.classes.map((c) => (c.id !== 'seven' ? { ...c, startTime: '16:00' } : c));
    expect(timetableClasses(overlap, BASE).map((c) => c.id)).toEqual(['seven']);
  });
});

describe('시안 행 ↔ DB 열 이름', async () => {
  const { rowToDb } = await import('../../storage/rosterRepository.ts');
  // supabase/migrations/20261108000000_simulator.sql 열(created_at 등 자동 칸 제외)
  const DB = {
    simDrafts: 'applied_at,applied_summary,base_date,base_snapshot,edited_at,grade_view,id,memo,name,source_draft_id,status',
    simClasses: 'alias,draft_id,grade_basis_year,grade_code,id,memo,merged_into,removed,source_class_id,start_stage,start_time,start_unit,weekday',
    simMembers: 'draft_id,id,memo,sim_class_id,student_id,tag,temp_name,waitlist_id',
  };
  it('앱이 저장하는 칸 = DB 칸', () => {
    const d = draftFromReal(setup(), BASE, 'A안', NOW);
    const keys = (k: keyof typeof DB, row: object) => Object.keys(rowToDb(k, row)).sort().join(',');
    expect(keys('simDrafts', d.draft)).toBe(DB.simDrafts);
    expect(keys('simClasses', d.classes[0])).toBe(DB.simClasses);
    expect(keys('simMembers', d.members[0])).toBe(DB.simMembers);
  });
});
