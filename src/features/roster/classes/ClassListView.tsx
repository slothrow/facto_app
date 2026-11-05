// 반 목록(요일별 → 시간순)과 주간 시간표 보기.
// 시간표: 폰에서는 요일 탭 전환, 태블릿·PC(md 이상)에서는 요일×시간 전체 격자.
import { useMemo, useState } from 'react';
import { navigate } from '../../../app/router.ts';
import { todayStr, useRoster } from '../../../app/RosterContext.tsx';
import { PlusIcon } from '../../../components/icons.tsx';
import { Button, Card } from '../../../components/ui.tsx';
import { formatTimeKo, gapMinutes, isClassActive, shortTime, toMinutes } from '../../../engine/classTime.ts';
import { schoolYearOf } from '../../../engine/grade.ts';
import type { ClassRow, RosterData } from '../../../storage/rosterTypes.ts';
import { waitlistMatchesForClass } from '../waitlist/waitlistModel.ts';
import {
  CAPACITY,
  CLASS_WEEKDAYS,
  WEEKDAY_NAMES,
  classBadges,
  classEndTime,
  classGradeLabel,
  classHeadcount,
  compareClasses,
} from '../rosterModel.ts';
import { ClassForm } from './ClassForm.tsx';

export function ClassListView({ mode }: { mode?: string }) {
  const { roster } = useRoster();
  const today = todayStr();
  const [adding, setAdding] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const timetable = mode === 'timetable';

  const active = useMemo(() => roster.classes.filter((c) => isClassActive(c, today)).sort(compareClasses), [roster.classes, today]);
  const closed = roster.classes.filter((c) => !isClassActive(c, today)).sort(compareClasses);

  return (
    <div className="space-y-4">
      <NewSchoolYearNotice today={today} hasClasses={active.length > 0} />

      <div className="flex items-center gap-2">
        <div className="flex rounded-xl border border-stone-300 bg-white p-0.5">
          {[
            { on: !timetable, label: '목록', to: '/roster/classes' },
            { on: timetable, label: '시간표', to: '/roster/classes/timetable' },
          ].map((b) => (
            <button
              key={b.label}
              type="button"
              aria-pressed={b.on}
              onClick={() => navigate(b.to)}
              className={`h-10 rounded-lg px-4 text-base font-medium ${b.on ? 'bg-emerald-700 text-white' : 'text-stone-600'}`}
            >
              {b.label}
            </button>
          ))}
        </div>
        <Button variant="primary" className="ml-auto flex items-center gap-1" onClick={() => setAdding(true)}>
          <PlusIcon className="h-5 w-5" /> 반 추가
        </Button>
      </div>

      {active.length === 0 && (
        <Card>
          <p className="text-base text-stone-600">
            아직 반이 없어요. [반 추가]로 만들거나, 학생 탭의 [붙여넣기로 가져오기]로 명단을 넣으면 반이 함께 만들어져요.
          </p>
        </Card>
      )}

      {timetable ? <Timetable classes={active} roster={roster} today={today} /> : <ClassList classes={active} roster={roster} today={today} />}

      {closed.length > 0 && (
        <div>
          <Button variant="ghost" className="w-full text-stone-500" onClick={() => setShowClosed((v) => !v)}>
            폐반한 반 {closed.length}개 {showClosed ? '숨기기' : '보기'}
          </Button>
          {showClosed && <ClassList classes={closed} roster={roster} today={today} muted />}
        </div>
      )}

      {adding && <ClassForm onClose={() => setAdding(false)} />}
    </div>
  );
}

