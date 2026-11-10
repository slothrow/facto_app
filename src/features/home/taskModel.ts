// 홈 할 일: 앱 데이터 → 자동 할 일 입력(사실 계산), 모든 할 일 모으기, 상태 저장 변경. 순수 함수.
import { isClassOpenOn } from '../../engine/classTime.ts';
import { addDays } from '../../engine/dates.ts';
import { buildAutoTasks, type AutoTaskInput, type Task } from '../../engine/tasks/index.ts';
import type { RosterChange, RosterData, TaskRow, TaskStateRow } from '../../storage/rosterTypes.ts';
import type { AppData } from '../../storage/types.ts';
import { classesOnDate } from '../attendance/attendanceModel.ts';
import { progressCount, recipients } from '../briefing/briefingModel.ts';
import { classProgressNow, currentSessionByWeekday } from '../curriculum/curriculumModel.ts';
import { classDisplayName } from '../roster/rosterModel.ts';
import { trialPerson } from '../roster/waitlist/waitlistModel.ts';

/** 출석 확인 완료: 확인 기록이 있거나 결석을 하나라도 표시했으면 */
export function isAttendanceChecked(roster: Pick<RosterData, 'attendanceChecks' | 'absences'>, date: string, classId: string): boolean {
  return (
    roster.attendanceChecks.some((c) => c.date === date && c.classId === classId) ||
    roster.absences.some((a) => a.date === date && a.classId === classId)
  );
}

export function autoTaskInput(data: AppData, roster: RosterData, today: string, nowMinutes: number): AutoTaskInput {
  const day = classesOnDate(data, roster, today);
  const ids = day.classes.map((c) => c.id);
  const current = currentSessionByWeekday(data, today);
  const open = roster.classes.filter((c) => isClassOpenOn(c, today));
  const nameOf = new Map(roster.students.map((s) => [s.id, s.name]));

  // 학생별 가장 최근 상담 기록(새 기록이 생기면 예전 "다음 연락"은 사라진다)
  const latest = new Map<string, RosterData['counselingNotes'][number]>();
  for (const n of roster.counselingNotes) {
    const cur = latest.get(n.studentId);
    if (!cur || n.date > cur.date || (n.date === cur.date && n.id > cur.id)) latest.set(n.studentId, n);
  }
  const enrolledNow = new Set(roster.enrollments.filter((e) => e.startDate <= today && (!e.endDate || e.endDate >= today)).map((e) => e.studentId));

  return {
    nowMinutes,
    exportStartMonths: data.exportHistory.map((e) => e.startMonth),
    confirmedMonths: data.monthPlans.filter((m) => m.status === 'confirmed').map((m) => m.calendarMonth),
    progressMissing: open.filter((c) => classProgressNow(roster, c, current).progress.kind === 'unset').length,
    todayClasses: day.classes.map((c) => {
      const p = progressCount(recipients(roster, c.id, today, [], ids));
      return { id: c.id, label: classDisplayName(c, today), startTime: c.startTime, checked: isAttendanceChecked(roster, today, c.id), unsent: p.total - p.sent };
    }),
    trials: roster.trialLessons.map((t) => ({ id: t.id, date: t.date, name: trialPerson(roster, t, t.date).name })),
    counseling: [...latest.values()].map((n) => ({ id: n.id, studentId: n.studentId, name: nameOf.get(n.studentId) ?? '학생', nextContactOn: n.nextContactOn })),
    waitlist: roster.waitlist.map((w) => {
      const last = [...w.stageHistory].reverse().find((h) => h.stage === w.stage);
      return { id: w.id, name: w.name, stage: w.stage, since: last?.date ?? w.inquiredOn ?? today };
    }),
    needsReview: roster.students.filter((s) => s.status !== 'left' && s.needsReview).length,
    availabilityMissing: roster.students.filter((s) => s.status === 'active' && enrolledNow.has(s.id) && Object.keys(s.availability ?? {}).length === 0).length,
    returning: roster.students
      .filter((s) => s.status === 'paused' && s.statusTo)
      .map((s) => ({ id: s.id, name: s.name, returnOn: addDays(s.statusTo!, 1) })),
    lastBackupAt: data.settings.lastBackupAt ?? null,
  };
}

export const manualTasks = (tasks: TaskRow[]): Task[] =>
  tasks.map((t) => ({ key: `manual:${t.id}`, kind: 'manual', title: t.title, due: t.dueDate, detail: t.memo ?? undefined, category: t.category }));

/** 할 일 상태 저장(완료·미루기·숨기기). 같은 키가 있으면 덮어쓴다 */
export function setTaskState(taskKey: string, patch: Pick<TaskStateRow, 'status'> & Partial<TaskStateRow>, now: string): RosterChange {
  const row: TaskStateRow = {
    taskKey,
    status: patch.status,
    snoozeUntil: patch.snoozeUntil ?? null,
    memo: patch.memo ?? null,
    doneAt: patch.status === 'done' ? now : null,
  };
  return { upsert: { taskStates: [row] } };
}

export function allTasks(data: AppData, roster: RosterData, today: string, nowMinutes: number, extra: Task[] = []): Task[] {
  return [...buildAutoTasks(today, autoTaskInput(data, roster, today, nowMinutes), data.settings.taskRules ?? {}), ...extra, ...manualTasks(roster.tasks)];
}
