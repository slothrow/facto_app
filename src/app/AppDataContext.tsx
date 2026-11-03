// 앱 데이터를 화면 전체에 공급한다. 저장은 Repository를 통해서만 한다.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createSeedAppData } from '../data/seedAppData.ts';
import type { Repository } from '../storage/repository.ts';
import { COLLECTION_KEYS, type AppData } from '../storage/types.ts';

interface AppDataValue {
  data: AppData;
  /** 바뀐 표만 골라 저장. 성공하면 true */
  commit: (next: AppData, message?: string) => Promise<boolean>;
  /** 전체 교체(복원, 초기 데이터) */
  replaceAll: (next: AppData, message?: string) => Promise<boolean>;
  toast: string | null;
  showToast: (message: string) => void;
  /** 전체 교체할 때마다 1씩 늘어난다. 입력 폼을 새 데이터로 다시 그릴 때 key로 쓴다 */
  revision: number;
}

const Ctx = createContext<AppDataValue | null>(null);

export function AppDataProvider({ repo, children }: { repo: Repository; children: ReactNode }) {
  const [data, setData] = useState<AppData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const dataRef = useRef<AppData | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const apply = (next: AppData) => {
    dataRef.current = next;
    setData(next);
  };

  const showToast = useCallback((message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let loaded = await repo.load();
        if (!loaded) {
          // 처음 실행: 초기 데이터로 시작한다
          loaded = createSeedAppData();
          await repo.replaceAll(loaded);
        }
        if (!cancelled) apply(loaded);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repo]);

  const commit = useCallback(
    async (next: AppData, message = '저장했어요') => {
      const prev = dataRef.current;
      if (!prev) return false;
      const changed = COLLECTION_KEYS.filter((k) => prev[k] !== next[k]);
      apply(next);
      try {
        for (const k of changed) await repo.save(k, next[k]);
        showToast(message);
        return true;
      } catch (e) {
        apply(prev);
        showToast(`저장하지 못했어요: ${e instanceof Error ? e.message : String(e)}`);
        return false;
      }
    },
    [repo, showToast],
  );

  const replaceAll = useCallback(
    async (next: AppData, message = '데이터를 바꿨어요') => {
      const prev = dataRef.current;
      try {
        await repo.replaceAll(next);
        apply(next);
        setRevision((r) => r + 1);
        showToast(message);
        return true;
      } catch (e) {
        if (prev) apply(prev);
        showToast(`저장하지 못했어요: ${e instanceof Error ? e.message : String(e)}`);
        return false;
      }
    },
    [repo, showToast],
  );

  if (loadError) {
    return <p className="p-6 text-red-700">데이터를 불러오지 못했어요: {loadError}</p>;
  }
  if (!data) return <p className="p-6 text-stone-500">불러오는 중…</p>;

  return <Ctx.Provider value={{ data, commit, replaceAll, toast, showToast, revision }}>{children}</Ctx.Provider>;
}

export function useAppData(): AppDataValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('AppDataProvider 안에서만 쓸 수 있습니다');
  return v;
}
