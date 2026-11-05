// 학생 화면 계산(순수 함수): 초성 검색, 전화번호 형식, 반 배정·이동, 다음 수업월 1주.
import { scheduleFor } from '../../../app/scheduleInput.ts';
import { addDays } from '../../../engine/dates.ts';
import type { AppData } from '../../../storage/types.ts';
import {
  newId,
  type ClassRow,
  type CounselingNoteRow,
  type CounselingType,
  type EnrollmentRow,
  type RosterChange,
  type RosterData,
  type StudentRow,
} from '../../../storage/rosterTypes.ts';
import { classDisplayName, enrollmentCovers } from '../rosterModel.ts';

// ---------------------------------------------------------------
// 초성 검색: "ㄱㅅㅇ" → 김선우, "김ㅅ" → 김선우
// ---------------------------------------------------------------

const CHOSEONG = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const isChoseong = (ch: string) => CHOSEONG.includes(ch);

function choseongOf(ch: string): string {
  const code = ch.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return ch;
  return CHOSEONG[Math.floor(code / 588)];
}

const charMatches = (nameCh: string, q: string) => (isChoseong(q) ? choseongOf(nameCh) === q : nameCh === q);

export function matchesName(name: string, query: string): boolean {
  const q = query.replace(/\s/g, '');
  if (!q) return true;
  const n = name.replace(/\s/g, '');
  for (let i = 0; i + q.length <= n.length; i++) {
    let ok = true;
    for (let j = 0; j < q.length && ok; j++) ok = charMatches(n[i + j], q[j]);
    if (ok) return true;
  }
  return false;
}

// ---------------------------------------------------------------
// 전화번호: 숫자만 저장, 010-1234-5678로 표시
// ---------------------------------------------------------------

export const digitsOnly = (s: string) => s.replace(/\D/g, '');

export function formatPhone(digits: string | null): string {
  const d = digitsOnly(digits ?? '');
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return d.startsWith('02') ? `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}` : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 9 && d.startsWith('02')) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
  if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return d;
}

export const RELATION_LABEL = { mom: '엄마', dad: '아빠', other: '기타' } as const;

/** 대표 연락처: 대표로 표시한 학부모 → 첫 학부모 → 학생 본인 */
export function primaryContact(s: StudentRow): { label: string; phone: string } | null {
  const g = s.guardians.find((x) => x.isPrimary && x.phone) ?? s.guardians.find((x) => x.phone);
  if (g) return { label: g.name || RELATION_LABEL[g.relation], phone: g.phone };
  if (s.studentPhone) return { label: '학생', phone: s.studentPhone };
  return null;
}

export const STATUS_LABEL = { active: '재원', paused: '휴원', left: '퇴원' } as const;

export const COUNSELING_LABEL: Record<CounselingType, string> = {
  new: '신규 상담',
  regular: '정기 상담',
  parent: '학부모 요청',
  move: '반 이동',
  other: '기타',
};

// ---------------------------------------------------------------
// 다음 수업월 1주 (반 이동 적용일 기본값, SPEC 3.3)
// ---------------------------------------------------------------

/** after 다음 날부터 찾아서 그 요일반의 첫 "1주" 회차 날짜. 반년 안에 없으면 null */
export function nextWeek1Date(data: AppData, weekday: number, after: string): string | null {
  const from = addDays(after, 1);
  const out = scheduleFor(data, { from, to: addDays(from, 190) });
  const hit = out.days.find((d) => d.weekday === weekday && d.status === 'session' && d.session?.weekNo === 1);
  return hit?.date ?? null;
}

/** 그 요일반의 after 이후 첫 수업 날짜(첫 수업일 제안용) */
export function nextSessionDate(data: AppData, weekday: number, onOrAfter: string): string | null {
  const out = scheduleFor(data, { from: onOrAfter, to: addDays(onOrAfter, 120) });
  return out.days.find((d) => d.weekday === weekday && d.status === 'session')?.date ?? null;
}

// ---------------------------------------------------------------
// 반 배정·이동·빼기 → 저장할 변경 묶음
// ---------------------------------------------------------------

