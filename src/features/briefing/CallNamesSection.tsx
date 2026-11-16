// 설정 → 부르는 이름 확인(SPEC_personal_briefing 3.3): 재원생 전체를 한 화면에서 검토·수정.
import { useMemo, useState } from 'react';
import { todayStr, useRoster } from '../../app/RosterContext.tsx';
import { BottomSheet, Button, Card, inputClass } from '../../components/ui.tsx';
import { studentGradeLabel } from '../roster/rosterModel.ts';
import { matchesName } from '../roster/students/studentModel.ts';
import { CallNameInput } from './CallNameInput.tsx';
import { callNameList } from './personalModel.ts';

export function CallNamesSection() {
  const { roster } = useRoster();
  const [open, setOpen] = useState(false);
  const list = callNameList(roster);
  const custom = list.filter((x) => x.custom).length;
  return (
    <Card title="부르는 이름 확인">
      <p className="text-base text-stone-600">
        개인브리핑 문구의 {'{이름}'} 자리에 들어가는 이름이에요. 비어 있으면 이름에서 자동으로 만들어요(최하솜 → 하솜이).
      </p>
      <p className="mt-1 text-sm text-stone-500">
        재원생 {list.length}명 · 직접 고친 이름 {custom}명
      </p>
      <Button className="mt-2 w-full" onClick={() => setOpen(true)}>
        전체 목록 보기·고치기
      </Button>
      {open && <CallNamesSheet onClose={() => setOpen(false)} />}
    </Card>
  );
}

function CallNamesSheet({ onClose }: { onClose: () => void }) {
  const { roster } = useRoster();
  const today = todayStr();
  const [q, setQ] = useState('');
  const all = callNameList(roster);
  const list = useMemo(() => (q.trim() ? all.filter((x) => matchesName(x.student.name, q)) : all), [all, q]);
  return (
    <BottomSheet title="부르는 이름 확인" onClose={onClose}>
      <div className="space-y-2">
        <p className="text-sm text-stone-600">회색 글씨 = 자동값. 어색하면 칸을 눌러 고치세요(고치면 바로 저장). 비우면 다시 자동값을 써요.</p>
        <input className={inputClass} placeholder="이름 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="divide-y divide-stone-100">
          {list.map(({ student: s }) => (
            <li key={s.id} className="flex min-h-14 items-center gap-2 py-1">
              <span className="w-28 shrink-0">
                <span className="block text-base font-semibold">{s.name}</span>
                <span className="block text-xs text-stone-500">{studentGradeLabel(s, today)}</span>
              </span>
              <CallNameInput student={s} className="min-h-11 flex-1 py-1" />
            </li>
          ))}
        </ul>
        {list.length === 0 && <p className="text-base text-stone-500">찾는 아이가 없어요.</p>}
      </div>
    </BottomSheet>
  );
}
