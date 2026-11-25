// 하린이 시간표 화면(SPEC_harin 2·3·7장). 주소 #/harin. 하단 탭 없이 전체 화면, 파스텔 톤.
// 폰 세로: 요일 탭으로 한 요일씩. 가로·PC: 월~금 전체. [오늘]: 오늘(주말이면 월요일) 일정 목록.
// 편집(편성 시뮬레이터 방식): 블록 탭 → 선택 → 칸 탭으로 옮기기 / 다시 탭하면 고치기.
// 끌기: PC는 마우스로 5px 이상, 폰은 0.25초 길게 눌러서. 선택한 블록 아래 손잡이를 끌면 길이 조절.
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useMemo, useRef, useState } from 'react';
import { useAppData } from '../../app/AppDataContext.tsx';
import { navigate } from '../../app/router.ts';
import { todayStr, useRoster } from '../../app/RosterContext.tsx';
import { ConfirmDialog } from '../../components/ui.tsx';
import { fromMinutes, shortTime, toMinutes } from '../../engine/classTime.ts';
import {
  INPUT_END,
  INPUT_START,
  KID_WEEKDAYS,
  agendaWeekday,
  blockLook,
  buildTravelBlocks,
  canPlaceKid,
  dayAgenda,
  durationOf,
  mainTimetable,
  visibleRange,
  type TravelBlock,
} from '../../engine/harin/index.ts';
import { dropStart, grabOffset, snapMinutes } from '../../engine/timeRange.ts';
import type { KidBlockRow } from '../../storage/rosterTypes.ts';
import { useMedia } from '../simulator/useSimEditor.ts';
import { BlockSheet, CopySheet, TravelSheet, type BlockSheetMode } from './BlockSheets.tsx';
import { HarinGrid, TRAVEL_STYLE, type GridBlock, type GridPreview } from './HarinGrid.tsx';
import { WEEKDAY_LABEL, copyToDays, moveBlock, newTimetable, replaceBlock, setTravel } from './harinModel.ts';
import { useHarinEditor } from './useHarinEditor.ts';

type Drag = { kind: 'move' | 'resize'; id: string; offset: number; touch: boolean };

