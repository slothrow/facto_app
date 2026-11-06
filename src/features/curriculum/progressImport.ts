// 반 진도 일괄 입력(SPEC_briefing 3.5). 순수 함수.
// 열: 요일, 시작시간, 수업월, 단계, 단원 (그 밖의 열은 무시). 요일+시작시간으로 운영 중인 반을 찾는다.
import { isClassOpenOn, toMinutes } from '../../engine/classTime.ts';
import { STAGE_NAMES, UNITS_PER_STAGE, stageFromText, type CurriculumSettings, type StageId } from '../../engine/curriculum.ts';
import { newId, type ClassRow, type ProgressAnchorRow, type RosterChange, type RosterData } from '../../storage/rosterTypes.ts';
import { WEEKDAY_NAMES, classGradeLabel, compareClasses } from '../roster/rosterModel.ts';
import { parseTable, parseTime, parseWeekday } from '../roster/students/importModel.ts';

type Col = 'weekday' | 'startTime' | 'courseMonth' | 'stage' | 'unit';
const HEADERS: Record<Col, string[]> = {
  weekday: ['요일'],
  startTime: ['시작시간', '시간', '시작'],
  courseMonth: ['수업월'],
  stage: ['단계'],
  unit: ['단원'],
};
const ORDER: Col[] = ['weekday', 'startTime', 'courseMonth', 'stage', 'unit'];
const norm = (s: string) => s.replace(/﻿/g, '').replace(/\s/g, '');

export interface ProgressImportRow {
  line: number;
  /** 원래 줄(미리보기용) */
  raw: string[];
  cls: ClassRow | null;
  courseMonth: string | null;
  stage: StageId | null;
  unit: number | null;
  /** 저장 안 하는 이유 */
  error: string | null;
  /** 참고 안내(예: 15:30 → 15:40반으로 맞춤) */
  note: string | null;
  /** 같은 반·수업월 기준점이 이미 있으면 그 행(바꿈) */
  existing: ProgressAnchorRow | null;
}

/** '2026-12', '2026.12', '2026/12', '202612', '2026-12-01' → '2026-12' */
export function parseCourseMonth(s: string): string | null {
  const m = s.trim().match(/^(\d{4})\s*[-./년]?\s*(\d{1,2})/);
  if (!m) return null;
  const mon = Number(m[2]);
  if (mon < 1 || mon > 12) return null;
  return `${m[1]}-${String(mon).padStart(2, '0')}`;
}

/** 요일+시작시간으로 운영 중인 반. 딱 맞는 반이 없으면 같은 요일 ±10분 안의 반 하나(예: 금 15:30 → 15:40반) */
function findClass(classes: ClassRow[], weekday: number, time: string, date: string): { cls: ClassRow | null; note: string | null } {
  const open = classes.filter((c) => c.weekday === weekday && isClassOpenOn(c, date));
  const exact = open.find((c) => c.startTime === time);
  if (exact) return { cls: exact, note: null };
  const near = open.filter((c) => Math.abs(toMinutes(c.startTime) - toMinutes(time)) <= 10);
  if (near.length === 1) return { cls: near[0], note: `${time} → ${near[0].startTime}반으로 맞춤` };
  return { cls: null, note: null };
}

