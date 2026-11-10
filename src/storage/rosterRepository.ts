// 2단계 데이터 저장소. 화면은 이 인터페이스만 알고, 어디에 저장되는지는 모른다.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { KeyValueStorage } from './localStorageRepository.ts';
import {
  ROSTER_KEYS,
  applyChange,
  emptyRoster,
  type Guardian,
  type RosterChange,
  type RosterData,
  type RosterKey,
} from './rosterTypes.ts';

export interface RosterRepository {
  load(): Promise<RosterData>;
  /** 바뀐 행만 저장. 추가·수정을 먼저(참조되는 표부터), 삭제는 나중에(참조하는 표부터) */
  apply(change: RosterChange): Promise<void>;
  /** 전체 교체(백업 복원) */
  replaceAll(data: RosterData): Promise<void>;
  /** 시안 적용: 전부 성공하거나 전부 취소(SPEC_simulator 7.3). 이미 적용된 시안이면 실패 */
  applyDraft(draftId: string, change: RosterChange): Promise<void>;
}

/** 시안 적용 함수(apply_sim_draft)에 넘길 모양: { upsert: { 표 이름: 행[] }, remove: { enrollments: [{ id }] } } */
export function applyDraftPayload(change: RosterChange): { upsert: Record<string, Row[]>; remove: { enrollments: { id: string }[] } } {
  const upsert: Record<string, Row[]> = {};
  for (const k of ROSTER_KEYS) {
    const rows = change.upsert?.[k] as object[] | undefined;
    if (rows?.length) upsert[ROSTER_TABLE[k]] = rows.map((r) => rowToDb(k, r));
  }
  return { upsert, remove: { enrollments: (change.remove?.enrollments ?? []).map((e) => ({ id: e.id })) } };
}

// ---------------------------------------------------------------
// DB 열 이름 변환 (camelCase ↔ snake_case)
// ---------------------------------------------------------------

export const ROSTER_TABLE: Record<RosterKey, string> = {
  classes: 'classes',
  students: 'students',
  siblings: 'student_siblings',
  enrollments: 'enrollments',
  counselingNotes: 'counseling_notes',
  waitlist: 'waitlist',
  trialLessons: 'trial_lessons',
  absences: 'absences',
  makeupBookings: 'makeup_bookings',
  progressAnchors: 'class_progress_anchors',
  basicLessons: 'basic_lesson_plans',
  briefingTexts: 'briefing_texts',
  briefings: 'briefings',
  simDrafts: 'sim_drafts',
  simClasses: 'sim_classes',
  simMembers: 'sim_members',
  attendanceChecks: 'attendance_checks',
  tasks: 'tasks',
  taskStates: 'task_states',
};

/** 삭제할 때 행을 찾는 열 */
const KEY_COLUMNS: Record<RosterKey, string[]> = {
  classes: ['id'],
  students: ['id'],
  siblings: ['student_id', 'sibling_id'],
  enrollments: ['id'],
  counselingNotes: ['id'],
  waitlist: ['id'],
  trialLessons: ['id'],
  absences: ['date', 'class_id', 'student_id'],
  makeupBookings: ['id'],
  progressAnchors: ['id'],
  basicLessons: ['id'],
  briefingTexts: ['code'],
  briefings: ['id'],
  simDrafts: ['id'],
  simClasses: ['id'],
  simMembers: ['id'],
  attendanceChecks: ['date', 'class_id'],
  tasks: ['id'],
  taskStates: ['task_key'],
};

const DB_ONLY = new Set(['created_at', 'updated_at', 'updated_by']);
const toSnake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const toCamel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

type Row = Record<string, unknown>;

export function rowToDb(key: RosterKey, row: object): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) out[toSnake(k)] = v;
  if (key === 'students') {
    out.guardians = (row as { guardians: Guardian[] }).guardians.map((g) => ({
      name: g.name,
      relation: g.relation,
      phone: g.phone,
      is_primary: g.isPrimary,
    }));
  }
  return out;
}

export function rowFromDb(key: RosterKey, row: Row): object {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) if (!DB_ONLY.has(k)) out[toCamel(k)] = v;
  if (key === 'students') {
    out.guardians = ((row.guardians as Row[] | null) ?? []).map((g) => ({
      name: (g.name as string) ?? '',
      relation: (g.relation as string) ?? 'other',
      phone: (g.phone as string) ?? '',
      isPrimary: Boolean(g.is_primary),
    }));
  }
  return out;
}

