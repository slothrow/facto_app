// 저장소 인터페이스. 지금은 localStorage 구현을 쓰고, 4단계에서 Supabase 구현으로 갈아끼운다.
// 화면 코드는 이 인터페이스만 알고, 어디에 저장되는지는 모른다.
import type { AppData, CollectionKey } from './types.ts';

export interface Repository {
  /** 저장된 데이터 전체. 아직 아무것도 없으면 null */
  load(): Promise<AppData | null>;
  /** 테이블 하나의 내용을 통째로 바꾼다 */
  save<K extends CollectionKey>(key: K, value: AppData[K]): Promise<void>;
  /** 전체 교체(백업 복원, 초기 데이터 불러오기) */
  replaceAll(data: AppData): Promise<void>;
}
