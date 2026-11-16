// [+ 아이 추가]: 다른 반 아이가 보강으로 왔을 때 이 반 목록에 오늘만 넣는다(전체·개인브리핑 공용).
import { useMemo, useState } from 'react';
import { BottomSheet, Button, inputClass } from '../../components/ui.tsx';
import type { RosterData } from '../../storage/rosterTypes.ts';
import { studentGradeLabel } from '../roster/rosterModel.ts';
import { matchesName } from '../roster/students/studentModel.ts';

export function GuestSheet({
  roster,
  exclude,
  date,
  onPick,
  onClose,
}: {
  roster: RosterData;
  exclude: Set<string>;
  date: string;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const found = useMemo(
    () =>
      q.trim()
        ? roster.students.filter((s) => s.status !== 'left' && !exclude.has(s.id) && matchesName(s.name, q)).slice(0, 12)
        : [],
    [roster.students, exclude, q],
  );
  return (
    <BottomSheet title="아이 추가" onClose={onClose}>
      <div className="space-y-2">
        <p className="text-sm text-stone-600">다른 반 아이가 보강으로 왔을 때 이 반 목록에 오늘만 넣어요.</p>
        <input className={inputClass} autoFocus placeholder="이름 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        {found.map((s) => (
          <Button key={s.id} className="w-full text-left" onClick={() => onPick(s.id)}>
            {s.name} <span className="text-sm text-stone-500">{studentGradeLabel(s, date)}</span>
          </Button>
        ))}
        {q.trim() && found.length === 0 && <p className="text-base text-stone-500">찾는 아이가 없어요.</p>}
      </div>
    </BottomSheet>
  );
}
