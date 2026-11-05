// 반 시간 규칙. SPEC_students 1장, 3.2. 순수 함수.
// 교실이 하나라 같은 요일에 시간이 겹치는 반은 있을 수 없다.

export const CLASS_MINUTES = 50;
/** 앞 반 종료와 다음 반 시작 사이 최소 간격(미만이면 경고) */
export const MIN_GAP_MINUTES = 10;

export const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export const fromMinutes = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** '16:30' → '오후 4:30' */
export function formatTimeKo(hhmm: string): string {
  const m = toMinutes(hhmm);
  const h = Math.floor(m / 60);
  const ampm = h < 12 ? '오전' : '오후';
  return `${ampm} ${shortTime(hhmm)}`;
}

/** '16:30' → '4:30' (오전/오후 없이) */
export function shortTime(hhmm: string): string {
  const m = toMinutes(hhmm);
  const h = Math.floor(m / 60);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m % 60).padStart(2, '0')}`;
}

/** 시작 시간 선택지(10분 단위) */
export function startTimeOptions(from = '09:00', to = '21:00'): string[] {
  const out: string[] = [];
  for (let m = toMinutes(from); m <= toMinutes(to); m += 10) out.push(fromMinutes(m));
  return out;
}

export interface TimedClass {
  id: string;
  weekday: number;
  startTime: string;
  openedOn: string | null;
  closedOn: string | null;
}

/** 그 날짜에 운영 중인 반인지(개설일 이후, 폐반일 전) */
export function isClassOpenOn(cls: Pick<TimedClass, 'openedOn' | 'closedOn'>, date: string): boolean {
  if (cls.openedOn && date < cls.openedOn) return false;
  if (cls.closedOn && date >= cls.closedOn) return false;
  return true;
}

/** 폐반하지 않은 반(앞으로 운영할 반). 개설일이 미래여도 포함 */
export const isClassActive = (cls: Pick<TimedClass, 'closedOn'>, today: string) => !cls.closedOn || cls.closedOn > today;

/** 두 반 사이 간격(분). 음수면 겹침 */
export function gapMinutes(a: string, b: string): number {
  const [first, second] = toMinutes(a) <= toMinutes(b) ? [a, b] : [b, a];
  return toMinutes(second) - (toMinutes(first) + CLASS_MINUTES);
}

export interface TimeCheck {
  /** 겹치는 반 → 저장 불가 */
  conflicts: TimedClass[];
  /** 간격 10분 미만 → 경고(저장 가능) */
  tight: TimedClass[];
}

/**
 * 새로 만들거나 고칠 반(candidate)을 같은 요일의 다른 운영 중인 반과 비교한다.
 * 폐반한 반, 자기 자신은 빼고 본다.
 */
export function checkClassTime<T extends TimedClass>(candidate: TimedClass, classes: T[], today: string): { conflicts: T[]; tight: T[] } {
  const conflicts: T[] = [];
  const tight: T[] = [];
  for (const c of classes) {
    if (c.id === candidate.id || c.weekday !== candidate.weekday || !isClassActive(c, today)) continue;
    const gap = gapMinutes(c.startTime, candidate.startTime);
    if (gap < 0) conflicts.push(c);
    else if (gap < MIN_GAP_MINUTES) tight.push(c);
  }
  return { conflicts, tight };
}
