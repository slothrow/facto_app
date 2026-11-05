// 회차 계획 탭. SPEC 8.1.
import { format } from 'date-fns';
import { useMemo, useState } from 'react';
import { useAppData } from '../../app/AppDataContext.tsx';
import { describeImpact } from '../../app/impact.ts';
import { confirmMonth, isConfirmedMonth, unconfirmMonth, upsertClosure } from '../../app/mutations.ts';
import { navigate } from '../../app/router.ts';
import { scheduleFor } from '../../app/scheduleInput.ts';
import { ClosureForm } from '../../components/ClosureForm.tsx';
import { AlertIcon, CheckIcon, ChevronLeft, ChevronRight, LockIcon } from '../../components/icons.tsx';
import { BottomSheet, Button, Card, ConfirmDialog } from '../../components/ui.tsx';
import { addMonthsYm, monthEnd, monthOf, monthStart } from '../../engine/dates.ts';
import { WEEKDAY_NAMES, formatOffset, monthName } from '../../engine/label.ts';
import { snapshotMonth } from '../../engine/schedule.ts';
import type { DayCell, MonthSummary } from '../../engine/types.ts';
import type { AppData } from '../../storage/types.ts';
import { DaySheet } from './DaySheet.tsx';
import { ImpactPreview } from './ImpactPreview.tsx';
import { MonthCalendar, WeekLegend, type PrivateNote } from './MonthCalendar.tsx';
import { PlanSwitch } from './PlanSwitch.tsx';
import { useRoster } from '../../app/RosterContext.tsx';
import type { RosterData } from '../../storage/rosterTypes.ts';
import { trialLines } from '../roster/waitlist/waitlistModel.ts';

const isYm = (s?: string): s is string => !!s && /^\d{4}-\d{2}$/.test(s);

/** 선생님만 보는 칸 메모: 체험수업(시간순), 토요보강 예약 수 */
function privateNotesFor(roster: RosterData, ym: string): Map<string, PrivateNote[]> {
  const map = new Map<string, PrivateNote[]>();
  const add = (date: string, n: PrivateNote) => map.set(date, [...(map.get(date) ?? []), n]);
  roster.trialLessons
    .filter((t) => monthOf(t.date) === ym)
    .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''))
    .forEach((t) => add(t.date, { kind: 'trial', lines: trialLines(roster, t) }));
  const counts = new Map<string, number>();
  for (const b of roster.makeupBookings) if (monthOf(b.date) === ym) counts.set(b.date, (counts.get(b.date) ?? 0) + 1);
  for (const [date, n] of counts) add(date, { kind: 'makeup', lines: ['보강 예약', `${n}명`] });
  return map;
}

