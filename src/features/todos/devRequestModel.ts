// 앱 개선 요청 메모(SPEC_home 9장)의 계산. 화면·저장과 분리된 순수 함수.
import { format } from 'date-fns';
import { newId, type DevRequestRow } from '../../storage/rosterTypes.ts';

export const MAX_REQUEST_LENGTH = 2000;

/** ISO 시각 → 이 기기 시간 기준 'YYYY-MM-DD' */
export const localDate = (iso: string) => format(new Date(iso), 'yyyy-MM-dd');

/** 'YYYY-MM-DD' → 'M/D' */
export const shortDate = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

/** 화면 순서: 안 한 것(쓴 순서) → 완료한 것(완료한 순서) */
export function sortRequests(list: DevRequestRow[]): DevRequestRow[] {
  const open = list.filter((r) => !r.done).sort((a, b) => a.sort - b.sort || a.createdAt.localeCompare(b.createdAt));
  const done = list.filter((r) => r.done).sort((a, b) => (a.doneAt ?? '').localeCompare(b.doneAt ?? '') || a.sort - b.sort);
  return [...open, ...done];
}

/** 새 항목(맨 아래). 빈 글이면 null */
export function makeRequest(list: DevRequestRow[], text: string, now: Date, userId: string | null): DevRequestRow | null {
  const v = text.trim().slice(0, MAX_REQUEST_LENGTH);
  if (!v) return null;
  return {
    id: newId(),
    text: v,
    done: false,
    doneAt: null,
    sort: list.reduce((m, r) => Math.max(m, r.sort), 0) + 1,
    createdBy: userId,
    createdAt: now.toISOString(),
  };
}

export const toggleDone = (r: DevRequestRow, now: Date): DevRequestRow =>
  r.done ? { ...r, done: false, doneAt: null } : { ...r, done: true, doneAt: now.toISOString() };

/** 글 고치기. 빈 글이면 고치지 않는다(null) */
export function editText(r: DevRequestRow, text: string): DevRequestRow | null {
  const v = text.trim().slice(0, MAX_REQUEST_LENGTH);
  return v && v !== r.text ? { ...r, text: v } : null;
}

/** [전체 복사]: 안 한 항목을 "- 내용(작성일)" 목록으로. 여러 줄이면 다음 줄을 두 칸 들여써서 한 항목으로 묶는다 */
export function copyText(list: DevRequestRow[]): string {
  return sortRequests(list)
    .filter((r) => !r.done)
    .map((r) => {
      const [first, ...rest] = r.text.split('\n').map((l) => l.trimEnd());
      return [`- ${first}`, ...rest.map((l) => `  ${l}`)].join('\n') + `(${shortDate(localDate(r.createdAt))})`;
    })
    .join('\n');
}

/** 작성자 표시: 내가 쓴 것은 "나", 그 밖은 "다른 사람"(로그인 없이 쓰는 개발용 모드는 모두 "나") */
export const authorLabel = (r: DevRequestRow, userId: string | null) => (!userId || !r.createdBy || r.createdBy === userId ? '나' : '다른 사람');