export function rosterToDb(data: RosterData): Record<string, Row[]> {
  const out: Record<string, Row[]> = {};
  for (const k of ROSTER_KEYS) out[ROSTER_TABLE[k]] = (data[k] as object[]).map((r) => rowToDb(k, r));
  return out;
}

// ---------------------------------------------------------------
// Supabase 구현
// ---------------------------------------------------------------

export class SupabaseRosterRepository implements RosterRepository {
  private readonly db: SupabaseClient;

  constructor(db: SupabaseClient) {
    this.db = db;
  }

  async load(): Promise<RosterData> {
    const results = await Promise.all(ROSTER_KEYS.map((k) => this.db.from(ROSTER_TABLE[k]).select('*')));
    const data = emptyRoster();
    results.forEach((res, i) => {
      // 에러 메시지에 행 내용(이름 등)이 섞이지 않게 DB 메시지만 쓴다
      if (res.error) throw new Error(res.error.message);
      const k = ROSTER_KEYS[i];
      (data as unknown as Record<RosterKey, object[]>)[k] = (res.data as Row[]).map((r) => rowFromDb(k, r));
    });
    return data;
  }

  async apply(change: RosterChange): Promise<void> {
    for (const k of ROSTER_KEYS) {
      const rows = change.upsert?.[k] as object[] | undefined;
      if (!rows?.length) continue;
      const { error } = await this.db.from(ROSTER_TABLE[k]).upsert(rows.map((r) => rowToDb(k, r)));
      if (error) throw new Error(error.message);
    }
    for (const k of [...ROSTER_KEYS].reverse()) {
      const rows = change.remove?.[k] as object[] | undefined;
      if (!rows?.length) continue;
      const cols = KEY_COLUMNS[k];
      if (cols.length === 1) {
        const ids = rows.map((r) => rowToDb(k, r)[cols[0]]);
        const { error } = await this.db.from(ROSTER_TABLE[k]).delete().in(cols[0], ids);
        if (error) throw new Error(error.message);
      } else {
        for (const r of rows) {
          const dbRow = rowToDb(k, r);
          let q = this.db.from(ROSTER_TABLE[k]).delete();
          for (const c of cols) q = q.eq(c, dbRow[c]);
          const { error } = await q;
          if (error) throw new Error(error.message);
        }
      }
    }
  }

  async replaceAll(data: RosterData): Promise<void> {
    const { error } = await this.db.rpc('replace_roster', { p_data: rosterToDb(data) });
    if (error) throw new Error(error.message);
  }

  async applyDraft(draftId: string, change: RosterChange): Promise<void> {
    const { error } = await this.db.rpc('apply_sim_draft', { p_draft_id: draftId, p_change: applyDraftPayload(change) });
    if (error) throw new Error(error.message);
  }
}

// ---------------------------------------------------------------
// localStorage 구현(Supabase 접속 정보가 없는 개발용, 테스트용)
// ---------------------------------------------------------------

export const ROSTER_STORAGE_KEY = 'facto-app:roster:v1';

export class LocalRosterRepository implements RosterRepository {
  private readonly storage: KeyValueStorage;
  private readonly key: string;

  constructor(storage: KeyValueStorage, key = ROSTER_STORAGE_KEY) {
    this.storage = storage;
    this.key = key;
  }

  async load(): Promise<RosterData> {
    const raw = this.storage.getItem(this.key);
    return raw ? { ...emptyRoster(), ...(JSON.parse(raw) as Partial<RosterData>) } : emptyRoster();
  }

  async apply(change: RosterChange): Promise<void> {
    this.write(applyChange(await this.load(), change));
  }

  async replaceAll(data: RosterData): Promise<void> {
    this.write(data);
  }

  async applyDraft(draftId: string, change: RosterChange): Promise<void> {
    const data = await this.load();
    const draft = data.simDrafts.find((d) => d.id === draftId);
    if (!draft) throw new Error('draft not found');
    if (draft.status !== 'editing') throw new Error(`draft is not editable (status: ${draft.status})`);
    this.write(applyChange(data, change));
  }

  private write(data: RosterData) {
    this.storage.setItem(this.key, JSON.stringify(data));
  }
}
