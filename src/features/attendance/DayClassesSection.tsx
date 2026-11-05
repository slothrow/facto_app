// 회차 계획 날짜 바텀시트의 선생님용 정보(SPEC_students 8장 + 체험·토요보강).
// - 이 날 수업 반 → 반을 누르면 결석 체크 명단
// - 이 날 체험수업(시간·이름·학년) + [체험수업 기록]
// - 보강데이면 [토요보강 예약 보기]
import { useState } from 'react';
import { useAppData } from '../../app/AppDataContext.tsx';
import { navigate } from '../../app/router.ts';
import { useRoster } from '../../app/RosterContext.tsx';
import { Button } from '../../components/ui.tsx';
import { formatTimeKo } from '../../engine/classTime.ts';
import { weekdayOf } from '../../engine/dates.ts';
import { makeupDaysIn } from '../makeup/makeupModel.ts';
import { classGradeLabel } from '../roster/rosterModel.ts';
import { TrialForm } from '../roster/waitlist/TrialForm.tsx';
import { trialCalendarText } from '../roster/waitlist/waitlistModel.ts';
import type { TrialLessonRow } from '../../storage/rosterTypes.ts';
import { attendanceList, classesOnDate } from './attendanceModel.ts';

export function DayClassesSection({ date, onClose }: { date: string; onClose: () => void }) {
  const { data } = useAppData();
  const { roster } = useRoster();
  const [addingTrial, setAddingTrial] = useState(false);
  const [editing, setEditing] = useState<TrialLessonRow | null>(null);
  const { noClassReason, classes } = classesOnDate(data, roster, date);
  const trials = roster.trialLessons.filter((t) => t.date === date).sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));
  const isMakeupDay = weekdayOf(date) === 6 && makeupDaysIn(data, date.slice(0, 7)).includes(date);
  const booked = roster.makeupBookings.filter((b) => b.date === date).length;
  const showClasses = roster.classes.length > 0 && !isMakeupDay;

  return (
    <section className="space-y-3">
      {isMakeupDay && (
        <Button
          className="w-full border-fuchsia-300 text-fuchsia-900"
          onClick={() => {
            onClose();
            navigate(`/makeup/${date.slice(0, 7)}`);
          }}
        >
          토요보강 예약 보기 ({booked}명)
        </Button>
      )}

      {showClasses && (
        <div className="space-y-2">
          <h3 className="text-base font-bold text-stone-800">이 날 수업 반</h3>
          {noClassReason ? (
            <p className="rounded-xl bg-stone-100 p-3 text-base text-stone-600">수업 없음 · {noClassReason}</p>
          ) : classes.length === 0 ? (
            <p className="text-base text-stone-500">이 요일에 운영하는 반이 없어요.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {classes.map((c) => {
                const list = attendanceList(roster, c.id, date);
                const absent = list.filter((e) => e.absent).length;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      onClose();
                      navigate(`/attend/${date}/${c.id}`);
                    }}
                    className="min-h-14 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-left"
                  >
                    <div className="text-base font-semibold">
                      {formatTimeKo(c.startTime)} {classGradeLabel(c, date)}
                    </div>
                    <div className="text-sm text-stone-600">
                      {list.length}명{absent > 0 && <span className="text-red-700"> · 결석 {absent}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {roster.students.length + roster.waitlist.length > 0 && (
        <div className="space-y-2">
          {trials.length > 0 && (
            <ul className="space-y-1">
              {trials.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setEditing(t)}
                    className="flex min-h-11 w-full items-center gap-2 rounded-xl bg-sky-50 px-3 py-2 text-left text-base text-sky-900 active:bg-sky-100"
                  >
                    <span className="flex-1">
                      {trialCalendarText(roster, t)}
                      {t.memo && <span className="text-sm text-sky-700"> · {t.memo}</span>}
                    </span>
                    <span className="shrink-0 text-sm text-sky-700">수정</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Button variant="ghost" className="w-full text-sky-800" onClick={() => setAddingTrial(true)}>
            + 체험수업 기록 (선생님만 보기)
          </Button>
        </div>
      )}
      {addingTrial && <TrialForm presetDate={date} onClose={() => setAddingTrial(false)} />}
      {editing && <TrialForm initial={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}
