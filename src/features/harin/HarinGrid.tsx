// 하린이 시간표 격자(SPEC_harin 3·7장). 열 = 요일, 행 = 10분. 파스텔 둥근 블록 + 회색 빗금 이동 블록.
// 편집할 때: 블록 = 끌기(block:id), 선택한 블록 아래 손잡이 = 길이 조절(resize:id), 10분 칸 = 놓는 곳(cell:요일|HH:MM).
// DndContext 안에서만 쓴다(편성 시뮬레이터 SimGrid와 같은 방식).
import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { CSSProperties, ReactNode } from 'react';
import { fromMinutes, shortTime, toMinutes } from '../../engine/classTime.ts';
import { isShortBlock, type BlockLook, type TravelBlock } from '../../engine/harin/index.ts';
import type { KidBlockRow } from '../../storage/rosterTypes.ts';
import { WEEKDAY_LABEL } from './harinModel.ts';

export interface GridBlock {
  block: KidBlockRow;
  look: BlockLook;
}

export interface GridPreview {
  weekday: number;
  startTime: string;
  endTime: string;
  ok: boolean;
}

const px = (minutes: number) => `calc(${minutes} * var(--u))`;

/** 이동 블록 빗금 */
export const TRAVEL_STYLE: CSSProperties = {
  backgroundColor: '#f5f5f4',
  backgroundImage: 'repeating-linear-gradient(135deg, #e7e5e4 0 6px, #f5f5f4 6px 12px)',
};

