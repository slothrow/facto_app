// 적용 계획(SPEC_simulator 7장). 순수 함수: 시안 + 실제 데이터 → 저장할 변경 묶음(RosterChange) + 미리보기.
// 같은 결과를 미리보기에 보여 주고, 그대로 DB 함수(트랜잭션) 하나로 실행한다.
//
// 날짜 규칙(기존 반 데이터와 같은 뜻):
// - 폐반일(closedOn) = 이 날부터 운영하지 않는 날 = 적용일. (기획서의 "적용일 전날까지 운영"과 같다)
// - 배정 끝(endDate) = 마지막 날(포함) = 적용일 전날.
// - 수업월 기준: 반마다 그 요일의 "그 수업월 1주" 날짜가 적용일. 날짜 기준: 모든 반이 그 날짜.
import { addDays, monthStart } from '../dates.ts';
import { progressAt, stageForGrade, formatProgress, DEFAULT_CURRICULUM, type CurriculumSettings, type StageId } from '../curriculum.ts';
import { classGradeCodeOn } from '../grade.ts';
import type { DatedLabel, DayCell, WeekNo } from '../types.ts';
import {
  newId,
  type ClassRow,
  type CounselingNoteRow,
  type EnrollmentRow,
  type ProgressAnchorRow,
  type RosterChange,
  type RosterData,
  type SimClassRow,
  type StudentRow,
  type WaitlistRow,
} from '../../storage/rosterTypes.ts';
import { toMinutes } from '../classTime.ts';
import { simClassName, slotText, type SimDraft } from './model.ts';

/** 회차 엔진 결과에서 날짜 찾기 */
export interface ScheduleLookup {
  /** 그 요일반의 (수업월, 1주) 날짜 */
  week1Of(weekday: number, courseMonth: string): string | null;
  /** 그 날짜 이후(포함) 그 요일반의 첫 회차 */
  firstSessionFrom(weekday: number, date: string): DatedLabel | null;
}

export function scheduleLookup(days: DayCell[]): ScheduleLookup {
  const sessions = days.filter((d) => d.status === 'session' && d.session).sort((a, b) => a.date.localeCompare(b.date));
  return {
    week1Of: (weekday, courseMonth) =>
      sessions.find((d) => d.weekday === weekday && d.session!.courseMonth === courseMonth && d.session!.weekNo === 1)?.date ?? null,
    firstSessionFrom: (weekday, date) => {
      const d = sessions.find((x) => x.weekday === weekday && x.date >= date);
      return d ? { date: d.date, courseMonth: d.session!.courseMonth, weekNo: d.session!.weekNo } : null;
    },
  };
}

export type ApplyOption = { mode: 'month'; courseMonth: string } | { mode: 'date'; date: string };

export const optionText = (o: ApplyOption) =>
  o.mode === 'month' ? `${o.courseMonth.slice(0, 4)}년 ${Number(o.courseMonth.slice(5, 7))}월 수업월 기준` : `${o.date}부터(날짜 기준)`;

export interface ApplyInput {
  draft: SimDraft;
  roster: RosterData;
  sched: ScheduleLookup;
  option: ApplyOption;
  /** 체크를 해제한 퇴원 예정·신규 아이(시안 아이 id) */
  skip?: string[];
  today: string;
  /** 적용 시각(ISO) */
  now: string;
  curriculum?: CurriculumSettings;
}

export interface ApplyClassPreview {
  simClassId: string;
  title: string;
  applyDate: string | null;
  lines: string[];
}

export interface ApplyPerson {
  memberId: string;
  name: string;
  classTitle: string;
  date: string | null;
}

export interface ApplyPlan {
  ok: boolean;
  /** 있으면 적용할 수 없다 */
  errors: string[];
  classes: ApplyClassPreview[];
  /** 퇴원 예정 아이(체크 목록용, 체크 해제 여부와 상관없이 모두) */
  leavers: ApplyPerson[];
  /** 신규 태그 대기자(체크 목록용) */
  newcomers: ApplyPerson[];
  /** 반영하지 않는 것 안내(임시 이름, 이동·미정 태그 등) */
  notes: string[];
  warnings: string[];
  change: RosterChange;
  /** 적용 결과 요약(시안에 저장) */
  summary: string[];
}

