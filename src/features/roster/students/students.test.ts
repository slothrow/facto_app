import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { scheduleFor } from '../../../app/scheduleInput.ts';
import { createSeedAppData } from '../../../data/seedAppData.ts';
import { applyChange, emptyRoster, type ClassRow, type RosterData } from '../../../storage/rosterTypes.ts';
import { classMembersOn } from '../rosterModel.ts';
import { autoMap, buildImportPlan, parseGrade, parseTable, parseTime, planToChange } from './importModel.ts';
import { blankStudent, formatPhone, matchesName, nextWeek1Date, planEnroll, planUnenroll } from './studentModel.ts';

describe('초성 검색', () => {
  it('초성, 섞어 쓰기, 일부만', () => {
    expect(matchesName('김선우', 'ㄱㅅㅇ')).toBe(true);
    expect(matchesName('김선우', '김ㅅ')).toBe(true);
    expect(matchesName('김선우', 'ㅅㅇ')).toBe(true);
    expect(matchesName('김선우', 'ㅇㅅ')).toBe(false);
    expect(matchesName('김선우', '선우')).toBe(true);
    expect(matchesName('김선우', '')).toBe(true);
  });
});

describe('전화번호', () => {
  it('숫자만 저장, 010-1234-5678로 표시', () => {
    expect(formatPhone('01012345678')).toBe('010-1234-5678');
    expect(formatPhone('010-1234-5678')).toBe('010-1234-5678');
    expect(formatPhone('0212345678')).toBe('02-1234-5678');
    expect(formatPhone('0311234567')).toBe('031-123-4567');
  });
});

const cls = (id: string, weekday: 1 | 2 | 3 | 4 | 5, startTime: string, gradeCode = 8): ClassRow => ({
  id,
  weekday,
  startTime,
  gradeCode,
  gradeBasisYear: 2026,
  alias: null,
  openedOn: null,
  closedOn: null,
  memo: null,
});

function rosterWith(...classes: ClassRow[]): RosterData {
  return { ...emptyRoster(), classes, students: [{ ...blankStudent('가나', '2026-11-05'), id: 's1' }] };
}

describe('반 배정·이동 (SPEC 3.3)', () => {
  it('이동: 이전 배정은 적용일 전날 종료 + 상담 기록 자동 추가', () => {
    let r = rosterWith(cls('a', 2, '16:30'), cls('b', 4, '16:30'));
    r = applyChange(r, planEnroll(r, 's1', r.classes[0], '2026-09-01', '2026-09-01'));
    r = applyChange(r, planEnroll(r, 's1', r.classes[1], '2026-12-03', '2026-11-05'));
    const [first, second] = [...r.enrollments].sort((x, y) => x.startDate.localeCompare(y.startDate));
    expect(first).toMatchObject({ classId: 'a', startDate: '2026-09-01', endDate: '2026-12-02' });
    expect(second).toMatchObject({ classId: 'b', startDate: '2026-12-03', endDate: null });
    expect(r.counselingNotes).toHaveLength(1);
    expect(r.counselingNotes[0]).toMatchObject({ type: 'move', date: '2026-11-05' });
    expect(r.counselingNotes[0].content).toContain('적용일 2026-12-03');
  });

  it('반 이동한 학생: 이동 전 날짜에는 이전 반, 이동 후에는 새 반 명단', () => {
    let r = rosterWith(cls('a', 2, '16:30'), cls('b', 4, '16:30'));
    r = applyChange(r, planEnroll(r, 's1', r.classes[0], '2026-09-01', '2026-09-01'));
    r = applyChange(r, planEnroll(r, 's1', r.classes[1], '2026-12-03', '2026-11-05'));
    expect(classMembersOn(r, 'a', '2026-12-01').map((s) => s.id)).toEqual(['s1']);
    expect(classMembersOn(r, 'b', '2026-12-01')).toEqual([]);
    expect(classMembersOn(r, 'a', '2026-12-08')).toEqual([]);
    expect(classMembersOn(r, 'b', '2026-12-03').map((s) => s.id)).toEqual(['s1']);
  });

  it('아직 시작 안 한 배정을 다시 옮기면 그 배정은 지운다', () => {
    let r = rosterWith(cls('a', 2, '16:30'), cls('b', 4, '16:30'));
    r = applyChange(r, planEnroll(r, 's1', r.classes[0], '2026-12-01', '2026-11-05'));
    r = applyChange(r, planEnroll(r, 's1', r.classes[1], '2026-11-20', '2026-11-05'));
    expect(r.enrollments.map((e) => e.classId)).toEqual(['b']);
  });

  it('빼기: 적용일부터 배정 없음', () => {
    let r = rosterWith(cls('a', 2, '16:30'));
    r = applyChange(r, planEnroll(r, 's1', r.classes[0], '2026-09-01', '2026-09-01'));
    r = applyChange(r, planUnenroll(r, 's1', 'a', '2026-11-10'));
    expect(r.enrollments[0].endDate).toBe('2026-11-09');
    expect(classMembersOn(r, 'a', '2026-11-10')).toEqual([]);
  });

  it('휴원·퇴원 학생은 그날 명단에서 빠진다', () => {
    let r = rosterWith(cls('a', 2, '16:30'));
    r = applyChange(r, planEnroll(r, 's1', r.classes[0], '2026-09-01', '2026-09-01'));
    r = { ...r, students: [{ ...r.students[0], status: 'paused', statusFrom: '2026-11-01', statusTo: '2026-11-30' }] };
    expect(classMembersOn(r, 'a', '2026-10-27')).toHaveLength(1);
    expect(classMembersOn(r, 'a', '2026-11-10')).toHaveLength(0);
    expect(classMembersOn(r, 'a', '2026-12-01')).toHaveLength(1);
  });
});

