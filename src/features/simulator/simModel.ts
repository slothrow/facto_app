// 편성 화면에서 쓰는 계산(순수 함수). 시안 ↔ 저장 데이터(RosterData) 연결, 진도·격자 범위.
import { scheduleFor } from '../../app/scheduleInput.ts';
import { CLASS_MINUTES, fromMinutes, toMinutes } from '../../engine/classTime.ts';
import { progressAt, stageForGrade, withCurriculumDefaults, type Progress } from '../../engine/curriculum.ts';
import { addDays, monthStart } from '../../engine/dates.ts';
import { classGradeCodeOn } from '../../engine/grade.ts';
import {
  liveClasses,
  scheduleLookup,
  withHoursDefaults,
  type OperatingHours,
  type ScheduleLookup,
  type SimDraft,
} from '../../engine/simulator/index.ts';
import type { RosterChange, RosterData, SimClassRow } from '../../storage/rosterTypes.ts';
import type { AppData } from '../../storage/types.ts';

export const hoursOf = (data: AppData): OperatingHours => withHoursDefaults(data.settings.operatingHours);

export function draftOf(roster: Pick<RosterData, 'simDrafts' | 'simClasses' | 'simMembers'>, id: string): SimDraft | null {
  const draft = roster.simDrafts.find((d) => d.id === id);
  if (!draft) return null;
  return {
    draft,
    classes: roster.simClasses.filter((c) => c.draftId === id),
    members: roster.simMembers.filter((m) => m.draftId === id),
  };
}

/** 새 시안 저장(전부 추가) */
export const draftInsertChange = (d: SimDraft): RosterChange => ({
  upsert: { simDrafts: [d.draft], simClasses: d.classes, simMembers: d.members },
});

/** 시안 삭제 */
export const draftRemoveChange = (d: SimDraft): RosterChange => ({
  remove: { simDrafts: [d.draft], simClasses: d.classes, simMembers: d.members },
});

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** 두 시안 상태의 차이 → 바뀐 행만 저장하는 변경 묶음. 무언가 바뀌면 시안의 마지막 수정 시각도 바꾼다 */
export function changeBetween(prev: SimDraft, next: SimDraft, now: string): RosterChange {
  const diffRows = <T extends { id: string }>(a: T[], b: T[]) => {
    const before = new Map(a.map((r) => [r.id, r]));
    const after = new Set(b.map((r) => r.id));
    return {
      upsert: b.filter((r) => !same(before.get(r.id), r)),
      remove: a.filter((r) => !after.has(r.id)),
    };
  };
  const cls = diffRows(prev.classes, next.classes);
  const mem = diffRows(prev.members, next.members);
  const touched = cls.upsert.length + cls.remove.length + mem.upsert.length + mem.remove.length > 0 || !same(prev.draft, next.draft);
  return {
    upsert: {
      simDrafts: touched ? [{ ...next.draft, editedAt: now }] : [],
      simClasses: cls.upsert,
      simMembers: mem.upsert,
    },
    remove: { simClasses: cls.remove, simMembers: mem.remove },
  };
}

/** 기준일 근처부터 1년 남짓 회차(적용 날짜·진도 계산용) */
export function lookupFor(data: AppData, baseDate: string): ScheduleLookup {
  const from = addDays(baseDate, -45);
  return scheduleLookup(scheduleFor(data, { from, to: addDays(baseDate, 430) }).days);
}

/** 시안 반이 기준일 이후 맞는 첫 수업월 */
export const nextCourseMonth = (sched: ScheduleLookup, weekday: number, baseDate: string) =>
  sched.firstSessionFrom(weekday, baseDate)?.courseMonth ?? null;

/**
 * 시안 반의 진도(기준일 이후 첫 수업월 기준).
 * - 기존 반: 실제 반 진도를 그대로 따라간다(옮겨도 유지)
 * - 새 반: 시작 진도(없으면 학년 기본 단계 1단원)
 */
export function simProgress(
  c: SimClassRow,
  roster: Pick<RosterData, 'progressAnchors'>,
  sched: ScheduleLookup,
  baseDate: string,
  data: AppData,
): Progress {
  const cm = nextCourseMonth(sched, c.weekday, baseDate);
  if (!cm) return { kind: 'unset' };
  if (c.sourceClassId) return progressAt(roster.progressAnchors.filter((a) => a.classId === c.sourceClassId), cm);
  const stage = c.startStage ?? stageForGrade(classGradeCodeOn(c, monthStart(cm)), withCurriculumDefaults(data.settings.curriculum));
  if (!stage) return { kind: 'unset' };
  if (stage === 'basic') return { kind: 'basic' };
  return { kind: 'unit', stage, unit: c.startUnit ?? 1, week: 1 };
}

/** 격자 세로 범위(분): 운영 시간대 ±30분, 그 밖의 반이 있으면 넓힌다. 10분 단위 */
export function gridRange(d: Pick<SimDraft, 'classes'>, hours: OperatingHours): { start: number; end: number } {
  const hs = Object.values(hours);
  const starts = liveClasses(d).map((c) => toMinutes(c.startTime));
  const start = Math.min(...hs.map((h) => toMinutes(h.start) - 30), ...starts);
  const end = Math.max(...hs.map((h) => toMinutes(h.end) + 30), ...starts.map((s) => s + CLASS_MINUTES));
  return { start: Math.floor(start / 10) * 10, end: Math.ceil(end / 10) * 10 };
}

/** 격자 칸(10분 단위 시작 시각) */
export function gridSlots(range: { start: number; end: number }): string[] {
  const out: string[] = [];
  for (let m = range.start; m + CLASS_MINUTES <= range.end; m += 10) out.push(fromMinutes(m));
  return out;
}