export function planApply(input: ApplyInput): ApplyPlan {
  const { draft: d, roster, sched, option, today, now } = input;
  const curriculum = input.curriculum ?? DEFAULT_CURRICULUM;
  const skip = new Set(input.skip ?? []);
  const labelDate = d.draft.baseDate;
  const realById = new Map(roster.classes.map((c) => [c.id, c]));
  const simById = new Map(d.classes.map((c) => [c.id, c]));

  const errors: string[] = [];
  const notes: string[] = [];
  const warnings: string[] = [];
  const previews: ApplyClassPreview[] = [];
  const leavers: ApplyPerson[] = [];
  const newcomers: ApplyPerson[] = [];
  const counts = { moved: 0, created: 0, closed: 0, merged: 0, edited: 0, left: 0, registered: 0, reassigned: 0 };

  const classesUp = new Map<string, ClassRow>();
  const studentsUp = new Map<string, StudentRow>();
  const enrollUp = new Map<string, EnrollmentRow>();
  const enrollRemove = new Map<string, EnrollmentRow>();
  const anchorsUp: ProgressAnchorRow[] = [];
  const notesUp: CounselingNoteRow[] = [];
  const waitUp: WaitlistRow[] = [];
  const basicUp: RosterData['basicLessons'] = [];
  const trialsUp: RosterData['trialLessons'] = [];

  const dateFor = (weekday: number): string | null => (option.mode === 'month' ? sched.week1Of(weekday, option.courseMonth) : option.date);
  const monthFor = (weekday: number, date: string): string | null =>
    option.mode === 'month' ? option.courseMonth : (sched.firstSessionFrom(weekday, date)?.courseMonth ?? null);
  const titleOf = (c: SimClassRow) => {
    const real = c.sourceClassId ? realById.get(c.sourceClassId) : undefined;
    return `${slotText((real ?? c).weekday, (real ?? c).startTime)} ${simClassName(real ?? c, labelDate)}`;
  };
  const noDate = (c: SimClassRow) =>
    errors.push(`${titleOf(c)}: 적용 날짜를 찾을 수 없어요(그 요일 회차 계획을 확인해 주세요)`);

  /** 실제 반 id → 폐반일(= 적용일) */
  const closeOf = new Map<string, string>();
  /** 시안 반 id → 적용 후 실제 반과 적용일 */
  const target = new Map<string, { realId: string; applyDate: string; title: string }>();

  const closeReal = (real: ClassRow, date: string) => {
    closeOf.set(real.id, date);
    classesUp.set(real.id, { ...(classesUp.get(real.id) ?? real), closedOn: date });
    counts.closed += 1;
  };

  const ordered = [...d.classes].sort((a, b) => a.weekday - b.weekday || toMinutes(a.startTime) - toMinutes(b.startTime));

  // 1) 반
  for (const c of ordered) {
    const title = titleOf(c);
    const real = c.sourceClassId ? realById.get(c.sourceClassId) : undefined;
    if (c.sourceClassId && (!real || (real.closedOn !== null && real.closedOn <= today))) {
      errors.push(`${title}: 원래 반이 이미 폐반되었거나 없어요`);
      continue;
    }
    const lines: string[] = [];
    const preview: ApplyClassPreview = { simClassId: c.id, title, applyDate: null, lines };

    if (c.mergedInto || c.removed) {
      if (!real) continue; // 시안에서 만들었다가 뺀 반은 할 일 없음
      const date = dateFor(real.weekday);
      if (!date) {
        noDate(c);
        continue;
      }
      closeReal(real, date);
      preview.applyDate = date;
      if (c.mergedInto) {
        const into = simById.get(c.mergedInto);
        counts.merged += 1;
        lines.push(`폐반(${date}부터 수업 없음), 학생은 ${into ? titleOf(into) : '합친 반'}으로`);
      } else {
        lines.push(`폐반(${date}부터 수업 없음)`);
      }
      previews.push(preview);
      continue;
    }

    const date = dateFor(c.weekday);
    if (!date) {
      noDate(c);
      continue;
    }
    preview.applyDate = date;
    const moved = real && (real.weekday !== c.weekday || real.startTime !== c.startTime);

    if (real && !moved) {
      target.set(c.id, { realId: real.id, applyDate: date, title });
      const gradeChanged = classGradeCodeOn(real, labelDate) !== classGradeCodeOn(c, labelDate);
      const aliasChanged = (real.alias ?? '') !== (c.alias ?? '');
      if (gradeChanged || aliasChanged) {
        classesUp.set(real.id, { ...real, gradeCode: c.gradeCode, gradeBasisYear: c.gradeBasisYear, alias: c.alias });
        counts.edited += 1;
        lines.push(`반 정보 수정: ${simClassName(c, labelDate)}`);
      }
      previews.push(preview);
      continue;
    }

    // 옮긴 반·새 반: 새 반 개설(옮긴 반은 기존 반 폐반 — 과거 출석·브리핑 기록은 기존 반에 그대로 남는다)
    const id = newId();
    const row: ClassRow = {
      id,
      weekday: c.weekday,
      startTime: c.startTime,
      gradeCode: c.gradeCode,
      gradeBasisYear: c.gradeBasisYear,
      alias: c.alias,
      openedOn: date,
      closedOn: null,
      memo: real?.memo ?? null,
    };
    classesUp.set(id, row);
    const newTitle = `${slotText(c.weekday, c.startTime)} ${simClassName(c, labelDate)}`;
    target.set(c.id, { realId: id, applyDate: date, title: newTitle });
    if (real) {
      const closeDate = dateFor(real.weekday);
      if (!closeDate) {
        noDate(c);
        continue;
      }
      closeReal(real, closeDate);
      counts.closed -= 1; // 이동은 폐반 수에 넣지 않는다
      counts.moved += 1;
      lines.push(`기존 반 폐반(${closeDate}부터 수업 없음)`);
      lines.push(`새 반 개설 ${newTitle} (${date}부터)`);
    } else {
      counts.created += 1;
      lines.push(`새 반 개설 (${date}부터)`);
    }

    // 진도: 옮긴 반은 기존 반의 그 수업월 진도를 이어받고, 새 반은 시작 진도
    const cm = monthFor(c.weekday, date);
    let stage: StageId | null = null;
    let unit: number | null = null;
    let unitWeek = 1;
    if (cm && real) {
      const p = progressAt(
        roster.progressAnchors.filter((a) => a.classId === real.id),
        cm,
      );
      if (p.kind === 'unit') [stage, unit, unitWeek] = [p.stage, p.unit, p.week];
      else if (p.kind === 'basic') stage = 'basic';
    } else if (cm) {
      stage = c.startStage ?? stageForGrade(classGradeCodeOn(c, monthStart(cm)), curriculum);
      unit = stage === null || stage === 'basic' ? null : (c.startUnit ?? 1);
    }
    if (cm && stage) {
      anchorsUp.push({ id: newId(), classId: id, courseMonth: cm, stage, unit, unitWeek: stage === 'basic' ? 1 : unitWeek, memo: '반 편성 적용' });
      lines.push(
        `진도 ${formatProgress(stage === 'basic' ? { kind: 'basic' } : { kind: 'unit', stage, unit: unit!, week: unitWeek as WeekNo }, curriculum)}부터 (${Number(cm.slice(5, 7))}월 수업월)`,
      );
    } else {
      lines.push('진도 미설정 — 적용 후 반 상세에서 정해 주세요');
    }

    // 적용일 이후 기록(베이직 수업 계획·체험수업)은 새 반으로. 요일이 바뀌면 날짜가 안 맞아 옮기지 않는다
    if (real) {
      const from = closeOf.get(real.id)!;
      const basic = roster.basicLessons.filter((b) => b.classId === real.id && b.date >= from);
      const trials = roster.trialLessons.filter((t) => t.classId === real.id && t.date >= from);
      if (basic.length + trials.length > 0) {
        const what = [basic.length ? `베이직 수업 계획 ${basic.length}건` : '', trials.length ? `체험수업 ${trials.length}건` : ''].filter(Boolean).join('·');
        if (real.weekday === c.weekday) {
          basicUp.push(...basic.map((b) => ({ ...b, classId: id })));
          trialsUp.push(...trials.map((t) => ({ ...t, classId: id })));
          lines.push(`${what} 새 반으로 옮김`);
        } else {
          notes.push(`${title}: 요일이 바뀌어 적용일 이후 ${what}은 기존 반에 남겨요`);
        }
      }
    }
    previews.push(preview);
  }

  // 2) 아이
  const originOf = (studentId: string, c: SimClassRow): string | null => {
    const mine = d.draft.baseSnapshot.members.filter((m) => m.studentId === studentId).map((m) => m.classId);
    if (mine.length === 0) return null;
    const related = new Set([c.sourceClassId, ...d.classes.filter((x) => x.mergedInto === c.id).map((x) => x.sourceClassId)]);
    return mine.find((id) => related.has(id)) ?? mine[0];
  };
  const openIn = (studentId: string, classId: string, endAfter: string) =>
    roster.enrollments.filter((e) => e.studentId === studentId && e.classId === classId && (!e.endDate || e.endDate >= endAfter));
  /** 배정을 date 전날로 끝낸다. 시작 전이면 배정을 지운다 */
  const endBefore = (e: EnrollmentRow, date: string) => {
    const end = addDays(date, -1);
    const cur = enrollUp.get(e.id) ?? e;
    if (end < cur.startDate) {
      enrollUp.delete(e.id);
      enrollRemove.set(e.id, e);
    } else if (!cur.endDate || cur.endDate > end) enrollUp.set(e.id, { ...cur, endDate: end });
  };
  const studentName = (id: string) => roster.students.find((s) => s.id === id)?.name ?? '(없는 학생)';

  let moveTags = 0;
  let undecidedTags = 0;
  for (const c of ordered) {
    if (c.mergedInto) continue;
    const t = target.get(c.id);
    if (!c.removed && !t) continue; // 반 단계에서 오류
    const classTitle = t?.title ?? titleOf(c);
    const ms = d.members.filter((m) => m.simClassId === c.id);
    let orphaned = 0;
    for (const m of ms) {
      if (m.tag === 'move') moveTags += 1;
      if (m.tag === 'undecided') undecidedTags += 1;

      if (m.tempName && !m.studentId && !m.waitlistId) {
        notes.push(`임시 이름 "${m.tempName}"(${classTitle})은 반영하지 않아요 — 대기자로 먼저 등록해 주세요`);
        continue;
      }

      if (m.waitlistId) {
        const w = roster.waitlist.find((x) => x.id === m.waitlistId);
        if (!w || w.studentId) {
          notes.push(`${w?.name ?? '대기자'}(${classTitle}): 이미 등록했거나 없는 대기자라 반영하지 않아요`);
          continue;
        }
        if (m.tag !== 'new' || c.removed || !t) {
          notes.push(`대기자 ${w.name}(${classTitle})은 신규 태그가 아니어서 반영하지 않아요`);
          continue;
        }
        newcomers.push({ memberId: m.id, name: w.name, classTitle, date: t.applyDate });
        if (skip.has(m.id)) continue;
        const sid = newId();
        studentsUp.set(sid, {
          id: sid,
          name: w.name,
          gender: null,
          birthday: w.birthday,
          gradeCode: w.gradeCode,
          gradeBasisYear: w.gradeBasisYear,
          gradeAdjust: 0,
          school: null,
          studentPhone: null,
          guardians: w.guardian?.phone ? [{ name: w.guardian.name, relation: w.guardian.relation, phone: w.guardian.phone, isPrimary: true }] : [],
          address: null,
          registeredOn: today,
          firstClassOn: t.applyDate,
          status: 'active',
          statusFrom: null,
          statusTo: null,
          leaveReason: null,
          availability: w.wish,
          notice: m.memo,
          needsReview: true,
          kakaoSearch: null,
        });
        const e: EnrollmentRow = { id: newId(), studentId: sid, classId: t.realId, startDate: t.applyDate, endDate: null };
        enrollUp.set(e.id, e);
        waitUp.push({ ...w, stage: 'enrolled', stageHistory: [...w.stageHistory, { stage: 'enrolled', date: today }], studentId: sid });
        notesUp.push({ id: newId(), studentId: sid, date: today, type: 'new', content: `반 편성 적용으로 대기자에서 등록 (${classTitle}, ${t.applyDate}부터)`, nextContactOn: null });
        counts.registered += 1;
        continue;
      }

      if (!m.studentId) continue;
      const sid = m.studentId;
      const origin = originOf(sid, c);
      const originReal = origin ? realById.get(origin) : undefined;
      const leaveDate = origin && closeOf.has(origin) ? closeOf.get(origin)! : (t?.applyDate ?? (originReal ? dateFor(originReal.weekday) : null));

      if (m.tag === 'leaving') {
        leavers.push({ memberId: m.id, name: studentName(sid), classTitle, date: leaveDate });
        if (!skip.has(m.id) && leaveDate) {
          const s = roster.students.find((x) => x.id === sid);
          if (s) {
            for (const e of roster.enrollments.filter((x) => x.studentId === sid && (!x.endDate || x.endDate >= addDays(leaveDate, -1)))) endBefore(e, leaveDate);
            studentsUp.set(sid, { ...s, status: 'left', statusFrom: leaveDate, statusTo: null, leaveReason: s.leaveReason ?? '반 편성' });
            counts.left += 1;
          }
          continue;
        }
      }

      if (c.removed || !t) {
        // 빼놓은 반: 배정만 끝난다(학생은 재원 그대로)
        if (origin && closeOf.has(origin)) {
          for (const e of openIn(sid, origin, addDays(closeOf.get(origin)!, -1))) endBefore(e, closeOf.get(origin)!);
          orphaned += 1;
        }
        continue;
      }

      if (origin === t.realId) continue;
      // 배정 이동: 이전 반은 (새 반 시작, 이전 반 폐반) 중 빠른 날 전날까지
      if (origin) {
        const until = [t.applyDate, closeOf.get(origin) ?? t.applyDate].sort()[0];
        for (const e of openIn(sid, origin, addDays(until, -1))) endBefore(e, until);
      }
      const e: EnrollmentRow = { id: newId(), studentId: sid, classId: t.realId, startDate: t.applyDate, endDate: null };
      enrollUp.set(e.id, e);
      notesUp.push({
        id: newId(),
        studentId: sid,
        date: today,
        type: 'move',
        content: `반 편성 적용: ${originReal ? `${slotText(originReal.weekday, originReal.startTime)} ${simClassName(originReal, labelDate)}` : '이전 반'} → ${t.title} (적용일 ${t.applyDate})`,
        nextContactOn: null,
      });
      counts.reassigned += 1;
    }
    if (orphaned > 0) warnings.push(`${classTitle}(빼놓은 반): 학생 ${orphaned}명은 배정이 끝나고 반 없이 남아요`);
  }
  if (moveTags + undecidedTags > 0) {
    notes.push(
      `${[moveTags ? `이동 태그 ${moveTags}명` : '', undecidedTags ? `미정 태그 ${undecidedTags}명` : ''].filter(Boolean).join(', ')}은 그 반에 그대로 둬요 — 적용 후 직접 확인해 주세요`,
    );
  }

  const summary = [
    counts.moved && `반 옮김 ${counts.moved}`,
    counts.created && `새 반 ${counts.created}`,
    counts.closed && `폐반 ${counts.closed}` + (counts.merged ? `(합침 ${counts.merged} 포함)` : ''),
    counts.edited && `반 정보 수정 ${counts.edited}`,
    counts.reassigned && `배정 이동 ${counts.reassigned}명`,
    counts.left && `퇴원 ${counts.left}명`,
    counts.registered && `신규 등록 ${counts.registered}명`,
  ].filter((x): x is string => Boolean(x));

  const ok = errors.length === 0;
  const change: RosterChange = {
    upsert: {
      classes: [...classesUp.values()],
      students: [...studentsUp.values()],
      enrollments: [...enrollUp.values()],
      counselingNotes: notesUp,
      waitlist: waitUp,
      trialLessons: trialsUp,
      progressAnchors: anchorsUp,
      basicLessons: basicUp,
      simDrafts: [
        {
          ...d.draft,
          status: 'applied',
          appliedAt: now,
          editedAt: now,
          appliedSummary: { option: optionText(option), lines: summary.length ? summary : ['바뀐 내용 없음'] },
        },
      ],
    },
    remove: { enrollments: [...enrollRemove.values()] },
  };
  return { ok, errors, classes: previews, leavers, newcomers, notes, warnings, change, summary };
}
