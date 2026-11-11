// 할 일 탭(26단계, SPEC_home 8장): 공용 할 일 달력. 월·주·일·목록 보기와 날짜별 메모장.
// 입력·체크는 화면에 바로 반영하고 저장은 뒤에서 한다(RosterContext.mutate). 실패하면 알림 후 서버 상태로 되돌린다.
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useAppData } from '../../app/AppDataContext.tsx';
import { todayStr, useRoster } from '../../app/RosterContext.tsx';
import { ChevronLeft, ChevronRight } from '../../components/icons.tsx';
import { BottomSheet, Button, ConfirmDialog, inputClass } from '../../components/ui.tsx';
import { addDays, addMonthsYm, monthEnd, monthOf, monthStart, weekdayOf } from '../../engine/dates.ts';
import type { TodoRow } from '../../storage/rosterTypes.ts';
import {
  TODO_VIEWS,
  dayLabels,
  dayStat,
  groupByDate,
  makeTodo,
  monthCells,
  moveTodos,
  overdueTodos,
  sortDay,
  weekDays,
  type TodoView,
} from './todoModel.ts';

const WD = ['일', '월', '화', '수', '목', '금', '토'];
const VIEW_KEY = 'facto-app:todo-view';
const md = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8))}일 (${WD[weekdayOf(d)]})`;

function readView(): TodoView {
  try {
    const v = window.localStorage.getItem(VIEW_KEY);
    if (v && TODO_VIEWS.some((x) => x.id === v)) return v as TodoView;
  } catch {
    /* 기억 못 해도 월 보기로 연다 */
  }
  return 'month';
}

function useIsWide() {
  const q = '(min-width: 768px)';
  const [wide, setWide] = useState(() => window.matchMedia?.(q).matches ?? false);
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return;
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

/** 할 일 저장(낙관적). 성공 알림은 띄우지 않는다(연속 입력 방해) */
function useTodoOps() {
  const { roster, mutate } = useRoster();
  const todos = roster.todos;
  const save = useCallback((rows: TodoRow[]) => void mutate({ upsert: { todos: rows } }, ''), [mutate]);
  const remove = useCallback((rows: TodoRow[]) => void mutate({ remove: { todos: rows } }, ''), [mutate]);
  return { todos, save, remove };
}

export function TodoPage() {
  const { data } = useAppData();
  const { todos, save } = useTodoOps();
  const today = todayStr();
  const wide = useIsWide();
  const [view, setViewState] = useState<TodoView>(readView);
  const [cursor, setCursor] = useState(today);
  /** 폰에서 메모장(바텀시트)으로 연 날짜 */
  const [sheetDate, setSheetDate] = useState<string | null>(null);

  const setView = (v: TodoView) => {
    setViewState(v);
    try {
      window.localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* 무시 */
    }
  };

  const ym = monthOf(cursor);
  const byDate = useMemo(() => groupByDate(todos), [todos]);
  const labels = useMemo(() => dayLabels(data, addDays(monthStart(ym), -7), addDays(monthEnd(ym), 7)), [data, ym]);
  const overdue = useMemo(() => overdueTodos(todos, today), [todos, today]);

  const step = (n: number) => {
    if (view === 'week') setCursor(addDays(cursor, 7 * n));
    else if (view === 'day') setCursor(addDays(cursor, n));
    else setCursor(monthStart(addMonthsYm(ym, n)));
  };
  const openDate = (d: string) => {
    setCursor(d);
    if (!wide) setSheetDate(d);
  };
  const moveOverdueToToday = () => save(moveTodos(todos, overdue, today));

  const main = (
    <>
      {view !== 'list' && overdue.length > 0 && <OverdueBar count={overdue.length} onMove={moveOverdueToToday} />}
      {view === 'month' && <MonthGrid ym={ym} today={today} selected={wide ? cursor : null} byDate={byDate} labels={labels} onPick={openDate} />}
      {view === 'week' && <WeekView cursor={cursor} today={today} byDate={byDate} labels={labels} />}
      {view === 'day' && <DayView date={cursor} today={today} labels={labels} onStep={(n) => setCursor(addDays(cursor, n))} />}
      {view === 'list' && <ListView ym={ym} today={today} byDate={byDate} overdue={overdue} onMoveOverdue={moveOverdueToToday} />}
    </>
  );

  return (
    <div className="space-y-3">
      <header className="space-y-2">
        <div className="flex items-center gap-1">
          <button type="button" aria-label="이전" onClick={() => step(-1)} className="flex h-11 w-11 items-center justify-center rounded-xl active:bg-stone-100">
            <ChevronLeft className="h-6 w-6" />
          </button>
          <h1 className="min-w-0 flex-1 text-center text-xl font-bold">
            {ym.slice(0, 4)}년 {Number(ym.slice(5))}월
          </h1>
          <button type="button" aria-label="다음" onClick={() => step(1)} className="flex h-11 w-11 items-center justify-center rounded-xl active:bg-stone-100">
            <ChevronRight className="h-6 w-6" />
          </button>
          <Button className="ml-1" onClick={() => setCursor(today)}>
            오늘
          </Button>
        </div>
        <div className="grid grid-cols-4 gap-1 rounded-xl bg-stone-100 p-1" role="tablist">
          {TODO_VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={view === v.id}
              onClick={() => setView(v.id)}
              className={`min-h-10 rounded-lg text-base font-semibold ${view === v.id ? 'bg-white text-emerald-800 shadow-sm' : 'text-stone-600'}`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </header>

      {wide && view === 'month' ? (
        <div className="grid grid-cols-[minmax(0,1fr)_360px] items-start gap-6">
          <div className="space-y-3">{main}</div>
          <aside className="sticky top-6 rounded-2xl border border-stone-200 bg-white p-4">
            <DayHeading date={cursor} today={today} labels={labels} />
            <DayPad key={cursor} date={cursor} />
          </aside>
        </div>
      ) : (
        main
      )}

      {sheetDate && !wide && (
        <BottomSheet title={<DayTitle date={sheetDate} today={today} />} onClose={() => setSheetDate(null)}>
          <DayLabelLine names={labels.get(sheetDate)} />
          <DayPad key={sheetDate} date={sheetDate} autoFocus />
        </BottomSheet>
      )}
    </div>
  );
}

function OverdueBar({ count, onMove }: { count: number; onMove: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2">
      <span className="flex-1 text-base font-semibold text-amber-900">못 한 일 {count}개</span>
      <Button onClick={onMove} className="border-amber-400">
        → 오늘로 옮기기
      </Button>
    </div>
  );
}

const DayTitle = ({ date, today }: { date: string; today: string }) => (
  <span>
    {md(date)}
    {date === today && <span className="ml-2 rounded-md bg-emerald-100 px-1.5 py-0.5 text-sm text-emerald-800">오늘</span>}
  </span>
);

const DayLabelLine = ({ names }: { names?: string[] }) =>
  names?.length ? <p className="-mt-1 mb-2 text-sm text-red-600">{names.join(' · ')}</p> : null;

function DayHeading({ date, today, labels }: { date: string; today: string; labels: Map<string, string[]> }) {
  return (
    <div className="mb-2">
      <h2 className="text-lg font-bold">
        <DayTitle date={date} today={today} />
      </h2>
      <DayLabelLine names={labels.get(date)} />
    </div>
  );
}

// ---------------------------------------------------------------
// 월 보기
// ---------------------------------------------------------------

function MonthGrid({
  ym,
  today,
  selected,
  byDate,
  labels,
  onPick,
}: {
  ym: string;
  today: string;
  selected: string | null;
  byDate: Map<string, TodoRow[]>;
  labels: Map<string, string[]>;
  onPick: (d: string) => void;
}) {
  return (
    <div>
      <div className="grid grid-cols-7 text-center text-sm font-medium">
        {WD.map((h, i) => (
          <div key={h} className={`py-1 ${i === 0 ? 'text-red-600' : i === 6 ? 'text-blue-600' : 'text-stone-600'}`}>
            {h}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-stone-200 bg-stone-200">
        {monthCells(ym).map((d, i) => {
          if (!d) return <div key={`b${i}`} className="min-h-[68px] bg-stone-50 md:min-h-[96px]" />;
          const s = dayStat(byDate.get(d));
          const names = labels.get(d);
          const wd = weekdayOf(d);
          const red = wd === 0 || !!names?.length;
          return (
            <button
              key={d}
              type="button"
              onClick={() => onPick(d)}
              aria-label={`${md(d)} 할 일 ${s.remaining}개 남음`}
              className={`flex min-h-[68px] flex-col items-center gap-0.5 px-0.5 pt-1 pb-1 text-center active:bg-stone-100 md:min-h-[96px] ${
                d === selected ? 'bg-emerald-50' : 'bg-white'
              }`}
            >
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-base ${
                  d === today ? 'bg-emerald-700 font-bold text-white' : red ? 'text-red-600' : wd === 6 ? 'text-blue-600' : 'text-stone-800'
                }`}
              >
                {Number(d.slice(8))}
              </span>
              {names?.length ? <span className="w-full truncate text-[11px] leading-tight text-red-600">{names[0]}</span> : null}
              <Dots total={s.total} remaining={s.remaining} starred={s.starred} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 남은 개수만큼 점(최대 3개 + 숫자). 모두 끝나면 회색 점, 별표가 남아 있으면 주황 */
