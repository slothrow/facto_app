// 홈 탭(SPEC_home 3장). 오늘 수업 카드 → 오늘 할 일 → 이번 주 → 다가오는 일 → 바로가기.
import { useMemo } from 'react';
import { useAppData } from '../../app/AppDataContext.tsx';
import { navigate } from '../../app/router.ts';
import { todayStr, useRoster } from '../../app/RosterContext.tsx';
import { Button, Card } from '../../components/ui.tsx';
import { formatTimeKo } from '../../engine/classTime.ts';
import { addDays, weekdayOf } from '../../engine/dates.ts';
import type { ClassRow, RosterData } from '../../storage/rosterTypes.ts';
import type { AppData } from '../../storage/types.ts';
import { classesOnDate } from '../attendance/attendanceModel.ts';
import { progressCount, recipients } from '../briefing/briefingModel.ts';
import { WEEKDAY_NAMES, classDisplayName } from '../roster/rosterModel.ts';
import { bucketize } from '../../engine/tasks/index.ts';
import { TaskSections } from './TaskSections.tsx';
import { allTasks, isAttendanceChecked } from './taskModel.ts';
import { templateTasks } from './templateModel.ts';

export const mdw = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8))}일 (${WEEKDAY_NAMES[weekdayOf(d)]})`;

/** 오늘 다음으로 수업이 있는 날(60일 안) */
function nextClassDay(data: AppData, roster: RosterData, today: string): string | null {
  for (let i = 1; i <= 60; i++) {
    const d = addDays(today, i);
    if (classesOnDate(data, roster, d).classes.length > 0) return d;
  }
  return null;
}

export function HomePage() {
  const { data } = useAppData();
  const { roster } = useRoster();
  const today = todayStr();
  const { classes, noClassReason } = classesOnDate(data, roster, today);
  const checked = new Set(classes.filter((c) => isAttendanceChecked(roster, today, c.id)).map((c) => c.id));
  const buckets = useMemo(() => {
    const d = new Date();
    const tasks = allTasks(data, roster, today, d.getHours() * 60 + d.getMinutes(), templateTasks(data, roster, today));
    return bucketize(tasks, roster.taskStates, today);
  }, [data, roster, today]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{mdw(today)}</h1>
      <div className="md:grid md:grid-cols-[minmax(0,1fr)_320px] md:items-start md:gap-6">
        <div className="space-y-4">
          <TodayClasses data={data} roster={roster} today={today} classes={classes} noClassReason={noClassReason} checked={checked} />
          <TaskSections buckets={buckets} today={today} />
        </div>
        <div className="mt-4 space-y-4 md:sticky md:top-6 md:mt-0">
          <Shortcuts />
        </div>
      </div>
    </div>
  );
}

export function Shortcuts() {
  return (
    <Card title="바로가기">
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => navigate('/roster/vacancy')}>빈자리 보기</Button>
        <Button onClick={() => navigate('/roster/students')}>학생 찾기</Button>
      </div>
    </Card>
  );
}

export function TodayClasses({
  data,
  roster,
  today,
  classes,
  noClassReason,
  checked,
}: {
  data: AppData;
  roster: RosterData;
  today: string;
  classes: ClassRow[];
  noClassReason: string | null;
  /** 출석 확인 완료한 반 id (없으면 표시 안 함) */
  checked?: Set<string>;
}) {
  if (classes.length === 0) {
    const next = nextClassDay(data, roster, today);
    return (
      <Card title="오늘 수업">
        <p className="text-base text-stone-600">
          오늘은 수업이 없습니다
          {noClassReason && !['수업 없음', '주말'].includes(noClassReason) ? ` (${noClassReason})` : ''}
          {next && ` · 다음 수업 ${mdw(next)}`}
        </p>
      </Card>
    );
  }
  const ids = classes.map((c) => c.id);
  return (
    <Card title={`오늘 수업 ${classes.length}반`}>
      <ul className="space-y-2">
        {classes.map((c) => {
          const p = progressCount(recipients(roster, c.id, today, [], ids));
          const absent = roster.absences.filter((a) => a.date === today && a.classId === c.id).length;
          const briefed = p.total > 0 && p.sent === p.total;
          const isChecked = checked?.has(c.id);
          return (
            <li key={c.id} className="flex items-center gap-2 rounded-xl border border-stone-200 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="text-lg font-bold">{formatTimeKo(c.startTime)}</div>
                <div className="truncate text-base text-stone-600">
                  {classDisplayName(c, today)}
                  {absent > 0 && <span className="ml-1 text-red-700">· 결석 {absent}</span>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigate(`/attend/${today}/${c.id}`)}
                className={`min-h-11 shrink-0 rounded-xl border px-3 text-base font-semibold ${
                  isChecked ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-stone-300 bg-white active:bg-stone-100'
                }`}
              >
                출석{checked ? (isChecked ? ' ✓' : ' 미') : ''}
              </button>
              <button
                type="button"
                onClick={() => navigate(`/briefing/${today}/${c.id}`)}
                className={`min-h-11 shrink-0 rounded-xl border px-3 text-base font-semibold ${
                  briefed ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-stone-300 bg-white active:bg-stone-100'
                }`}
              >
                브리핑 {briefed ? '✓' : `${p.sent}/${p.total}`}
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
