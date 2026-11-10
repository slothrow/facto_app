// SPEC_home 2.6 빈자리 테스트
import { describe, expect, it } from 'vitest';
import { blankStudent } from '../features/roster/students/studentModel.ts';
import type { ClassRow, EnrollmentRow, StudentRow, WaitlistRow } from '../storage/rosterTypes.ts';
import { draftFromReal } from './simulator/index.ts';
import { withHoursDefaults } from './simulator/model.ts';
import type { Weekday } from './types.ts';
import { computeVacancies, gradeFromBirthYear, wishMonthFits, type VacancyInput } from './vacancy.ts';

const TODAY = '2026-11-10';
const hours = withHoursDefaults();

const cls = (id: string, weekday: Weekday, startTime: string, gradeCode: number | null = 7, basis = 2026): ClassRow => ({
  id,
  weekday,
  startTime,
  gradeCode,
  gradeBasisYear: basis,
  alias: null,
  openedOn: '2026-03-01',
  closedOn: null,
  memo: null,
});

function people(classId: string, n: number, opts: Partial<StudentRow> = {}, enroll: Partial<EnrollmentRow> = {}) {
  const students: StudentRow[] = [];
  const enrollments: EnrollmentRow[] = [];
  for (let i = 0; i < n; i++) {
    const s = { ...blankStudent(`${classId}-${i}`, TODAY), id: `${classId}-s${i}-${Math.random()}`, ...opts };
    students.push(s);
    enrollments.push({ id: `e-${s.id}`, studentId: s.id, classId, startDate: '2026-03-02', endDate: null, ...enroll });
  }
  return { students, enrollments };
}

const wait = (over: Partial<WaitlistRow>): WaitlistRow => ({
  id: `w${Math.random()}`,
  name: '대기',
  gradeCode: 7,
  gradeBasisYear: 2026,
  birthday: null,
  guardian: null,
  wish: {},
  inquiredOn: TODAY,
  source: null,
  stage: 'inquiry',
  stageHistory: [],
  memo: null,
  studentId: null,
  ...over,
});

function input(classes: ClassRow[], groups: ReturnType<typeof people>[], over: Partial<VacancyInput> = {}): VacancyInput {
  return {
    baseDate: TODAY,
    grade: 7,
    source: {
      kind: 'real',
      classes,
      students: groups.flatMap((g) => g.students),
      enrollments: groups.flatMap((g) => g.enrollments),
    },
    waitlist: [],
    hours,
    ...over,
  };
}

const times = (r: ReturnType<typeof computeVacancies>, wd: number) => r.slots.filter((s) => s.weekday === wd);

describe('새 반 개설 가능 시각', () => {
  it('화 15:30·16:30·17:30 반 → 13:30, 14:30(기본), 13:40~14:20(기타), 14:40은 간격 0분이라 불가', () => {
    const r = computeVacancies(input([cls('a', 2, '15:30'), cls('b', 2, '16:30'), cls('c', 2, '17:30')], [], { grade: 8 }));
    const tue = times(r, 2);
    expect(tue.filter((s) => s.basic).map((s) => s.startTime)).toEqual(['13:30', '14:30']);
    expect(tue.filter((s) => !s.basic).map((s) => s.startTime)).toEqual(['13:40', '13:50', '14:00', '14:10', '14:20']);
    expect(tue.some((s) => s.startTime === '14:40')).toBe(false);
  });

  it('반이 없는 요일, 마지막 종료 18:30 → 17:40 가능, 17:50 불가', () => {
    const r = computeVacancies(input([], [], { grade: 8 }));
    const wed = times(r, 3).map((s) => s.startTime);
    expect(wed).toContain('17:40');
    expect(wed).not.toContain('17:50');
    expect(wed[0]).toBe('13:30');
  });

  it('선호 시간대 16:00 이후 + 7세(코드 6): 16:30이 13:30보다 위', () => {
    const r = computeVacancies(input([], [], { grade: 6 }));
    const thu = times(r, 4);
    const i1630 = thu.findIndex((s) => s.startTime === '16:30');
    const i1330 = thu.findIndex((s) => s.startTime === '13:30');
    expect(i1630).toBeLessThan(i1330);
    expect(thu[i1630].preferred).toBe(true);
    expect(thu[i1330].preferred).toBe(false);
  });
});

