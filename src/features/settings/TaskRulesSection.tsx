// 설정 → 할 일 관리: 자동 할 일 13개 켜기/끄기와 기준값(SPEC_home 4.3). 반복 할 일 템플릿은 TemplatesSection.
import { useState } from 'react';
import { useAppData } from '../../app/AppDataContext.tsx';
import { updateSettings } from '../../app/mutations.ts';
import { Button, Card } from '../../components/ui.tsx';
import { AUTO_RULES, type TaskRules } from '../../engine/tasks/index.ts';

export function TaskRulesSection() {
  const { data, commit } = useAppData();
  const saved: TaskRules = data.settings.taskRules ?? {};
  const [rules, setRules] = useState<TaskRules>(saved);
  const [open, setOpen] = useState(false);
  const dirty = JSON.stringify(rules) !== JSON.stringify(saved);

  const on = (key: string) => rules[key]?.enabled !== false;
  const value = (key: string, name: string, def: number) => rules[key]?.params?.[name] ?? def;
  const patch = (key: string, p: { enabled?: boolean; params?: Record<string, number> }) =>
    setRules((r) => ({ ...r, [key]: { ...r[key], ...p, params: { ...r[key]?.params, ...p.params } } }));

  return (
    <Card title="할 일 관리 · 자동 할 일">
      <p className="text-sm text-stone-500">앱 데이터를 보고 홈에 저절로 뜨는 할 일이에요. 처리하면 저절로 사라지는 것이 많아요.</p>
      <button type="button" className="mt-2 min-h-11 text-base font-semibold text-emerald-800 underline" onClick={() => setOpen(!open)}>
        {open ? '접기' : `${AUTO_RULES.filter((r) => on(r.key)).length}/${AUTO_RULES.length}개 켜짐 · 펼치기`}
      </button>
      {open && (
        <>
          <ul className="mt-2 divide-y divide-stone-100">
            {AUTO_RULES.map((r) => (
              <li key={r.key} className="py-2">
                <label className="flex min-h-11 items-center gap-3">
                  <input type="checkbox" className="h-6 w-6 shrink-0 accent-emerald-700" checked={on(r.key)} onChange={(e) => patch(r.key, { enabled: e.target.checked })} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-semibold">{r.label}</span>
                    <span className="block text-sm text-stone-500">{r.when}</span>
                  </span>
                </label>
                {Object.entries(r.params).map(([name, p]) => (
                  <label key={name} className="ml-9 mt-1 flex items-center gap-2 text-base">
                    <span className="text-stone-600">{p.label}</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={p.min}
                      max={p.max}
                      disabled={!on(r.key)}
                      className="h-11 w-20 rounded-xl border border-stone-300 px-2 text-center"
                      value={value(r.key, name, p.value)}
                      onChange={(e) => {
                        const n = Math.max(p.min, Math.min(p.max, Number(e.target.value) || p.min));
                        patch(r.key, { params: { [name]: n } });
                      }}
                    />
                  </label>
                ))}
              </li>
            ))}
          </ul>
          <Button variant="primary" className="mt-2 w-full" disabled={!dirty} onClick={() => commit(updateSettings(data, { taskRules: rules }), '할 일 규칙을 저장했어요')}>
            저장
          </Button>
        </>
      )}
    </Card>
  );
}
