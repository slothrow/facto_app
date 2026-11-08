// 2단계 데이터(반·학생·대기자·체험·결석)를 화면 전체에 공급한다. 저장은 RosterRepository를 통해서만.
// 변경은 화면에 먼저 반영하고, 저장에 실패하면 되돌린다.
import { format } from 'date-fns';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { RosterRepository } from '../storage/rosterRepository.ts';
import { applyChange, type RosterChange, type RosterData } from '../storage/rosterTypes.ts';
import { useAppData } from './AppDataContext.tsx';

interface RosterValue {
  roster: RosterData;
  /** 바뀐 행만 저장. 성공하면 true */
  mutate: (change: RosterChange, message?: string) => Promise<boolean>;
  replaceRoster: (next: RosterData) => Promise<void>;
  /** 시안 적용(한 번에 전부). 성공하면 true */
  applyDraft: (draftId: string, change: RosterChange) => Promise<boolean>;
}

const Ctx = createContext<RosterValue | null>(null);

export function RosterProvider({ repo, children }: { repo: RosterRepository; children: ReactNode }) {
  const { showToast } = useAppData();
  const [roster, setRoster] = useState<RosterData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const ref = useRef<RosterData | null>(null);

  const set = (next: RosterData) => {
    ref.current = next;
    setRoster(next);
  };

  useEffect(() => {
    let cancelled = false;
    repo
      .load()
      .then((d) => !cancelled && set(d))
      .catch((e: unknown) => !cancelled && setLoadError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [repo]);

  const mutate = useCallback(
    async (change: RosterChange, message = '저장했어요') => {
      const prev = ref.current;
      if (!prev) return false;
      set(applyChange(prev, change));
      try {
        await repo.apply(change);
        if (message) showToast(message);
        return true;
      } catch (e) {
        // 실패하면 서버 상태를 다시 읽어 맞춘다(일부만 저장됐을 수 있음)
        set(prev);
        repo.load().then(set, () => undefined);
        showToast(`저장하지 못했어요: ${e instanceof Error ? e.message : String(e)}`);
        return false;
      }
    },
    [repo, showToast],
  );

  const replaceRoster = useCallback(
    async (next: RosterData) => {
      await repo.replaceAll(next);
      set(next);
    },
    [repo],
  );

  const applyDraft = useCallback(
    async (draftId: string, change: RosterChange) => {
      try {
        await repo.applyDraft(draftId, change);
      } catch (e) {
        showToast(`적용하지 못했어요(아무것도 바뀌지 않았어요): ${e instanceof Error ? e.message : String(e)}`);
        return false;
      }
      // 서버에서 다시 읽어 화면을 맞춘다(적용 시각 등 서버 값 포함)
      try {
        set(await repo.load());
      } catch {
        if (ref.current) set(applyChange(ref.current, change));
      }
      return true;
    },
    [repo, showToast],
  );

  if (loadError) return <p className="p-6 text-red-700">학생 데이터를 불러오지 못했어요: {loadError}</p>;
  if (!roster) return <p className="p-6 text-stone-500">불러오는 중…</p>;
  return <Ctx.Provider value={{ roster, mutate, replaceRoster, applyDraft }}>{children}</Ctx.Provider>;
}

export function useRoster(): RosterValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('RosterProvider 안에서만 쓸 수 있습니다');
  return v;
}

/** 오늘 날짜 'YYYY-MM-DD'(이 기기 시간 기준) */
export const todayStr = () => format(new Date(), 'yyyy-MM-dd');
