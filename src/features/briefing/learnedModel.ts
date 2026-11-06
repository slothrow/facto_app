// 개인 진도·브리핑 현황(SPEC_briefing 6.2, 6.3). 저장하지 않고 매번 계산한다. 순수 함수.
// - 이수: 반에 배정돼 있던 날 중 회차가 있고 결석하지 않은 날의 코드(그날 그 반 기준 → 반 이동 전 날짜는 이전 반 진도)
// - [+ 아이 추가]로 다른 반에서 브리핑을 받은 날도 이수(briefings 기록 기준)
// - 미이수: 배정돼 있던 날인데 결석한 날
import { isClassOpenOn } from '../../engine/classTime.ts';
import { STAGE_NAMES, type CurriculumSettings } from '../../engine/curriculum.ts';
import type { DayCell } from '../../engine/types.ts';
import type { BriefingRow, ClassRow, RosterData } from '../../storage/rosterTypes.ts';
import { enrollmentCovers, studentStatusOn } from '../roster/rosterModel.ts';
import { classBriefing, progressCount, recipients } from './briefingModel.ts';

export interface LearnedItem {
  date: string;
  classId: string;
  /** 표시할 코드(예: P9-3, 베이직 · 제목). 진도 미설정이면 "진도 미설정" */
  label: string;
  kind: 'done' | 'absent' | 'guest';
  sent: BriefingRow | null;
}

const labelOf = (b: ReturnType<typeof classBriefing>) =>
  b.code ?? (b.result.kind === 'unset' ? '진도 미설정' : b.result.kind === 'done' ? '과정 완료' : b.result.kind === 'basic' ? STAGE_NAMES.basic : '');

/** 학생의 배운 내용(최근 날짜부터). cells = 회차 엔진 결과(날짜순) */
export function learnedHistory(
  roster: RosterData,
  studentId: string,
  cells: DayCell[],
  settings: CurriculumSettings,
  until: string,
): LearnedItem[] {
  const student = roster.students.find((s) => s.id === studentId);
  if (!student) return [];
  const classById = new Map<string, ClassRow>(roster.classes.map((c) => [c.id, c]));
  const mine = roster.enrollments.filter((e) => e.studentId === studentId);
  const sent = roster.briefings.filter((b) => b.studentId === studentId);
  const absentKey = new Set(roster.absences.filter((a) => a.studentId === studentId).map((a) => `${a.date}|${a.classId}`));
  const items: LearnedItem[] = [];
  const covered = new Set<string>();

  for (const cell of cells) {
    if (cell.date > until || cell.status !== 'session' || !cell.session) continue;
    for (const e of mine) {
      const cls = classById.get(e.classId);
      if (!cls || cls.weekday !== cell.weekday || !enrollmentCovers(e, cell.date) || !isClassOpenOn(cls, cell.date)) continue;
      if (studentStatusOn(student, cell.date) !== 'active') continue;
      const key = `${cell.date}|${cls.id}`;
      if (covered.has(key)) continue;
      covered.add(key);
      const b = classBriefing(roster, cls, cell, settings);
      const record = sent.find((x) => x.date === cell.date && x.classId === cls.id) ?? null;
      items.push({
        date: cell.date,
        classId: cls.id,
        label: record?.code ?? labelOf(b),
        kind: absentKey.has(key) ? 'absent' : 'done',
        sent: record,
      });
    }
  }
  // 다른 반에서 받은 브리핑(보강 등)
  for (const r of sent) {
    if (r.date > until || covered.has(`${r.date}|${r.classId}`)) continue;
    items.push({ date: r.date, classId: r.classId, label: r.code, kind: 'guest', sent: r });
  }
  return items.sort((a, b) => b.date.localeCompare(a.date));
}

export interface ClassDayStatus {
  date: string;
  weekNo: number;
  label: string;
  sent: number;
  total: number;
}

/** 반의 수업월 하나의 브리핑 현황(날짜별 "4/4 보냄"). 오늘 이후 날짜는 빼고 */
export function classMonthStatus(
  roster: RosterData,
  cls: ClassRow,
  courseMonth: string,
  cells: DayCell[],
  settings: CurriculumSettings,
  until: string,
): ClassDayStatus[] {
  return cells
    .filter((c) => c.date <= until && c.status === 'session' && c.session?.courseMonth === courseMonth && c.weekday === cls.weekday && isClassOpenOn(cls, c.date))
    .map((c) => {
      const p = progressCount(recipients(roster, cls.id, c.date, [], [cls.id]));
      return { date: c.date, weekNo: c.session!.weekNo, label: labelOf(classBriefing(roster, cls, c, settings)), ...p };
    });
}
