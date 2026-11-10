import { describe, expect, it } from 'vitest';
import { LocalRosterRepository, rowFromDb, rowToDb } from './rosterRepository.ts';
import { applyChange, emptyRoster, type ClassRow, type StudentRow } from './rosterTypes.ts';

const cls = (id: string, startTime = '16:30'): ClassRow => ({
  id,
  weekday: 2,
  startTime,
  gradeCode: 8,
  gradeBasisYear: 2026,
  alias: null,
  openedOn: null,
  closedOn: null,
  memo: null,
});

const student = (id: string, name: string): StudentRow => ({
  id,
  name,
  gender: null,
  birthday: null,
  gradeCode: 8,
  gradeBasisYear: 2026,
  gradeAdjust: 0,
  school: null,
  studentPhone: null,
  guardians: [{ name: '엄마', relation: 'mom', phone: '01012345678', isPrimary: true }],
  address: null,
  registeredOn: null,
  firstClassOn: null,
  status: 'active',
  statusFrom: null,
  statusTo: null,
  leaveReason: null,
  availability: { 2: '15:00' },
  notice: null,
  needsReview: false,
});

describe('행 단위 변경', () => {
  it('추가·수정·삭제를 한 번에 적용한다', () => {
    let d = applyChange(emptyRoster(), { upsert: { classes: [cls('a'), cls('b')] } });
    d = applyChange(d, { upsert: { classes: [{ ...cls('a'), startTime: '17:30' }] }, remove: { classes: [cls('b')] } });
    expect(d.classes).toEqual([{ ...cls('a'), startTime: '17:30' }]);
  });
  it('결석처럼 키가 여러 열인 표도 구분한다', () => {
    const a = { date: '2026-11-10', classId: 'c', studentId: 's1' };
    const b = { date: '2026-11-10', classId: 'c', studentId: 's2' };
    let d = applyChange(emptyRoster(), { upsert: { absences: [a, b] } });
    d = applyChange(d, { remove: { absences: [{ ...a }] } });
    expect(d.absences).toEqual([b]);
  });
  it('바뀌지 않은 표는 같은 배열을 그대로 쓴다', () => {
    const base = emptyRoster();
    const d = applyChange(base, { upsert: { classes: [cls('a')] } });
    expect(d.students).toBe(base.students);
  });
});

describe('DB 열 이름 변환', () => {
  it('학생: camelCase ↔ snake_case, 연락처 안쪽까지', () => {
    const s = student('s1', '김선우');
    const db = rowToDb('students', s);
    expect(db.grade_basis_year).toBe(2026);
    expect(db.needs_review).toBe(false);
    expect(db.guardians).toEqual([{ name: '엄마', relation: 'mom', phone: '01012345678', is_primary: true }]);
    const back = rowFromDb('students', { ...db, created_at: 'x', updated_at: 'y', updated_by: 'z' });
    expect(back).toEqual(s);
  });
});

describe('localStorage 저장소', () => {
  it('저장하고 다시 읽는다', async () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    const repo = new LocalRosterRepository(storage);
    // 처음엔 비어 있고 반복 할 일 초기 템플릿만 들어 있다
    expect({ ...(await repo.load()), taskTemplates: [] }).toEqual(emptyRoster());
    expect((await repo.load()).taskTemplates).toHaveLength(16);
    await repo.apply({ upsert: { classes: [cls('a')], students: [student('s1', '가')] } });
    const d = await repo.load();
    expect(d.classes).toHaveLength(1);
    expect(d.students[0].name).toBe('가');
  });
});
