// 2단계 데이터(반·학생·대기자·체험·결석). SPEC_students.md 10장 테이블과 1:1로 대응한다.
// 1단계(AppData)와 달리 행 단위로 저장한다(학생이 많아지고, 두 사람이 동시에 다른 학생을 고쳐도 덮어쓰지 않게).
// 비어 있는 값은 null(= DB의 null).
import type { Weekday } from '../engine/types.ts';

/** SPEC 2.1의 n: 4=5세, 5=6세, 6=7세, 7=초1 … 10=초4 */
export type GradeCode = number;

export interface ClassRow {
  id: string;
  weekday: Weekday;
  /** 'HH:MM' 24시간제, 10분 단위 */
  startTime: string;
  gradeCode: GradeCode;
  gradeBasisYear: number;
  alias: string | null;
  openedOn: string | null;
  /** 폐반일. 이 날부터 운영하지 않는다 */
  closedOn: string | null;
  memo: string | null;
}

export type GuardianRelation = 'mom' | 'dad' | 'other';

export interface Guardian {
  name: string;
  relation: GuardianRelation;
  /** 숫자만 */
  phone: string;
  isPrimary: boolean;
}

/** { 요일번호: 'HH:MM'(그 시각 이후 가능) 또는 null(아무 때나) }. 없는 요일은 불가 */
export type Availability = Partial<Record<Weekday, string | null>>;

export type StudentStatus = 'active' | 'paused' | 'left';

export interface StudentRow {
  id: string;
  name: string;
  gender: 'M' | 'F' | null;
  birthday: string | null;
  /** 생일이 없을 때 입력한 학년과 그 학년도 */
  gradeCode: GradeCode | null;
  gradeBasisYear: number | null;
  /** 조기입학 +1, 유예 -1 */
  gradeAdjust: number;
  school: string | null;
  studentPhone: string | null;
  guardians: Guardian[];
  address: string | null;
  registeredOn: string | null;
  firstClassOn: string | null;
  status: StudentStatus;
  /** 휴원 시작 / 퇴원일 */
  statusFrom: string | null;
  /** 휴원 종료 */
  statusTo: string | null;
  leaveReason: string | null;
  availability: Availability;
  /** 특이사항(카드 맨 위 고정 메모) */
  notice: string | null;
  needsReview: boolean;
}

/** 한 쌍을 한 줄로. studentId < siblingId */
export interface SiblingRow {
  studentId: string;
  siblingId: string;
}

export interface EnrollmentRow {
  id: string;
  studentId: string;
  classId: string;
  startDate: string;
  /** 마지막 날(포함). null이면 진행 중 */
  endDate: string | null;
}

export type CounselingType = 'new' | 'regular' | 'parent' | 'move' | 'other';

export interface CounselingNoteRow {
  id: string;
  studentId: string;
  date: string;
  type: CounselingType;
  content: string;
  nextContactOn: string | null;
}

export type WaitlistStage = 'inquiry' | 'trial_booked' | 'trial_done' | 'enrolled' | 'dropped';
export type WaitlistSource = 'referral' | 'blog' | 'flyer' | 'other';

export interface WaitlistGuardian {
  name: string;
  relation: GuardianRelation;
  phone: string;
}

export interface WaitlistRow {
  id: string;
  name: string;
  gradeCode: GradeCode | null;
  gradeBasisYear: number | null;
  birthday: string | null;
  guardian: WaitlistGuardian | null;
  wish: Availability;
  inquiredOn: string | null;
  source: WaitlistSource | null;
  stage: WaitlistStage;
  stageHistory: { stage: WaitlistStage; date: string }[];
  memo: string | null;
  studentId: string | null;
}

export interface TrialLessonRow {
  id: string;
  date: string;
  classId: string | null;
  waitlistId: string | null;
  /** 대기자에 연결하지 않았을 때 이름 */
  name: string;
  memo: string | null;
}

export interface AbsenceRow {
  date: string;
  classId: string;
  studentId: string;
}

export interface RosterData {
  classes: ClassRow[];
  students: StudentRow[];
  siblings: SiblingRow[];
  enrollments: EnrollmentRow[];
  counselingNotes: CounselingNoteRow[];
  waitlist: WaitlistRow[];
  trialLessons: TrialLessonRow[];
  absences: AbsenceRow[];
}

export type RosterKey = keyof RosterData;

/** 저장 순서(참조되는 쪽 먼저). 삭제는 이 순서의 반대로 한다 */
export const ROSTER_KEYS: RosterKey[] = [
  'classes',
  'students',
  'siblings',
  'enrollments',
  'counselingNotes',
  'waitlist',
  'trialLessons',
  'absences',
];

export const emptyRoster = (): RosterData => ({
  classes: [],
  students: [],
  siblings: [],
  enrollments: [],
  counselingNotes: [],
  waitlist: [],
  trialLessons: [],
  absences: [],
});

type RowOf<K extends RosterKey> = RosterData[K][number];

/** 행 하나를 가리키는 키 */
export function rowKey<K extends RosterKey>(key: K, row: RowOf<K>): string {
  switch (key) {
    case 'siblings': {
      const r = row as SiblingRow;
      return `${r.studentId}|${r.siblingId}`;
    }
    case 'absences': {
      const r = row as AbsenceRow;
      return `${r.date}|${r.classId}|${r.studentId}`;
    }
    default:
      return (row as { id: string }).id;
  }
}

/** 한 번에 저장할 변경 묶음. upsert = 추가 또는 고치기 */
export interface RosterChange {
  upsert?: Partial<{ [K in RosterKey]: RosterData[K] }>;
  remove?: Partial<{ [K in RosterKey]: RosterData[K] }>;
}

/** 변경을 메모리의 데이터에 적용한다(화면 즉시 반영용, 저장소 구현도 같이 쓴다) */
export function applyChange(data: RosterData, change: RosterChange): RosterData {
  const next: RosterData = { ...data };
  for (const key of ROSTER_KEYS) {
    const ups = change.upsert?.[key] as RowOf<typeof key>[] | undefined;
    const rems = change.remove?.[key] as RowOf<typeof key>[] | undefined;
    if (!ups?.length && !rems?.length) continue;
    const list = [...(data[key] as RowOf<typeof key>[])];
    const index = new Map(list.map((r, i) => [rowKey(key, r), i]));
    const removed = new Set((rems ?? []).map((r) => rowKey(key, r)));
    for (const r of ups ?? []) {
      const k = rowKey(key, r);
      const i = index.get(k);
      if (i === undefined) {
        index.set(k, list.length);
        list.push(r);
      } else list[i] = r;
    }
    (next as unknown as Record<RosterKey, unknown[]>)[key] = list.filter((r) => !removed.has(rowKey(key, r)));
  }
  return next;
}

export const newId = () => crypto.randomUUID();
