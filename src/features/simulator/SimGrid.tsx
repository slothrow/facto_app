// 시안 시간표 격자(SPEC_simulator 3.1·3.2). 열 = 요일, 행 = 10분 단위.
// 반 블록 높이 = 50분, 정시가 아닌 반(예: 3:40)도 정확한 위치. 옮긴 반은 원래 자리에 점선 흔적.
// 반을 선택하면 시작 칸을 초록(가능)·노랑(경고)·회색(불가)으로 칠한다.
import type { MouseEvent, ReactNode } from 'react';
import { CLASS_MINUTES, fromMinutes, shortTime, toMinutes } from '../../engine/classTime.ts';
import type { Placement } from '../../engine/simulator/index.ts';
import type { Weekday } from '../../engine/types.ts';
import type { SimClassRow } from '../../storage/rosterTypes.ts';
import { WEEKDAY_NAMES } from '../roster/rosterModel.ts';

export interface BlockView {
  cls: SimClassRow;
  grade: string;
  count: number;
  progress: string;
  isNew: boolean;
  graduating: boolean;
  warn: boolean;
  memo: boolean;
  waitCount: number;
  /** PC에서 블록 안에 보여 줄 아이(이름 + 태그 색) */
  people?: { name: string; tone: string }[];
}

export interface GhostView {
  weekday: number;
  startTime: string;
  text: string;
}

const px = (minutes: number) => `calc(${minutes} * var(--u))`;

const PLACE_BG: Record<Placement['kind'], string> = {
  ok: 'bg-emerald-200/70',
  warn: 'bg-amber-200/80',
  block: 'bg-stone-300/70',
};

