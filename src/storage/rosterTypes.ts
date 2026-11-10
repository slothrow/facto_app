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
  /** 비어 있으면 학년 미정 */
  gradeCode: GradeCode | null;
  gradeBasisYear: number | null;
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
  /** 카톡 대화방 검색어(예: "홍길동 7세"). 비우면 이름을 쓴다. 3단계에 생긴 칸이라 예전 데이터엔 없을 수 있다 */
  kakaoSearch?: string | null;
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
  /** 희망 시작 시기 'YYYY-MM'. 비우면 언제든. 5단계에 생긴 칸이라 예전 데이터엔 없을 수 있다 */
  wishStartMonth?: string | null;
}

export interface TrialLessonRow {
  id: string;
  date: string;
  classId: string | null;
  waitlistId: string | null;
  /** 대기자에 연결하지 않았을 때 이름 */
  name: string;
  memo: string | null;
  /** 시작 시간 'HH:MM'. 보통 정규수업 뒤 6:30 이후 */
  startTime: string | null;
  /** 대기자에 연결하지 않았을 때 학년 */
  gradeCode: GradeCode | null;
  gradeBasisYear: number | null;
}

/** 토요보강 예약: 보강데이 30분 타임 하나에 학생 1명 */
export interface MakeupBookingRow {
  id: string;
  studentId: string;
  date: string;
  startTime: string;
  memo: string | null;
}

export interface AbsenceRow {
  date: string;
  classId: string;
  studentId: string;
}

// ---------------------------------------------------------------
// 3단계: 교육과정 진도 + 브리핑 (SPEC_briefing.md 8장)
// ---------------------------------------------------------------

export type { StageId } from '../engine/curriculum.ts';
import type { StageId } from '../engine/curriculum.ts';

/** 반 진도 기준점: 이 수업월에 이 단계 몇 단원. 베이직은 단원 없음(null) */
export interface ProgressAnchorRow {
  id: string;
  classId: string;
  courseMonth: string;
  stage: StageId;
  unit: number | null;
  /** 그 수업월 1회차의 주차(1~4). B1-3이면 unit 1, unitWeek 3. 예전 데이터에는 없을 수 있다(=1) */
  unitWeek?: number;
  memo: string | null;
}

/** 베이직 수업 계획: (반, 날짜)별 제목·브리핑 문구 */
export interface BasicLessonRow {
  id: string;
  classId: string;
  date: string;
  title: string;
  text: string;
}

/** 브리핑 문구 저장소: 코드당 문구 1개 */
export interface BriefingTextRow {
  code: string;
  text: string;
}

/** 보낸 기록. textSnapshot = 실제로 보낸 문구 */
export interface BriefingRow {
  id: string;
  date: string;
  classId: string;
  studentId: string;
  code: string;
  textSnapshot: string;
  /** ISO 시각 */
  sharedAt: string;
  sharedBy?: string | null;
}

// ---------------------------------------------------------------
// 4단계: 반 편성 시뮬레이터 (SPEC_simulator.md 8장)
// 시안에서 무엇을 해도 실제 반·학생은 바뀌지 않는다. [적용하기]에서만 반영.
// ---------------------------------------------------------------

export type SimDraftStatus = 'editing' | 'applied' | 'archived';
export type SimGradeView = 'current' | 'next';
export type SimTag = 'keep' | 'move' | 'leaving' | 'new' | 'undecided';

/** 시안을 만들 때의 실제 반·배정 상태(변경 목록·"시안 만든 뒤 바뀐 내용" 비교용) */
export interface SimSnapshot {
  classes: Pick<ClassRow, 'id' | 'weekday' | 'startTime' | 'gradeCode' | 'gradeBasisYear' | 'alias'>[];
  /** 반별 학생 */
  members: { classId: string; studentId: string }[];
}

export interface SimAppliedSummary {
  option: string;
  lines: string[];
}

