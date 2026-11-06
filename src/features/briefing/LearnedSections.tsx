// 학생 카드 "배운 내용", 반 상세 "브리핑 현황"(SPEC_briefing 6.3). 저장하지 않고 계산해서 보여 준다.
import { useMemo, useState } from 'react';
import { useAppData } from '../../app/AppDataContext.tsx';
import { navigate } from '../../app/router.ts';
import { todayStr, useRoster } from '../../app/RosterContext.tsx';
import { scheduleFor } from '../../app/scheduleInput.ts';
import { CheckIcon } from '../../components/icons.tsx';
import { Button, Card } from '../../components/ui.tsx';
import { shortTime } from '../../engine/classTime.ts';
import { addDays, addMonthsYm, monthStart } from '../../engine/dates.ts';
import type { ClassRow } from '../../storage/rosterTypes.ts';
import { courseMonthLabel, curriculumOf, currentSessionByWeekday } from '../curriculum/curriculumModel.ts';
import { dateLabel } from './TextsPage.tsx';
import { classMonthStatus, learnedHistory } from './learnedModel.ts';

const PAGE = 12;

export function LearnedSection({ studentId }: { studentId: string }) {
  const { data } = useAppData();
  const { roster } = useRoster();
  const today = todayStr();
  const [shown, setShown] = useState(PAGE);
  // 첫 배정부터(최대 1년 전) 오늘까지
  const from = useMemo(() => {
    const starts = roster.enrollments.filter((e) => e.studentId === studentId).map((e) => e.startDate).sort();
    const yearAgo = monthStart(addMonthsYm(today.slice(0, 7), -12));
    return starts[0] && starts[0] > yearAgo ? starts[0] : yearAgo;
  }, [roster.enrollments, studentId, today]);
  const items = useMemo(
    () => learnedHistory(roster, studentId, scheduleFor(data, { from, to: today }).days, curriculumOf(data), today),
    [roster, studentId, data, from, today],
  );
  const classById = new Map(roster.classes.map((c) => [c.id, c]));
  const missed = items.filter((i) => i.kind === 'absent').length;

  return (
    <Card title={`배운 내용${missed ? ` · 미이수 ${missed}회` : ''}`}>
      {items.length === 0 ? (
        <p className="text-base text-stone-500">아직 기록이 없어요. 반 진도를 설정하면 수업한 날마다 코드가 쌓여요.</p>
      ) : (
        <>
          <ul className="divide-y divide-stone-100">
            {items.slice(0, shown).map((i) => {
              const c = classById.get(i.classId);
              return (
                <li key={`${i.date}-${i.classId}`} className={`flex min-h-11 items-center gap-2 text-base ${i.kind === 'absent' ? 'text-stone-400' : ''}`}>
                  <span className="w-20 shrink-0">{dateLabel(i.date)}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold">
                    {i.label}
                    {i.kind === 'guest' && c && <span className="ml-1 text-sm font-normal text-sky-700">({shortTime(c.startTime)}반 보강)</span>}
                  </span>
                  {i.kind === 'absent' ? (
                    <span className="shrink-0 text-sm">결석(미이수)</span>
                  ) : i.sent ? (
                    <span className="flex shrink-0 items-center gap-0.5 text-sm font-semibold text-emerald-700">
                      <CheckIcon className="h-4 w-4" /> 보냄
                    </span>
                  ) : (
                    <span className="shrink-0 text-sm text-stone-400">안 보냄</span>
                  )}
                </li>
              );
            })}
          </ul>
          {items.length > shown && (
            <Button variant="ghost" className="mt-1 w-full" onClick={() => setShown((n) => n + PAGE)}>
              더 보기 ({items.length - shown})
            </Button>
          )}
        </>
      )}
    </Card>
  );
}

export function ClassBriefingStatus({ cls }: { cls: ClassRow }) {
  const { data } = useAppData();
  const { roster } = useRoster();
  const today = todayStr();
  const status = useMemo(() => {
    const session = currentSessionByWeekday(data, today).get(cls.weekday);
    if (!session) return null;
    // 수업월은 달력월과 어긋날 수 있어 앞뒤로 넉넉히 계산한다
    const cells = scheduleFor(data, { from: addDays(today, -56), to: addDays(today, 42) }).days;
    return { courseMonth: session.courseMonth, days: classMonthStatus(roster, cls, session.courseMonth, cells, curriculumOf(data), today) };
  }, [data, roster, cls, today]);
  if (!status) return null;

  return (
    <Card title={`브리핑 현황 · ${courseMonthLabel(status.courseMonth)}`}>
      {status.days.length === 0 ? (
        <p className="text-base text-stone-500">이번 수업월에 아직 지난 수업이 없어요.</p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {status.days.map((d) => {
            const all = d.total > 0 && d.sent === d.total;
            return (
              <li key={d.date}>
                <button
                  type="button"
                  onClick={() => navigate(`/briefing/${d.date}/${cls.id}`)}
                  className="flex min-h-11 w-full items-center gap-2 text-left text-base active:bg-stone-50"
                >
                  <span className="w-20 shrink-0">{dateLabel(d.date)}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{d.label}</span>
                  <span className={`shrink-0 font-semibold ${all ? 'text-emerald-700' : d.sent ? 'text-amber-700' : 'text-stone-400'}`}>
                    {d.sent}/{d.total} 보냄
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
