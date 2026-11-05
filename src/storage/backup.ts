// JSON 백업/복원. 복원할 파일이 이 앱의 백업 형식인지 확인한다.
import { ROSTER_KEYS, type RosterData } from './rosterTypes.ts';
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

// ---------------------------------------------------------------
// 2단계: 학생 데이터(roster)도 같은 백업 파일에 넣는다. 예전 백업(roster 없음)도 그대로 복원된다.
// ---------------------------------------------------------------

export interface FullBackup {
  app: AppData;
  roster: RosterData | null;
}

export function toFullBackupJson(app: AppData, roster: RosterData): string {
  return JSON.stringify({ ...app, roster }, null, 2);
}

export function parseFullBackup(text: string): FullBackup {
  const app = parseBackup(text);
  const raw = (app as unknown as { roster?: unknown }).roster;
  delete (app as unknown as { roster?: unknown }).roster;
  if (raw === undefined) return { app, roster: null };
  if (!raw || typeof raw !== 'object') throw new Error('백업 파일의 학생 데이터 형식이 잘못됐습니다.');
  const obj = raw as Record<string, unknown>;
  // 나중에 생긴 항목은 예전 백업에 없을 수 있어 빈 목록으로 채운다
  const LATER_KEYS = new Set(['makeupBookings']);
  for (const k of ROSTER_KEYS) {
    if (obj[k] === undefined && LATER_KEYS.has(k)) obj[k] = [];
    if (!Array.isArray(obj[k])) throw new Error(`백업 파일의 학생 데이터에 "${k}" 항목이 없습니다.`);
  }
  // 체험수업의 시간·학년도 나중에 생긴 칸
  obj.trialLessons = (obj.trialLessons as Record<string, unknown>[]).map((t) => ({ startTime: null, gradeCode: null, gradeBasisYear: null, ...t }));
  return { app, roster: obj as unknown as RosterData };
}
