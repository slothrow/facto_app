// 하린이 시간표 화면(SPEC_harin 2·3장). 주소 #/harin. 하단 탭 없이 전체 화면, 파스텔 톤.
// 폰 세로: 요일 탭으로 한 요일씩. 가로·PC: 월~금 전체. [오늘]: 오늘(주말이면 월요일) 일정 목록.
import { DndContext } from '@dnd-kit/core';
import { useMemo, useState } from 'react';
import { useAppData } from '../../app/AppDataContext.tsx';
import { navigate } from '../../app/router.ts';
import { todayStr, useRoster } from '../../app/RosterContext.tsx';
import {
  KID_WEEKDAYS,
  agendaText,
  agendaWeekday,
  blockLook,
  buildTravelBlocks,
  dayAgenda,
  mainTimetable,
  visibleRange,
} from '../../engine/harin/index.ts';
import { shortTime } from '../../engine/classTime.ts';
import { useMedia } from '../simulator/useSimEditor.ts';
import { HarinGrid, TRAVEL_STYLE, type GridBlock } from './HarinGrid.tsx';
import { WEEKDAY_LABEL, blocksOf, newTimetable } from './harinModel.ts';

export function HarinPage() {
  const { data } = useAppData();
  const { roster, mutate } = useRoster();
  const phonePortrait = useMedia('(max-width: 767px) and (orientation: portrait)');
  const timetables = useMemo(() => [...roster.kidTimetables].sort((a, b) => a.sort - b.sort), [roster.kidTimetables]);
  const main = mainTimetable(timetables);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const current = timetables.find((t) => t.id === pickedId) ?? main;
  const todayWd = agendaWeekday(todayStr());
  const [day, setDay] = useState<number>(todayWd);
  const [showToday, setShowToday] = useState(false);

  const blocks = useMemo(() => (current ? blocksOf(roster, current.id) : []), [roster, current]);
  const travel = useMemo(() => buildTravelBlocks(blocks, roster.kidActivities), [blocks, roster.kidActivities]);
  const travelCat = roster.kidCategories.find((c) => c.isTravel);
  const grid: GridBlock[] = blocks.map((b) => ({ block: b, look: blockLook(b, roster.kidActivities, roster.kidCategories) }));
  const range = visibleRange(data.settings.harin, [...blocks, ...travel]);
  const days = phonePortrait ? [day] : [...KID_WEEKDAYS];

  return (
    <div className="min-h-dvh bg-[#fff7f2] font-jua text-stone-800">
      <div className="mx-auto w-full max-w-[480px] px-3 pt-3 pb-[calc(2rem+env(safe-area-inset-bottom))] md:max-w-5xl md:px-6">
        <header className="mb-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/home')}
            className="flex h-11 shrink-0 items-center rounded-full bg-white px-3 font-sans text-sm font-semibold text-stone-600 shadow-sm active:bg-stone-100"
          >
            ← 공부방
          </button>
          <h1 className="min-w-0 flex-1 truncate text-center text-2xl text-rose-500">🌷 하린이 시간표</h1>
          <button
            type="button"
            onClick={() => setShowToday((v) => !v)}
            aria-pressed={showToday}
            className={`h-11 shrink-0 rounded-full px-4 text-lg shadow-sm ${showToday ? 'bg-rose-400 text-white' : 'bg-white text-rose-500'}`}
          >
            오늘
          </button>
        </header>

        {!current ? (
          <div className="rounded-3xl bg-white p-6 text-center shadow-sm">
            <p className="mb-4 text-xl">아직 시간표가 없어요 🐣</p>
            <button
              type="button"
              onClick={() => void mutate({ upsert: { kidTimetables: [newTimetable(timetables, '2학기')] } }, '시간표를 만들었어요')}
              className="h-12 rounded-full bg-rose-400 px-6 text-xl text-white shadow active:bg-rose-500"
            >
              시간표 만들기
            </button>
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-center gap-2">
              <select
                value={current.id}
                onChange={(e) => setPickedId(e.target.value)}
                aria-label="시간표 고르기"
                className="h-11 min-w-0 flex-1 rounded-full border-2 border-rose-100 bg-white px-4 text-lg"
              >
                {timetables.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.isMain ? '★ ' : ''}
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            {current.memo && <p className="mb-2 px-2 font-sans text-sm text-stone-500">{current.memo}</p>}

            {showToday && <TodayCard items={dayAgenda(blocks, roster.kidActivities, roster.kidCategories, todayWd)} weekday={todayWd} weekend={todayWd !== new Date().getDay()} />}

            {phonePortrait && (
              <div className="mb-2 flex gap-1 rounded-full bg-white p-1 shadow-sm" role="tablist">
                {KID_WEEKDAYS.map((wd) => (
                  <button
                    key={wd}
                    type="button"
                    role="tab"
                    aria-selected={day === wd}
                    onClick={() => setDay(wd)}
                    className={`h-11 flex-1 rounded-full text-xl ${day === wd ? 'bg-rose-400 text-white' : wd === todayWd ? 'text-rose-500' : 'text-stone-500'}`}
                  >
                    {WEEKDAY_LABEL[wd]}
                  </button>
                ))}
              </div>
            )}

            <DndContext>
              <HarinGrid
                days={days}
                range={range}
                blocks={grid}
                travel={travel}
                travelEmoji={travelCat?.emoji ?? '🚶'}
                unitClass={phonePortrait ? '[--u:2.2px]' : '[--u:1.7px] lg:[--u:1.9px]'}
              />
            </DndContext>
            {blocks.length === 0 && <p className="mt-3 text-center font-sans text-base text-stone-500">아직 일정이 없어요.</p>}
          </>
        )}
      </div>
    </div>
  );
}

function TodayCard({ items, weekday, weekend }: { items: ReturnType<typeof dayAgenda>; weekday: number; weekend: boolean }) {
  return (
    <section className="mb-3 rounded-3xl bg-white p-4 shadow-sm">
      <h2 className="mb-2 text-xl text-rose-500">
        {weekend ? `월요일 일정 (주말이라 월요일을 보여 줘요)` : `오늘(${WEEKDAY_LABEL[weekday]}) 일정`}
      </h2>
      {items.length === 0 ? (
        <p className="font-sans text-base text-stone-500">일정이 없어요.</p>
      ) : (
        <ol className="space-y-1.5">
          {items.map((it, i) => (
            <li key={i} className="flex items-center gap-2 text-lg">
              <span className="w-12 shrink-0 text-right text-stone-500">{shortTime(it.startTime)}</span>
              {it.kind === 'travel' ? (
                <span className="rounded-full px-2 text-base text-stone-500" style={TRAVEL_STYLE}>
                  {it.emoji} {it.name} {it.minutes}분
                </span>
              ) : (
                <span className="min-w-0 truncate">
                  {it.emoji} {it.name} <span className="text-base text-stone-500">({shortTime(it.startTime)}~{shortTime(it.endTime)})</span>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      <p className="sr-only">{agendaText(items)}</p>
    </section>
  );
}