describe('기존 반 빈자리', () => {
  it('화 16:30 초1반 3명 → 1자리, 4명 → 표시 안 함', () => {
    const a = cls('a', 2, '16:30', 7);
    const r3 = computeVacancies(input([a], [people('a', 3)]));
    expect(r3.same).toHaveLength(1);
    expect(r3.same[0].seats).toBe(1);
    const r4 = computeVacancies(input([a], [people('a', 4)]));
    expect(r4.same).toHaveLength(0);
  });

  it('꽉 찬 반이라도 곧 생길 자리가 있으면 그 날짜로 표시', () => {
    const a = cls('a', 2, '16:30', 7);
    const r = computeVacancies(input([a], [people('a', 3), people('a', 1, {}, { endDate: '2026-12-14' })]));
    expect(r.same).toHaveLength(1);
    expect(r.same[0].seats).toBe(0);
    expect(r.same[0].soon).toEqual([{ date: '2026-12-15', seats: 1 }]);
  });

  it('2026학년도 7세반 + 기준일 2027-03-02 → 초1반, 2026학년도 초3반 → 졸업 대상', () => {
    const k7 = cls('k7', 2, '14:30', 6);
    const e3 = cls('e3', 2, '16:30', 9);
    const r = computeVacancies(input([k7, e3], [people('k7', 2), people('e3', 3)], { baseDate: '2027-03-02', grade: 7 }));
    expect(r.same.map((v) => v.id)).toEqual(['k7']);
    expect(r.same[0].grade).toBe(7);
    expect(r.graduating.map((v) => v.id)).toEqual(['e3']);
    // 졸업 대상 반 시간대는 자동으로 비우지 않는다
    expect(times(r, 2).some((s) => s.startTime === '16:30')).toBe(false);
  });

  it('퇴원일 2027-02-28 학생은 2027-03-02 인원에서 제외, 2027-03-02 시작 예정 배정은 오늘 기준 제외·그날 기준 포함', () => {
    const a = cls('a', 2, '16:30', 7, 2027);
    const stay = people('a', 2);
    const leaving = people('a', 1, { status: 'left', statusFrom: '2027-02-28' });
    const coming = people('a', 1, {}, { startDate: '2027-03-02' });
    const today = computeVacancies(input([a], [stay, leaving, coming], { grade: 6 }));
    expect(today.same[0].count).toBe(3); // 2명 + 퇴원 전 1명, 예정 배정 제외
    const march = computeVacancies(input([a], [stay, leaving, coming], { baseDate: '2027-03-02', grade: 7 }));
    expect(march.same[0].count).toBe(3); // 2명 + 예정 1명, 퇴원 제외
  });
});

describe('대기자 연결', () => {
  it('희망 시작 시기 2027-03: 기준일 2027-02-15 포함, 2026-11-10 제외, 빈칸이면 항상 포함', () => {
    expect(wishMonthFits('2027-03', '2027-02-15')).toBe(true);
    expect(wishMonthFits('2027-03', '2026-11-10')).toBe(false);
    expect(wishMonthFits(null, '2026-11-10')).toBe(true);
    expect(wishMonthFits(undefined, '2026-11-10')).toBe(true);
  });

  it('같은 학년·희망 요일 시간이 맞는 대기자만 센다', () => {
    const a = cls('a', 2, '16:30', 7);
    const ok = wait({ id: 'ok', wish: { 2: '16:00' } });
    const late = wait({ id: 'late', wish: { 2: '17:00' } });
    const other = wait({ id: 'other', gradeCode: 8 });
    const later = wait({ id: 'later', wishStartMonth: '2027-03' });
    const r = computeVacancies(input([a], [people('a', 3)], { waitlist: [ok, late, other, later] }));
    expect(r.same[0].waitIds).toEqual(['ok']);
    const slot = r.slots.find((s) => s.weekday === 2 && s.startTime === '13:30')!;
    expect(slot.waitIds).toEqual([]);
  });
});

describe('시안 기준', () => {
  it('"퇴원 예정" 태그 아이 자리는 빈자리, 빼놓은 반은 제외', () => {
    const a = cls('a', 2, '16:30', 7);
    const b = cls('b', 3, '16:30', 7);
    const g = people('a', 4);
    const gb = people('b', 2);
    const roster = {
      classes: [a, b],
      students: [...g.students, ...gb.students],
      enrollments: [...g.enrollments, ...gb.enrollments],
      siblings: [],
    };
    const d0 = draftFromReal(roster as never, TODAY, '시안', `${TODAY}T10:00:00+09:00`);
    const simA = d0.classes.find((c) => c.sourceClassId === 'a')!;
    const simB = d0.classes.find((c) => c.sourceClassId === 'b')!;
    const first = d0.members.find((m) => m.simClassId === simA.id)!;
    const d = {
      ...d0,
      classes: d0.classes.map((c) => (c.id === simB.id ? { ...c, removed: true } : c)),
      members: d0.members.map((m) => (m.id === first.id ? { ...m, tag: 'leaving' as const } : m)),
    };
    const r = computeVacancies({ baseDate: TODAY, grade: 7, source: { kind: 'draft', draft: d }, waitlist: [], hours });
    expect(r.same.map((v) => v.realClassId)).toEqual(['a']);
    expect(r.same[0].seats).toBe(1);
    // 빼놓은 반 자리는 새 반 시각으로 열린다
    expect(times(r, 3).some((s) => s.startTime === '16:30')).toBe(true);
  });
});

describe('출생연도', () => {
  it('2020년생: 2026-11 기준 7세(6), 2027-03 기준 초1(7)', () => {
    expect(gradeFromBirthYear(2020, '2026-11-10')).toBe(6);
    expect(gradeFromBirthYear(2020, '2027-03-02')).toBe(7);
  });
});
