// 학생 목록: 이름 검색(초성 지원), 필터(상태, 학년, 요일, 반 미배정, 확인 필요). 기본은 재원 학생만.
// 주소: #/roster/students, #/roster/students/review(확인 필요), #/roster/students/import(가져오기)
import { useMemo, useState } from 'react';
import { navigate } from '../../../app/router.ts';
import { todayStr, useRoster } from '../../../app/RosterContext.tsx';
import { PlusIcon, SearchIcon } from '../../../components/icons.tsx';
import { Button, inputClass } from '../../../components/ui.tsx';
import { gradeCodeOn, gradeOptions } from '../../../engine/grade.ts';
import type { StudentRow } from '../../../storage/rosterTypes.ts';
import { CLASS_WEEKDAYS, WEEKDAY_NAMES, classDisplayName, currentEnrollment, studentGradeLabel, studentStatusOn } from '../rosterModel.ts';
import { ImportView } from './ImportView.tsx';
import { QuickAddSheet } from './QuickAddSheet.tsx';
import { STATUS_LABEL, matchesName } from './studentModel.ts';

type StatusFilter = 'active' | 'paused' | 'left' | 'all';

export function StudentListView({ filterParam }: { filterParam?: string }) {
  if (filterParam === 'import') return <ImportView />;
  return <StudentList initialReview={filterParam === 'review'} initialUnassigned={filterParam === 'unassigned'} />;
}

function StudentList({ initialReview, initialUnassigned }: { initialReview: boolean; initialUnassigned: boolean }) {
  const { roster } = useRoster();
  const today = todayStr();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>(initialReview ? 'all' : 'active');
  const [grade, setGrade] = useState<number | 'all'>('all');
  const [weekday, setWeekday] = useState<number | 'all'>('all');
  const [unassigned, setUnassigned] = useState(initialUnassigned);
  const [review, setReview] = useState(initialReview);
  const [adding, setAdding] = useState(false);

  const rows = useMemo(() => {
    const classById = new Map(roster.classes.map((c) => [c.id, c]));
    return roster.students
      .map((s) => {
        const e = currentEnrollment(roster.enrollments, s.id, today);
        return { s, cls: e ? (classById.get(e.classId) ?? null) : null, st: studentStatusOn(s, today) };
      })
      .filter(({ s, cls, st }) => {
        if (!matchesName(s.name, query)) return false;
        if (status !== 'all' && st !== status) return false;
        if (grade !== 'all' && gradeCodeOn(s, today) !== grade) return false;
        if (weekday !== 'all' && cls?.weekday !== weekday) return false;
        if (unassigned && cls) return false;
        if (review && !s.needsReview) return false;
        return true;
      })
      .sort((a, b) => a.s.name.localeCompare(b.s.name, 'ko'));
  }, [roster, query, status, grade, weekday, unassigned, review, today]);

  const reviewCount = roster.students.filter((s) => s.needsReview).length;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button variant="primary" className="flex flex-1 items-center justify-center gap-1" onClick={() => setAdding(true)}>
          <PlusIcon className="h-5 w-5" /> 학생 추가
        </Button>
        <Button className="flex-1" onClick={() => navigate('/roster/students/import')}>
          붙여넣기로 가져오기
        </Button>
      </div>

      <label className="relative block">
        <SearchIcon className="pointer-events-none absolute top-3 left-3 h-5 w-5 text-stone-400" />
        <input
          type="search"
          className={`${inputClass} pl-10`}
          placeholder="이름 검색 (초성 가능: ㄱㅅㅇ)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <select className={`${inputClass} w-auto`} value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} aria-label="상태">
          <option value="active">재원</option>
          <option value="paused">휴원</option>
          <option value="left">퇴원</option>
          <option value="all">전체 상태</option>
        </select>
        <select
          className={`${inputClass} w-auto`}
          value={grade}
          onChange={(e) => setGrade(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          aria-label="학년"
        >
          <option value="all">전체 학년</option>
          {gradeOptions().map((g) => (
            <option key={g.code} value={g.code}>
              {g.label}
            </option>
          ))}
        </select>
        <select
          className={`${inputClass} w-auto`}
          value={weekday}
          onChange={(e) => setWeekday(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          aria-label="요일"
        >
          <option value="all">전체 요일</option>
          {CLASS_WEEKDAYS.map((wd) => (
            <option key={wd} value={wd}>
              {WEEKDAY_NAMES[wd]}요일
            </option>
          ))}
        </select>
        <Toggle on={unassigned} onClick={() => setUnassigned((v) => !v)} label="반 미배정" />
        <Toggle on={review} onClick={() => setReview((v) => !v)} label={`확인 필요${reviewCount ? ` ${reviewCount}` : ''}`} />
      </div>

      <p className="px-1 text-sm text-stone-500">{rows.length}명</p>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-base text-stone-500">
          {roster.students.length === 0 ? '아직 학생이 없어요. [학생 추가]나 [붙여넣기로 가져오기]로 시작하세요.' : '조건에 맞는 학생이 없어요.'}
        </p>
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-stone-200 bg-white md:grid md:grid-cols-2">
          {rows.map(({ s, cls, st }) => (
            <li key={s.id} className="border-b border-stone-100 md:border-r">
              <StudentRowButton s={s} clsName={cls ? classDisplayName(cls, today) : null} status={st} today={today} />
            </li>
          ))}
        </ul>
      )}

      {adding && <QuickAddSheet onClose={() => setAdding(false)} />}
    </div>
  );
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`min-h-11 rounded-xl border px-3 text-base font-medium ${on ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-stone-300 bg-white text-stone-700'}`}
    >
      {label}
    </button>
  );
}

function StudentRowButton({ s, clsName, status, today }: { s: StudentRow; clsName: string | null; status: StudentRow['status']; today: string }) {
  return (
    <button type="button" onClick={() => navigate(`/roster/student/${s.id}`)} className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left active:bg-stone-50">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-base">
          <span className="font-semibold text-stone-900">{s.name}</span>
          <span className="text-stone-500">{studentGradeLabel(s, today)}</span>
          {status !== 'active' && <span className="rounded-full bg-stone-200 px-2 text-sm text-stone-700">{STATUS_LABEL[status]}</span>}
          {s.needsReview && <span className="rounded-full bg-amber-100 px-2 text-sm text-amber-900">확인 필요</span>}
        </div>
        <div className="truncate text-sm text-stone-500">{clsName ?? '반 미배정'}</div>
      </div>
    </button>
  );
}
