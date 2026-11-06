// 반 화면: 기본은 한 페이지 주간 시간표(TimetableGrid), [목록]으로 바꾸면 요일별 반 목록(경고 배지 자세히).
// 주소: #/roster/classes(시간표), #/roster/classes/list(목록)
import { useMemo, useState } from 'react';
import { navigate } from '../../../app/router.ts';
import { todayStr, useRoster } from '../../../app/RosterContext.tsx';
import { CheckIcon, PlusIcon } from '../../../components/icons.tsx';
import { Button, Card } from '../../../components/ui.tsx';
import { formatTimeKo, isClassActive } from '../../../engine/classTime.ts';
import { schoolYearOf } from '../../../engine/grade.ts';
import type { ClassRow, RosterData } from '../../../storage/rosterTypes.ts';
import { waitlistMatchesForClass } from '../waitlist/waitlistModel.ts';
import {
  CAPACITY,
  CLASS_WEEKDAYS,
  WEEKDAY_NAMES,
  classBadges,
  classGradeLabel,
  classHeadcount,
  compareClasses,
} from '../rosterModel.ts';
import { ClassForm } from './ClassForm.tsx';
import { useAppData } from '../../../app/AppDataContext.tsx';
import { formatProgress } from '../../../engine/curriculum.ts';
import type { SessionLabel } from '../../../engine/types.ts';
import { classProgressNow, courseMonthLabel, curriculumOf, currentSessionByWeekday } from '../../curriculum/curriculumModel.ts';
import { TimetableGrid } from './TimetableGrid.tsx';

export function ClassListView({ mode }: { mode?: string }) {
  const { roster } = useRoster();
  const today = todayStr();
  const [adding, setAdding] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const timetable = mode !== 'list';

  const active = useMemo(() => roster.classes.filter((c) => isClassActive(c, today)).sort(compareClasses), [roster.classes, today]);
  const closed = roster.classes.filter((c) => !isClassActive(c, today)).sort(compareClasses);

  return (
    <div className="space-y-4">
      <NewSchoolYearNotice today={today} hasClasses={active.length > 0} />

      <div className="flex items-center gap-2">
        <div className="flex rounded-xl border border-stone-300 bg-white p-0.5">
          {[
            { on: timetable, label: '시간표', to: '/roster/classes' },
            { on: !timetable, label: '목록', to: '/roster/classes/list' },
          ].map((b) => (
            <button
              key={b.label}
              type="button"
              aria-pressed={b.on}
              onClick={() => navigate(b.to)}
              className={`h-10 rounded-lg px-3 text-base font-medium ${b.on ? 'bg-emerald-700 text-white' : 'text-stone-600'}`}
            >
              {b.label}
            </button>
          ))}
        </div>
        <Button variant="primary" className="ml-auto flex items-center gap-1 px-3" onClick={() => navigate(`/attend/${today}`)}>
          <CheckIcon className="h-5 w-5" /> 오늘 출석
        </Button>
        <Button className="flex items-center gap-1 px-3" onClick={() => setAdding(true)} aria-label="반 추가">
          <PlusIcon className="h-5 w-5" /> 반
        </Button>
      </div>

      {active.length === 0 && (
        <Card>
          <p className="text-base text-stone-600">
            아직 반이 없어요. [반 추가]로 만들거나, 학생 탭의 [붙여넣기로 가져오기]로 명단을 넣으면 반이 함께 만들어져요.
          </p>
        </Card>
      )}

      {timetable ? <TimetableGrid classes={active} /> : <ClassList classes={active} roster={roster} today={today} />}
      {!timetable && (
        <Button className="w-full" onClick={() => navigate('/roster/progress-import')}>
          진도 일괄 입력
        </Button>
      )}

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
  const { data } = useAppData();
  const current = useMemo(() => currentSessionByWeekday(data, today), [data, today]);
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
                  <ClassRowButton cls={c} roster={roster} today={today} muted={muted} current={current} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function ClassRowButton({
  cls,
  roster,
  today,
  muted,
  current,
}: {
  cls: ClassRow;
  roster: RosterData;
  today: string;
  muted?: boolean;
  current: Map<number, SessionLabel>;
}) {
  const { data } = useAppData();
  const now = classProgressNow(roster, cls, current);
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
        {!muted && (
          <div className={`text-sm ${now.progress.kind === 'unset' ? 'text-amber-700' : 'text-stone-600'}`}>
            진도 <b>{formatProgress(now.progress, curriculumOf(data))}</b>
            {now.session && now.progress.kind !== 'unset' && <> · {courseMonthLabel(now.session.courseMonth)}</>}
          </div>
        )}
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