function ClassList({ classes, roster, today, muted }: { classes: ClassRow[]; roster: RosterData; today: string; muted?: boolean }) {
  return (
    <div className="space-y-4">
      {CLASS_WEEKDAYS.map((wd) => {
        const list = classes.filter((c) => c.weekday === wd);
        if (list.length === 0) return null;
        return (
          <section key={wd}>
            <h2 className="mb-2 px-1 text-base font-bold text-stone-700">{WEEKDAY_NAMES[wd]}요일</h2>
            <ul className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
              {list.map((c) => (
                <li key={c.id} className="border-b border-stone-100 last:border-b-0">
                  <ClassRowButton cls={c} roster={roster} today={today} muted={muted} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function ClassRowButton({ cls, roster, today, muted }: { cls: ClassRow; roster: RosterData; today: string; muted?: boolean }) {
  const count = classHeadcount(roster, cls.id, today);
  const badges = classBadges(roster, cls, today);
  const waiting = muted ? 0 : waitlistMatchesForClass(roster, cls, today).length;
  return (
    <button
      type="button"
      onClick={() => navigate(`/roster/class/${cls.id}`)}
      className={`flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left active:bg-stone-50 ${muted ? 'opacity-60' : ''}`}
    >
      <div className="min-w-0 flex-1">
        <div className="text-base font-semibold text-stone-900">
          {formatTimeKo(cls.startTime)} <span className="text-emerald-800">{classGradeLabel(cls, today)}</span>
          {cls.alias && <span className="ml-1 text-stone-600">{cls.alias}</span>}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-1">
          {badges.map((b) => (
            <span key={b.kind} className="rounded-full bg-amber-100 px-2 py-0.5 text-sm text-amber-900">
              {b.text}
            </span>
          ))}
          {waiting > 0 && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sm text-sky-900">대기 {waiting}</span>}
          {muted && cls.closedOn && <span className="text-sm text-stone-500">{cls.closedOn} 폐반</span>}
        </div>
      </div>
      <span className={`shrink-0 text-lg font-bold ${count > CAPACITY ? 'text-red-700' : 'text-stone-700'}`}>
        {count}/{CAPACITY}
      </span>
    </button>
  );
}

function Timetable({ classes, roster, today }: { classes: ClassRow[]; roster: RosterData; today: string }) {
  const [day, setDay] = useState<number>(() => {
    const wd = new Date().getDay();
    return wd >= 1 && wd <= 5 ? wd : 1;
  });
  const times = [...new Set(classes.map((c) => c.startTime))].sort((a, b) => toMinutes(a) - toMinutes(b));

  return (
    <>
      {/* 폰: 요일 탭 */}
      <div className="md:hidden">
        <div className="mb-3 flex gap-1">
          {CLASS_WEEKDAYS.map((wd) => (
            <button
              key={wd}
              type="button"
              aria-pressed={day === wd}
              onClick={() => setDay(wd)}
              className={`h-11 flex-1 rounded-xl border text-base font-medium ${
                day === wd ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-stone-300 bg-white'
              }`}
            >
              {WEEKDAY_NAMES[wd]}
            </button>
          ))}
        </div>
        <DayColumn classes={classes.filter((c) => c.weekday === day)} roster={roster} today={today} />
      </div>

      {/* 태블릿·PC: 전체 격자 */}
      <div className="hidden md:block">
        <table className="w-full table-fixed border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="w-24" />
              {CLASS_WEEKDAYS.map((wd) => (
                <th key={wd} className="py-2 text-base font-bold text-stone-700">
                  {WEEKDAY_NAMES[wd]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {times.map((t) => (
              <tr key={t}>
                <th className="pr-2 text-right align-top text-sm font-medium text-stone-500">{formatTimeKo(t)}</th>
                {CLASS_WEEKDAYS.map((wd) => {
                  // 같은 줄에는 시작 시간이 같은 반만 둔다(시간이 다른 반은 각자의 줄에)
                  const c = classes.find((x) => x.weekday === wd && x.startTime === t);
                  return <td key={wd} className="align-top">{c ? <TimetableCell cls={c} roster={roster} today={today} /> : null}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function DayColumn({ classes, roster, today }: { classes: ClassRow[]; roster: RosterData; today: string }) {
  if (classes.length === 0) return <p className="py-6 text-center text-base text-stone-500">이 요일에는 반이 없어요.</p>;
  return (
    <ol className="space-y-2">
      {classes.map((c, i) => {
        const prev = classes[i - 1];
        const gap = prev ? gapMinutes(prev.startTime, c.startTime) : null;
        return (
          <li key={c.id}>
            {gap !== null && (
              <p className={`py-1 text-center text-sm ${gap < 10 ? 'font-semibold text-amber-700' : 'text-stone-400'}`}>
                쉬는 시간 {gap}분
              </p>
            )}
            <TimetableCell cls={c} roster={roster} today={today} showTime />
          </li>
        );
      })}
    </ol>
  );
}

function TimetableCell({ cls, roster, today, showTime }: { cls: ClassRow; roster: RosterData; today: string; showTime?: boolean }) {
  const count = classHeadcount(roster, cls.id, today);
  const warn = classBadges(roster, cls, today).length > 0;
  return (
    <button
      type="button"
      onClick={() => navigate(`/roster/class/${cls.id}`)}
      className={`w-full rounded-xl border px-3 py-2 text-left ${warn ? 'border-amber-300 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}
    >
      {showTime && (
        <div className="text-sm text-stone-600">
          {formatTimeKo(cls.startTime)} ~ {shortTime(classEndTime(cls))}
        </div>
      )}
      <div className="text-base font-bold text-stone-900">
        {classGradeLabel(cls, today)} {cls.alias && <span className="font-medium text-stone-600">{cls.alias}</span>}
      </div>
      <div className="text-sm text-stone-600">
        {count}/{CAPACITY}명
      </div>
    </button>
  );
}

/** 3월(새 학년도)에 한 번만 보여 주는 안내. 이 기기에서 닫으면 그 학년도에는 다시 안 뜬다 */
function NewSchoolYearNotice({ today, hasClasses }: { today: string; hasClasses: boolean }) {
  const year = schoolYearOf(today);
  const key = `facto-app:schoolYearNotice:${year}`;
  const [dismissed, setDismissed] = useState(() => {
    try {
      return window.localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  });
  if (!hasClasses || today.slice(5, 7) !== '03' || dismissed) return null;
  const close = () => {
    try {
      window.localStorage.setItem(key, '1');
    } catch {
      /* 저장이 안 돼도 이번 화면에서는 닫는다 */
    }
    setDismissed(true);
  };
  return (
    <div className="flex items-start gap-2 rounded-2xl bg-sky-50 p-4 text-base text-sky-900">
      <p className="flex-1">새 학년도({year})로 바뀌었습니다. 반 학년이 한 학년씩 올라갔으니 확인하세요.</p>
      <Button variant="ghost" onClick={close} className="shrink-0">
        확인
      </Button>
    </div>
  );
}

