// 하린이 숙제 화면 조각(SPEC_harin 15장): 오늘의 숙제 카드, 날짜별 체크 목록, 주간 배지, 날짜 시트.
// 체크는 부모가 한다. 날짜별로 kid_homework_checks에 저장한다.
import { useMemo } from 'react';
import { useRoster } from '../../app/RosterContext.tsx';
import { BottomSheet } from '../../components/ui.tsx';
import { addDays, weekdayOf } from '../../engine/dates.ts';
import {
  homeworksForDate,
  isHomeworkDone,
  mainTimetable,
  missedHomeworks,
  nextWorkdayOnOrAfter,
} from '../../engine/harin/index.ts';
import type { KidHomeworkCheckRow, KidHomeworkRow } from '../../storage/rosterTypes.ts';
import { WEEKDAY_LABEL } from './harinModel.ts';

const dayName = (date: string) => `${WEEKDAY_LABEL[weekdayOf(date)] ?? ''}요일`;
const md = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

/** 숙제 계산·체크 저장을 한곳에 모은 훅. 학원 숙제는 대표 시간표만 본다 */
export function useKidHomework() {
  const { roster, mutate } = useRoster();
  const main = mainTimetable(roster.kidTimetables);
  const mainBlocks = useMemo(() => (main ? roster.kidBlocks.filter((b) => b.timetableId === main.id) : []), [roster.kidBlocks, main]);
  const homeworks = roster.kidHomeworks;
  const checks = roster.kidHomeworkChecks;
  const acts = roster.kidActivities;

  const forDate = (date: string) => homeworksForDate(date, homeworks, mainBlocks, acts);
  const isDone = (date: string, id: string) => isHomeworkDone(checks, date, id);
  const doneCount = (date: string) => forDate(date).filter((h) => isDone(date, h.id)).length;
  const missed = (date: string) => missedHomeworks(date, homeworks, checks, mainBlocks, acts);

  const toggle = (date: string, hw: KidHomeworkRow) => {
    const exists = checks.find((c) => c.date === date && c.homeworkId === hw.id);
    void mutate(
      exists
        ? { remove: { kidHomeworkChecks: [exists] } }
        : { upsert: { kidHomeworkChecks: [{ date, homeworkId: hw.id, doneAt: new Date().toISOString() } satisfies KidHomeworkCheckRow] } },
      '',
    );
  };

  return { homeworks, forDate, isDone, doneCount, missed, toggle };
}
export type KidHomework = ReturnType<typeof useKidHomework>;

/** 체크 목록. 체크하면 취소선 */
export function HomeworkChecklist({ date, hw, size = 'normal' }: { date: string; hw: KidHomework; size?: 'normal' | 'small' }) {
  const items = hw.forDate(date);
  if (items.length === 0) return <p className="font-sans text-base text-stone-500">이 날은 숙제가 없어요 🎈</p>;
  return (
    <ul className={size === 'small' ? 'space-y-1' : 'space-y-1.5'}>
      {items.map((h) => (
        <HomeworkRow key={h.id} date={date} item={h} hw={hw} small={size === 'small'} />
      ))}
    </ul>
  );
}

