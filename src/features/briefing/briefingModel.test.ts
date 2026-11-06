import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRICULUM } from '../../engine/curriculum.ts';
import type { DayCell } from '../../engine/types.ts';
import { emptyRoster, type ClassRow, type RosterData } from '../../storage/rosterTypes.ts';
import { blankStudent } from '../roster/students/studentModel.ts';
import { basicCode } from './basicModel.ts';
import { cancelSent, classBriefing, defaultClass, kakaoSearchOf, progressCount, recipients, recordSent } from './briefingModel.ts';

const cls = (id: string, startTime: string, weekday: 1 | 2 | 3 | 4 | 5 = 2): ClassRow => ({
  id,
  weekday,
  startTime,
  gradeCode: 6,
  gradeBasisYear: 2026,
  alias: null,
  openedOn: null,
  closedOn: null,
  memo: null,
});
const DATE = '2027-01-05'; // 화요일
const cell = (session: DayCell['session'] | undefined, status: DayCell['status'] = 'session'): DayCell => ({ date: DATE, weekday: 2, status, session, events: [] });
const s = (id: string, name: string) => ({ ...blankStudent(name, '2026-11-01'), id });

function base(): RosterData {
  return {
    ...emptyRoster(),
    classes: [cls('c1', '15:30'), cls('c2', '16:30')],
    students: [s('a', '가'), s('b', '나'), s('c', '다'), s('d', '라')],
    enrollments: [
      { id: 'e1', studentId: 'a', classId: 'c1', startDate: '2026-11-01', endDate: null },
      { id: 'e2', studentId: 'b', classId: 'c1', startDate: '2026-11-01', endDate: null },
      { id: 'e3', studentId: 'c', classId: 'c1', startDate: '2026-11-01', endDate: null },
      { id: 'e4', studentId: 'd', classId: 'c2', startDate: '2026-11-01', endDate: null },
    ],
    absences: [{ date: DATE, classId: 'c1', studentId: 'b' }],
    progressAnchors: [{ id: 'p', classId: 'c1', courseMonth: '2026-12', stage: 'P', unit: 8, memo: null }],
    briefingTexts: [{ code: 'P9-3', text: '문구\n둘째 줄' }],
  };
}

describe('기본 선택 반', () => {
  const classes = [cls('c1', '14:30'), cls('c2', '15:30'), cls('c3', '16:30')];
  it('지금 시각 기준 가장 최근에 끝난 반, 없으면 첫 반', () => {
    expect(defaultClass(classes, 16 * 60 + 30)?.id).toBe('c2'); // 15:30반이 16:20에 끝남
    expect(defaultClass(classes, 15 * 60 + 19)?.id).toBe('c1'); // 14:30반이 15:20에 끝나기 전 → 아직 없음 → 첫 반
    expect(defaultClass(classes, 23 * 60)?.id).toBe('c3');
    expect(defaultClass(classes, null)?.id).toBe('c1');
    expect(defaultClass([], 0)).toBeNull();
  });
});

