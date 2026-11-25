// 하린이 시간표 블록 편집 상태: 조작은 바로 자동 저장, 이번 접속 중 되돌리기/다시 실행(최대 50개, PC Ctrl+Z / Ctrl+Y).
// 편성 시뮬레이터(useSimEditor)와 같은 방식. 시간표를 바꾸면 기록을 비운다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRoster } from '../../app/RosterContext.tsx';
import type { KidBlockRow } from '../../storage/rosterTypes.ts';
import { blocksChange, blocksOf, isEmptyChange } from './harinModel.ts';

const MAX_HISTORY = 50;

export function useHarinEditor(timetableId: string | null) {
  const { roster, mutate } = useRoster();
  const blocks = useMemo(() => (timetableId ? blocksOf(roster, timetableId) : []), [roster, timetableId]);
  const [past, setPast] = useState<KidBlockRow[][]>([]);
  const [future, setFuture] = useState<KidBlockRow[][]>([]);
  const ref = useRef(blocks);
  ref.current = blocks;

  useEffect(() => {
    setPast([]);
    setFuture([]);
  }, [timetableId]);

  const save = useCallback(
    (from: KidBlockRow[], to: KidBlockRow[], message = '') => {
      const change = blocksChange(from, to);
      if (!isEmptyChange(change)) void mutate(change, message);
    },
    [mutate],
  );

  /** 조작 하나 저장(되돌리기 기록에 남김) */
  const apply = useCallback(
    (next: KidBlockRow[], message = '') => {
      const cur = ref.current;
      setPast((p) => [...p, cur].slice(-MAX_HISTORY));
      setFuture([]);
      save(cur, next, message);
    },
    [save],
  );

  const undo = useCallback(() => {
    const prev = past[past.length - 1];
    if (!prev) return;
    const cur = ref.current;
    setPast((p) => p.slice(0, -1));
    setFuture((f) => [cur, ...f]);
    save(cur, prev, '되돌렸어요');
  }, [past, save]);

  const redo = useCallback(() => {
    const next = future[0];
    if (!next) return;
    const cur = ref.current;
    setFuture((f) => f.slice(1));
    setPast((p) => [...p, cur].slice(-MAX_HISTORY));
    save(cur, next, '다시 했어요');
  }, [future, save]);

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

  return { blocks, apply, undo, redo, canUndo: past.length > 0, canRedo: future.length > 0 };
}
