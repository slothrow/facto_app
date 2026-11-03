// 로그인 관문. 로그인하지 않으면 로그인 화면만 보이고 데이터는 전혀 불러오지 않는다.
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Button, Field, inputClass } from '../../components/ui.tsx';

interface AuthValue {
  email: string;
  signOut: () => Promise<void>;
}

const AuthCtx = createContext<AuthValue | null>(null);

/** 로그인한 계정 정보. 로컬 모드(Supabase 미설정)면 null */
export const useAuth = () => useContext(AuthCtx);

export function AuthGate({ db, children }: { db: SupabaseClient; children: (session: Session) => ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    db.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = db.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [db]);

  if (session === undefined) return <p className="p-6 text-stone-500">불러오는 중…</p>;
  if (!session) return <LoginPage db={db} />;

  const value: AuthValue = {
    email: session.user.email ?? '',
    signOut: async () => {
      await db.auth.signOut();
    },
  };
  return <AuthCtx.Provider value={value}>{children(session)}</AuthCtx.Provider>;
}

function LoginPage({ db }: { db: SupabaseClient }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await db.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(toKoreanError(error.message));
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-stone-50 px-4">
      <form onSubmit={onSubmit} className="w-full max-w-[400px] space-y-4 rounded-2xl border border-stone-200 bg-white p-6">
        <div>
          <h1 className="text-xl font-bold text-stone-900">학사운영</h1>
          <p className="mt-1 text-base text-stone-500">플레이팩토 망포꿈수학</p>
        </div>
        <Field label="이메일">
          <input
            type="email"
            autoComplete="username"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="비밀번호">
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </Field>
        {error && (
          <p role="alert" className="text-base text-red-700">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" className="w-full" disabled={busy}>
          {busy ? '로그인 중…' : '로그인'}
        </Button>
      </form>
    </div>
  );
}

function toKoreanError(message: string): string {
  if (/invalid login credentials/i.test(message)) return '이메일 또는 비밀번호가 맞지 않아요.';
  if (/email not confirmed/i.test(message)) return '이메일 인증이 안 된 계정이에요. 대시보드에서 계정을 확인해 주세요.';
  if (/failed to fetch|network/i.test(message)) return '인터넷 연결을 확인해 주세요.';
  return `로그인하지 못했어요: ${message}`;
}
