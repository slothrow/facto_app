// 시안 편집 상태(편집 중인 시안만 저장, 적용됨·보관은 읽기 전용): 모든 조작은 즉시 자동 저장, 이번 접속 중 되돌리기/다시 실행(최대 50개). SPEC_simulator 2.3
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRoster } from '../../app/RosterContext.tsx';
import type { SimDraft } from '../../engine/simulator/index.ts';
import { changeBetween, draftOf } from './simModel.ts';

const MAX_HISTORY = 50;

export function useSimEditor(draftId: string) {
  const { roster, mutate } = useRoster();
  const d = useMemo(() => draftOf(roster, draftId), [roster, draftId]);
  const [past, setPast] = useState<SimDraft[]>([]);
  const [future, setFuture] = useState<SimDraft[]>([]);
  const ref = useRef(d);
  ref.current = d;

  const save = useCallback(
    (from: SimDraft, to: SimDraft) => mutate(changeBetween(from, to, new Date().toISOString()), ''),
    [mutate],
  );

  /** 조작 하나 저장(되돌리기 기록에 남김) */
  const apply = useCallback(
    (next: SimDraft) => {
      const cur = ref.current;
      if (!cur || cur.draft.status !== 'editing') return;
      setPast((p) => [...p, cur].slice(-MAX_HISTORY));
      setFuture([]);
      void save(cur, next);
    },
    [save],
  );

  /** 되돌리기 기록 없이 저장(학년 보기 전환 등) */
  const quiet = useCallback(
    (next: SimDraft) => {
      const cur = ref.current;
      if (cur && cur.draft.status === 'editing') void save(cur, next);
    },
    [save],
  );

  const undo = useCallback(() => {
    const cur = ref.current;
    const prev = past[past.length - 1];
    if (!cur || !prev || cur.draft.status !== 'editing') return;
    setPast((p) => p.slice(0, -1));
    setFuture((f) => [cur, ...f]);
    void save(cur, { ...prev, draft: { ...prev.draft, gradeView: cur.draft.gradeView, name: cur.draft.name } });
  }, [past, save]);

  const redo = useCallback(() => {
    const cur = ref.current;
    const next = future[0];
    if (!cur || !next || cur.draft.status !== 'editing') return;
    setFuture((f) => f.slice(1));
    setPast((p) => [...p, cur].slice(-MAX_HISTORY));
    void save(cur, { ...next, draft: { ...next.draft, gradeView: cur.draft.gradeView, name: cur.draft.name } });
  }, [future, save]);

  // PC: Ctrl+Z / Ctrl+Y(또는 Ctrl+Shift+Z)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  return { d, apply, quiet, undo, redo, canUndo: past.length > 0, canRedo: future.length > 0 };
}

/** 미디어 쿼리 상태(폰 세로 판단 등) */
export function useMedia(query: string): boolean {
  const get = () => typeof window !== 'undefined' && window.matchMedia(query).matches;
  const [on, setOn] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const f = () => setOn(mq.matches);
    mq.addEventListener('change', f);
    f();
    return () => mq.removeEventListener('change', f);
  }, [query]);
  return on;
}