describe('다음 수업월 1주', () => {
  it('그 요일반의 다음 1주 회차 날짜', () => {
    const data = createSeedAppData();
    const date = nextWeek1Date(data, 2, '2026-11-05');
    expect(date).not.toBeNull();
    const day = scheduleFor(data, { from: date!, to: date! }).days[0];
    expect(day.weekday).toBe(2);
    expect(day.session?.weekNo).toBe(1);
    expect(date! > '2026-11-05').toBe(true);
  });
});

describe('가져오기 값 읽기', () => {
  it('시간', () => {
    expect(parseTime('16:30')).toBe('16:30');
    expect(parseTime('4:30')).toBe('16:30');
    expect(parseTime('1630')).toBe('16:30');
    expect(parseTime('오후 5:40')).toBe('17:40');
    expect(parseTime('16:35')).toBeNull();
  });
  it('학년', () => {
    expect(parseGrade('7세')).toBe(6);
    expect(parseGrade('초2')).toBe(8);
    expect(parseGrade('2학년')).toBe(8);
    expect(parseGrade('')).toBeNull();
  });
});

const SAMPLE = `\\xEF\\xBB\\xBF요일,시작시간,반학년,이름,상태,확인필요,메모
월,15:30,초2,가가,재원,,반 메모: 메모1
월,15:30,,나나,재원,,
화,17:30,,다다,재원,Y,학생 메모
,,,라라,재원,Y,반 전체 X
수,17:30,,마마,재원,,반 메모: 학년 미기재
월,15:30,초2,가가,재원,,`;

describe('가져오기 (SPEC 5.1)', () => {
  const today = '2026-11-05';
  const table = parseTable(SAMPLE);

  it('깨진 BOM 글자를 지우고 열을 자동 매칭', () => {
    expect(autoMap(table[0])).toEqual(['weekday', 'startTime', 'classGrade', 'name', 'status', 'needsReview', 'memo']);
  });

  it('반은 요일+시간으로 묶어 새로 만들고, 같은 반 다른 줄의 학년을 쓴다', () => {
    const plan = buildImportPlan(table, autoMap(table[0]), emptyRoster(), today, 2026);
    expect(plan.newClasses).toHaveLength(3);
    const mon = plan.newClasses.find((c) => c.key === '1|15:30')!;
    expect(mon.row.gradeCode).toBe(8);
    expect(plan.newClasses.find((c) => c.key === '3|17:30')!.row.gradeCode).toBeNull();
    expect(plan.rows).toHaveLength(6);
    expect(plan.rows.filter((r) => r.duplicate).map((r) => r.line)).toEqual([7]);
    expect(plan.rows.find((r) => r.student.name === '다다')!.student.notice).toBe('학생 메모');
    // 반학년이 빈 줄도 같은 반의 학년을 따른다
    expect(plan.rows.find((r) => r.student.name === '나나')!.student.gradeCode).toBe(8);
    expect(plan.rows.find((r) => r.student.name === '라라')!.classKey).toBeNull();
  });

  it('가져오기 실행: 반 메모, 배정, 확인 필요', () => {
    const plan = buildImportPlan(table, autoMap(table[0]), emptyRoster(), today, 2026);
    const r = applyChange(emptyRoster(), planToChange(plan, new Set([7]), emptyRoster(), today));
    expect(r.classes).toHaveLength(3);
    expect(r.students).toHaveLength(5);
    expect(r.enrollments).toHaveLength(4);
    expect(r.students.filter((s) => s.needsReview)).toHaveLength(2);
    expect(r.classes.find((c) => c.weekday === 1)!.memo).toBe('메모1');
  });

  it('이미 있는 반(같은 요일·시간)에는 새 반을 만들지 않는다', () => {
    const existing = { ...emptyRoster(), classes: [cls('x', 1, '15:30')] };
    const plan = buildImportPlan(table, autoMap(table[0]), existing, today, 2026);
    expect(plan.newClasses.map((c) => c.key)).not.toContain('1|15:30');
    expect(plan.rows[0].classKey).toBe('x');
  });

  it('카톡검색어 열: 새 학생은 그대로, 이름이 같아 건너뛴 기존 학생은 카톡 검색어만 채운다', () => {
    const existing = { ...emptyRoster(), students: [{ ...blankStudent('가나', today), id: 'old' }] };
    const t = parseTable('이름,카톡검색어\n가나,가나 7세\n다라,다라맘');
    const plan = buildImportPlan(t, autoMap(t[0]), existing, today, 2026);
    const skip = new Set(plan.rows.filter((r) => r.duplicate).map((r) => r.line));
    const students = planToChange(plan, skip, existing, today).upsert!.students!;
    expect(students.map((s) => [s.name, s.kakaoSearch, s.id === 'old'])).toEqual([
      ['다라', '다라맘', false],
      ['가나', '가나 7세', true],
    ]);
  });

  // 실제 초기 명단(이 PC에만 있음, git 제외). 완료 기준: 반 14개, 학생 55명, 확인 필요 9명
  const ROSTER_FILE = 'data/initial_roster.csv';
  it.skipIf(!existsSync(ROSTER_FILE))('초기 명단: 반 14개, 학생 55명, 확인 필요 9명', () => {
    const t = parseTable(readFileSync(ROSTER_FILE, 'utf8'));
    const plan = buildImportPlan(t, autoMap(t[0]), emptyRoster(), today, 2026);
    const r = applyChange(emptyRoster(), planToChange(plan, new Set(), emptyRoster(), today));
    expect(r.classes).toHaveLength(14);
    expect(r.students).toHaveLength(55);
    expect(r.students.filter((s) => s.needsReview)).toHaveLength(9);
  });
});
