// 검토 패널(SPEC_simulator 6장): 경고 / 변경 목록 / 요약. 항목을 누르면 해당 반을 선택한다.
import { useState } from 'react';
import type { DraftChange, DraftSummary, DraftWarning } from '../../engine/simulator/index.ts';

export function ReviewPanel({
  warnings,
  changes,
  summary,
  onPick,
}: {
  warnings: DraftWarning[];
  changes: DraftChange[];
  summary: DraftSummary;
  onPick: (simClassId: string) => void;
}) {
  const [tab, setTab] = useState<'warn' | 'change' | 'sum'>('warn');
  const tabs = [
    { id: 'warn' as const, label: `경고 ${warnings.length}` },
    { id: 'change' as const, label: `변경 ${changes.length}` },
    { id: 'sum' as const, label: '요약' },
  ];
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-3">
      <div role="tablist" className="mb-2 grid grid-cols-3 gap-1 rounded-xl bg-stone-100 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`h-9 rounded-lg text-sm font-semibold ${tab === t.id ? 'bg-white text-emerald-800 shadow-sm' : 'text-stone-600'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'warn' && (
        <List
          empty="경고가 없어요."
          items={warnings.map((w, i) => ({ key: `${w.simClassId}-${w.kind}-${i}`, id: w.simClassId, text: w.text, tone: TONE[w.kind] ?? 'border-amber-300 bg-amber-50' }))}
          onPick={onPick}
        />
      )}
      {tab === 'change' && (
        <List
          empty="아직 바꾼 것이 없어요."
          items={changes.map((c, i) => ({ key: `${c.simClassId}-${c.kind}-${i}`, id: c.simClassId, text: c.text, tone: 'border-sky-200 bg-sky-50' }))}
          onPick={onPick}
        />
      )}
      {tab === 'sum' && <SummaryTable summary={summary} />}
    </section>
  );
}

const TONE: Partial<Record<DraftWarning['kind'], string>> = {
  availability: 'border-red-300 bg-red-50',
  over: 'border-red-300 bg-red-50',
  overlap: 'border-red-300 bg-red-50',
  availabilityMissing: 'border-stone-200 bg-stone-50',
  empty: 'border-stone-200 bg-stone-50',
};

function List({ items, empty, onPick }: { items: { key: string; id: string; text: string; tone: string }[]; empty: string; onPick: (id: string) => void }) {
  if (items.length === 0) return <p className="py-2 text-sm text-stone-500">{empty}</p>;
  return (
    <ul className="max-h-80 space-y-1 overflow-y-auto">
      {items.map((it) => (
        <li key={it.key}>
          <button type="button" onClick={() => onPick(it.id)} className={`min-h-11 w-full rounded-xl border px-3 py-2 text-left text-sm ${it.tone}`}>
            {it.text}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function SummaryTable({ summary }: { summary: DraftSummary }) {
  const rows: [string, string | number][] = [
    ['반 수', summary.classCount],
    ['학생 수(퇴원 예정 제외)', summary.studentCount],
    ['빈자리(정원 4 기준)', summary.emptySeats],
    ['경고', summary.warningCount],
    ...summary.byGrade.map((g) => [`${g.label} 반`, g.count] as [string, number]),
  ];
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k} className="border-b border-stone-100 last:border-0">
            <td className="py-1.5 text-stone-600">{k}</td>
            <td className="py-1.5 text-right font-semibold">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