describe('오늘 코드와 문구', () => {
  it('코드가 있으면 저장소 문구(줄바꿈 그대로)', () => {
    const b = classBriefing(base(), cls('c1', '15:30'), cell({ courseMonth: '2027-01', weekNo: 3, pinned: false, confirmed: false }), DEFAULT_CURRICULUM);
    expect(b).toMatchObject({ code: 'P9-3', text: '문구\n둘째 줄' });
  });
  it('문구가 없으면 text null, 진도 미설정이면 code null, 공휴일은 noSession', () => {
    const r = base();
    expect(classBriefing(r, cls('c1', '15:30'), cell({ courseMonth: '2027-02', weekNo: 1, pinned: false, confirmed: false }), DEFAULT_CURRICULUM)).toMatchObject({ code: 'P10-1', text: null });
    expect(classBriefing(r, cls('c2', '16:30'), cell({ courseMonth: '2027-01', weekNo: 3, pinned: false, confirmed: false }), DEFAULT_CURRICULUM)).toMatchObject({ result: { kind: 'unset' }, code: null });
    expect(classBriefing(r, cls('c1', '15:30'), cell(undefined, 'holiday'), DEFAULT_CURRICULUM).result.kind).toBe('noSession');
  });
  it('베이직: 그 날짜 계획의 문구, 기록 코드는 "베이직 · 제목"', () => {
    const r = { ...base(), progressAnchors: [{ id: 'p', classId: 'c1', courseMonth: '2026-12', stage: 'basic' as const, unit: null, memo: null }] };
    r.basicLessons = [{ id: 'x', classId: 'c1', date: DATE, title: '모양 놀이', text: '오늘은 모양 놀이' }];
    const b = classBriefing(r, cls('c1', '15:30'), cell({ courseMonth: '2027-01', weekNo: 3, pinned: false, confirmed: false }), DEFAULT_CURRICULUM);
    expect(b).toMatchObject({ code: '베이직 · 모양 놀이', text: '오늘은 모양 놀이' });
    expect(basicCode(null)).toBe('베이직');
  });
});

describe('아이 목록', () => {
  it('명단 − 결석(맨 아래), 추가한 아이, 이미 받은 다른 반 아이도 다시 보인다', () => {
    const r = base();
    const list = recipients(r, 'c1', DATE, ['d'], ['c1', 'c2']);
    expect(list.map((x) => [x.student.id, x.absent, x.guest])).toEqual([
      ['a', false, false],
      ['c', false, false],
      ['d', false, true],
      ['b', true, false],
    ]);
    // 화면을 새로 열어도(guestIds 없음) 이 반으로 브리핑 받은 다른 반 아이는 남는다
    r.briefings = [{ id: 'x', date: DATE, classId: 'c1', studentId: 'd', code: 'P9-3', textSnapshot: 't', sharedAt: '2027-01-05T08:00:00Z' }];
    expect(recipients(r, 'c1', DATE, [], ['c1', 'c2']).find((x) => x.student.id === 'd')).toMatchObject({ guest: true, sent: { id: 'x' } });
    expect(progressCount(recipients(r, 'c1', DATE, [], ['c1', 'c2']))).toEqual({ sent: 1, total: 3 });
  });
  it('같은 날 수업 오는 형제가 있으면 형제 표시(결석한 형제는 제외)', () => {
    const r = { ...base(), siblings: [{ studentId: 'a', siblingId: 'd' }, { studentId: 'b', siblingId: 'c' }] };
    const list = recipients(r, 'c1', DATE, [], ['c1', 'c2']);
    expect(Object.fromEntries(list.map((x) => [x.student.id, x.sibling]))).toEqual({ a: true, c: false, b: true });
  });
});

describe('보낸 기록', () => {
  it('보냄 기록: 같은 날·반·아이 기록이 있으면 그 행을 고친다, 취소는 삭제', () => {
    const r = base();
    const first = recordSent(r, DATE, 'c1', 'a', 'P9-3', '문구', '2027-01-05T08:00:00Z').upsert!.briefings![0];
    expect(first).toMatchObject({ date: DATE, classId: 'c1', studentId: 'a', code: 'P9-3', textSnapshot: '문구' });
    r.briefings = [first];
    expect(recordSent(r, DATE, 'c1', 'a', 'P9-3', '바뀐 문구', '2027-01-05T09:00:00Z').upsert!.briefings![0].id).toBe(first.id);
    expect(cancelSent(first)).toEqual({ remove: { briefings: [first] } });
  });
  it('카톡 검색어: 비우면 이름', () => {
    expect(kakaoSearchOf({ ...s('a', '홍길동'), kakaoSearch: '  ' })).toBe('홍길동');
    expect(kakaoSearchOf({ ...s('a', '홍길동'), kakaoSearch: '길동맘' })).toBe('길동맘');
  });
});