function Dots({ total, remaining, starred }: { total: number; remaining: number; starred: boolean }) {
  if (total === 0) return null;
  if (remaining === 0) return <span className="mt-auto h-2 w-2 rounded-full bg-stone-300" aria-hidden />;
  const color = starred ? 'bg-amber-500' : 'bg-emerald-600';
  return (
    <span className="mt-auto flex items-center gap-0.5" aria-hidden>
      {Array.from({ length: Math.min(remaining, 3) }, (_, i) => (
        <span key={i} className={`h-2 w-2 rounded-full ${color}`} />
      ))}
      {remaining > 3 && <span className="text-[11px] font-semibold text-stone-600">{remaining}</span>}
    </span>
  );
}

// ---------------------------------------------------------------
// 주·일·목록 보기
// ---------------------------------------------------------------

function WeekView({ cursor, today, byDate, labels }: { cursor: string; today: string; byDate: Map<string, TodoRow[]>; labels: Map<string, string[]> }) {
  return (
    <div className="space-y-2">
      {weekDays(cursor).map((d) => (
        <section key={d} className={`rounded-2xl border bg-white p-3 ${d === today ? 'border-emerald-400' : 'border-stone-200'}`}>
          <DayHeading date={d} today={today} labels={labels} />
          <TodoList items={byDate.get(d) ?? []} />
          <AddToggle date={d} />
        </section>
      ))}
    </div>
  );
}