function HomeworkRow({ date, item, hw, small }: { date: string; item: KidHomeworkRow; hw: KidHomework; small?: boolean }) {
  const done = hw.isDone(date, item.id);
  return (
    <li>
      <label className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl px-2 ${done ? 'bg-emerald-50/60' : 'active:bg-sky-50'}`}>
        <input type="checkbox" className="h-6 w-6 shrink-0 accent-rose-500" checked={done} onChange={() => hw.toggle(date, item)} />
        <span className={`min-w-0 flex-1 ${small ? 'text-base' : 'text-lg'} ${done ? 'text-stone-400 line-through' : ''}`}>
          <span className="mr-1">{item.emoji}</span>
          {item.name}
        </span>
        {item.minutes ? <span className="shrink-0 font-sans text-sm text-stone-400">{item.minutes}분</span> : null}
      </label>
    </li>
  );
}

/** 하린 화면 맨 위 "오늘의 숙제" 카드. 주말이면 다음 월요일 숙제를 보여 준다 */
export function TodayHomeworkCard({ today, hw, onRegister }: { today: string; hw: KidHomework; onRegister: () => void }) {
  const date = nextWorkdayOnOrAfter(today);
  const items = hw.forDate(date);
  const done = hw.doneCount(date);
  const missed = hw.missed(date);
  const isToday = date === today;
  const missedLabel = missed.date === addDays(today, -1) ? '어제' : missed.date ? dayName(missed.date) : '';

  if (hw.homeworks.length === 0) {
    return (
      <section className="mb-3 rounded-3xl bg-white p-4 shadow-sm">
        <h2 className="text-xl text-sky-600">✏️ 오늘의 숙제</h2>
        <p className="mt-1 font-sans text-base text-stone-500">숙제를 등록해 두면 날마다 여기에 자동으로 떠요.</p>
        <button type="button" onClick={onRegister} className="mt-2 h-11 rounded-full bg-sky-100 px-5 text-lg text-sky-700 active:bg-sky-200">
          숙제 등록하기
        </button>
      </section>
    );
  }

  return (
    <section className="mb-3 rounded-3xl bg-white p-4 shadow-sm">
      {missed.homeworks.length > 0 && (
        <div className="mb-3 rounded-2xl bg-amber-50 p-2">
          <p className="px-1 font-sans text-sm font-semibold text-amber-700">
            {missedLabel} 못 한 숙제 {missed.homeworks.length}개
          </p>
          <ul className="mt-1 space-y-0.5">
            {missed.homeworks.map((h) => (
              <HomeworkRow key={h.id} date={missed.date} item={h} hw={hw} small />
            ))}
          </ul>
        </div>
      )}
      <h2 className="mb-1 flex items-baseline gap-2 text-xl text-sky-600">
        <span>✏️ {isToday ? '오늘의 숙제' : `${dayName(date)} 숙제`}</span>
        {items.length > 0 && (
          <span className="font-sans text-sm text-stone-400">
            {done}/{items.length}
          </span>
        )}
      </h2>
      <HomeworkChecklist date={date} hw={hw} />
      {items.length > 0 && done === items.length && <p className="mt-2 rounded-2xl bg-emerald-100 py-2 text-center text-xl text-emerald-700">오늘 숙제 끝! 🎉</p>}
    </section>
  );
}

/** 그날 숙제 패널(하루 보기·숙제 블록 상세) */
export function HomeworkPanel({ date, hw, title }: { date: string; hw: KidHomework; title?: string }) {
  const items = hw.forDate(date);
  const done = hw.doneCount(date);
  return (
    <div className="rounded-3xl bg-white p-4 shadow-sm">
      <h2 className="mb-1 flex items-baseline gap-2 text-xl text-sky-600">
        <span>✏️ {title ?? `${md(date)} 숙제`}</span>
        {items.length > 0 && (
          <span className="font-sans text-sm text-stone-400">
            {done}/{items.length}
          </span>
        )}
      </h2>
      <HomeworkChecklist date={date} hw={hw} />
      {items.length > 0 && done === items.length && <p className="mt-2 rounded-2xl bg-emerald-100 py-2 text-center text-lg text-emerald-700">숙제 끝! 🎉</p>}
    </div>
  );
}

/** 주간 요일 머리글 아래 배지: ✏️3 / 다 했으면 ✅. 눌러서 그날 숙제 시트 */
export function HomeworkBadge({ date, hw, onOpen }: { date: string; hw: KidHomework; onOpen: (date: string) => void }) {
  const total = hw.forDate(date).length;
  if (total === 0) return null;
  const left = total - hw.doneCount(date);
  return (
    <button
      type="button"
      onClick={() => onOpen(date)}
      aria-label={`${md(date)} 숙제 ${total}개 중 ${left}개 남음`}
      className={`mx-auto mt-0.5 block min-h-6 rounded-full px-1.5 font-sans text-xs font-semibold leading-6 ${left === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-700'}`}
    >
      {left === 0 ? '✅' : `✏️${left}`}
    </button>
  );
}

export function HomeworkDaySheet({ date, hw, onClose }: { date: string; hw: KidHomework; onClose: () => void }) {
  return (
    <BottomSheet title={`${md(date)} (${dayName(date)}) 숙제`} onClose={onClose}>
      <div className="font-jua">
        <HomeworkChecklist date={date} hw={hw} />
      </div>
    </BottomSheet>
  );
}
