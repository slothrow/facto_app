// 하린이 시간표 보기 방식(SPEC_harin 14장): [주간]/[하루] 전환, 요일 칩, 하루 일정 목록, 상세·편집 안내 시트.
import { useState, type ReactNode } from 'react';
import { BottomSheet, Button } from '../../components/ui.tsx';
import { shortTime } from '../../engine/classTime.ts';
import { KID_WEEKDAYS, durationOf, type BlockLook, type dayAgenda } from '../../engine/harin/index.ts';
import type { KidBlockRow } from '../../storage/rosterTypes.ts';
import { TRAVEL_STYLE } from './HarinGrid.tsx';
import { WEEKDAY_LABEL } from './harinModel.ts';

export type HarinView = 'week' | 'day';
const VIEW_KEY = 'facto-app:harin-view';

/** 마지막에 고른 보기(기본 주간). 저장소를 못 쓰면 주간 */
export function loadView(): HarinView {
  try {
    return localStorage.getItem(VIEW_KEY) === 'day' ? 'day' : 'week';
  } catch {
    return 'week';
  }
}

export function saveView(v: HarinView) {
  try {
    localStorage.setItem(VIEW_KEY, v);
  } catch {
    /* 저장 못 해도 화면은 그대로 */
  }
}

/** [주간] [하루] 전환 */
export function ViewToggle({ view, onChange }: { view: HarinView; onChange: (v: HarinView) => void }) {
  return (
    <div className="flex gap-1 rounded-full bg-white p-1 shadow-sm" role="tablist" aria-label="보기 방식">
      {(
        [
          ['week', '주간'],
          ['day', '하루'],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={view === id}
          onClick={() => onChange(id)}
          className={`h-9 flex-1 rounded-full text-lg ${view === id ? 'bg-rose-400 text-white' : 'text-stone-500'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** 하루 보기의 요일 칩 */
export function DayChips({
  day,
  todayWd,
  onChange,
  badge,
}: {
  day: number;
  todayWd: number;
  onChange: (wd: number) => void;
  /** 요일 칩 안에 덧붙일 것(숙제 개수 등) */
  badge?: (wd: number) => ReactNode;
}) {
  return (
    <div className="mb-2 flex gap-1 rounded-full bg-white p-1 shadow-sm" role="tablist" aria-label="요일">
      {KID_WEEKDAYS.map((wd) => (
        <button
          key={wd}
          type="button"
          role="tab"
          aria-selected={day === wd}
          onClick={() => onChange(wd)}
          className={`flex h-11 flex-1 items-center justify-center gap-0.5 rounded-full text-xl ${day === wd ? 'bg-rose-400 text-white' : wd === todayWd ? 'text-rose-500' : 'text-stone-500'}`}
        >
          {WEEKDAY_LABEL[wd]}
          {badge?.(wd)}
        </button>
      ))}
    </div>
  );
}

/** 하루 보기의 시간순 텍스트 목록 */
export function DayList({
  items,
  weekday,
  isToday,
  children,
}: {
  items: ReturnType<typeof dayAgenda>;
  weekday: number;
  isToday: boolean;
  /** 목록 위에 붙일 것(그날 숙제) */
  children?: ReactNode;
}) {
  return (
    <section className="space-y-3">
      {children}
      <div className="rounded-3xl bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-xl text-rose-500">
          {isToday ? `오늘(${WEEKDAY_LABEL[weekday]})` : `${WEEKDAY_LABEL[weekday]}요일`} 일정
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
                    {it.emoji} {it.name}{' '}
                    <span className="text-base text-stone-500">
                      ({shortTime(it.startTime)}~{shortTime(it.endTime)})
                    </span>
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

/** 폰 주간에서 블록을 눌렀을 때: 상세(시간·장소·메모) + 하루 보기에서 고치기 */
export function BlockDetailSheet({
  block,
  look,
  extra,
  onEditInDay,
  onClose,
}: {
  block: KidBlockRow;
  look: BlockLook;
  /** 시간표의 "숙제" 블록이면 그날 숙제 목록 */
  extra?: ReactNode;
  onEditInDay: () => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet title={`${look.emoji} ${look.name}`} onClose={onClose}>
      <div className="space-y-3 font-sans">
        <dl className="space-y-1 rounded-2xl bg-stone-50 p-3 text-base">
          <Row label="시간">
            {WEEKDAY_LABEL[block.weekday]}요일 {shortTime(block.startTime)}~{shortTime(block.endTime)} ({durationOf(block)}분)
          </Row>
          {look.place && <Row label="장소">{look.place}</Row>}
          {block.memo && <Row label="메모">{block.memo}</Row>}
        </dl>
        {extra}
        <EditInDayButton onClick={onEditInDay} />
      </div>
    </BottomSheet>
  );
}

/** 폰 주간에서 빈 칸을 눌렀을 때: 편집 안내 */
export function EditHintSheet({ weekday, onEditInDay, onClose }: { weekday: number; onEditInDay: () => void; onClose: () => void }) {
  return (
    <BottomSheet title="편집은 하루 보기에서" onClose={onClose}>
      <div className="space-y-3 font-sans">
        <p className="text-base text-stone-600">폰 세로 주간 화면은 칸이 좁아서 일정을 넣거나 옮길 수 없어요. 하루 보기에서는 크게 보면서 고칠 수 있어요.</p>
        <EditInDayButton onClick={onEditInDay} weekday={weekday} />
        <Button className="w-full" onClick={onClose}>
          닫기
        </Button>
      </div>
    </BottomSheet>
  );
}

function EditInDayButton({ onClick, weekday }: { onClick: () => void; weekday?: number }) {
  return (
    <Button variant="primary" className="w-full !bg-rose-500" onClick={onClick}>
      {weekday ? `${WEEKDAY_LABEL[weekday]}요일 하루 보기로 가서 고치기` : '하루 보기에서 고치기'}
    </Button>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-12 shrink-0 text-stone-500">{label}</dt>
      <dd className="min-w-0 flex-1 break-words">{children}</dd>
    </div>
  );
}

/** 좌우 스와이프로 요일을 바꾸는 터치 핸들러(끌기 중이면 무시) */
export function useSwipe(onSwipe: (dir: -1 | 1) => void, blocked: () => boolean) {
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: React.TouchEvent) => setStart({ x: e.touches[0].clientX, y: e.touches[0].clientY }),
    onTouchEnd: (e: React.TouchEvent) => {
      if (!start || blocked()) return setStart(null);
      const t = e.changedTouches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      setStart(null);
      if (Math.abs(dx) > 70 && Math.abs(dy) < 40) onSwipe(dx < 0 ? 1 : -1);
    },
  };
}