export function HarinGrid({
  days,
  range,
  blocks,
  travel,
  travelEmoji,
  editable = false,
  selectedId = null,
  draggingId = null,
  preview = null,
  onCell,
  onBlock,
  onTravel,
  unitClass = '[--u:2px]',
  compact = false,
  dayHeader,
}: {
  days: number[];
  range: { start: number; end: number };
  blocks: GridBlock[];
  travel: TravelBlock[];
  travelEmoji: string;
  editable?: boolean;
  selectedId?: string | null;
  draggingId?: string | null;
  preview?: GridPreview | null;
  onCell?: (weekday: number, start: string) => void;
  onBlock?: (id: string) => void;
  onTravel?: (t: TravelBlock) => void;
  /** 1분당 높이(css 변수 --u) */
  unitClass?: string;
  /** 폰 세로 주간: 좁은 칸용. 블록은 `이모지 이름` 한 줄만, 시각 눈금도 좁게 */
  compact?: boolean;
  /** 요일 머리글 아래에 붙일 것(숙제 개수 배지 등) */
  dayHeader?: (weekday: number) => ReactNode;
}) {
  const slots: number[] = [];
  for (let m = range.start; m < range.end; m += 10) slots.push(m);
  const labels = slots.filter((m) => m % 30 === 0);
  const height = px(range.end - range.start);
  const labelW = compact ? 'w-7' : 'w-9';

  return (
    <div className={unitClass}>
      {days.length > 1 && (
        <div className={`flex ${compact ? 'gap-1' : 'gap-1.5'}`}>
          <div className={`${labelW} shrink-0`} />
          {days.map((wd) => (
            <div key={wd} className="min-w-0 flex-1 pb-1 text-center font-jua text-rose-500">
              <div className={compact ? 'text-base' : 'text-lg'}>{WEEKDAY_LABEL[wd]}</div>
              {dayHeader?.(wd)}
            </div>
          ))}
        </div>
      )}
      <div className={`flex ${compact ? 'gap-1' : 'gap-1.5'}`}>
        {/* 시각 눈금 */}
        <div className={`relative ${labelW} shrink-0`} style={{ height }}>
          {labels.map((m) => (
            <span
              key={m}
              className={`absolute right-0.5 -translate-y-1/2 font-jua leading-none ${m % 60 === 0 ? (compact ? 'text-xs' : 'text-sm') + ' text-stone-600' : compact ? 'hidden' : 'text-[11px] text-stone-400'}`}
              style={{ top: px(m - range.start) }}
            >
              {shortTime(fromMinutes(m))}
            </span>
          ))}
        </div>
        {days.map((wd) => (
          <div key={wd} data-harin-day={wd} className="relative min-w-0 flex-1 rounded-2xl bg-white/70 shadow-[inset_0_0_0_1px_#fde4ec]" style={{ height }}>
            {slots.map((m) => (
              <Cell
                key={m}
                weekday={wd}
                start={fromMinutes(m)}
                top={m - range.start}
                line={m % 60 === 0 ? 'hour' : m % 30 === 0 ? 'half' : null}
                selecting={editable && selectedId !== null}
                onTap={onCell}
              />
            ))}

            {preview && preview.weekday === wd && (
              <div
                className={`pointer-events-none absolute inset-x-1 z-30 rounded-2xl border-[3px] border-dashed ${preview.ok ? 'border-emerald-500 bg-emerald-200/40' : 'border-stone-500 bg-stone-300/50'}`}
                style={{ top: px(toMinutes(preview.startTime) - range.start), height: px(toMinutes(preview.endTime) - toMinutes(preview.startTime)) }}
              />
            )}

            {travel
              .filter((t) => t.weekday === wd)
              .map((t) => (
                <TravelView key={`${t.ownerId}-${t.side}`} t={t} range={range} emoji={travelEmoji} onTap={onTravel} compact={compact} />
              ))}

            {blocks
              .filter((g) => g.block.weekday === wd)
              .map((g) => (
                <BlockView
                  key={g.block.id}
                  g={g}
                  range={range}
                  editable={editable}
                  selected={selectedId === g.block.id}
                  dim={selectedId !== null && selectedId !== g.block.id}
                  dragging={draggingId === g.block.id}
                  onTap={onBlock}
                  compact={compact}
                />
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function BlockView({
  g,
  range,
  editable,
  selected,
  dim,
  dragging,
  onTap,
  compact,
}: {
  g: GridBlock;
  range: { start: number; end: number };
  editable: boolean;
  selected: boolean;
  dim: boolean;
  dragging: boolean;
  onTap?: (id: string) => void;
  compact: boolean;
}) {
  const { block: b, look } = g;
  const s = toMinutes(b.startTime);
  const minutes = toMinutes(b.endTime) - s;
  const drag = useDraggable({ id: `block:${b.id}`, disabled: !editable });
  const t = drag.transform;
  const short = compact || isShortBlock(minutes);
  return (
    <div
      className={`absolute ${compact ? 'inset-x-0.5' : 'inset-x-1'} ${dragging ? 'z-50' : selected ? 'z-20' : 'z-10'}`}
      style={{
        top: px(s - range.start),
        height: px(minutes),
        transform: t ? `translate3d(${t.x}px, ${t.y}px, 0)` : undefined,
      }}
    >
      <button
        ref={drag.setNodeRef}
        type="button"
        data-harin-block={b.id}
        onClick={() => onTap?.(b.id)}
        {...drag.listeners}
        {...drag.attributes}
        className={`flex h-full w-full select-none [-webkit-touch-callout:none] flex-col overflow-hidden ${compact ? 'rounded-lg border px-0.5' : 'rounded-2xl border-2 px-1.5'} border-white text-left font-jua text-stone-800 shadow-[0_2px_6px_rgba(120,80,100,0.18)] ${
          short ? 'justify-center' : 'justify-start py-1'
        } ${selected ? 'ring-4 ring-rose-400' : ''} ${dim ? 'opacity-75' : ''} ${dragging ? 'opacity-90 shadow-2xl' : ''}`}
        style={{ backgroundColor: look.color }}
      >
        {compact ? (
          <span className="truncate text-[11px] leading-tight">
            {look.emoji}
            {look.name}
          </span>
        ) : short ? (
          <span className="truncate text-[13px] leading-tight md:text-sm">
            {look.emoji} {look.name} <span className="text-stone-600">{shortTime(b.startTime)}</span>
          </span>
        ) : (
          <>
            <span className="truncate text-[15px] leading-tight md:text-base">
              {look.emoji} {look.name}
            </span>
            <span className="truncate text-xs leading-tight text-stone-600 md:text-[13px]">
              {shortTime(b.startTime)}~{shortTime(b.endTime)}
            </span>
            {look.place && <span className="truncate text-xs leading-tight text-stone-500">📍{look.place}</span>}
          </>
        )}
      </button>
      {editable && selected && <ResizeHandle id={b.id} />}
    </div>
  );
}

/** 선택한 블록 아래 끝 손잡이: 위아래로 끌어 길이 조절 */
function ResizeHandle({ id }: { id: string }) {
  const drag = useDraggable({ id: `resize:${id}` });
  return (
    <button
      ref={drag.setNodeRef}
      type="button"
      aria-label="끌어서 길이 바꾸기"
      {...drag.listeners}
      {...drag.attributes}
      className="absolute inset-x-3 -bottom-3 z-30 flex h-6 touch-none items-center justify-center"
    >
      <span className="h-2.5 w-12 rounded-full border-2 border-white bg-rose-400 shadow" />
    </button>
  );
}

function TravelView({
  t,
  range,
  emoji,
  onTap,
  compact,
}: {
  t: TravelBlock;
  range: { start: number; end: number };
  emoji: string;
  onTap?: (t: TravelBlock) => void;
  compact: boolean;
}) {
  const s = Math.max(range.start, toMinutes(t.startTime));
  const e = Math.min(range.end, toMinutes(t.endTime));
  if (e <= s) return null;
  const warn = t.warnings.length > 0;
  return (
    <button
      type="button"
      onClick={() => onTap?.(t)}
      title={warn ? t.warnings.join(', ') : undefined}
      className={`absolute ${compact ? 'inset-x-1' : 'inset-x-3'} z-[5] flex items-center justify-center overflow-hidden rounded-xl font-jua text-[11px] leading-none text-stone-500 md:text-xs ${warn ? 'ring-2 ring-amber-400' : ''}`}
      style={{ ...TRAVEL_STYLE, top: px(s - range.start), height: px(e - s) }}
    >
      <span className="truncate rounded-full bg-white/80 px-1.5">
        {warn && '⚠️'}
        {compact ? `${emoji}${t.minutes}` : `${emoji} ${t.minutes}분`}
      </span>
    </button>
  );
}

function Cell({
  weekday,
  start,
  top,
  line,
  selecting,
  onTap,
}: {
  weekday: number;
  start: string;
  top: number;
  line: 'hour' | 'half' | null;
  selecting: boolean;
  onTap?: (weekday: number, start: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `cell:${weekday}|${start}` });
  return (
    <button
      ref={setNodeRef}
      type="button"
      tabIndex={onTap ? 0 : -1}
      aria-label={`${WEEKDAY_LABEL[weekday]} ${shortTime(start)}`}
      onClick={() => onTap?.(weekday, start)}
      className={`absolute inset-x-0 ${line === 'hour' ? 'border-t border-rose-100' : line === 'half' ? 'border-t border-dashed border-rose-50' : ''} ${
        selecting ? 'active:bg-rose-100' : 'active:bg-rose-50'
      } ${isOver ? 'bg-rose-50' : ''}`}
      style={{ top: px(top), height: px(10) }}
    />
  );
}
