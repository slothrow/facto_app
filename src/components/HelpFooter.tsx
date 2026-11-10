// 화면 맨 아래 간단한 사용법(접기 가능). 접은 상태는 이 기기에 기억한다.
import { useState } from 'react';
import type { Help } from '../app/help.ts';

const KEY = 'facto-app:help-collapsed';

const readCollapsed = () => {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};

export function HelpFooter({ help }: { help: Help }) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem(KEY, next ? '1' : '0');
    } catch {
      /* 저장 못 해도 화면에서는 접힌다 */
    }
  };
  return (
    <section className="mt-8 rounded-2xl border border-dashed border-stone-300 bg-white/60 px-4 py-3 md:max-w-3xl">
      <button type="button" onClick={toggle} aria-expanded={!collapsed} className="flex min-h-10 w-full items-center gap-2 text-left">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stone-200 text-sm font-bold text-stone-700">?</span>
        <span className="flex-1 text-base font-bold text-stone-700">{help.title} 사용법</span>
        <span className="text-sm text-stone-500">{collapsed ? '펼치기' : '접기'}</span>
      </button>
      {!collapsed && (
        <ul className="mt-2 space-y-1.5 pl-1 text-[15px] leading-snug text-stone-600">
          {help.lines.map((l) => (
            <li key={l} className="flex gap-2">
              <span className="shrink-0 text-stone-400">·</span>
              <span>{l}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
