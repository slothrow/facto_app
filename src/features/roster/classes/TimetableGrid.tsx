// 한 페이지 주간 시간표: 월~금 × 1:30~5:30. 반은 시작 시간에 맞춰 10분 단위로 위치를 잡는다
// (1:40반은 1:30반보다 10분만큼 아래, 새 줄을 만들지 않음). 칸마다 반 학년·인원과 아이 이름.
// 폰(360px)에서도 가로 스크롤 없이 한 화면에 들어가게 작은 글씨로 그린다.
// - 이름 탭 → 정보 수정 / 반 이동 / 학생 카드
// - 반 머리(학년·인원) 탭 → 반 상세
// - 빈 곳 탭 → 그 요일·시간(10분 단위)으로 반 추가
import { useState, type MouseEvent } from 'react';
import { navigate } from '../../../app/router.ts';
import { todayStr, useRoster } from '../../../app/RosterContext.tsx';
import { BottomSheet, Button } from '../../../components/ui.tsx';
import { CLASS_MINUTES, fromMinutes, shortTime, toMinutes } from '../../../engine/classTime.ts';
import { weekdayOf } from '../../../engine/dates.ts';
import type { Weekday } from '../../../engine/types.ts';
import type { ClassRow, RosterData, StudentRow } from '../../../storage/rosterTypes.ts';
import { EnrollSheet } from '../students/EnrollSheet.tsx';
import { StudentForm } from '../students/StudentForm.tsx';
import { waitlistMatchesForClass } from '../waitlist/waitlistModel.ts';
import {
  CAPACITY,
  CLASS_WEEKDAYS,
  MIN_HEADCOUNT,
  STANDARD_SLOTS,
  WEEKDAY_NAMES,
  classBadges,
  classDisplayName,
  classGradeLabel,
  classHeadcount,
  classMembersOn,
  freeStandardSlots,
  studentGradeLabel,
  timetableRange,
} from '../rosterModel.ts';
import { ClassForm } from './ClassForm.tsx';

type Range = { start: number; end: number };
/** 분 → CSS 길이. --u = 1분의 높이(50분 칸에 이름 4~5명이 들어가는 크기) */
const px = (minutes: number) => `calc(${minutes} * var(--u))`;

export function TimetableGrid({ classes }: { classes: ClassRow[] }) {
  const { roster } = useRoster();
  const today = todayStr();
  const todayWd = weekdayOf(today);
  const range = timetableRange(classes);
  const [picked, setPicked] = useState<StudentRow | null>(null);
  const [newAt, setNewAt] = useState<{ weekday: Weekday; startTime: string } | null>(null);
  const labels = STANDARD_SLOTS.filter((t) => toMinutes(t) >= range.start && toMinutes(t) < range.end);
  // 기본 시간이 아닌 반(예: 1:40)은 왼쪽 눈금에 따로 작게 표시
  const extraLabels = [...new Set(classes.map((c) => c.startTime))].filter((t) => !STANDARD_SLOTS.includes(t));

  return (
    <>
      <div className="[--u:1.75px] md:[--u:2.4px]">
        <div className="flex gap-0.5 md:gap-1">
          <div className="w-8 shrink-0 md:w-14" />
          {CLASS_WEEKDAYS.map((wd) => (
            <div
              key={wd}
              className={`min-w-0 flex-1 rounded-md py-1 text-center text-sm font-bold md:text-base ${wd === todayWd ? 'bg-emerald-700 text-white' : 'text-stone-700'}`}
            >
              {WEEKDAY_NAMES[wd]}
            </div>
          ))}
        </div>
        <div className="mt-0.5 flex gap-0.5 md:gap-1">
          <div className="relative w-8 shrink-0 md:w-14" style={{ height: px(range.end - range.start) }}>
            {labels.map((t) => (
              <span
                key={t}
                className="absolute right-0.5 text-xs leading-none font-semibold text-stone-500 md:text-sm"
                style={{ top: px(toMinutes(t) - range.start + 3) }}
              >
                {shortTime(t)}
              </span>
            ))}
            {extraLabels.map((t) => (
              <span
                key={t}
                className="absolute right-0.5 text-[10px] leading-none font-semibold text-sky-700 md:text-xs"
                style={{ top: px(toMinutes(t) - range.start + 3) }}
              >
                {shortTime(t)}
              </span>
            ))}
          </div>
          {CLASS_WEEKDAYS.map((wd) => (
            <DayColumn
              key={wd}
              weekday={wd}
              classes={classes.filter((c) => c.weekday === wd)}
              range={range}
              roster={roster}
              today={today}
              isToday={wd === todayWd}
              onPick={setPicked}
              onEmpty={setNewAt}
            />
          ))}
        </div>
      </div>
      <p className="mt-2 text-center text-xs text-stone-500 md:text-sm">이름 → 수정·반 이동 · 반 머리 → 반 상세 · 빈 곳 → 반 추가</p>

      {picked && <StudentActions student={picked} onClose={() => setPicked(null)} />}
      {newAt && <ClassForm preset={newAt} onClose={() => setNewAt(null)} />}
    </>
  );
}

