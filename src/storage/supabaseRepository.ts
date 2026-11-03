// Supabase 구현. 로그인한 사용자끼리(원장 + 개발자) 같은 데이터를 본다.
// 저장은 DB 함수(save_collection, replace_all)로 표 하나씩 통째로 바꾼다 → 중간 실패 시 자동 취소.
// 두 사람이 동시에 같은 표를 고치면 나중에 저장한 쪽이 남는다(2명이 쓰는 앱이라 충분).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Repository } from './repository.ts';
import { ORDER_OF, TABLE_OF, appDataToDb, dbToAppData, toDb, type DbTables } from './supabaseMapping.ts';
import type { AppData, CollectionKey } from './types.ts';

export class SupabaseRepository implements Repository {
  private readonly db: SupabaseClient;

  constructor(db: SupabaseClient) {
    this.db = db;
  }

  async load(): Promise<AppData | null> {
    const settings = await this.db.from('settings').select('data').eq('id', 1).maybeSingle();
    if (settings.error) throw new Error(settings.error.message);

    const keys = Object.keys(ORDER_OF) as (keyof typeof ORDER_OF)[];
    const results = await Promise.all(
      keys.map((k) => this.db.from(TABLE_OF[k]).select('*').order(ORDER_OF[k].column, { ascending: ORDER_OF[k].ascending })),
    );
    const tables: Record<string, unknown> = { settings: settings.data };
    results.forEach((res, i) => {
      if (res.error) throw new Error(res.error.message);
      tables[TABLE_OF[keys[i]]] = res.data;
    });
    return dbToAppData(tables as unknown as DbTables);
  }

  async save<K extends CollectionKey>(key: K, value: AppData[K]): Promise<void> {
    const { error } = await this.db.rpc('save_collection', { p_key: TABLE_OF[key], p_rows: toDb(key, value) });
    if (error) throw new Error(error.message);
  }

  async replaceAll(data: AppData): Promise<void> {
    const { error } = await this.db.rpc('replace_all', { p_data: appDataToDb(data) });
    if (error) throw new Error(error.message);
  }
}
