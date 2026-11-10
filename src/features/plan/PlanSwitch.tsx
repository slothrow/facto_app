// 달력 탭 상단 전환: [수업 달력] [안내 달력 만들기]. 토요보강은 수업 달력에 딸린 화면(수업 달력이 켜진 것으로 표시).
import { navigate } from '../../app/router.ts';

export function PlanSwitch({ active, month }: { active: 'plan' | 'makeup' | 'export'; month?: string }) {
  const items = [
    { id: 'plan', label: '수업 달력', to: month ? `/plan/${month}` : '/plan' },
    { id: 'export', label: '안내 달력 만들기', to: '/export' },
  ] as const;
  const on = active === 'makeup' ? 'plan' : active;
  return (
    <div role="tablist" className="grid grid-cols-2 gap-1 rounded-2xl bg-stone-200/70 p-1">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          role="tab"
          aria-selected={on === it.id}
          onClick={() => navigate(it.to)}
          className={`h-11 rounded-xl text-base font-semibold ${on === it.id ? 'bg-white text-emerald-800 shadow-sm' : 'text-stone-600'}`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
