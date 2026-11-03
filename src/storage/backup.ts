// JSON 백업/복원. 복원할 파일이 이 앱의 백업 형식인지 확인한다.
import { COLLECTION_KEYS, type AppData } from './types.ts';

export function toBackupJson(data: AppData): string {
  return JSON.stringify(data, null, 2);
}

/** 형식이 맞으면 AppData, 아니면 이유를 담은 Error를 던진다 */
export function parseBackup(text: string): AppData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('JSON 파일이 아닙니다.');
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('백업 파일 형식이 아닙니다.');
  const obj = parsed as Record<string, unknown>;
  if (obj.version !== 1) throw new Error('지원하지 않는 백업 버전입니다.');
  for (const key of COLLECTION_KEYS) {
    if (!(key in obj)) throw new Error(`백업 파일에 "${key}" 항목이 없습니다.`);
    const isObj = key === 'settings';
    if (isObj ? typeof obj[key] !== 'object' : !Array.isArray(obj[key])) {
      throw new Error(`백업 파일의 "${key}" 항목 형식이 잘못됐습니다.`);
    }
  }
  return obj as unknown as AppData;
}