export function SimGrid({
  days,
  range,
  blocks,
  ghosts,
  selectedId,
  placement,
  waitDots,
  compact,
  onCell,
  onBlock,
  renderBlock,
  renderCell,
}: {
  days: Weekday[];
  range: { start: number; end: number };
  blocks: BlockView[];
  ghosts: GhostView[];
  selectedId: string | null;
  /** 선택한 반을 (요일, 시작)에 놓을 수 있는지. 선택이 없으면 null */
  placement: ((weekday: Weekday, start: string) => Placement) | null;
  /** 선택한 반 기준 대기자 희망 칸(키: "요일|HH:MM") */
  waitDots?: Map<string, number>;
  compact: boolean;
  onCell: (weekday: Weekday, start: string) => void;
  onBlock: (id: string, tappedStart: string) => void;
  /** 드래그 기능이 블록·칸을 감싸는 자리 */
  renderBlock?: (b: BlockView, node: ReactNode) => ReactNode;
  renderCell?: (weekday: Weekday, start: string, node: ReactNode) => ReactNode;
}) {
  const slots: number[] = [];
  for (let m = range.start; m < range.end; m += 10) slots.push(m);
  const labels = slots.filter((m) => m % 30 === 0);

  return (
    <div className={compact ? '[--u:1.5px] md:[--u:2.1px]' : '[--u:2.3px]'}>
      {days.length > 1 && (
        <div className="flex gap-1">
          <div className="w-9 shrink-0" />
          {days.map((wd) => (
            <div key={wd} className="min-w-0 flex-1 py-1 text-center text-sm font-bold text-stone-700">
              {WEEKDAY_NAMES[wd]}
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-1">
        <div className="relative w-9 shrink-0" style={{ height: px(range.end - range.start) }}>
          {labels.map((m) => (
            <span
              key={m}
              className={`absolute right-1 -translate-y-1/2 text-xs leading-none ${m % 60 === 30 ? 'font-semibold text-stone-600' : 'text-stone-400'}`}
              style={{ top: px(m - range.start) }}
            >
              {shortTime(fromMinutes(m))}
            </span>
          ))}
        </div>
        {days.map((wd) => (
          <div
            key={wd}
            className="relative min-w-0 flex-1 rounded-lg border border-stone-200 bg-white"
            style={{ height: px(range.end - range.start) }}
          >
            {/* 10분 칸: 탭하면 옮기기(선택 중) 또는 새 반 */}
            {slots.map((m) => {
              const t = fromMinutes(m);
              const canStart = m + CLASS_MINUTES <= range.end;
              const p = placement && canStart ? placement(wd, t) : null;
              const dots = waitDots?.get(`${wd}|${t}`) ?? 0;
              const cell = (
                <button
                  key={m}
                  type="button"
                  aria-label={`${WEEKDAY_NAMES[wd]} ${shortTime(t)}${p ? (p.kind === 'ok' ? ' 놓을 수 있음' : p.kind === 'warn' ? ' 경고' : ' 불가') : ''}`}
                  onClick={() => canStart && onCell(wd, t)}
                  className={`absolute inset-x-0 ${m % 30 === 0 ? 'border-t border-stone-200' : ''} ${p ? PLACE_BG[p.kind] : 'active:bg-emerald-50'}`}
                  style={{ top: px(m - range.start), height: px(10) }}
                >
                  {dots > 0 && (
                    <span className="absolute top-0 right-0.5 rounded-full bg-sky-600 px-1 text-[10px] leading-tight font-bold text-white">대기 {dots}</span>
                  )}
                </button>
              );
              return renderCell ? <div key={m}>{renderCell(wd, t, cell)}</div> : cell;
            })}

            {ghosts
              .filter((g) => g.weekday === wd)
              .map((g) => (
                <div
                  key={`${g.startTime}-${g.text}`}
                  className="pointer-events-none absolute inset-x-0.5 flex items-start justify-center rounded-md border-2 border-dashed border-stone-400 bg-stone-50/60 p-0.5 text-center text-xs font-semibold text-stone-500"
                  style={{ top: px(toMinutes(g.startTime) - range.start), height: px(CLASS_MINUTES) }}
                >
                  {g.text}
                </div>
              ))}

            {blocks
              .filter((b) => b.cls.weekday === wd)
              .map((b) => {
                const node = (
                  <Block key={b.cls.id} b={b} range={range} selected={selectedId === b.cls.id} dim={selectedId !== null && selectedId !== b.cls.id} compact={compact} onTap={onBlock} />
                );
                return renderBlock ? <div key={b.cls.id}>{renderBlock(b, node)}</div> : node;
              })}
          </div>
        ))}
      </div>
    </div>
  );
}

function Block({
  b,
  range,
  selected,
  dim,
  compact,
  onTap,
}: {
  b: BlockView;
  range: { start: number; end: number };
  selected: boolean;
  dim: boolean;
  compact: boolean;
  onTap: (id: string, tappedStart: string) => void;
}) {
  const start = toMinutes(b.cls.startTime);
  const over = b.count > 4;
  const onClick = (e: MouseEvent<HTMLButtonElement>) => {
    // 블록 안에서 누른 위치의 10분 칸(선택한 반을 10분만 옮길 때)
    const rect = e.currentTarget.getBoundingClientRect();
    const minute = Math.max(0, Math.min(40, Math.floor(((e.clientY - rect.top) / rect.height) * CLASS_MINUTES / 10) * 10));
    onTap(b.cls.id, fromMinutes(start + minute));
  };
  return (
    <button
      type="button"
      onClick={onClick}
      data-sim-block={b.cls.id}
      className={`absolute inset-x-0.5 z-10 flex flex-col overflow-hidden rounded-md border px-1 py-0.5 text-left leading-tight shadow-sm ${
        b.isNew ? 'border-emerald-500 bg-emerald-50' : 'border-sky-300 bg-sky-50'
      } ${selected ? 'z-20 ring-4 ring-emerald-600' : ''} ${dim ? 'opacity-80' : ''}`}
      style={{ top: `calc(${start - range.start} * var(--u))`, height: `calc(${CLASS_MINUTES} * var(--u))` }}
    >
      <span className="flex items-center gap-1">
        <span className={`truncate font-bold ${compact ? 'text-xs' : 'text-sm'}`}>{b.grade}</span>
        <span className={`ml-auto shrink-0 font-semibold ${compact ? 'text-[11px]' : 'text-sm'} ${over ? 'text-red-600' : 'text-stone-600'}`}>
          {b.count}/4
        </span>
      </span>
      <span className={`truncate text-stone-600 ${compact ? 'text-[10px]' : 'text-xs'}`}>
        {start % 60 !== 30 && <span className="font-semibold text-sky-700">{shortTime(b.cls.startTime)} </span>}
        {b.cls.alias && `${b.cls.alias} `}
        {b.progress}
      </span>
      <span className="flex flex-wrap gap-0.5">
        {b.isNew && <Badge tone="bg-emerald-600 text-white">신규</Badge>}
        {b.graduating && <Badge tone="bg-violet-600 text-white">졸업 대상</Badge>}
        {b.warn && <Badge tone="bg-amber-400 text-amber-950">!</Badge>}
        {b.memo && <Badge tone="bg-stone-200 text-stone-700">메모</Badge>}
        {b.waitCount > 0 && <Badge tone="bg-sky-600 text-white">대기 {b.waitCount}</Badge>}
      </span>
      {b.people && !compact && (
        <span className="mt-0.5 flex flex-wrap gap-x-1 text-xs">
          {b.people.map((p, i) => (
            <span key={i} className={p.tone}>
              {p.name}
            </span>
          ))}
        </span>
      )}
    </button>
  );
}

const Badge = ({ tone, children }: { tone: string; children: ReactNode }) => (
  <span className={`rounded px-1 text-[10px] leading-tight font-bold ${tone}`}>{children}</span>
);