export interface SimDraftRow {
  id: string;
  name: string;
  baseDate: string;
  sourceDraftId: string | null;
  status: SimDraftStatus;
  gradeView: SimGradeView;
  memo: string | null;
  /** 마지막으로 고친 시각(ISO). 반·아이를 고쳐도 앱이 함께 바꾼다 */
  editedAt: string;
  appliedAt: string | null;
  appliedSummary: SimAppliedSummary | null;
  baseSnapshot: SimSnapshot;
}

export interface SimClassRow {
  id: string;
  draftId: string;
  /** 원래 실제 반. 시안에서 새로 만든 반이면 null */
  sourceClassId: string | null;
  weekday: Weekday;
  startTime: string;
  gradeCode: GradeCode | null;
  gradeBasisYear: number | null;
  alias: string | null;
  memo: string | null;
  /** 빼놓은 반(시간표에서 빠짐, 삭제 아님) */
  removed: boolean;
  /** 합쳐진 대상 시안 반 */
  mergedInto: string | null;
  /** 새 반 시작 진도 */
  startStage: StageId | null;
  startUnit: number | null;
}

export interface SimMemberRow {
  id: string;
  draftId: string;
  simClassId: string;
  studentId: string | null;
  waitlistId: string | null;
  /** 아직 대기자 등록 전인 상담 아이. 적용할 때 반영하지 않는다 */
  tempName: string | null;
  tag: SimTag;
  memo: string | null;
}

/** (날짜, 반) 출석 확인 완료 기록(SPEC_home 3.2). 결석을 표시하면 자동으로 남긴다 */
export interface AttendanceCheckRow {
  date: string;
  classId: string;
  checkedAt: string;
  /** DB가 로그인 사용자로 채운다(앱은 보내지 않음) */
  checkedBy?: string | null;
}

export type TaskCategory = '운영' | '행사' | '세무' | '홍보';

/** 직접 추가한 할 일(SPEC_home 4.6) */
export interface TaskRow {
  id: string;
  title: string;
  dueDate: string;
  memo: string | null;
  category: TaskCategory | null;
  createdAt: string;
  createdBy?: string | null;
}

export type TaskStatus = 'done' | 'snoozed' | 'hidden';

/** 모든 할 일의 상태(SPEC_home 4.1). 키 예: auto:calendar_export:2027-01, tpl:<id>:2027-02-10, manual:<id> */
export interface TaskStateRow {
  taskKey: string;
  status: TaskStatus;
  snoozeUntil: string | null;
  memo: string | null;
  doneAt: string | null;
  doneBy?: string | null;
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
  makeupBookings: MakeupBookingRow[];
  progressAnchors: ProgressAnchorRow[];
  basicLessons: BasicLessonRow[];
  briefingTexts: BriefingTextRow[];
  briefings: BriefingRow[];
  simDrafts: SimDraftRow[];
  simClasses: SimClassRow[];
  simMembers: SimMemberRow[];
  attendanceChecks: AttendanceCheckRow[];
  tasks: TaskRow[];
  taskStates: TaskStateRow[];
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
  'makeupBookings',
  'progressAnchors',
  'basicLessons',
  'briefingTexts',
  'briefings',
  'simDrafts',
  'simClasses',
  'simMembers',
  'attendanceChecks',
  'tasks',
  'taskStates',
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
  makeupBookings: [],
  progressAnchors: [],
  basicLessons: [],
  briefingTexts: [],
  briefings: [],
  simDrafts: [],
  simClasses: [],
  simMembers: [],
  attendanceChecks: [],
  tasks: [],
  taskStates: [],
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
    case 'briefingTexts':
      return (row as BriefingTextRow).code;
    case 'attendanceChecks': {
      const r = row as AttendanceCheckRow;
      return `${r.date}|${r.classId}`;
    }
    case 'taskStates':
      return (row as TaskStateRow).taskKey;
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
