// 토요보강 예약 리스트. 주소: #/makeup/<YYYY-MM>
// 위: 보강데이별 30분 타임(9:00~14:00, 1:1) / 아래: 그 달 결석했는데 예약 안 된 "미정" 학생 → 누르면 타임 고르기
import { format } from 'date-fns';
import { useState } from 'react';
import { useAppData } from '../../app/AppDataContext.tsx';
import { navigate } from '../../app/router.ts';
import { useRoster } from '../../app/RosterContext.tsx';
import { ChevronLeft, ChevronRight } from '../../components/icons.tsx';
import { BottomSheet, Button, Card, inputClass } from '../../components/ui.tsx';
import { formatTimeKo, shortTime } from '../../engine/classTime.ts';
import { addMonthsYm, weekdayOf } from '../../engine/dates.ts';
import type { MakeupBookingRow, StudentRow } from '../../storage/rosterTypes.ts';
import { WEEKDAY_NAMES, studentGradeLabel } from '../roster/rosterModel.ts';
import { matchesName } from '../roster/students/studentModel.ts';
import { PlanSwitch } from '../plan/PlanSwitch.tsx';
import { monthMakeup, planBooking, planCancelBooking, type MonthMakeup } from './makeupModel.ts';

const isYm = (s?: string): s is string => Boolean(s && /^\d{4}-\d{2}$/.test(s));
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;
const dayTitle = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8))}일 (${WEEKDAY_NAMES[weekdayOf(d)]})`;

type Picking = { kind: 'slot'; date: string; time: string } | { kind: 'student'; student: StudentRow } | { kind: 'booked'; booking: MakeupBookingRow; student: StudentRow | null };

export function MakeupPage({ month }: { month?: string }) {
  const { data } = useAppData();
  const { roster } = useRoster();
  const ym = isYm(month) ? month : format(new Date(), 'yyyy-MM');
  const m = monthMakeup(data, roster, ym);
  const [picking, setPicking] = useState<Picking | null>(null);

  return (
    <div className="space-y-4">
      <div className="md:max-w-md">
        <PlanSwitch active="makeup" month={ym} />
      </div>
      <header className="flex items-center justify-between gap-2">
        <Button variant="ghost" className="px-2" aria-label="이전 달" onClick={() => navigate(`/makeup/${addMonthsYm(ym, -1)}`)}>
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <h1 className="text-xl font-bold">
          {Number(ym.slice(0, 4))}년 {Number(ym.slice(5))}월 토요보강
        </h1>
        <Button variant="ghost" className="px-2" aria-label="다음 달" onClick={() => navigate(`/makeup/${addMonthsYm(ym, 1)}`)}>
          <ChevronRight className="h-6 w-6" />
        </Button>
      </header>

      {m.days.length === 0 && (
        <Card>
          <p className="text-base text-stone-600">이 달에는 보강데이가 없어요. 달력에서 토요일을 누르고 [보강데이 지정]을 하면 여기에 타임이 생겨요.</p>
        </Card>
      )}

      {/* PC: 보강데이 카드와 미정 학생을 2열로 */}
      <div className="space-y-4 md:grid md:grid-cols-2 md:items-start md:gap-4 md:space-y-0">
      {m.days.map((d) => {
        const booked = d.slots.filter((s) => s.booking).length;
        return (
          <Card key={d.date} title={`${dayTitle(d.date)} · 예약 ${booked}/${d.slots.length}`}>
            <ul className="divide-y divide-stone-100">
              {d.slots.map((s) => (
                <li key={s.time}>
                  <button
                    type="button"
                    onClick={() =>
                      setPicking(s.booking ? { kind: 'booked', booking: s.booking, student: s.student } : { kind: 'slot', date: d.date, time: s.time })
                    }
                    className="flex min-h-12 w-full items-center gap-3 text-left active:bg-stone-50"
                  >
                    <span className="w-24 shrink-0 text-base font-semibold text-stone-600">
                      {shortTime(s.time)}~{shortTime(addMinutes(s.time, 30))}
                    </span>
                    {s.student ? (
                      <span className="text-lg font-semibold text-fuchsia-900">
                        {s.student.name} <span className="text-base font-normal text-stone-500">{studentGradeLabel(s.student, d.date)}</span>
                      </span>
                    ) : (
                      <span className="text-base text-stone-400">비어 있음</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}

      {m.misplaced.length > 0 && (
        <Card title="날짜 확인 필요">
          <p className="mb-2 text-sm text-stone-600">보강데이가 바뀌어서 지금 타임에 없는 예약이에요. 눌러서 다시 잡아 주세요.</p>
          <ul className="space-y-1">
            {m.misplaced.map(({ booking, student }) => (
              <li key={booking.id}>
                <button type="button" className="min-h-11 text-left text-base" onClick={() => setPicking({ kind: 'booked', booking, student })}>
                  {student?.name ?? '(삭제된 학생)'} <span className="text-stone-500">{md(booking.date)} {shortTime(booking.startTime)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title={`미정 ${m.pending.length}명`}>
        {m.pending.length === 0 ? (
          <p className="text-base text-stone-500">이 달에 결석했는데 보강이 안 잡힌 학생이 없어요.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {m.pending.map((p) => (
              <li key={p.student.id}>
                <button
                  type="button"
                  disabled={m.days.length === 0}
                  onClick={() => setPicking({ kind: 'student', student: p.student })}
                  className="flex min-h-12 w-full items-center gap-2 text-left active:bg-stone-50 disabled:opacity-60"
                >
                  <span className="text-base font-semibold">{p.student.name}</span>
                  <span className="text-sm text-stone-500">{studentGradeLabel(p.student, p.absenceDates[0])}</span>
                  <span className="ml-auto text-sm text-red-700">결석 {p.absenceDates.map(md).join(', ')}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      </div>

      {picking && <PickSheet picking={picking} month={m} onClose={() => setPicking(null)} />}
    </div>
  );
}

function addMinutes(hhmm: string, n: number) {
  const [h, mi] = hhmm.split(':').map(Number);
  const t = h * 60 + mi + n;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

function PickSheet({ picking, month, onClose }: { picking: Picking; month: MonthMakeup; onClose: () => void }) {
  const { roster, mutate } = useRoster();
  const [q, setQ] = useState('');

  const book = async (studentId: string, date: string, time: string) => {
    const change = planBooking(roster, studentId, date, time);
    if (!change) return;
    if (await mutate(change, '보강을 잡았어요')) onClose();
  };

  // 빈 타임 → 학생 고르기(미정 학생 먼저, 아래에 검색)
  if (picking.kind === 'slot') {
    const pendingIds = new Set(month.pending.map((p) => p.student.id));
    const others = q
      ? roster.students.filter((s) => s.status !== 'left' && !pendingIds.has(s.id) && matchesName(s.name, q)).slice(0, 8)
      : [];
    return (
      <BottomSheet title={`${dayTitle(picking.date)} ${formatTimeKo(picking.time)}`} onClose={onClose}>
        <div className="space-y-3">
          {month.pending.length > 0 && <h3 className="text-sm font-semibold text-stone-600">미정 학생</h3>}
          {month.pending.map((p) => (
            <Button key={p.student.id} className="w-full text-left" onClick={() => book(p.student.id, picking.date, picking.time)}>
              {p.student.name} <span className="text-sm text-red-700">결석 {p.absenceDates.map(md).join(', ')}</span>
            </Button>
          ))}
          <input className={inputClass} placeholder="다른 학생 이름 검색" value={q} onChange={(e) => setQ(e.target.value)} />
          {others.map((s) => (
            <Button key={s.id} className="w-full text-left" onClick={() => book(s.id, picking.date, picking.time)}>
              {s.name}
            </Button>
          ))}
        </div>
      </BottomSheet>
    );
  }

  // 미정 학생 → 빈 타임 고르기
  if (picking.kind === 'student') {
    return (
      <BottomSheet title={`${picking.student.name} 보강 잡기`} onClose={onClose}>
        <FreeSlotPicker month={month} onPick={(date, time) => book(picking.student.id, date, time)} />
      </BottomSheet>
    );
  }

  // 예약된 타임 → 옮기기 / 취소 / 학생 카드
  return <BookedSheet picking={picking} month={month} onClose={onClose} onMove={book} />;
}

function BookedSheet({
  picking,
  month,
  onClose,
  onMove,
}: {
  picking: Extract<Picking, { kind: 'booked' }>;
  month: MonthMakeup;
  onClose: () => void;
  onMove: (studentId: string, date: string, time: string) => Promise<void>;
}) {
  const { mutate } = useRoster();
  const [moving, setMoving] = useState(false);
  const { booking, student } = picking;
  return (
    <BottomSheet title={`${student?.name ?? ''} · ${md(booking.date)} ${formatTimeKo(booking.startTime)}`} onClose={onClose}>
      {moving ? (
        <FreeSlotPicker month={month} onPick={(date, time) => onMove(booking.studentId, date, time)} />
      ) : (
        <div className="space-y-2">
          <Button variant="primary" className="w-full" onClick={() => setMoving(true)}>
            다른 시간으로 옮기기
          </Button>
          <Button
            className="w-full"
            onClick={async () => {
              if (await mutate(planCancelBooking(booking), '보강 예약을 취소했어요(미정으로)')) onClose();
            }}
          >
            예약 취소
          </Button>
          {student && (
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => {
                onClose();
                navigate(`/roster/student/${student.id}`);
              }}
            >
              학생 카드 보기
            </Button>
          )}
        </div>
      )}
    </BottomSheet>
  );
}

function FreeSlotPicker({ month, onPick }: { month: MonthMakeup; onPick: (date: string, time: string) => void }) {
  return (
    <div className="space-y-4">
      {month.days.map((d) => (
        <div key={d.date}>
          <h3 className="mb-2 text-base font-semibold">{dayTitle(d.date)}</h3>
          <div className="grid grid-cols-3 gap-2">
            {d.slots.map((s) => (
              <button
                key={s.time}
                type="button"
                disabled={Boolean(s.booking)}
                onClick={() => onPick(d.date, s.time)}
                className="min-h-11 rounded-xl border border-stone-300 bg-white text-base font-medium disabled:border-stone-200 disabled:bg-stone-100 disabled:text-stone-400"
              >
                {shortTime(s.time)}
                {s.student && <span className="block text-xs">{s.student.name}</span>}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