export function HarinPage() {
  const { data, showToast } = useAppData();
  const { roster, mutate } = useRoster();
  const phonePortrait = useMedia('(max-width: 767px) and (orientation: portrait)');
  const timetables = useMemo(() => [...roster.kidTimetables].sort((a, b) => a.sort - b.sort), [roster.kidTimetables]);
  const main = mainTimetable(timetables);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const current = timetables.find((t) => t.id === pickedId) ?? main;
  const todayWd = agendaWeekday(todayStr());
  const [day, setDay] = useState<number>(todayWd);
  const [showToday, setShowToday] = useState(false);
  const { blocks, apply, undo, redo, canUndo, canRedo } = useHarinEditor(current?.id ?? null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<BlockSheetMode | null>(null);
  const [travelSheet, setTravelSheet] = useState<TravelBlock | null>(null);
  const [copyOf, setCopyOf] = useState<KidBlockRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<KidBlockRow | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [preview, setPreview] = useState<GridPreview | null>(null);
  const justDragged = useRef(0);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
  );

  const acts = roster.kidActivities;
  const cats = roster.kidCategories;
  const travel = useMemo(() => buildTravelBlocks(blocks, acts), [blocks, acts]);
  const travelCat = cats.find((c) => c.isTravel);
  const grid: GridBlock[] = blocks.map((b) => ({ block: b, look: blockLook(b, acts, cats) }));
  const range = visibleRange(data.settings.harin, [...blocks, ...travel]);
  const days = phonePortrait ? [day] : [...KID_WEEKDAYS];
  const selected = blocks.find((b) => b.id === selectedId) ?? null;
  const labelOf = (b: KidBlockRow) => {
    const l = blockLook(b, acts, cats);
    return `${l.emoji} ${l.name}`;
  };

  // ---------- 조작 ----------
  const tryMove = (b: KidBlockRow, weekday: number, start: string, end?: string) => {
    const p = canPlaceKid(blocks, b, weekday, start, end);
    if (!p.ok) {
      showToast(`놓을 수 없어요: ${p.reason}`);
      return false;
    }
    const next = end ? { ...b, weekday, startTime: start, endTime: end } : moveBlock(b, weekday, start);
    apply(replaceBlock(blocks, next));
    return true;
  };

  const onCell = (weekday: number, start: string) => {
    if (!current) return;
    if (selected) {
      if (tryMove(selected, weekday, start)) {
        showToast(`${WEEKDAY_LABEL[weekday]} ${shortTime(start)}로 옮겼어요`);
        setSelectedId(null);
      }
      return;
    }
    if (toMinutes(start) < toMinutes(INPUT_START) || toMinutes(start) >= toMinutes(INPUT_END)) return;
    setSheet({ kind: 'new', weekday, start });
  };

  const onBlock = (id: string) => {
    if (Date.now() - justDragged.current < 400) return; // 끌기 끝의 클릭은 무시
    if (selectedId === id) {
      const b = blocks.find((x) => x.id === id);
      if (b) setSheet({ kind: 'edit', block: b });
      return;
    }
    setSelectedId(id);
  };

  const saveBlock = (b: KidBlockRow) => {
    const exists = blocks.some((x) => x.id === b.id);
    apply(exists ? replaceBlock(blocks, b) : [...blocks, b], exists ? '고쳤어요' : '넣었어요');
    setSheet(null);
    setSelectedId(null);
    if (b.weekday !== day && phonePortrait) setDay(b.weekday);
  };

  const doDelete = (b: KidBlockRow) => {
    apply(blocks.filter((x) => x.id !== b.id), '지웠어요 (되돌리기 가능)');
    setConfirmDelete(null);
    setSheet(null);
    setSelectedId(null);
  };

  const doCopy = (src: KidBlockRow, weekdays: number[]) => {
    const r = copyToDays(blocks, src, weekdays);
    if (r.added.length) apply(r.next);
    const addedText = r.added.map((d) => WEEKDAY_LABEL[d]).join('·');
    const skippedText = r.skipped.map((d) => WEEKDAY_LABEL[d]).join('·');
    showToast(
      r.added.length === 0
        ? `복사하지 못했어요(${skippedText}: 그 시간에 일정 있음)`
        : `${addedText}에 복사했어요${r.skipped.length ? ` (${skippedText}은 겹쳐서 건너뜀)` : ''}`,
    );
    setCopyOf(null);
    setSelectedId(null);
  };

  const setTravelMinutes = (t: TravelBlock, minutes: number | null) => {
    const owner = blocks.find((b) => b.id === t.ownerId);
    if (!owner) return;
    apply(replaceBlock(blocks, setTravel(owner, t.side, minutes)), minutes === 0 ? '이번만 이동 없음' : '이동 시간을 바꿨어요');
    setTravelSheet(null);
  };

  // ---------- 끌기 ----------
  const minStart = Math.max(range.start, toMinutes(INPUT_START));
  const maxEnd = Math.min(range.end, toMinutes(INPUT_END));
  /** 1분당 화면 높이(px) */
  const unitPx = () => {
    const col = document.querySelector('[data-harin-day]');
    return col ? col.getBoundingClientRect().height / (range.end - range.start) : 2;
  };
  const collision: CollisionDetection = (args) => {
    const hit = pointerWithin(args).find((h) => String(h.id).startsWith('cell:'));
    return hit ? [hit] : [];
  };
  const moveTarget = (overId: string | undefined, b: KidBlockRow, offset: number) => {
    if (!overId?.startsWith('cell:')) return null;
    const [wd, t] = overId.slice(5).split('|');
    const s = dropStart(toMinutes(t), offset, durationOf(b), minStart, maxEnd);
    return { weekday: Number(wd), start: fromMinutes(s) };
  };
  const resizeEnd = (b: KidBlockRow, dy: number) => {
    const e = snapMinutes(toMinutes(b.endTime) + dy / unitPx());
    return fromMinutes(Math.max(toMinutes(b.startTime) + 10, Math.min(toMinutes(INPUT_END), e)));
  };

  const onDragStart = (e: DragStartEvent) => {
    const [kind, id] = String(e.active.id).split(':') as ['block' | 'resize', string];
    const b = blocks.find((x) => x.id === id);
    if (!b) return;
    const ev = e.activatorEvent as MouseEvent | TouchEvent;
    const touch = 'touches' in ev;
    let offset = 0;
    if (kind === 'block') {
      const el = document.querySelector(`[data-harin-block="${id}"]`);
      const y = touch ? (ev.touches[0]?.clientY ?? 0) : ev.clientY;
      if (el) {
        const r = el.getBoundingClientRect();
        offset = grabOffset(y, r.top, r.height, durationOf(b));
      }
    }
    if (touch && navigator.vibrate) navigator.vibrate(30);
    setDrag({ kind: kind === 'resize' ? 'resize' : 'move', id, offset, touch });
    setSelectedId(id);
  };
  const onDragMove = (e: DragMoveEvent) => {
    if (!drag) return;
    const b = blocks.find((x) => x.id === drag.id);
    if (!b) return;
    if (drag.kind === 'resize') {
      const end = resizeEnd(b, e.delta.y);
      setPreview({ weekday: b.weekday, startTime: b.startTime, endTime: end, ok: canPlaceKid(blocks, b, b.weekday, b.startTime, end).ok });
      return;
    }
    const t = moveTarget(e.over ? String(e.over.id) : undefined, b, drag.offset);
    setPreview(t ? { weekday: t.weekday, startTime: t.start, endTime: fromMinutes(toMinutes(t.start) + durationOf(b)), ok: canPlaceKid(blocks, b, t.weekday, t.start).ok } : null);
  };
  const endDrag = () => {
    setDrag(null);
    setPreview(null);
    justDragged.current = Date.now();
  };
  const onDragEnd = (e: DragEndEvent) => {
    const cur = drag;
    endDrag();
    if (!cur) return;
    const b = blocks.find((x) => x.id === cur.id);
    if (!b) return;
    if (cur.kind === 'resize') {
      const end = resizeEnd(b, e.delta.y);
      if (end !== b.endTime && tryMove(b, b.weekday, b.startTime, end)) showToast(`${shortTime(b.startTime)}~${shortTime(end)}로 바꿨어요`);
      return;
    }
    // 폰: 길게 누르고 움직이지 않고 떼면 고치기 창
    if (cur.touch && Math.hypot(e.delta.x, e.delta.y) < 8) {
      setSheet({ kind: 'edit', block: b });
      return;
    }
    const t = moveTarget(e.over ? String(e.over.id) : undefined, b, cur.offset);
    if (!t || (t.weekday === b.weekday && t.start === b.startTime)) return;
    if (tryMove(b, t.weekday, t.start)) {
      showToast(`${WEEKDAY_LABEL[t.weekday]} ${shortTime(t.start)}로 옮겼어요`);
      setSelectedId(null);
    }
  };

  const travelOwner = travelSheet ? blocks.find((b) => b.id === travelSheet.ownerId) : undefined;

  return (
    <div className="min-h-dvh bg-[#fff7f2] font-jua text-stone-800">
      <div className="mx-auto w-full max-w-[480px] px-3 pt-3 pb-[calc(7rem+env(safe-area-inset-bottom))] md:max-w-5xl md:px-6">
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
                onChange={(e) => {
                  setPickedId(e.target.value);
                  setSelectedId(null);
                }}
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
              <RoundButton label="되돌리기" disabled={!canUndo} onClick={undo}>
                ↶
              </RoundButton>
              <RoundButton label="다시 실행" disabled={!canRedo} onClick={redo}>
                ↷
              </RoundButton>
            </div>
            {current.memo && <p className="mb-2 px-2 font-sans text-sm text-stone-500">{current.memo}</p>}

            {showToday && <TodayCard items={dayAgenda(blocks, acts, cats, todayWd)} weekday={todayWd} weekend={todayWd !== new Date().getDay()} />}

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

            <DndContext
              sensors={sensors}
              collisionDetection={collision}
              onDragStart={onDragStart}
              onDragMove={onDragMove}
              onDragEnd={onDragEnd}
              onDragCancel={endDrag}
            >
              <HarinGrid
                days={days}
                range={range}
                blocks={grid}
                travel={travel}
                travelEmoji={travelCat?.emoji ?? '🚶'}
                editable
                selectedId={selectedId}
                draggingId={drag?.kind === 'move' ? drag.id : null}
                preview={preview}
                onCell={onCell}
                onBlock={onBlock}
                onTravel={setTravelSheet}
                unitClass={phonePortrait ? '[--u:2.2px]' : '[--u:1.7px] lg:[--u:1.9px]'}
              />
            </DndContext>
            {blocks.length === 0 && <p className="mt-3 text-center font-sans text-base text-stone-500">빈 칸을 누르면 일정을 넣을 수 있어요.</p>}
          </>
        )}
      </div>

      {/* 선택한 블록 도구 */}
      {selected && !sheet && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-rose-100 bg-white/95 px-3 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] font-sans shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
          <div className="mx-auto max-w-[480px] md:max-w-2xl">
            <p className="mb-2 truncate text-base">
              <span className="font-jua text-lg">{labelOf(selected)}</span> {WEEKDAY_LABEL[selected.weekday]} {shortTime(selected.startTime)}~{shortTime(selected.endTime)}
              <span className="text-sm text-stone-500"> · 빈 칸을 누르면 그리로 옮겨요</span>
            </p>
            <div className="flex gap-2">
              <ToolButton onClick={() => setSheet({ kind: 'edit', block: selected })}>고치기</ToolButton>
              <ToolButton onClick={() => setCopyOf(selected)}>요일 복사</ToolButton>
              <ToolButton onClick={() => setConfirmDelete(selected)} danger>
                삭제
              </ToolButton>
              <ToolButton onClick={() => setSelectedId(null)}>✕</ToolButton>
            </div>
          </div>
        </div>
      )}

      {sheet && current && (
        <BlockSheet
          mode={sheet}
          timetableId={current.id}
          blocks={blocks}
          categories={cats}
          activities={acts}
          onSave={saveBlock}
          onDelete={(b) => setConfirmDelete(b)}
          onCopy={(b) => {
            setSheet(null);
            setCopyOf(b);
          }}
          onManageActivities={() => showToast('학원 목록 관리는 곧 생겨요')}
          onClose={() => setSheet(null)}
        />
      )}
      {travelSheet && travelOwner && (
        <TravelSheet
          travel={travelSheet}
          owner={travelOwner}
          activity={acts.find((a) => a.id === travelOwner.activityId)}
          onSet={(m) => setTravelMinutes(travelSheet, m)}
          onClose={() => setTravelSheet(null)}
        />
      )}
      {copyOf && <CopySheet block={copyOf} label={labelOf(copyOf)} onCopy={(d) => doCopy(copyOf, d)} onClose={() => setCopyOf(null)} />}
      {confirmDelete && (
        <ConfirmDialog
          title="일정을 지울까요?"
          body={`${labelOf(confirmDelete)} (${WEEKDAY_LABEL[confirmDelete.weekday]} ${shortTime(confirmDelete.startTime)}~${shortTime(confirmDelete.endTime)}) — [↶]로 되돌릴 수 있어요.`}
          confirmLabel="지우기"
          danger
          onConfirm={() => doDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

function RoundButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="h-11 w-11 shrink-0 rounded-full bg-white text-xl text-rose-500 shadow-sm active:bg-rose-50 disabled:text-stone-300"
    >
      {children}
    </button>
  );
}

function ToolButton({ onClick, danger, children }: { onClick: () => void; danger?: boolean; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-11 flex-1 rounded-full border-2 text-base font-semibold ${danger ? 'border-red-200 text-red-600 active:bg-red-50' : 'border-rose-200 text-rose-700 active:bg-rose-50'}`}
    >
      {children}
    </button>
  );
}

function TodayCard({ items, weekday, weekend }: { items: ReturnType<typeof dayAgenda>; weekday: number; weekend: boolean }) {
  return (
    <section className="mb-3 rounded-3xl bg-white p-4 shadow-sm">
      <h2 className="mb-2 text-xl text-rose-500">
        {weekend ? '월요일 일정 (주말이라 월요일을 보여 줘요)' : `오늘(${WEEKDAY_LABEL[weekday]}) 일정`}
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
    </section>
  );
}
