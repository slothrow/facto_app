// Supabase 접속 정보는 .env.local에서 읽는다(커밋하지 않음).
// 값이 없으면 null → 예전처럼 이 기기(localStorage)에만 저장하는 개발용 모드로 동작한다.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null;