export function PlanPage({ month }: { month?: string }) {
  const { data, commit } = useAppData();
  const ym = isYm(month) ? month : format(new Date(), 'yyyy-MM');
  const [year, mon] = [ym.slice(0, 4), monthName(ym)];

  const output = useMemo(() => scheduleFor(data, { from: monthStart(ym), to: monthEnd(ym) }), [data, ym]);
  const summary = output.monthSummaries[0];
  const warnings = output.warnings.filter((w) => w.calendarMonth === ym);
  const confirmed = isConfirmedMonth(data, ym);
  const { roster } = useRoster();
  const notes = useMemo(() => privateNotesFor(roster, ym), [roster, ym]);

  const [selected, setSelected] = useState<DayCell | null>(null);
  const [closureOpen, setClosureOpen] = useState(false);
  const [dialog, setDialog] = useState<'confirm' | 'unconfirm' | null>(null);

  const go = (delta: number) => navigate(`/plan/${addMonthsYm(ym, delta)}`);

  const doConfirm = async () => {
    setDialog(null);
    await commit(confirmMonth(data, ym, snapshotMonth(output, ym), new Date().toISOString()), `${mon}을 확정했어요`);
  };
  const doUnconfirm = async () => {
    setDialog(null);
    await commit(unconfirmMonth(data, ym), `${mon} 확정을 해제했어요`);
  };

  return (
    <div className="space-y-4">
      <PlanSwitch active="plan" month={ym} />
      <Button variant="primary" className="flex w-full items-center justify-center gap-2 text-lg" onClick={() => navigate(`/attend/${format(new Date(), 'yyyy-MM-dd')}`)}>
        <CheckIcon className="h-6 w-6" /> 오늘 출석
      </Button>
      <header className="flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={() => go(-1)} aria-label="이전 달" className="px-2">
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <div className="flex flex-col items-center">
          <h1 className="text-xl font-bold">
            {year}년 {mon}
          </h1>
          {confirmed ? (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-sm font-medium text-emerald-800">
              <LockIcon className="h-3.5 w-3.5" /> 확정
            </span>
          ) : (
            <span className="mt-1 rounded-full bg-stone-200 px-2.5 py-0.5 text-sm font-medium text-stone-700">초안</span>
          )}
        </div>
        <Button variant="ghost" onClick={() => go(1)} aria-label="다음 달" className="px-2">
          <ChevronRight className="h-6 w-6" />
        </Button>
      </header>

      <MonthCalendar calendarMonth={ym} days={output.days} onSelect={setSelected} notes={notes} />
      <WeekLegend />
      {notes.size > 0 && <p className="-mt-2 text-xs text-stone-500">하늘색(체험)·분홍색(보강 예약)은 선생님만 보이고 달력배포 이미지에는 들어가지 않아요.</p>}

      <SummaryCard summary={summary} threshold={data.settings.offsetWarningThreshold} />

      {warnings.length > 0 && (
        <Card
          title={
            <span className="flex items-center gap-1.5 text-red-700">
              <AlertIcon className="h-5 w-5" /> 경고 {warnings.length}개
            </span>
          }
          className="border-red-200 bg-red-50"
        >
          <ul className="space-y-1 text-base text-red-900">
            {warnings.map((w) => (
              <li key={`${w.type}-${w.weekday}-${w.date}-${w.message}`}>· {w.message}</li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => setClosureOpen(true)}>휴원 기간 추가</Button>
        {confirmed ? (
          <Button onClick={() => setDialog('unconfirm')}>확정 해제</Button>
        ) : (
          <Button variant="primary" onClick={() => setDialog('confirm')}>
            이 달 확정
          </Button>
        )}
      </div>

      {selected && <DaySheet cell={selected} onClose={() => setSelected(null)} />}
      {closureOpen && <ClosureSheet data={data} onClose={() => setClosureOpen(false)} />}

      {dialog === 'confirm' && (
        <ConfirmDialog
          title={`${mon} 회차를 확정할까요?`}
          body="확정하면 앞 달을 바꿔도 이 달 회차는 그대로 유지됩니다. 학부모님께 안내 달력을 보내기 전에 확정하세요."
          confirmLabel="확정"
          onConfirm={doConfirm}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog === 'unconfirm' && (
        <ConfirmDialog
          title={`${mon} 확정을 해제할까요?`}
          body="해제하면 이 달 회차가 규칙대로 다시 계산되어 바뀔 수 있습니다. 이미 학부모님께 안내했다면 주의하세요."
          confirmLabel="확정 해제"
          danger
          onConfirm={doUnconfirm}
          onCancel={() => setDialog(null)}
        />
      )}
    </div>
  );
}

function SummaryCard({ summary, threshold }: { summary: MonthSummary; threshold: number }) {
  return (
    <Card title="요일별 요약">
      <ul className="divide-y divide-stone-100">
        {summary.tracks.map((t) => {
          const over = t.offset !== null && Math.abs(t.offset) >= threshold;
          return (
            <li key={t.weekday} className="flex flex-wrap items-baseline gap-x-2 py-2 text-base">
              <span className="w-6 font-bold">{WEEKDAY_NAMES[t.weekday]}</span>
              <span className="font-medium">{t.count}회</span>
              <span className="text-stone-600">· {t.sessionsText || '수업 없음'}</span>
              <span className={`ml-auto font-medium ${over ? 'text-red-700' : 'text-stone-700'}`}>
                월말 {t.offset === null ? '-' : formatOffset(t.offset)}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function ClosureSheet({ data, onClose }: { data: AppData; onClose: () => void }) {
  const { commit } = useAppData();
  const [pending, setPending] = useState<{ next: AppData; lines: string[]; label: string } | null>(null);

  return (
    <BottomSheet title="휴원 기간 추가" onClose={onClose}>
      {pending ? (
        <ImpactPreview
          title={`휴원 추가: ${pending.label}`}
          lines={pending.lines}
          note="시작 날짜부터 약 6개월을 비교한 결과입니다."
          onApply={async () => {
            if (await commit(pending.next, '휴원 기간을 추가했어요')) onClose();
          }}
          onCancel={() => setPending(null)}
        />
      ) : (
        <ClosureForm
          kindFixed="closed"
          submitLabel="미리보기"
          onCancel={onClose}
          onSubmit={(row) => {
            const next = upsertClosure(data, row);
            setPending({ next, lines: describeImpact(data, next, row.startDate), label: row.label });
          }}
        />
      )}
    </BottomSheet>
  );
}