/** 이 날짜(applyDate) 이후로 이어지는 배정. 반 이동·빼기의 대상 */
export function openEnrollmentsAt(enrollments: EnrollmentRow[], studentId: string, applyDate: string): EnrollmentRow[] {
  return enrollments.filter((e) => e.studentId === studentId && (!e.endDate || e.endDate >= applyDate));
}

/** 배정을 applyDate 전날로 끝낸다. 시작 전이면 배정 자체를 지운다 */
function endBefore(e: EnrollmentRow, applyDate: string, change: Required<RosterChange>) {
  const end = addDays(applyDate, -1);
  if (end < e.startDate) (change.remove.enrollments ??= []).push(e);
  else (change.upsert.enrollments ??= []).push({ ...e, endDate: end });
}

const emptyChange = (): Required<RosterChange> => ({ upsert: {}, remove: {} });

/** 반에 넣기(이미 다른 반에 있으면 이동과 같다) */
export function planEnroll(
  roster: RosterData,
  studentId: string,
  toClass: ClassRow,
  applyDate: string,
  today: string,
): RosterChange {
  const change = emptyChange();
  const open = openEnrollmentsAt(roster.enrollments, studentId, applyDate);
  const from = open.find((e) => enrollmentCovers(e, applyDate) || e.startDate >= applyDate) ?? null;
  for (const e of open) endBefore(e, applyDate, change);
  change.upsert.enrollments = [
    ...(change.upsert.enrollments ?? []),
    { id: newId(), studentId, classId: toClass.id, startDate: applyDate, endDate: null },
  ];
  if (from && from.classId !== toClass.id) {
    const fromClass = roster.classes.find((c) => c.id === from.classId);
    const note: CounselingNoteRow = {
      id: newId(),
      studentId,
      date: today,
      type: 'move',
      content: `${fromClass ? classDisplayName(fromClass, applyDate) : '이전 반'} → ${classDisplayName(toClass, applyDate)} (적용일 ${applyDate})`,
      nextContactOn: null,
    };
    change.upsert.counselingNotes = [note];
  }
  return change;
}

/** 반에서 빼기: applyDate부터 배정 없음 */
export function planUnenroll(roster: RosterData, studentId: string, classId: string, applyDate: string): RosterChange {
  const change = emptyChange();
  for (const e of openEnrollmentsAt(roster.enrollments, studentId, applyDate)) if (e.classId === classId) endBefore(e, applyDate, change);
  return change;
}

/** 학생 완전 삭제: 관련 기록은 DB가 함께 지운다(cascade). 화면 데이터도 같이 정리 */
export function planDeleteStudent(roster: RosterData, studentId: string): RosterChange {
  return {
    remove: {
      students: roster.students.filter((s) => s.id === studentId),
      enrollments: roster.enrollments.filter((e) => e.studentId === studentId),
      counselingNotes: roster.counselingNotes.filter((n) => n.studentId === studentId),
      absences: roster.absences.filter((a) => a.studentId === studentId),
      siblings: roster.siblings.filter((p) => p.studentId === studentId || p.siblingId === studentId),
    },
    upsert: { waitlist: roster.waitlist.filter((w) => w.studentId === studentId).map((w) => ({ ...w, studentId: null })) },
  };
}

export function blankStudent(name: string, today: string): StudentRow {
  return {
    id: newId(),
    name,
    gender: null,
    birthday: null,
    gradeCode: null,
    gradeBasisYear: null,
    gradeAdjust: 0,
    school: null,
    studentPhone: null,
    guardians: [],
    address: null,
    registeredOn: today,
    firstClassOn: null,
    status: 'active',
    statusFrom: null,
    statusTo: null,
    leaveReason: null,
    availability: {},
    notice: null,
    needsReview: false,
  };
}

/** 형제자매 쌍(작은 id가 앞) */
export const siblingPair = (a: string, b: string) => (a < b ? { studentId: a, siblingId: b } : { studentId: b, siblingId: a });

export const siblingsOf = (roster: RosterData, id: string) =>
  roster.siblings.flatMap((p) => (p.studentId === id ? [p.siblingId] : p.siblingId === id ? [p.studentId] : []));
