// 개인브리핑 화면 도우미(SPEC_personal_briefing 3.3, 5.3). 순수 함수 + 이 기기 저장(확인 상태).
import { callNameOf, defaultCallName, renderPersonalParts, type PersonalPart } from '../../engine/personalBriefing.ts';
import type { BriefingRow, RosterChange, RosterData, StudentRow } from '../../storage/rosterTypes.ts';

/** 부르는 이름 저장: 비우거나 자동값과 같으면 null(앞으로 이름이 바뀌어도 자동값을 따른다) */
export function callNameChange(student: StudentRow, value: string): RosterChange {
  const v = value.trim();
  const callName = !v || v === defaultCallName(student.name) ? null : v;
  return { upsert: { students: [{ ...student, callName }] } };
}

/** 부르는 이름 확인 목록: 퇴원하지 않은 아이, 이름순 */
export function callNameList(roster: Pick<RosterData, 'students'>): { student: StudentRow; callName: string; custom: boolean }[] {
  return roster.students
    .filter((s) => s.status !== 'left')
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    .map((s) => ({ student: s, callName: callNameOf(s), custom: Boolean(s.callName?.trim()) }));
}

// ---------------------------------------------------------------
// 아이 카드: 확인 전 → 확인됨 → 보냄
// ---------------------------------------------------------------

/** 이 기기에 저장하는 아이별 상태. confirmedText = [확인]을 누를 때의 완성 문장 */
export interface LocalCard {
  /** 이 아이에게만 고친 문장(저장소 문구는 그대로) */
  override?: string;
  confirmedText?: string;
}
export type LocalCards = Record<string, LocalCard>;

export type CardStatus = 'pending' | 'confirmed' | 'sent';

/** 아이에게 보낼 완성 문장(이름 부분 표시용 조각 포함) */
export function personalText(template: string, student: StudentRow, local: LocalCard | undefined): { text: string; parts: PersonalPart[] } {
  if (local?.override !== undefined) return { text: local.override, parts: [{ text: local.override, isName: false }] };
  const parts = renderPersonalParts(template, callNameOf(student));
  return { text: parts.map((p) => p.text).join(''), parts };
}

/** 확인 뒤 문장이 바뀌면(문구·이름·아이별 수정) 다시 확인 전으로 */
export function cardStatus(text: string, local: LocalCard | undefined, sent: BriefingRow | null): CardStatus {
  if (sent) return 'sent';
  return local?.confirmedText !== undefined && local.confirmedText === text ? 'confirmed' : 'pending';
}

const KEY_PREFIX = 'facto-app:personal:';
const keyOf = (date: string, classId: string) => `${KEY_PREFIX}${date}:${classId}`;

export function loadLocalCards(date: string, classId: string): LocalCards {
  try {
    const raw = window.localStorage.getItem(keyOf(date, classId));
    return raw ? (JSON.parse(raw) as LocalCards) : {};
  } catch {
    return {};
  }
}

export function saveLocalCards(date: string, classId: string, cards: LocalCards) {
  try {
    window.localStorage.setItem(keyOf(date, classId), JSON.stringify(cards));
    pruneOld(date);
  } catch {
    /* 저장이 안 돼도 이번 화면에서는 유지된다 */
  }
}

/** 2주 넘게 지난 날짜의 확인 상태는 지운다(이 기기 저장 공간 정리) */
function pruneOld(today: string) {
  const limit = new Date(`${today}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() - 14);
  const cut = limit.toISOString().slice(0, 10);
  for (let i = window.localStorage.length - 1; i >= 0; i--) {
    const k = window.localStorage.key(i);
    if (k?.startsWith(KEY_PREFIX) && k.slice(KEY_PREFIX.length, KEY_PREFIX.length + 10) < cut) window.localStorage.removeItem(k);
  }
}
