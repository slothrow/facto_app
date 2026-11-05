// 한 페이지 주간 시간표: 월~금 × 1:30~5:30, 칸마다 반 학년·인원과 아이 이름.
// 폰(360px)에서도 가로 스크롤 없이 한 화면에 들어가게 작은 글씨로 그린다.
// - 이름 탭 → 정보 수정 / 반 이동 / 학생 카드
// - 반 머리(학년·인원) 탭 → 반 상세
// - 빈칸 탭 → 그 요일·시간으로 반 추가
import { useState } from 'react';
import { navigate } from '../../../app/router.ts';
import { todayStr, useRoster } from '../../../app/RosterContext.tsx';
import { BottomSheet, Button } from '../../../components/ui.tsx';
import { shortTime } from '../../../engine/classTime.ts';
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
  WEEKDAY_NAMES,
  classBadges,
  classDisplayName,
  classGradeLabel,
  classHeadcount,
  classMembersOn,
  studentGradeLabel,
  timetableRows,
} from '../rosterModel.ts';
import { ClassForm } from './ClassForm.tsx';

export function TimetableGrid({ classes }: { classes: ClassRow[] }) {
  const { roster } = useRoster();
  const today = todayStr();
  const todayWd = weekdayOf(today);
  const rows = timetableRows(classes);
  const [picked, setPicked] = useState<StudentRow | null>(null);
  const [newAt, setNewAt] = useState<{ weekday: Weekday; startTime: string } | null>(null);

  return (
    <>
      <div className="grid grid-cols-[2.25rem_repeat(5,minmax(0,1fr))] gap-0.5 md:grid-cols-[4rem_repeat(5,minmax(0,1fr))] md:gap-1">
        <div />
        {CLASS_WEEKDAYS.map((wd) => (
          <div
            key={wd}
            className={`rounded-md py-1 text-center text-sm font-bold md:text-base ${wd === todayWd ? 'bg-emerald-700 text-white' : 'text-stone-700'}`}
          >
            {WEEKDAY_NAMES[wd]}
          </div>
        ))}
        {rows.map((t) => (
          <Row key={t} time={t} classes={classes} roster={roster} today={today} todayWd={todayWd} onPick={setPicked} onEmpty={setNewAt} />
        ))}
      </div>
      <p className="mt-2 text-center text-xs text-stone-500 md:text-sm">이름 → 수정·반 이동 · 반 머리 → 반 상세 · 빈칸 → 반 추가</p>

      {picked && <StudentActions student={picked} onClose={() => setPicked(null)} />}
      {newAt && <ClassForm preset={newAt} onClose={() => setNewAt(null)} />}
    </>
  );
}

function Row({
  time,
  classes,
  roster,
  today,
  todayWd,
  onPick,
  onEmpty,
}: {
  time: string;
  classes: ClassRow[];
  roster: RosterData;
  today: string;
  todayWd: number;
  onPick: (s: StudentRow) => void;
  onEmpty: (at: { weekday: Weekday; startTime: string }) => void;
}) {
  return (
    <>
      <div className="pt-1.5 pr-0.5 text-right text-xs leading-tight font-semibold text-stone-500 md:text-sm">{shortTime(time)}</div>
      {CLASS_WEEKDAYS.map((wd) => {
        const c = classes.find((x) => x.weekday === wd && x.startTime === time);
        const tint = wd === todayWd ? 'bg-emerald-50/60' : 'bg-white';
        if (!c) {
          return (
            <button
              key={wd}
              type="button"
              aria-label={`${WEEKDAY_NAMES[wd]} ${shortTime(time)} 반 추가`}
              onClick={() => onEmpty({ weekday: wd, startTime: time })}
              className={`min-h-20 rounded-lg border border-dashed border-stone-200 ${tint} active:bg-stone-100`}
            />
          );
        }
        return <ClassCell key={wd} cls={c} roster={roster} today={today} tint={tint} onPick={onPick} />;
      })}
    </>
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
    <div className={`min-h-20 min-w-0 overflow-hidden rounded-lg border ${warn ? 'border-amber-300' : 'border-emerald-200'} ${tint}`}>
      <button
        type="button"
        onClick={() => navigate(`/roster/class/${cls.id}`)}
        className={`flex w-full items-baseline justify-between gap-0.5 px-1 py-0.5 text-left ${warn ? 'bg-amber-50' : 'bg-emerald-50'}`}
        aria-label={`${classDisplayName(cls, today)} 반 상세`}
      >
        <span className="truncate text-xs font-bold text-emerald-900 md:text-sm">{cls.gradeCode === null ? '미정' : classGradeLabel(cls, today)}</span>
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
              className={`block w-full truncate rounded px-0.5 py-0.5 text-left text-[13px] leading-tight active:bg-stone-100 md:text-base ${
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
              className="block w-full truncate px-0.5 py-0.5 text-left text-[12px] leading-tight text-stone-400 italic md:text-sm"
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
