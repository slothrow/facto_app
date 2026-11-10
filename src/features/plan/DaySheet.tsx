// 달력 칸을 누르면 뜨는 바텀시트. SPEC 8.1.
import { useState } from 'react';
import { useAppData } from '../../app/AppDataContext.tsx';
import { describeImpact } from '../../app/impact.ts';
import {
  isConfirmedMonth,
  makeupDaysOf,
  newId,
  setMakeup,
  setPin,
  setSkip,
  upsertClosure,
  deleteClosure,
} from '../../app/mutations.ts';
import { addMonthsYm, monthOf, monthsBetween } from '../../engine/dates.ts';
import { WEEKDAY_NAMES, formatLabel, monthName } from '../../engine/label.ts';
import type { DayCell, WeekNo } from '../../engine/types.ts';
import { BottomSheet, Button, Field, inputClass } from '../../components/ui.tsx';
import type { AppData } from '../../storage/types.ts';
import { DayClassesSection } from '../attendance/DayClassesSection.tsx';
import { ImpactPreview } from './ImpactPreview.tsx';

interface Pending {
  title: string;
  next: AppData;
  lines: string[];
  note?: string;
}

const md = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

export function DaySheet({ cell, onClose }: { cell: DayCell; onClose: () => void }) {
  const { data, commit } = useAppData();
  const [pending, setPending] = useState<Pending | null>(null);
  const [pinOpen, setPinOpen] = useState(false);

  const ym = monthOf(cell.date);
  const locked = isConfirmedMonth(data, ym);
  const isWeekday = cell.weekday >= 1 && cell.weekday <= 5;
  const trackActive = (data.settings.operatingWeekdays as number[]).includes(cell.weekday);
  const override = data.sessionOverrides.find((o) => o.date === cell.date);

  const title = `${Number(ym.slice(5))}월 ${Number(cell.date.slice(8))}일 (${WEEKDAY_NAMES[cell.weekday]})`;

  const previewSession = (label: string, next: AppData) =>
    setPending({
      title: label,
      next,
      lines: describeImpact(data, next, cell.date),
      note: '바꾸는 날부터 약 6개월을 비교한 결과입니다.',
    });

  const apply = async () => {
    if (pending && (await commit(pending.next))) onClose();
  };

  if (pending) {
    return (
      <BottomSheet title={title} onClose={onClose}>
        <ImpactPreview
          title={pending.title}
          lines={pending.lines}
          note={pending.note}
          onApply={apply}
          onCancel={() => setPending(null)}
        />
      </BottomSheet>
    );
  }

  return (
    <BottomSheet title={title} onClose={onClose}>
      <div className="space-y-4">
        <StatusLine cell={cell} />
        <DayClassesSection date={cell.date} onClose={onClose} />

        {isWeekday && (
          <div className="space-y-2">
            {locked ? (
              <p className="rounded-xl bg-stone-100 p-3 text-base text-stone-600">
                확정된 달입니다. 수업 날짜를 바꾸려면 먼저 이 달의 확정을 해제하세요.
              </p>
            ) : !trackActive ? (
              <p className="rounded-xl bg-stone-100 p-3 text-base text-stone-600">
                운영하지 않는 요일입니다. 설정 › 운영 요일에서 켤 수 있어요.
              </p>
            ) : cell.status === 'holiday' ? (
              <p className="rounded-xl bg-stone-100 p-3 text-base text-stone-600">
                공휴일은 수업하지 않습니다. 이 날 수업하려면 설정 › 공휴일에서 "무시"로 바꾸세요.
              </p>
            ) : cell.status === 'closed' ? (
              <p className="rounded-xl bg-stone-100 p-3 text-base text-stone-600">
                휴원일입니다. 설정 › 휴원일·행사일에서 바꿀 수 있어요.
              </p>
            ) : cell.status === 'skipped' ? (
              <Button
                variant="primary"
                className="w-full"
                onClick={() => previewSession('휴강 취소(다시 당기기)', setSkip(data, cell.date, false))}
              >
                휴강 취소 (다시 당기기)
              </Button>
            ) : cell.status === 'session' ? (
              <>
                <Button
                  className="w-full"
                  onClick={() => previewSession('이 날 휴강', setSkip(data, cell.date, true))}
                >
                  이 날 휴강 (이후 수업 뒤로)
                </Button>
                <Button className="w-full" onClick={() => setPinOpen((v) => !v)}>
                  진도 직접 지정
                </Button>
                {pinOpen && (
                  <PinPicker
                    calendarMonth={ym}
                    initial={cell.session!}
                    onPreview={(label) =>
                      previewSession(`${formatLabel(label)}로 고정`, setPin(data, cell.date, label))
                    }
                  />
                )}
                {override?.type === 'pin' && (
                  <Button
                    className="w-full"
                    onClick={() => previewSession('고정 해제', setPin(data, cell.date, null))}
                  >
                    고정 해제
                  </Button>
                )}
              </>
            ) : (
              <p className="rounded-xl bg-stone-100 p-3 text-base text-stone-600">
                수업 시작점 이전 날짜입니다. 설정 › 요일반 시작점에서 바꿀 수 있어요.
              </p>
            )}
          </div>
        )}

        {cell.weekday === 6 && <MakeupSection cell={cell} onPreview={setPending} />}

        <EventMemo date={cell.date} />
      </div>
    </BottomSheet>
  );
}

