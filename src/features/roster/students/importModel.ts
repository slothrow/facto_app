// 엑셀/CSV 붙여넣기 가져오기. SPEC_students 5.1. 순수 함수.
// 흐름: 텍스트 → 표(parseTable) → 열 매칭(autoMap) → 미리보기(buildImportPlan) → 저장할 변경(planToChange)
import { toMinutes } from '../../../engine/classTime.ts';
import { gradeOptions, gradeToStore } from '../../../engine/grade.ts';
import type { Weekday } from '../../../engine/types.ts';
import {
  newId,
  type ClassRow,
  type EnrollmentRow,
  type Guardian,
  type GuardianRelation,
  type RosterChange,
  type RosterData,
  type StudentRow,
} from '../../../storage/rosterTypes.ts';
import { isClassActive } from '../../../engine/classTime.ts';
import { WEEKDAY_NAMES } from '../rosterModel.ts';
import { blankStudent, digitsOnly } from './studentModel.ts';

export type ImportField =
  | 'name'
  | 'grade'
  | 'birthday'
  | 'gender'
  | 'school'
  | 'g1Relation'
  | 'g1Phone'
  | 'g2Relation'
  | 'g2Phone'
  | 'address'
  | 'registeredOn'
  | 'weekday'
  | 'startTime'
  | 'classGrade'
  | 'status'
  | 'memo'
  | 'needsReview'
  | 'kakaoSearch';

/** 자동 매칭되는 열 이름(SPEC 5.1) */
export const FIELD_LABEL: Record<ImportField, string> = {
  name: '이름',
  grade: '학년',
  birthday: '생일',
  gender: '성별',
  school: '학교',
  g1Relation: '학부모1 관계',
  g1Phone: '학부모1 연락처',
  g2Relation: '학부모2 관계',
  g2Phone: '학부모2 연락처',
  address: '주소',
  registeredOn: '등록일',
  weekday: '요일',
  startTime: '시작시간',
  classGrade: '반학년',
  status: '상태',
  memo: '메모',
  needsReview: '확인필요',
  kakaoSearch: '카톡검색어',
};

export const IMPORT_FIELDS = Object.keys(FIELD_LABEL) as ImportField[];

// ---------------------------------------------------------------
// 표 읽기
// ---------------------------------------------------------------

/** 엑셀에서 복사(탭 구분) 또는 CSV(쉼표 구분, 따옴표 지원) */
export function parseTable(text: string): string[][] {
  const clean = text.replace(/^(﻿|\\xEF\\xBB\\xBF)/, '').replace(/\r\n?/g, '\n');
  const firstLine = clean.split('\n', 1)[0] ?? '';
  const delim = firstLine.includes('\t') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ''));
}

const normHeader = (h: string) => h.replace(/^(﻿|\\xEF\\xBB\\xBF)/, '').replace(/\s/g, '');

/** 열 번호별 필드. 매칭 안 되면 null */
export function autoMap(header: string[]): (ImportField | null)[] {
  const used = new Set<ImportField>();
  return header.map((h) => {
    const n = normHeader(h);
    const f = IMPORT_FIELDS.find((k) => !used.has(k) && normHeader(FIELD_LABEL[k]) === n) ?? null;
    if (f) used.add(f);
    return f;
  });
}

// ---------------------------------------------------------------
// 값 읽기
// ---------------------------------------------------------------

export function parseWeekday(s: string): Weekday | null {
  const i = WEEKDAY_NAMES.indexOf(s.trim().charAt(0));
  return i >= 1 && i <= 5 ? (i as Weekday) : null;
}

