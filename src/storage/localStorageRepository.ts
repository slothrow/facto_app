// localStorage 구현. 브라우저 한 곳에만 저장된다(다른 기기와 공유 안 됨 → 4단계에서 해결).
import type { Repository } from './repository.ts';
import type { AppData, CollectionKey } from './types.ts';

export const STORAGE_KEY = 'facto-app:data:v1';

/** 테스트에서 가짜 저장소를 넣을 수 있게 필요한 메서드만 */
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

export class LocalStorageRepository implements Repository {
  private readonly storage: KeyValueStorage;
  private readonly key: string;

  constructor(storage: KeyValueStorage, key = STORAGE_KEY) {
    this.storage = storage;
    this.key = key;
  }

  async load(): Promise<AppData | null> {
    const raw = this.storage.getItem(this.key);
    return raw ? (JSON.parse(raw) as AppData) : null;
  }

  async save<K extends CollectionKey>(key: K, value: AppData[K]): Promise<void> {
    const current = await this.load();
    if (!current) throw new Error('저장된 데이터가 없습니다. 먼저 전체 데이터를 저장해야 합니다.');
    this.write({ ...current, [key]: value });
  }

  async replaceAll(data: AppData): Promise<void> {
    this.write(data);
  }

  private write(data: AppData) {
    this.storage.setItem(this.key, JSON.stringify(data));
  }
}
