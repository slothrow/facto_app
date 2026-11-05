// 반 상세의 현재 명단. (학생 추가·이동·빼기는 8단계에서)
import { navigate } from '../../../app/router.ts';
import { todayStr, useRoster } from '../../../app/RosterContext.tsx';
import { Card } from '../../../components/ui.tsx';
import type { ClassRow } from '../../../storage/rosterTypes.ts';
import { classMembersOn, studentGradeLabel } from '../rosterModel.ts';

export function ClassMembers({ cls }: { cls: ClassRow }) {
  const { roster } = useRoster();
  const today = todayStr();
  const members = classMembersOn(roster, cls.id, today);
  return (
    <Card title={`현재 명단 ${members.length}명`}>
      {members.length === 0 ? (
        <p className="text-base text-stone-500">배정된 학생이 없어요.</p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {members.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => navigate(`/roster/student/${s.id}`)} className="flex min-h-12 w-full items-center justify-between text-left text-base">
                <span className="font-medium">{s.name}</span>
                <span className="text-stone-500">{studentGradeLabel(s, today)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