export function buildProgressImport(
  text: string,
  roster: Pick<RosterData, 'classes' | 'progressAnchors'>,
  settings: CurriculumSettings,
  today: string,
): ProgressImportRow[] {
  const table = parseTable(text);
  if (table.length === 0) return [];
  // 머리글이 있으면 이름으로 열을 찾고, 없으면 요일·시작시간·수업월·단계·단원 순서로 본다
  const header = table[0].map(norm);
  const hasHeader = header.some((h) => Object.values(HEADERS).some((names) => names.includes(h)));
  const index: Record<Col, number> = { weekday: 0, startTime: 1, courseMonth: 2, stage: 3, unit: 4 };
  if (hasHeader) for (const c of ORDER) index[c] = header.findIndex((h) => HEADERS[c].includes(h));
  const body = hasHeader ? table.slice(1) : table;

  const rows: ProgressImportRow[] = [];
  const seen = new Set<string>();
  body.forEach((r, i) => {
    const get = (c: Col) => (index[c] >= 0 ? (r[index[c]] ?? '').trim() : '');
    // 단계가 빈 줄은 양식에서 아직 안 채운 줄 → 조용히 건너뛴다
    if (!get('stage') && !get('unit')) return;
    const row: ProgressImportRow = {
      line: i + (hasHeader ? 2 : 1),
      raw: r,
      cls: null,
      courseMonth: null,
      stage: null,
      unit: null,
      error: null,
      note: null,
      existing: null,
    };
    const fail = (msg: string) => rows.push({ ...row, error: msg });

    const wd = parseWeekday(get('weekday'));
    if (!wd) return fail('요일을 읽을 수 없어요');
    const time = parseTime(get('startTime'));
    if (!time) return fail('시작시간을 읽을 수 없어요');
    const found = findClass(roster.classes, wd, time, today);
    if (!found.cls) return fail(`운영 중인 ${WEEKDAY_NAMES[wd]} ${time}반이 없어요`);
    row.cls = found.cls;
    row.note = found.note;
    row.courseMonth = parseCourseMonth(get('courseMonth'));
    if (!row.courseMonth) return fail('수업월을 읽을 수 없어요(예: 2026-12)');
    row.stage = stageFromText(get('stage'), settings);
    if (!row.stage) return fail('단계를 읽을 수 없어요(베이직, K, P, A, B, S)');
    if (row.stage !== 'basic') {
      const u = Number(get('unit'));
      if (!Number.isInteger(u) || u < 1 || u > UNITS_PER_STAGE) return fail('단원은 1~12');
      row.unit = u;
    }
    const key = `${row.cls.id}|${row.courseMonth}`;
    if (seen.has(key)) return fail('같은 반·수업월이 위에 이미 있어요');
    seen.add(key);
    row.existing = roster.progressAnchors.find((a) => a.classId === row.cls!.id && a.courseMonth === row.courseMonth) ?? null;
    rows.push(row);
  });
  return rows;
}

export function progressImportChange(rows: ProgressImportRow[]): RosterChange {
  const anchors: ProgressAnchorRow[] = rows
    .filter((r) => !r.error && r.cls && r.courseMonth && r.stage)
    .map((r) => ({
      id: r.existing?.id ?? newId(),
      classId: r.cls!.id,
      courseMonth: r.courseMonth!,
      stage: r.stage!,
      unit: r.stage === 'basic' ? null : r.unit,
      memo: r.existing?.memo ?? null,
    }));
  return { upsert: { progressAnchors: anchors } };
}

export const stageText = (stage: StageId, unit: number | null, settings: CurriculumSettings) =>
  stage === 'basic' ? STAGE_NAMES.basic : `${settings[stage].prefix}${unit ?? ''}`;

/** [양식 내려받기]: 운영 중인 반 목록이 채워진 CSV. 단계·단원은 빈칸(엑셀에서 한글이 안 깨지게 BOM) */
export function progressTemplateCsv(classes: ClassRow[], today: string, courseMonthOf: (cls: ClassRow) => string): string {
  const lines = [['요일', '시작시간', '반학년(참고)', '수업월', '단계', '단원']];
  for (const c of classes.filter((x) => isClassOpenOn(x, today)).sort(compareClasses)) {
    lines.push([WEEKDAY_NAMES[c.weekday], c.startTime, c.gradeCode === null ? '' : classGradeLabel(c, today), courseMonthOf(c), '', '']);
  }
  return '﻿' + lines.map((l) => l.join(',')).join('\r\n') + '\r\n';
}
