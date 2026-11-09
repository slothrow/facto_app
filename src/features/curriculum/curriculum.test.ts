import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRICULUM } from '../../engine/curriculum.ts';
import { emptyRoster, type ClassRow, type RosterData } from '../../storage/rosterTypes.ts';
import { buildProgressImport, parseCourseMonth, progressImportChange, progressTemplateCsv } from './progressImport.ts';

const cls = (id: string, weekday: 1 | 2 | 3 | 4 | 5, startTime: string, gradeCode: number | null = 6): ClassRow => ({
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
const roster = (): RosterData => ({
  ...emptyRoster(),
  classes: [cls('tue', 2, '16:30', 9), cls('fri', 5, '15:40', 7), cls('mon', 1, '17:30'), { ...cls('old', 3, '15:30'), closedOn: '2026-10-01' }],
});
const TODAY = '2026-11-07';

describe('진도 일괄 입력(3.5)', () => {
  it('양식 그대로 붙여넣기: 다른 열 무시, 빈 단계 줄은 건너뜀, 금 15:30은 15:40반으로 맞춤', () => {
    const text = [
      '﻿요일,시작시간,반학년(참고),수업월,단계,단원',
      '화,16:30,초3,2026-12,P,8',
      '금,15:30,,2026-12,a,3',
      '월,17:30,7세,2026-12,,',
    ].join('\n');
    const rows = buildProgressImport(text, roster(), DEFAULT_CURRICULUM, TODAY);
    expect(rows.map((r) => [r.cls?.id, r.courseMonth, r.stage, r.unit, r.error])).toEqual([
      ['tue', '2026-12', 'P', 8, null],
      ['fri', '2026-12', 'A', 3, null],
    ]);
    expect(rows[1].note).toContain('15:40');
  });

  it('엑셀 붙여넣기(탭), 머리글 없이 순서대로, 베이직은 단원 없이', () => {
    const rows = buildProgressImport('월\t5:30\t2026.11\t베이직\t', roster(), DEFAULT_CURRICULUM, TODAY);
    expect(rows[0]).toMatchObject({ cls: { id: 'mon' }, courseMonth: '2026-11', stage: 'basic', unit: null, error: null });
  });

  it('주차: 단원 칸 "3-2" 또는 주차 열, 틀린 주차는 오류', () => {
    const text = ['요일,시작시간,수업월,단계,단원,주차', '화,16:30,2026-12,B,3-2,', '금,15:40,2026-12,B,1,3', '월,17:30,2026-12,B,1,5'].join('\n');
    const rows = buildProgressImport(text, roster(), DEFAULT_CURRICULUM, TODAY);
    expect(rows.map((r) => [r.unit, r.unitWeek, r.error === null])).toEqual([
      [3, 2, true],
      [1, 3, true],
      [1, 1, false],
    ]);
    expect(progressImportChange(rows).upsert?.progressAnchors?.map((x) => x.unitWeek)).toEqual([2, 3]);
  });

  it('못 찾는 반·폐반·잘못된 값은 오류 줄로 표시하고 저장하지 않음', () => {
    const text = ['요일,시작시간,수업월,단계,단원', '목,16:30,2026-12,P,1', '수,15:30,2026-12,P,1', '화,16:30,2026-13,P,1', '화,16:30,2026-12,Z,1', '화,16:30,2026-12,P,13'].join('\n');
    const rows = buildProgressImport(text, roster(), DEFAULT_CURRICULUM, TODAY);
    expect(rows.map((r) => r.error !== null)).toEqual([true, true, true, true, true]);
    expect(rows[0].line).toBe(2);
    expect(progressImportChange(rows).upsert?.progressAnchors).toEqual([]);
  });

  it('같은 반·수업월 기준점이 이미 있으면 그 행을 바꾼다(같은 id)', () => {
    const r = { ...roster(), progressAnchors: [{ id: 'a1', classId: 'tue', courseMonth: '2026-12', stage: 'P' as const, unit: 2, memo: '메모' }] };
    const rows = buildProgressImport('화,16:30,2026-12,P,8', r, DEFAULT_CURRICULUM, TODAY);
    expect(rows[0].existing?.id).toBe('a1');
    expect(progressImportChange(rows).upsert?.progressAnchors).toEqual([
      { id: 'a1', classId: 'tue', courseMonth: '2026-12', stage: 'P', unit: 8, unitWeek: 1, memo: '메모' },
    ]);
  });

  it('수업월 읽기', () => {
    expect(parseCourseMonth('2026-12')).toBe('2026-12');
    expect(parseCourseMonth('2026/1')).toBe('2026-01');
    expect(parseCourseMonth('202612')).toBe('2026-12');
    expect(parseCourseMonth('2026-13')).toBeNull();
  });

  it('양식 CSV: 운영 중인 반만, 요일·시간 순, 단계·단원 빈칸', () => {
    const csv = progressTemplateCsv(roster().classes, TODAY, () => '2026-12');
    expect(csv.replace('﻿', '').trim().split('\r\n')).toEqual([
      '요일,시작시간,반학년(참고),수업월,단계,단원',
      '월,17:30,7세,2026-12,,',
      '화,16:30,초3,2026-12,,',
      '금,15:40,초1,2026-12,,',
    ]);
  });
});
