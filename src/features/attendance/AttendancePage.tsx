// 결석 체크(SPEC_students 8장). 주소: #/attend/<날짜>(그날 수업 반), #/attend/<날짜>/<반 id>(명단)
// 기본은 전원 출석. 결석인 아이만 탭해서 표시하고, 다시 탭하면 해제. 누르는 즉시 저장된다.
import { useState } from 'react';
import { useAppData } from '../../app/AppDataContext.tsx';
import { navigate } from '../../app/router.ts';
import { todayStr, useRoster } from '../../app/RosterContext.tsx';
import { CheckIcon, ChevronLeft, ChevronRight } from '../../components/icons.tsx';
import { Button, Card } from '../../components/ui.tsx';
import { formatTimeKo } from '../../engine/classTime.ts';
import { addDays, weekdayOf } from '../../engine/dates.ts';
import { CAPACITY, WEEKDAY_NAMES, classDisplayName, studentGradeLabel } from '../roster/rosterModel.ts';
import { TrialForm } from '../roster/waitlist/TrialForm.tsx';
import { attendanceList, classesOnDate, toggleAbsence } from './attendanceModel.ts';

const isDate = (s?: string): s is string => Boolean(s && /^\d{4}-\d{2}-\d{2}$/.test(s));
const dateTitle = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8))}일 (${WEEKDAY_NAMES[weekdayOf(d)]})`;

export function AttendancePage({ params }: { params: string[] }) {
  const today = todayStr();
  const date = isDate(params[0]) ? params[0] : today;
  const classId = params[1];
  return classId ? <ClassAttendance date={date} classId={classId} /> : <DayClassList date={date} />;
}

function DayClassList({ date }: { date: string }) {
  const { data } = useAppData();
  const { roster } = useRoster();
  const today = todayStr();
  const { noClassReason, classes } = classesOnDate(data, roster, date);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-2">
        <Button variant="ghost" className="px-2" aria-label="전날" onClick={() => navigate(`/attend/${addDays(date, -1)}`)}>
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <div className="text-center">
          <h1 className="text-xl font-bold">{dateTitle(date)} 출석</h1>
          {date !== today && (
            <button type="button" className="min-h-9 text-sm text-emerald-800 underline" onClick={() => navigate(`/attend/${today}`)}>
              오늘로
            </button>
          )}
        </div>
        <Button variant="ghost" className="px-2" aria-label="다음 날" onClick={() => navigate(`/attend/${addDays(date, 1)}`)}>
          <ChevronRight className="h-6 w-6" />
        </Button>
      </header>

      {noClassReason ? (
        <Card>
          <p className="py-6 text-center text-lg font-semibold text-stone-600">수업 없음 · {noClassReason}</p>
        </Card>
      ) : classes.length === 0 ? (
        <Card>
          <p className="py-6 text-center text-base text-stone-500">이 요일에 운영하는 반이 없어요.</p>
        </Card>
      ) : (
        <ul className="space-y-2 md:grid md:grid-cols-2 md:gap-3 md:space-y-0 lg:grid-cols-3">
          {classes.map((c) => {
            const list = attendanceList(roster, c.id, date);
            const absent = list.filter((e) => e.absent).length;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/attend/${date}/${c.id}`)}
                  className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 text-left active:bg-stone-50"
                >
                  <div className="flex-1">
                    <div className="text-lg font-bold">{formatTimeKo(c.startTime)}</div>
                    <div className="text-base text-stone-600">{classDisplayName(c, date)}</div>
                  </div>
                  <div className="text-right text-base">
                    <div className="font-semibold">{list.length}명</div>
                    {absent > 0 && <div className="text-red-700">결석 {absent}</div>}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <Button variant="ghost" className="w-full md:mx-auto md:block md:w-auto md:px-6" onClick={() => navigate(`/plan/${date.slice(0, 7)}`)}>
        회차 계획 달력으로
      </Button>
    </div>
  );
}

function ClassAttendance({ date, classId }: { date: string; classId: string }) {
  const { roster, mutate } = useRoster();
  const [addingTrial, setAddingTrial] = useState(false);
  const cls = roster.classes.find((c) => c.id === classId);
  if (!cls) return <p className="text-base">반을 찾을 수 없어요.</p>;
  const list = attendanceList(roster, classId, date);
  const absent = list.filter((e) => e.absent).length;

  return (
    <div className="space-y-4">
      <button type="button" onClick={() => navigate(`/attend/${date}`)} className="flex h-11 items-center gap-1 text-base text-stone-600">
        <ChevronLeft className="h-5 w-5" /> {dateTitle(date)} 반 목록
      </button>
      <div>
        <h1 className="text-xl font-bold">{classDisplayName(cls, date)}</h1>
        <p className="text-base text-stone-600">
          {dateTitle(date)} · {list.length}/{CAPACITY}명 · {absent > 0 ? <b className="text-red-700">결석 {absent}명</b> : '전원 출석'}
        </p>
        <p className="mt-1 text-sm text-stone-500">결석한 아이만 눌러 주세요. 다시 누르면 출석으로 돌아가요.</p>
      </div>

      {list.length === 0 ? (
        <Card>
          <p className="text-base text-stone-500">이 날 명단이 비어 있어요.</p>
        </Card>
      ) : (
        <ul className="space-y-2 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
          {list.map((e) =>
            e.kind === 'student' ? (
              <li key={e.id}>
                <button
                  type="button"
                  aria-pressed={e.absent}
                  onClick={() => mutate(toggleAbsence(roster, date, classId, e.id), e.absent ? '출석으로 바꿨어요' : '결석으로 표시했어요')}
                  className={`flex min-h-16 w-full items-center gap-3 rounded-2xl border-2 px-4 text-left ${
                    e.absent ? 'border-red-500 bg-red-50' : 'border-stone-200 bg-white'
                  }`}
                >
                  <span className="flex-1 text-lg font-semibold">
                    {e.name} <span className="text-base font-normal text-stone-500">{e.student && studentGradeLabel(e.student, date)}</span>
                  </span>
                  {e.absent ? (
                    <span className="rounded-full bg-red-600 px-3 py-1 text-base font-bold text-white">결석</span>
                  ) : (
                    <span className="flex items-center gap-1 text-base text-emerald-700">
                      <CheckIcon className="h-5 w-5" /> 출석
                    </span>
                  )}
                </button>
              </li>
            ) : (
              <li key={e.id} className="flex min-h-14 items-center gap-3 rounded-2xl border border-dashed border-sky-300 bg-sky-50 px-4">
                <span className="flex-1 text-lg font-semibold">{e.name}</span>
                <span className="rounded-full bg-sky-200 px-3 py-1 text-sm font-semibold text-sky-900">체험</span>
              </li>
            ),
          )}
        </ul>
      )}
      <Button className="w-full md:w-auto md:px-6" onClick={() => setAddingTrial(true)}>
        이 반에 체험수업 기록
      </Button>
      {addingTrial && <TrialForm presetDate={date} presetClassId={classId} onClose={() => setAddingTrial(false)} />}
    </div>
  );
}
