// 반 상세·대기자 연결 계산(SPEC_simulator 5장). 순수 함수.
import { fromMinutes } from '../../engine/classTime.ts';
import { gradeLabel } from '../../engine/grade.ts';
import { memberInfo, membersOf, simGradeCode, viewDateOf, type SimDraft } from '../../engine/simulator/index.ts';
import type { Weekday } from '../../engine/types.ts';
import type { RosterData, SimClassRow, SimMemberRow, SimTag, WaitlistRow } from '../../storage/rosterTypes.ts';
import { OPEN_STAGES, fitsWish, waitlistGradeOn } from '../roster/waitlist/waitlistModel.ts';

/** 시안에 아직 넣지 않은 진행 중 대기자 */
export function freeWaitlist(d: SimDraft, roster: Pick<RosterData, 'waitlist'>): WaitlistRow[] {
  const used = new Set(d.members.map((m) => m.waitlistId).filter(Boolean));
  return roster.waitlist.filter((w) => OPEN_STAGES.includes(w.stage) && !w.studentId && !used.has(w.id));
}

/** 학년(학년 보기 기준)과 희망 요일·시간이 맞는 대기자 */
export function waitlistMatches(d: SimDraft, c: Pick<SimClassRow, 'weekday' | 'startTime' | 'gradeCode' | 'gradeBasisYear'>, roster: Pick<RosterData, 'waitlist'>): WaitlistRow[] {
  const vd = viewDateOf(d.draft);
  const g = simGradeCode(c, vd);
  if (g === null) return [];
  return freeWaitlist(d, roster).filter((w) => waitlistGradeOn(w, vd) === g && fitsWish(w.wish, c));
}

/** 선택한 반을 옮길 때 대기자 희망에 맞는 칸(30분 단위만 표시): 키 "요일|HH:MM" → 인원 */
export function waitDots(
  d: SimDraft,
  c: SimClassRow,
  roster: Pick<RosterData, 'waitlist'>,
  days: Weekday[],
  range: { start: number; end: number },
): Map<string, number> {
  const out = new Map<string, number>();
  const vd = viewDateOf(d.draft);
  const g = simGradeCode(c, vd);
  if (g === null) return out;
  const pool = freeWaitlist(d, roster).filter((w) => waitlistGradeOn(w, vd) === g && Object.keys(w.wish).length > 0);
  if (pool.length === 0) return out;
  for (const wd of days) {
    for (let m = Math.ceil(range.start / 30) * 30; m + 50 <= range.end; m += 30) {
      const t = fromMinutes(m);
      const n = pool.filter((w) => fitsWish(w.wish, { weekday: wd, startTime: t })).length;
      if (n > 0) out.set(`${wd}|${t}`, n);
    }
  }
  return out;
}

export const TAG_TONE: Record<SimTag, string> = {
  keep: 'text-stone-800',
  move: 'text-blue-700 font-semibold',
  leaving: 'text-stone-400 line-through',
  new: 'text-emerald-700 font-semibold',
  undecided: 'text-amber-600 font-semibold',
};

export const TAG_CHIP: Record<SimTag, string> = {
  keep: 'bg-stone-100 text-stone-700 border-stone-300',
  move: 'bg-blue-100 text-blue-800 border-blue-300',
  leaving: 'bg-stone-200 text-stone-500 border-stone-300 line-through',
  new: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  undecided: 'bg-amber-100 text-amber-800 border-amber-300',
};

export interface MemberView {
  m: SimMemberRow;
  name: string;
  /** 학년 보기 기준 */
  grade: string;
  kind: 'student' | 'waitlist' | 'temp';
}

export function memberViews(d: SimDraft, simClassId: string, roster: Pick<RosterData, 'students' | 'waitlist'>): MemberView[] {
  const vd = viewDateOf(d.draft);
  const order: Record<SimTag, number> = { keep: 0, move: 1, undecided: 2, new: 3, leaving: 4 };
  return membersOf(d, simClassId)
    .map((m) => {
      const info = memberInfo(m, roster, vd);
      return {
        m,
        name: m.tag === 'undecided' ? `${info.name}??` : info.name,
        grade: m.tempName ? '' : gradeLabel(info.grade),
        kind: (m.studentId ? 'student' : m.waitlistId ? 'waitlist' : 'temp') as MemberView['kind'],
      };
    })
    .sort((a, b) => order[a.m.tag] - order[b.m.tag] || a.name.localeCompare(b.name, 'ko'));
}

/** 블록 안 이름 표시용(PC) */
export const blockPeople = (d: SimDraft, simClassId: string, roster: Pick<RosterData, 'students' | 'waitlist'>) =>
  memberViews(d, simClassId, roster).map((v) => ({ name: v.name, tone: TAG_TONE[v.m.tag] }));

