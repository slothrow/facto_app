// 두 시안 비교(SPEC_simulator 2.2, 6.3): 요약 숫자와 변경 건수를 나란히.
import { useState } from 'react';
import { useAppData } from '../../app/AppDataContext.tsx';
import { navigate } from '../../app/router.ts';
import { useRoster } from '../../app/RosterContext.tsx';
import { Card, inputClass } from '../../components/ui.tsx';
import { ChevronLeft } from '../../components/icons.tsx';
import { checkDraft, diffDraft, summarize, type DraftSummary } from '../../engine/simulator/index.ts';
import { draftOf, hoursOf } from './simModel.ts';

export function CompareView() {
  const { roster } = useRoster();
  const { data } = useAppData();
  const drafts = roster.simDrafts;
  const [a, setA] = useState(drafts[0]?.id ?? '');
  const [b, setB] = useState(drafts[1]?.id ?? '');

  const stats = (id: string): { s: DraftSummary; changes: number; byKind: Record<string, number> } | null => {
    const d = draftOf(roster, id);
    if (!d) return null;
    const s = summarize(d, checkDraft(d, roster, { hours: hoursOf(data) }));
    const ch = diffDraft(d.draft.baseSnapshot, d, d.draft.baseDate);
    const byKind: Record<string, number> = {};
    for (const c of ch) byKind[c.kind] = (byKind[c.kind] ?? 0) + 1;
    return { s, changes: ch.length, byKind };
  };
  const sa = stats(a);
  const sb = stats(b);
  const grades = [...new Set([...(sa?.s.byGrade ?? []), ...(sb?.s.byGrade ?? [])].map((g) => g.label))];
  const rows: [string, (x: NonNullable<typeof sa>) => number][] = [
    ['반 수', (x) => x.s.classCount],
    ['학생 수', (x) => x.s.studentCount],
    ['빈자리', (x) => x.s.emptySeats],
    ['경고', (x) => x.s.warningCount],
    ['변경 건수', (x) => x.changes],
    ['· 옮김', (x) => x.byKind.move ?? 0],
    ['· 신규 반', (x) => x.byKind.new ?? 0],
    ['· 빼놓음', (x) => x.byKind.removed ?? 0],
    ['· 합침', (x) => x.byKind.merged ?? 0],
    ...grades.map((g) => [`${g} 반`, (x: NonNullable<typeof sa>) => x.s.byGrade.find((y) => y.label === g)?.count ?? 0] as [string, (x: NonNullable<typeof sa>) => number]),
  ];

  const pick = (value: string, set: (v: string) => void) => (
    <select className={inputClass} value={value} onChange={(e) => set(e.target.value)}>
      {drafts.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-3">
      <button type="button" onClick={() => navigate('/roster/sim')} className="flex h-12 shrink-0 items-center gap-1 rounded-xl border border-stone-300 bg-white pr-4 pl-2 text-lg font-semibold text-stone-800 shadow-sm active:bg-stone-100">
        <ChevronLeft className="h-7 w-7" /> 시안 목록
      </button>
      <h1 className="text-lg font-bold">두 시안 비교</h1>
      <div className="grid grid-cols-2 gap-2">
        {pick(a, setA)}
        {pick(b, setB)}
      </div>
      <Card>
        {sa && sb ? (
          <table className="w-full text-sm">
            <tbody>
              {rows.map(([label, f]) => {
                const x = f(sa);
                const y = f(sb);
                return (
                  <tr key={label} className="border-b border-stone-100 last:border-0">
                    <td className="py-2 text-stone-600">{label}</td>
                    <td className={`py-2 text-right font-semibold ${x !== y ? 'text-emerald-800' : ''}`}>{x}</td>
                    <td className={`py-2 text-right font-semibold ${x !== y ? 'text-emerald-800' : ''}`}>{y}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-stone-500">비교할 시안을 두 개 고르세요.</p>
        )}
      </Card>
    </div>
  );
}