function DayColumn({
  weekday,
  classes,
  range,
  roster,
  today,
  isToday,
  onPick,
  onEmpty,
}: {
  weekday: Weekday;
  classes: ClassRow[];
  range: Range;
  roster: RosterData;
  today: string;
  isToday: boolean;
  onPick: (s: StudentRow) => void;
  onEmpty: (at: { weekday: Weekday; startTime: string }) => void;
}) {
  const free = freeStandardSlots(classes).filter((t) => toMinutes(t) >= range.start && toMinutes(t) + CLASS_MINUTES <= range.end);

  // 빈 곳을 누르면 그 위치의 시간(10분 단위로 내림)으로 반 추가
  const onBackground = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const unit = parseFloat(getComputedStyle(e.currentTarget).getPropertyValue('--u')) || 2;
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const m = range.start + Math.floor(y / unit / 10) * 10;
    onEmpty({ weekday, startTime: fromMinutes(Math.min(m, range.end - CLASS_MINUTES)) });
  };

  return (
    <div
      className={`relative min-w-0 flex-1 rounded-lg ${isToday ? 'bg-emerald-50/70' : 'bg-stone-100/70'}`}
      style={{ height: px(range.end - range.start) }}
      onClick={onBackground}
    >
      {free.map((t) => (
        <button
          key={t}
          type="button"
          aria-label={`${WEEKDAY_NAMES[weekday]} ${shortTime(t)} 반 추가`}
          onClick={() => onEmpty({ weekday, startTime: t })}
          className="absolute inset-x-0 rounded-lg border border-dashed border-stone-300 active:bg-stone-200"
          style={{ top: px(toMinutes(t) - range.start), height: px(CLASS_MINUTES) }}
        />
      ))}
      {classes.map((c) => (
        <div key={c.id} className="absolute inset-x-0" style={{ top: px(toMinutes(c.startTime) - range.start), height: px(CLASS_MINUTES) }}>
          <ClassCell cls={c} roster={roster} today={today} tint={isToday ? 'bg-emerald-50' : 'bg-white'} onPick={onPick} />
        </div>
      ))}
    </div>
  );
}

function ClassCell({
  cls,
  roster,
  today,
  tint,
  onPick,
}: {
  cls: ClassRow;
  roster: RosterData;
  today: string;
  tint: string;
  onPick: (s: StudentRow) => void;
}) {
  const members = classMembersOn(roster, cls.id, today);
  const count = classHeadcount(roster, cls.id, today);
  const upcoming = roster.enrollments
    .filter((e) => e.classId === cls.id && e.startDate > today)
    .map((e) => roster.students.find((s) => s.id === e.studentId))
    .filter((s): s is StudentRow => Boolean(s && s.status !== 'left' && !members.some((m) => m.id === s.id)));
  const warn = classBadges(roster, cls, today).length > 0;
  const waiting = waitlistMatchesForClass(roster, cls, today).length;
  const countColor = count > CAPACITY ? 'text-red-700' : count < MIN_HEADCOUNT ? 'text-amber-700' : 'text-stone-500';

  return (
    <div className={`h-full min-w-0 overflow-hidden rounded-lg border ${warn ? 'border-amber-300' : 'border-emerald-200'} ${tint}`}>
      <button
        type="button"
        onClick={() => navigate(`/roster/class/${cls.id}`)}
        className={`mb-0.5 flex w-full items-baseline justify-between gap-0.5 px-1 py-px text-left ${warn ? 'bg-amber-50' : 'bg-emerald-50'}`}
        aria-label={`${classDisplayName(cls, today)} 반 상세`}
      >
        <span className="truncate text-xs font-bold text-emerald-900 md:text-sm">
          {cls.gradeCode === null ? '미정' : classGradeLabel(cls, today)}
        </span>
        <span className={`shrink-0 text-[11px] font-semibold md:text-xs ${countColor}`}>
          {count}/{CAPACITY}
        </span>
      </button>
      <ul className="px-0.5 pb-0.5">
        {members.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onPick(s)}
              className={`block w-full truncate rounded px-0.5 text-left text-[13px] leading-[15px] active:bg-stone-100 md:text-base md:leading-snug ${
                s.needsReview ? 'text-amber-800' : 'text-stone-900'
              }`}
            >
              {s.name}
            </button>
          </li>
        ))}
        {upcoming.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onPick(s)}
              className="block w-full truncate px-0.5 text-left text-[12px] leading-[15px] text-stone-400 italic md:text-sm"
            >
              +{s.name}
            </button>
          </li>
        ))}
      </ul>
      {waiting > 0 && <div className="px-1 pb-0.5 text-[11px] font-semibold text-sky-700 md:text-xs">대기 {waiting}</div>}
    </div>
  );
}

/** 이름을 눌렀을 때: 정보 수정 / 반 이동 / 학생 카드 */
function StudentActions({ student, onClose }: { student: StudentRow; onClose: () => void }) {
  const { roster } = useRoster();
  const today = todayStr();
  const [mode, setMode] = useState<'menu' | 'edit' | 'move'>('menu');
  const s = roster.students.find((x) => x.id === student.id) ?? student;

  if (mode === 'edit') return <StudentForm student={s} onClose={onClose} />;
  if (mode === 'move') return <EnrollSheet studentId={s.id} onClose={onClose} />;
  return (
    <BottomSheet title={`${s.name} · ${studentGradeLabel(s, today)}`} onClose={onClose}>
      <div className="space-y-2">
        {s.notice && <p className="rounded-xl bg-yellow-50 p-3 text-base">📌 {s.notice}</p>}
        <Button variant="primary" className="w-full" onClick={() => setMode('edit')}>
          정보 수정
        </Button>
        <Button className="w-full" onClick={() => setMode('move')}>
          반 이동
        </Button>
        <Button
          className="w-full"
          onClick={() => {
            onClose();
            navigate(`/roster/student/${s.id}`);
          }}
        >
          학생 카드 전체 보기
        </Button>
      </div>
    </BottomSheet>
  );
}