/** '16:30', '4:30'(오후로 봄), '1630', '오후 4:30' → 'HH:MM'. 10분 단위가 아니면 null */
export function parseTime(s: string): string | null {
  const t = s.trim();
  const pm = /오후|pm/i.test(t);
  const m = t.replace(/오전|오후|am|pm/gi, '').trim().match(/^(\d{1,2})[:시.]?\s*(\d{2})?분?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? '0');
  if ((pm || h < 9) && h < 12) h += 12; // 공부방 수업은 오후 → "4:30"은 16:30
  if (h > 23 || min > 59 || min % 10 !== 0) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export function parseGrade(s: string): number | null {
  const t = s.replace(/\s|반/g, '');
  if (!t) return null;
  const hit = gradeOptions().find((g) => g.label === t);
  if (hit) return hit.code;
  const m = t.match(/^(?:초등?)?(\d)학년$/) ?? t.match(/^초(\d)$/);
  if (m) return 6 + Number(m[1]);
  const age = t.match(/^(\d)세$/);
  if (age) return Number(age[1]) - 1;
  return null;
}

/** 'YYYY-MM-DD', 'YYYY.MM.DD', 'YYYY/M/D', 'YYYYMMDD' */
export function parseDate(s: string): string | null {
  const t = s.trim();
  const m = t.match(/^(\d{4})[-./]\s*(\d{1,2})[-./]\s*(\d{1,2})\.?$/) ?? t.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function parseRelation(s: string): GuardianRelation {
  if (/엄마|모|어머|mom/i.test(s)) return 'mom';
  if (/아빠|부|아버|dad/i.test(s)) return 'dad';
  return 'other';
}

const parseYes = (s: string) => /^(y|yes|o|예|네|1|true|확인)$/i.test(s.trim());
const parseGender = (s: string): StudentRow['gender'] => (/^(남|m)/i.test(s.trim()) ? 'M' : /^(여|f)/i.test(s.trim()) ? 'F' : null);
const parseStatus = (s: string): StudentRow['status'] => (/휴원/.test(s) ? 'paused' : /퇴원/.test(s) ? 'left' : 'active');

const CLASS_MEMO_PREFIX = /^반\s*메모\s*[:：]\s*/;

// ---------------------------------------------------------------
// 미리보기
// ---------------------------------------------------------------

export interface ImportRow {
  line: number;
  student: StudentRow;
  /** 배정할 반(기존 반 id 또는 새로 만들 반 key) */
  classKey: string | null;
  /** 같은 이름이 이미 있거나, 붙여 넣은 표 안에서 겹침 */
  duplicate: boolean;
  problems: string[];
}

export interface NewClass {
  key: string;
  row: ClassRow;
}

export interface ImportPlan {
  rows: ImportRow[];
  /** 새로 만들 반 */
  newClasses: NewClass[];
  /** 기존 반에 붙는 반 메모 */
  classMemos: Map<string, string[]>;
}

const classKeyOf = (weekday: number, startTime: string) => `${weekday}|${startTime}`;

export function buildImportPlan(
  table: string[][],
  mapping: (ImportField | null)[],
  roster: RosterData,
  today: string,
  /** 반 학년의 기준 학년도(SPEC 5.2: 초기 명단은 2026) */
  classBasisYear: number,
): ImportPlan {
  const col = (f: ImportField) => mapping.indexOf(f);
  const get = (r: string[], f: ImportField) => (col(f) >= 0 ? (r[col(f)] ?? '').trim() : '');

  const existingClass = new Map<string, ClassRow>();
  for (const c of roster.classes) if (isClassActive(c, today)) existingClass.set(classKeyOf(c.weekday, c.startTime), c);
  const newClasses = new Map<string, NewClass>();
  const classMemos = new Map<string, string[]>();
  const existingNames = new Set(roster.students.map((s) => s.name.replace(/\s/g, '')));
  const seenNames = new Set<string>();

  const rows: ImportRow[] = [];
  table.slice(1).forEach((r, i) => {
    const name = get(r, 'name');
    const problems: string[] = [];
    if (!name) return; // 이름 없는 줄은 건너뜀

    // 반
    let classKey: string | null = null;
    const wdText = get(r, 'weekday');
    const timeText = get(r, 'startTime');
    const classGrade = parseGrade(get(r, 'classGrade'));
    if (wdText || timeText) {
      const wd = parseWeekday(wdText);
      const time = parseTime(timeText);
      if (!wd) problems.push(`요일을 읽을 수 없음(${wdText || '빈칸'})`);
      if (!time) problems.push(`시작시간을 읽을 수 없음(${timeText || '빈칸'})`);
      if (wd && time) {
        const key = classKeyOf(wd, time);
        const existing = existingClass.get(key);
        classKey = existing ? existing.id : key;
        if (!existing) {
          const nc = newClasses.get(key) ?? {
            key,
            row: {
              id: newId(),
              weekday: wd,
              startTime: time,
              gradeCode: null,
              gradeBasisYear: null,
              alias: null,
              openedOn: null,
              closedOn: null,
              memo: null,
            },
          };
          // 같은 반의 다른 줄에 학년이 적혀 있으면 그것을 쓴다
          if (classGrade !== null && nc.row.gradeCode === null) {
            nc.row = { ...nc.row, gradeCode: classGrade, gradeBasisYear: classBasisYear };
          }
          newClasses.set(key, nc);
        }
      }
    }

    // 메모: "반 메모:"로 시작하면 반 메모, 아니면 학생 특이사항
    const memo = get(r, 'memo');
    let notice: string | null = null;
    if (memo && CLASS_MEMO_PREFIX.test(memo) && classKey) {
      const list = classMemos.get(classKey) ?? [];
      const text = memo.replace(CLASS_MEMO_PREFIX, '');
      if (!list.includes(text)) list.push(text);
      classMemos.set(classKey, list);
    } else if (memo) notice = memo.replace(CLASS_MEMO_PREFIX, '');

    // 학생
    const s = blankStudent(name, today);
    // 학생 학년: 학년 열(오늘 기준) → 없으면 반학년(반 기준 학년도)
    const ownGrade = parseGrade(get(r, 'grade'));
    if (ownGrade !== null) Object.assign(s, gradeToStore(ownGrade, today));
    else if (classGrade !== null) Object.assign(s, { gradeCode: classGrade, gradeBasisYear: classBasisYear });
    const bd = get(r, 'birthday');
    if (bd) {
      s.birthday = parseDate(bd);
      if (!s.birthday) problems.push(`생일 형식 확인(${bd})`);
    }
    s.gender = parseGender(get(r, 'gender'));
    s.school = get(r, 'school') || null;
    s.kakaoSearch = get(r, 'kakaoSearch') || null;
    s.address = get(r, 'address') || null;
    const reg = get(r, 'registeredOn');
    if (reg) s.registeredOn = parseDate(reg) ?? today;
    s.status = parseStatus(get(r, 'status'));
    if (s.status === 'left') s.statusFrom = today;
    s.needsReview = parseYes(get(r, 'needsReview'));
    s.notice = notice;
    const guardians: Guardian[] = [];
    for (const [rel, phone] of [
      ['g1Relation', 'g1Phone'],
      ['g2Relation', 'g2Phone'],
    ] as const) {
      const p = digitsOnly(get(r, phone));
      if (p) guardians.push({ name: '', relation: parseRelation(get(r, rel)), phone: p, isPrimary: guardians.length === 0 });
    }
    s.guardians = guardians;
    // SPEC 12장: 사진에서 X 표시된 학생(반 없음)은 "반 미배정 + 확인 필요"
    if (!classKey && !s.needsReview && (wdText || timeText)) s.needsReview = true;

    const norm = name.replace(/\s/g, '');
    const duplicate = existingNames.has(norm) || seenNames.has(norm);
    seenNames.add(norm);
    rows.push({ line: i + 2, student: s, classKey, duplicate, problems });
  });

  // 학년이 빈 학생은 배정될 반의 학년을 따른다(같은 반 다른 줄에만 학년이 적힌 경우)
  for (const r of rows) {
    if (r.student.gradeCode !== null || r.student.birthday || !r.classKey) continue;
    const c = newClasses.get(r.classKey)?.row ?? roster.classes.find((x) => x.id === r.classKey);
    if (c && c.gradeCode !== null) r.student = { ...r.student, gradeCode: c.gradeCode, gradeBasisYear: c.gradeBasisYear };
  }

  return { rows, newClasses: [...newClasses.values()], classMemos };
}

/** 가져오기 실행용 변경. skip = 건너뛸 줄 번호 */
export function planToChange(plan: ImportPlan, skip: Set<number>, roster: RosterData, startDate: string): RosterChange {
  const rows = plan.rows.filter((r) => !skip.has(r.line));
  const usedKeys = new Set(rows.map((r) => r.classKey).filter(Boolean));
  const created = plan.newClasses.filter((c) => usedKeys.has(c.key) || plan.classMemos.has(c.key));
  const classIdOf = (key: string) => created.find((c) => c.key === key)?.row.id ?? key;

  const classes: ClassRow[] = created.map((c) => {
    const memos = plan.classMemos.get(c.key);
    return memos ? { ...c.row, memo: memos.join('\n') } : c.row;
  });
  // 기존 반에 붙는 반 메모
  for (const [key, memos] of plan.classMemos) {
    const existing = roster.classes.find((c) => c.id === key);
    if (!existing) continue;
    const add = memos.filter((m) => !(existing.memo ?? '').includes(m));
    if (add.length) classes.push({ ...existing, memo: [existing.memo, ...add].filter(Boolean).join('\n') });
  }

  const enrollments: EnrollmentRow[] = rows
    .filter((r) => r.classKey && r.student.status !== 'left')
    .map((r) => ({ id: newId(), studentId: r.student.id, classId: classIdOf(r.classKey!), startDate: startDate, endDate: null }));

  // 이미 있는 학생(이름이 같아 건너뛴 줄)은 카톡 검색어만 채운다. 같은 이름이 둘 이상이면 건드리지 않는다
  const kakaoUpdates: StudentRow[] = [];
  for (const r of plan.rows) {
    if (!skip.has(r.line) || !r.duplicate || !r.student.kakaoSearch) continue;
    const norm = r.student.name.replace(/s/g, '');
    const same = roster.students.filter((x) => x.name.replace(/s/g, '') === norm);
    if (same.length === 1 && same[0].kakaoSearch !== r.student.kakaoSearch) kakaoUpdates.push({ ...same[0], kakaoSearch: r.student.kakaoSearch });
  }

  return { upsert: { classes, students: [...rows.map((r) => r.student), ...kakaoUpdates], enrollments } };
}

export const sortTimes = (a: string, b: string) => toMinutes(a) - toMinutes(b);
