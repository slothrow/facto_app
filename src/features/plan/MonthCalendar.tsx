// 회차 계획 탭의 월 달력(일~토 7열).
import { monthOf, monthStart, weekdayOf } from '../../engine/dates.ts';
import { formatCellLabel } from '../../engine/label.ts';
import type { DayCell } from '../../engine/types.ts';
import { PinIcon } from '../../components/icons.tsx';
import { MAKEUP_COLOR, WEEK_COLORS } from '../../components/weekColors.ts';

const HEADERS = ['일', '월', '화', '수', '목', '금', '토'];
const HATCH = 'repeating-linear-gradient(45deg, #e7e5e4 0 4px, transparent 4px 8px)';

/** 선생님만 보는 칸 메모(체험수업, 토요보강 예약 수). 달력배포 이미지에는 들어가지 않는다 */
export interface PrivateNote {
  kind: 'trial' | 'makeup';
  /** 줄마다 따로 표시(칸이 좁아 중간에서 끊기지 않게). 긴 줄은 …로 줄인다 */
  lines: string[];
}

export function MonthCalendar({
  calendarMonth,
  days,
  onSelect,
  notes,
  today,
}: {
  calendarMonth: string;
  days: DayCell[];
  onSelect: (cell: DayCell) => void;
  notes?: Map<string, PrivateNote[]>;
  /** 오늘 날짜('YYYY-MM-DD'). 그 칸을 강조한다 */
  today?: string;
}) {
  const monthDays = days.filter((d) => monthOf(d.date) === calendarMonth);
  const lead = weekdayOf(monthStart(calendarMonth));
  const cells: (DayCell | null)[] = [...Array(lead).fill(null), ...monthDays];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      <div className="grid grid-cols-7 text-center text-sm font-medium">
        {HEADERS.map((h, i) => (
          <div key={h} className={`py-1 ${i === 0 ? 'text-red-600' : i === 6 ? 'text-blue-600' : 'text-stone-600'}`}>
            {h}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-stone-200 bg-stone-200">
        {cells.map((c, i) =>
          c ? (
            <CalendarCell key={c.date} cell={c} calendarMonth={calendarMonth} onSelect={onSelect} notes={notes?.get(c.date)} isToday={c.date === today} />
          ) : (
            <div key={`blank-${i}`} className="min-h-[84px] bg-stone-50" />
          ),
        )}
      </div>
    </div>
  );
}

function CalendarCell({
  cell,
  calendarMonth,
  onSelect,
  notes,
  isToday,
}: {
  cell: DayCell;
  calendarMonth: string;
  onSelect: (cell: DayCell) => void;
  notes?: PrivateNote[];
  isToday?: boolean;
}) {
  const day = Number(cell.date.slice(8, 10));
  const red = cell.weekday === 0 || cell.status === 'holiday';
  const dateColor = red ? 'text-red-600' : cell.weekday === 6 ? 'text-blue-600' : 'text-stone-800';
  const isSkipped = cell.status === 'skipped';

  return (
    <button
      type="button"
      onClick={() => onSelect(cell)}
      className={`flex min-h-[84px] min-w-0 flex-col text-left active:bg-stone-100 ${
        isToday ? 'bg-emerald-50 ring-2 ring-inset ring-emerald-600' : 'bg-white'
      }`}
      style={isSkipped ? { backgroundImage: HATCH } : undefined}
      aria-label={isToday ? `${cell.date} 오늘` : cell.date}
      aria-current={isToday ? 'date' : undefined}
    >
      <div className="flex items-center justify-between px-1 pt-1">
        {isToday ? (
          <span className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-emerald-700 px-1 text-[14px] font-bold leading-none text-white">
            {day}
          </span>
        ) : (
          <span className={`text-[15px] font-semibold leading-none ${dateColor}`}>{day}</span>
        )}
        {cell.session?.pinned && <PinIcon className="h-3.5 w-3.5 text-stone-500" />}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5 px-1 pt-1">
        {cell.holidayName && (
          <span className="line-clamp-2 text-[11px] leading-tight text-red-600">{cell.holidayName}</span>
        )}
        {cell.closureLabel && (
          <span className="line-clamp-2 text-[11px] leading-tight text-stone-500">{cell.closureLabel}</span>
        )}
        {isSkipped && <span className="text-[12px] font-medium text-stone-500">비움</span>}
        {cell.events.map((e) => (
          <span key={e} className="flex min-w-0 items-start gap-0.5 text-[10px] leading-tight text-amber-800">
            <span className="mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
            <span className="line-clamp-2">{e}</span>
          </span>
        ))}
        {notes?.map((n, i) => (
          <span
            key={i}
            className={`block min-w-0 rounded px-0.5 py-px text-[10px] leading-tight ${
              n.kind === 'trial' ? 'bg-sky-100 text-sky-900' : 'bg-fuchsia-100 text-fuchsia-900'
            }`}
          >
            {n.lines.map((line, j) => (
              <span key={j} className={`block truncate ${j === 1 ? 'font-semibold' : ''}`}>
                {line}
              </span>
            ))}
          </span>
        ))}
      </div>

      {cell.status === 'session' && cell.session && (
        <span
          className="block truncate px-0.5 py-1 text-center text-[12px] font-semibold leading-tight text-stone-800"
          style={{ background: WEEK_COLORS[cell.session.weekNo] }}
        >
          {formatCellLabel(cell.session, calendarMonth)}
        </span>
      )}
      {cell.status === 'makeup' && (
        <span
          className="block truncate px-0.5 py-1 text-center text-[11px] font-semibold leading-tight text-white"
          style={{ background: MAKEUP_COLOR }}
        >
          보강수업
        </span>
      )}
    </button>
  );
}

export function WeekLegend() {
  const items: [string, string, string][] = [
    ['1주', WEEK_COLORS[1], '#292524'],
    ['2주', WEEK_COLORS[2], '#292524'],
    ['3주', WEEK_COLORS[3], '#292524'],
    ['4주', WEEK_COLORS[4], '#292524'],
    ['보강수업', MAKEUP_COLOR, '#fff'],
  ];
  return (
    <div className="flex flex-wrap gap-1.5 text-xs">
      {items.map(([label, bg, fg]) => (
        <span key={label} className="rounded-md px-2 py-1 font-medium" style={{ background: bg, color: fg }}>
          {label}
        </span>
      ))}
    </div>
  );
}