function DayView({ date, today, labels, onStep }: { date: string; today: string; labels: Map<string, string[]>; onStep: (n: number) => void }) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return (
    <section
      className="min-h-[60vh] rounded-2xl border border-stone-200 bg-white p-4"
      onTouchStart={(e) => (start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
      onTouchEnd={(e) => {
        const s = start.current;
        start.current = null;
        if (!s) return;
        const dx = e.changedTouches[0].clientX - s.x;
        const dy = e.changedTouches[0].clientY - s.y;
        if (Math.abs(dx) > 60 && Math.abs(dy) < 50) onStep(dx < 0 ? 1 : -1);
      }}
    >
      <div className="mb-2 flex items-center gap-1">
        <button type="button" aria-label="전날" onClick={() => onStep(-1)} className="flex h-11 w-11 items-center justify-center rounded-xl active:bg-stone-100">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 text-center">
          <DayHeading date={date} today={today} labels={labels} />
        </div>
        <button type="button" aria-label="다음날" onClick={() => onStep(1)} className="flex h-11 w-11 items-center justify-center rounded-xl active:bg-stone-100">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
      <DayPad key={date} date={date} />
      <p className="mt-4 text-center text-sm text-stone-400">좌우로 밀면 다른 날짜로 가요</p>
    </section>
  );
}

function ListView({
  ym,
  today,
  byDate,
  overdue,
  onMoveOverdue,
}: {
  ym: string;
  today: string;
  byDate: Map<string, TodoRow[]>;
  overdue: TodoRow[];
  onMoveOverdue: () => void;
}) {
  const [hideDone, setHideDone] = useState(false);
  // 지난 날짜의 안 한 일은 "밀린 할 일"에만 보인다
  const dates = [...byDate.keys()].filter((d) => monthOf(d) === ym).sort();
  const groups = dates
    .map((d) => ({ d, items: (byDate.get(d) ?? []).filter((t) => !(hideDone && t.done) && !(d < today && !t.done)) }))
    .filter((g) => g.items.length > 0);
  return (
    <div className="space-y-3">
      <label className="flex min-h-11 items-center justify-end gap-2 text-base">
        <input type="checkbox" className="h-5 w-5 accent-emerald-700" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
        완료 숨기기
      </label>
      {overdue.length > 0 && (
        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-3">
          <div className="mb-2 flex items-center gap-2">
            <h2 className="flex-1 text-base font-bold text-amber-900">밀린 할 일 {overdue.length}개</h2>
            <Button onClick={onMoveOverdue}>→ 오늘로 옮기기</Button>
          </div>
          <TodoList items={overdue} showDate />
        </section>
      )}
      {groups.length === 0 && <p className="py-8 text-center text-base text-stone-500">이 달에는 할 일이 없어요</p>}
      {groups.map((g) => (
        <section key={g.d} className={`rounded-2xl border bg-white p-3 ${g.d === today ? 'border-emerald-400' : 'border-stone-200'}`}>
          <h2 className="mb-1 text-base font-bold">
            <DayTitle date={g.d} today={today} />
          </h2>
          <TodoList items={g.items} />
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------
// 날짜 메모장: 맨 위 입력줄 + 목록
// ---------------------------------------------------------------

function DayPad({ date, autoFocus }: { date: string; autoFocus?: boolean }) {
  const { roster } = useRoster();
  const items = useMemo(() => sortDay(roster.todos.filter((t) => t.date === date)), [roster.todos, date]);
  return (
    <div className="space-y-2">
      <AddLine date={date} autoFocus={autoFocus} />
      {items.length === 0 ? <p className="py-3 text-center text-base text-stone-400">할 일을 적고 엔터를 누르세요</p> : <TodoList items={items} />}
    </div>
  );
}

/** 주 보기의 [+ 추가] → 입력줄 */
function AddToggle({ date }: { date: string }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-1 min-h-11 w-full rounded-xl text-left text-base font-semibold text-emerald-800 active:bg-stone-100">
        + 추가
      </button>
    );
  return (
    <div className="mt-2">
      <AddLine date={date} autoFocus onBlurEmpty={() => setOpen(false)} />
    </div>
  );
}

/** 엔터 → 한 줄 추가. 입력줄은 그대로 남아 연속 입력. 한글 조합 중 엔터도 글자가 끝난 뒤 처리한다 */
function AddLine({ date, autoFocus, onBlurEmpty }: { date: string; autoFocus?: boolean; onBlurEmpty?: () => void }) {
  const { todos, save } = useTodoOps();
  const [text, setText] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const pending = useRef(false);

  const add = () => {
    const value = (ref.current?.value ?? text).trim();
    if (!value) return;
    save([makeTodo(todos, date, value)]);
    setText('');
    if (ref.current) ref.current.value = '';
    ref.current?.focus();
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (composing.current) pending.current = true;
    else add();
  };

  return (
    <form onSubmit={onSubmit} className="flex gap-2">
      <input
        ref={ref}
        className={inputClass}
        value={text}
        placeholder="할 일 적고 엔터"
        enterKeyHint="enter"
        maxLength={500}
        autoFocus={autoFocus}
        onChange={(e) => setText(e.target.value)}
        onCompositionStart={() => (composing.current = true)}
        onCompositionEnd={() => {
          composing.current = false;
          if (pending.current) {
            pending.current = false;
            setTimeout(add, 0);
          }
        }}
        onBlur={() => !text.trim() && onBlurEmpty?.()}
      />
      <Button type="submit" variant="primary" className="shrink-0" onMouseDown={(e) => e.preventDefault()}>
        추가
      </Button>
    </form>
  );
}

function TodoList({ items, showDate }: { items: TodoRow[]; showDate?: boolean }) {
  return (
    <ul className="divide-y divide-stone-100">
      {items.map((t) => (
        <TodoItem key={t.id} todo={t} showDate={showDate} />
      ))}
    </ul>
  );
}

const LONG_PRESS_MS = 500;

function TodoItem({ todo, showDate }: { todo: TodoRow; showDate?: boolean }) {
  const { save } = useTodoOps();
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
  const press = useRef<{ timer: number; x: number; y: number; fired: boolean } | null>(null);

  const startPress = (x: number, y: number) => {
    const p = { x, y, fired: false, timer: 0 };
    p.timer = window.setTimeout(() => {
      p.fired = true;
      setMenu(true);
    }, LONG_PRESS_MS);
    press.current = p;
  };
  const cancelPress = () => {
    if (press.current) window.clearTimeout(press.current.timer);
  };

  return (
    <li className="flex items-center gap-1 py-0.5">
      <label className="flex h-11 w-11 shrink-0 items-center justify-center">
        <input
          type="checkbox"
          className="h-6 w-6 accent-emerald-700"
          checked={todo.done}
          onChange={(e) => save([{ ...todo, done: e.target.checked }])}
          aria-label={todo.done ? '완료 취소' : '완료'}
        />
      </label>
      {editing ? (
        <EditLine todo={todo} onClose={() => setEditing(false)} />
      ) : (
        <button
          type="button"
          className={`min-h-11 min-w-0 flex-1 py-2 text-left text-base break-words select-none ${todo.done ? 'text-stone-400 line-through' : 'text-stone-900'}`}
          onPointerDown={(e) => startPress(e.clientX, e.clientY)}
          onPointerMove={(e) => {
            const p = press.current;
            if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) cancelPress();
          }}
          onPointerUp={cancelPress}
          onPointerCancel={cancelPress}
          onPointerLeave={cancelPress}
          onContextMenu={(e) => {
            e.preventDefault();
            cancelPress();
            setMenu(true);
          }}
          onClick={() => {
            if (press.current?.fired) return; // 길게 누른 뒤 손을 뗀 것
            setEditing(true);
          }}
        >
          {showDate && <span className="mr-1 text-sm text-amber-800">{Number(todo.date.slice(5, 7))}/{Number(todo.date.slice(8))}</span>}
          {todo.text}
        </button>
      )}
      <button
        type="button"
        onClick={() => save([{ ...todo, starred: !todo.starred }])}
        aria-label={todo.starred ? '별표 빼기' : '별표'}
        aria-pressed={todo.starred}
        className={`flex h-11 w-11 shrink-0 items-center justify-center text-2xl ${todo.starred ? 'text-amber-500' : 'text-stone-300'}`}
      >
        {todo.starred ? '★' : '☆'}
      </button>
      {menu && <TodoMenu todo={todo} onClose={() => setMenu(false)} />}
    </li>
  );
}

/** 글자 바로 고치기. 엔터·바깥 누르면 저장, 다 지우면 그대로 둔다 */
function EditLine({ todo, onClose }: { todo: TodoRow; onClose: () => void }) {
  const { save } = useTodoOps();
  const [text, setText] = useState(todo.text);
  const done = useRef(false);
  const commit = () => {
    if (done.current) return;
    done.current = true;
    const v = text.trim();
    if (v && v !== todo.text) save([{ ...todo, text: v.slice(0, 500) }]);
    onClose();
  };
  return (
    <form
      className="min-w-0 flex-1"
      onSubmit={(e) => {
        e.preventDefault();
        commit();
      }}
    >
      <input
        className={inputClass}
        value={text}
        autoFocus
        maxLength={500}
        enterKeyHint="done"
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            done.current = true;
            onClose();
          }
        }}
      />
    </form>
  );
}

/** 길게 누르기 메뉴: 삭제 / 다른 날로 옮기기 */
function TodoMenu({ todo, onClose }: { todo: TodoRow; onClose: () => void }) {
  const { todos, save, remove } = useTodoOps();
  const today = todayStr();
  const [confirm, setConfirm] = useState(false);
  const [date, setDate] = useState(todo.date);
  const moveTo = (d: string) => {
    if (d && d !== todo.date) save(moveTodos(todos, [todo], d));
    onClose();
  };
  const quick: [string, string][] = [
    ['오늘', today],
    ['내일', addDays(today, 1)],
    ['다음 주', addDays(todo.date < today ? today : todo.date, 7)],
  ];
  return (
    <BottomSheet title={<span className="line-clamp-2">{todo.text}</span>} onClose={onClose}>
      <div className="space-y-4">
        <Section label="다른 날로 옮기기">
          <div className="grid grid-cols-3 gap-2">
            {quick.map(([label, d]) => (
              <Button key={label} disabled={d === todo.date} onClick={() => moveTo(d)}>
                {label}
              </Button>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
            <Button variant="primary" className="shrink-0" disabled={!date || date === todo.date} onClick={() => moveTo(date)}>
              옮기기
            </Button>
          </div>
        </Section>
        <Button variant="danger" className="w-full" onClick={() => setConfirm(true)}>
          삭제
        </Button>
      </div>
      {confirm && (
        <ConfirmDialog
          title="이 할 일을 지울까요?"
          body={todo.text}
          confirmLabel="삭제"
          danger
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            remove([todo]);
            onClose();
          }}
        />
      )}
    </BottomSheet>
  );
}

const Section = ({ label, children }: { label: string; children: ReactNode }) => (
  <div>
    <h3 className="mb-2 text-sm font-semibold text-stone-600">{label}</h3>
    {children}
  </div>
);
