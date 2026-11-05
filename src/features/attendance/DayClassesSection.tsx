// 회차 계획 날짜 바텀시트의 "이 날 수업 반" 목록(SPEC_students 8장). 반을 누르면 결석 체크 명단으로 간다.
import { useState } from 'react';
import { useAppData } from '../../app/AppDataContext.tsx';
import { navigate } from '../../app/router.ts';
import { useRoster } from '../../app/RosterContext.tsx';
import { Button } from '../../components/ui.tsx';
import { formatTimeKo } from '../../engine/classTime.ts';
import { classGradeLabel } from '../roster/rosterModel.ts';
import { TrialForm } from '../roster/waitlist/TrialForm.tsx';
import { attendanceList, classesOnDate } from './attendanceModel.ts';

export function DayClassesSection({ date, onClose }: { date: string; onClose: () => void }) {
  const { data } = useAppData();
  const { roster } = useRoster();
  const [addingTrial, setAddingTrial] = useState(false);
  if (roster.classes.length === 0) return null;
  const { noClassReason, classes } = classesOnDate(data, roster, date);

  return (
    <section className="space-y-2">
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
      {!noClassReason && classes.length > 0 && (
        <Button variant="ghost" className="w-full text-sky-800" onClick={() => setAddingTrial(true)}>
          + 체험수업 기록
        </Button>
      )}
      {addingTrial && <TrialForm presetDate={date} onClose={() => setAddingTrial(false)} />}
    </section>
  );
}
