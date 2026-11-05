// 달력 탭 상단 전환: [달력] [토요보강]. 같은 달끼리 오간다.
import { navigate } from '../../app/router.ts';

export function PlanSwitch({ active, month }: { active: 'plan' | 'makeup'; month: string }) {
  const items = [
    { id: 'plan', label: '달력', to: `/plan/${month}` },
    { id: 'makeup', label: '토요보강', to: `/makeup/${month}` },
  ] as const;
  return (
    <div role="tablist" className="grid grid-cols-2 gap-1 rounded-2xl bg-stone-200/70 p-1">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          role="tab"
          aria-selected={active === it.id}
          onClick={() => navigate(it.to)}
          className={`h-11 rounded-xl text-base font-semibold ${active === it.id ? 'bg-white text-emerald-800 shadow-sm' : 'text-stone-600'}`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
