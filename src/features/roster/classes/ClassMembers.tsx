// 반 상세의 현재 명단: 학생 추가·이동·빼기. 예정된 배정(다음 달부터 올 학생)도 따로 보여 준다.
import { useState } from 'react';
import { navigate } from '../../../app/router.ts';
import { todayStr, useRoster } from '../../../app/RosterContext.tsx';
import { Button, BottomSheet, Card, inputClass } from '../../../components/ui.tsx';
import { isClassActive } from '../../../engine/classTime.ts';
import type { ClassRow, StudentRow } from '../../../storage/rosterTypes.ts';
import { EnrollSheet } from '../students/EnrollSheet.tsx';
import { QuickAddSheet } from '../students/QuickAddSheet.tsx';
import { UnenrollDialog } from '../students/StudentCard.tsx';
import { matchesName } from '../students/studentModel.ts';
import { waitlistMatchesForClass } from '../waitlist/waitlistModel.ts';
import { classDisplayName, classMembersOn, currentEnrollment, studentGradeLabel } from '../rosterModel.ts';

export function ClassMembers({ cls }: { cls: ClassRow }) {
  const { roster } = useRoster();
  const today = todayStr();
  const members = classMembersOn(roster, cls.id, today);
  const upcoming = roster.enrollments
    .filter((e) => e.classId === cls.id && e.startDate > today)
    .map((e) => ({ e, s: roster.students.find((s) => s.id === e.studentId) }))
    .filter((x): x is { e: (typeof x)['e']; s: StudentRow } => Boolean(x.s && x.s.status !== 'left'));
  const leaving = new Map(
    roster.enrollments.filter((e) => e.classId === cls.id && e.endDate && e.endDate >= today).map((e) => [e.studentId, e.endDate!]),
  );
  const waiting = waitlistMatchesForClass(roster, cls, today);
  const [picking, setPicking] = useState(false);
  const [creating, setCreating] = useState(false);
  const [enrollId, setEnrollId] = useState<string | null>(null);
  const [moveId, setMoveId] = useState<string | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const active = isClassActive(cls, today);

  return (
    <Card title={`현재 명단 ${members.length}명`}>
      {members.length === 0 ? (
        <p className="mb-3 text-base text-stone-500">배정된 학생이 없어요.</p>
      ) : (
        <ul className="mb-3 divide-y divide-stone-100">
          {members.map((s) => (
            <li key={s.id} className="flex items-center gap-2 py-1">
              <button type="button" onClick={() => navigate(`/roster/student/${s.id}`)} className="flex min-h-12 flex-1 items-center gap-2 text-left text-base">
                <span className="font-medium">{s.name}</span>
                <span className="text-stone-500">{studentGradeLabel(s, today)}</span>
                {leaving.has(s.id) && <span className="text-sm text-amber-700">{leaving.get(s.id)}까지</span>}
              </button>
              {active && (
                <>
                  <Button className="px-3" onClick={() => setMoveId(s.id)}>
                    이동
                  </Button>
                  <Button variant="ghost" className="px-3 text-red-700" onClick={() => setRemoveId(s.id)}>
                    빼기
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {upcoming.length > 0 && (
        <div className="mb-3">
          <h3 className="mb-1 text-sm font-semibold text-stone-600">들어올 예정</h3>
          <ul className="space-y-1">
            {upcoming.map(({ e, s }) => (
              <li key={e.id}>
                <button type="button" onClick={() => navigate(`/roster/student/${s.id}`)} className="min-h-11 text-left text-base">
                  {s.name} <span className="text-sm text-stone-500">{e.startDate}부터</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {active && (
        <div className="flex gap-2">
          <Button variant="primary" className="flex-1" onClick={() => setPicking(true)}>
            + 학생 넣기
          </Button>
          <Button className="flex-1" onClick={() => setCreating(true)}>
            새 학생 등록
          </Button>
        </div>
      )}

      {waiting.length > 0 && (
        <button
          type="button"
          onClick={() => navigate(`/roster/waitlist/class/${cls.id}`)}
          className="mt-3 min-h-11 w-full rounded-xl bg-sky-50 px-3 text-left text-base text-sky-900"
        >
          이 반에 맞는 대기자 {waiting.length}명 보기 →
        </button>
      )}

      {picking && (
        <StudentPicker
          cls={cls}
          onClose={() => setPicking(false)}
          onPick={(id) => {
            setPicking(false);
            setEnrollId(id);
          }}
        />
      )}
      {creating && <QuickAddSheet presetClassId={cls.id} onClose={() => setCreating(false)} />}
      {enrollId && <EnrollSheet studentId={enrollId} presetClassId={cls.id} onClose={() => setEnrollId(null)} />}
      {moveId && <EnrollSheet studentId={moveId} onClose={() => setMoveId(null)} />}
      {removeId && <UnenrollDialog studentId={removeId} classId={cls.id} onClose={() => setRemoveId(null)} />}
    </Card>
  );
}

function StudentPicker({ cls, onClose, onPick }: { cls: ClassRow; onClose: () => void; onPick: (id: string) => void }) {
  const { roster } = useRoster();
  const today = todayStr();
  const [q, setQ] = useState('');
  const list = roster.students
    .filter((s) => s.status !== 'left' && matchesName(s.name, q))
    .map((s) => {
      const e = currentEnrollment(roster.enrollments, s.id, today);
      return { s, e, cur: e ? roster.classes.find((c) => c.id === e.classId) : null };
    })
    .filter(({ e }) => e?.classId !== cls.id)
    // 반 미배정 학생을 먼저
    .sort((a, b) => Number(Boolean(a.e)) - Number(Boolean(b.e)) || a.s.name.localeCompare(b.s.name, 'ko'));

  return (
    <BottomSheet title={`${classDisplayName(cls, today)}에 넣을 학생`} onClose={onClose}>
      <input className={`${inputClass} mb-3`} placeholder="이름 검색 (초성 가능)" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="divide-y divide-stone-100">
        {list.map(({ s, cur }) => (
          <li key={s.id}>
            <button type="button" onClick={() => onPick(s.id)} className="flex min-h-12 w-full items-center gap-2 text-left text-base">
              <span className="font-medium">{s.name}</span>
              <span className="text-stone-500">{studentGradeLabel(s, today)}</span>
              <span className="ml-auto text-sm text-stone-500">{cur ? classDisplayName(cur, today) : '반 미배정'}</span>
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="py-4 text-center text-stone-500">넣을 수 있는 학생이 없어요.</li>}
      </ul>
    </BottomSheet>
  );
}
