import { AppDataProvider, useAppData } from './app/AppDataContext.tsx';
import { navigate, useHashRoute } from './app/router.ts';
import { TABS } from './app/tabs.tsx';
import { AuthGate } from './features/auth/AuthGate.tsx';
import { RosterProvider } from './app/RosterContext.tsx';
import { LocalStorageRepository } from './storage/localStorageRepository.ts';
import { LocalRosterRepository, SupabaseRosterRepository } from './storage/rosterRepository.ts';
import { supabase } from './storage/supabaseClient.ts';
import { SupabaseRepository } from './storage/supabaseRepository.ts';

// Supabase 접속 정보(.env.local)가 있으면 로그인 후 Supabase에 저장,
// 없으면 개발용으로 이 기기(localStorage)에만 저장한다.
const localRepo = new LocalStorageRepository(window.localStorage);
const remoteRepo = supabase ? new SupabaseRepository(supabase) : null;
const localRoster = new LocalRosterRepository(window.localStorage);
const remoteRoster = supabase ? new SupabaseRosterRepository(supabase) : null;

export default function App() {
  if (!supabase || !remoteRepo || !remoteRoster) {
    return (
      <AppDataProvider repo={localRepo}>
        <RosterProvider repo={localRoster}>
          <Shell />
        </RosterProvider>
      </AppDataProvider>
    );
  }
  return (
    <AuthGate db={supabase}>
      {(session) => (
        // 계정이 바뀌면 데이터를 처음부터 다시 불러온다
        <AppDataProvider key={session.user.id} repo={remoteRepo}>
          <RosterProvider repo={remoteRoster}>
            <Shell />
          </RosterProvider>
        </AppDataProvider>
      )}
    </AuthGate>
  );
}

function Shell() {
  const [tabId, ...params] = useHashRoute();
  const { toast, revision } = useAppData();
  const tab = TABS.find((t) => t.id === tabId) ?? TABS[0];

  return (
    <div className="min-h-dvh bg-stone-50">
      <main
        className={`mx-auto w-full max-w-[480px] px-3 pt-4 pb-[calc(6rem+env(safe-area-inset-bottom))] ${
          tab.wide ? 'md:max-w-5xl' : ''
        }`}
      >
        <div key={`${tab.id}-${revision}`}>{tab.render(params)}</div>
      </main>

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4">
          <div role="status" className="rounded-full bg-stone-900/90 px-4 py-2 text-base text-white shadow-lg">
            {toast}
          </div>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)]">
        <ul className="mx-auto flex max-w-[480px]">
          {TABS.filter((t) => !t.hiddenUnder).map((t) => {
            const active = t.id === (tab.hiddenUnder ?? tab.id);
            const Icon = t.icon;
            return (
              <li key={t.id} className="flex-1">
                <button
                  type="button"
                  onClick={() => navigate(`/${t.id}`)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex h-16 w-full flex-col items-center justify-center gap-0.5 text-sm font-medium ${
                    active ? 'text-emerald-700' : 'text-stone-500'
                  }`}
                >
                  <Icon className="h-6 w-6" />
                  {t.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