function StatusLine({ cell }: { cell: DayCell }) {
  let text = '수업 없음';
  if (cell.status === 'session' && cell.session) {
    text = `${formatLabel(cell.session)} 수업${cell.session.pinned ? ' · 직접 지정함' : ''}${
      cell.session.confirmed ? ' · 확정' : ''
    }`;
  } else if (cell.status === 'holiday') text = `공휴일 · ${cell.holidayName}`;
  else if (cell.status === 'closed') text = `휴원 · ${cell.closureLabel}`;
  else if (cell.status === 'skipped') text = '휴강 (수업 없음, 이후 수업이 뒤로 밀림)';
  else if (cell.status === 'makeup') text = '보강데이';
  return <p className="text-base font-medium text-stone-700">{text}</p>;
}

function PinPicker({
  calendarMonth,
  initial,
  onPreview,
}: {
  calendarMonth: string;
  initial: { courseMonth: string; weekNo: WeekNo };
  onPreview: (label: { courseMonth: string; weekNo: WeekNo }) => void;
}) {
  const [courseMonth, setCourseMonth] = useState(initial.courseMonth);
  const [weekNo, setWeekNo] = useState<WeekNo>(initial.weekNo);
  const months = monthsBetween(addMonthsYm(calendarMonth, -3), addMonthsYm(calendarMonth, 3));

  return (
    <div className="space-y-3 rounded-xl border border-stone-200 p-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="진도 월">
          <select className={inputClass} value={courseMonth} onChange={(e) => setCourseMonth(e.target.value)}>
            {months.map((m) => (
              <option key={m} value={m}>
                {m.slice(0, 4)}년 {monthName(m)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="주">
          <select
            className={inputClass}
            value={weekNo}
            onChange={(e) => setWeekNo(Number(e.target.value) as WeekNo)}
          >
            {[1, 2, 3, 4].map((w) => (
              <option key={w} value={w}>
                {w}주
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Button variant="primary" className="w-full" onClick={() => onPreview({ courseMonth, weekNo })}>
        미리보기
      </Button>
    </div>
  );
}

function MakeupSection({ cell, onPreview }: { cell: DayCell; onPreview: (p: Pending) => void }) {
  const { data } = useAppData();
  const ym = monthOf(cell.date);
  const isMakeup = cell.status === 'makeup';
  const current = makeupDaysOf(data, ym);

  const preview = (on: boolean) => {
    const next = setMakeup(data, cell.date, on);
    const after = makeupDaysOf(next, ym);
    const fmt = (list: string[]) => (list.length ? list.map(md).join(', ') : '없음');
    onPreview({
      title: on ? '보강데이로 지정' : '보강데이 해제',
      next,
      lines: [`${monthName(ym)} 보강데이: ${fmt(current)} → ${fmt(after)}`],
    });
  };

  return (
    <div className="space-y-2">
      <p className="text-sm text-stone-500">
        {monthName(ym)} 보강데이: {current.length ? current.map(md).join(', ') : '없음'}
      </p>
      {isMakeup ? (
        <Button className="w-full" onClick={() => preview(false)}>
          보강데이 해제
        </Button>
      ) : (
        <Button variant="primary" className="w-full" onClick={() => preview(true)}>
          이 날을 보강데이로 지정
        </Button>
      )}
    </div>
  );
}

function EventMemo({ date }: { date: string }) {
  const { data, commit } = useAppData();
  const [label, setLabel] = useState('');
  const [show, setShow] = useState(true);
  const events = data.closures.filter((c) => c.kind === 'event' && c.startDate <= date && date <= c.endDate);

  const add = async () => {
    if (!label.trim()) return;
    const ok = await commit(
      upsertClosure(data, {
        id: newId(),
        kind: 'event',
        startDate: date,
        endDate: date,
        weekdays: null,
        label: label.trim(),
        showOnCalendar: show,
      }),
      '행사를 추가했어요',
    );
    if (ok) setLabel('');
  };

  return (
    <div className="space-y-2 border-t border-stone-200 pt-4">
      <p className="font-bold text-stone-800">행사 메모</p>
      {events.map((e) => (
        <div key={e.id} className="flex items-center justify-between gap-2 rounded-xl bg-amber-50 px-3 py-2">
          <span className="min-w-0 text-base">
            {e.label}
            {e.startDate !== e.endDate && (
              <span className="text-sm text-stone-500">
                {' '}
                ({md(e.startDate)}~{md(e.endDate)})
              </span>
            )}
            {!e.showOnCalendar && <span className="text-sm text-stone-500"> · 이미지에 표시 안 함</span>}
          </span>
          <Button variant="ghost" className="shrink-0 text-red-600" onClick={() => commit(deleteClosure(data, e.id), '행사를 지웠어요')}>
            삭제
          </Button>
        </div>
      ))}
      <input
        className={inputClass}
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="예: 보드게임 페스티벌"
      />
      <label className="flex min-h-11 items-center gap-3 text-base">
        <input type="checkbox" className="h-5 w-5" checked={show} onChange={(e) => setShow(e.target.checked)} />
        안내 달력 이미지에 표시
      </label>
      <Button className="w-full" onClick={add} disabled={!label.trim()}>
        행사 추가
      </Button>
    </div>
  );
}
