// 놓을 수 있는지 판단(SPEC_simulator 4.1). 탭 방식·드래그 방식·새 반 만들기가 모두 이 함수 하나를 쓴다.
import { CLASS_MINUTES, MIN_GAP_MINUTES, checkClassTime, fromMinutes, toMinutes } from '../classTime.ts';
import type { Weekday } from '../types.ts';
import { liveClasses, slotText, withHoursDefaults, type OperatingHours, type SimDraft } from './model.ts';

export type Placement =
  | { kind: 'ok' }
  /** 놓을 수는 있음(노랑) */
  | { kind: 'warn'; reasons: string[] }
  /** 놓을 수 없음(회색) */
  | { kind: 'block'; reasons: string[] };

/** 10분 단위로 맞춘다(가까운 쪽) */
export const snapTo10 = (hhmm: string) => fromMinutes(Math.round(toMinutes(hhmm) / 10) * 10);

/**
 * classId 반을 (weekday, start)에 놓을 수 있는지. classId가 null이면 새 반.
 * - 같은 요일 다른 반과 [시작, 시작+50분)이 겹치면 block
 * - 앞뒤 반과 간격 10분 미만이면 warn
 * - 운영 시간대 밖이면 warn
 */
export function canPlace(
  draft: Pick<SimDraft, 'classes'>,
  classId: string | null,
  weekday: Weekday,
  start: string,
  hours: OperatingHours = withHoursDefaults(),
): Placement {
  const startTime = snapTo10(start);
  const others = liveClasses(draft).map((c) => ({
    id: c.id,
    weekday: c.weekday,
    startTime: c.startTime,
    openedOn: null,
    closedOn: null,
    slot: slotText(c.weekday, c.startTime),
  }));
  // 기존 반 시간 검사(겹침·간격)를 그대로 쓴다. 시안 반은 폐반 개념이 없어 오늘 날짜는 아무 값이나 된다
  const { conflicts, tight } = checkClassTime(
    { id: classId ?? '__new__', weekday, startTime, openedOn: null, closedOn: null },
    others,
    '2000-01-01',
  );
  if (conflicts.length > 0) return { kind: 'block', reasons: conflicts.map((c) => `${c.slot} 반과 겹침`) };

  const reasons = tight.map((c) => {
    const a = toMinutes(c.startTime);
    const b = toMinutes(startTime);
    const gap = Math.abs(a - b) - CLASS_MINUTES;
    return `${c.slot} 반과 간격 ${gap}분(${MIN_GAP_MINUTES}분 미만)`;
  });
  const h = hours[weekday];
  if (toMinutes(startTime) < toMinutes(h.start) || toMinutes(startTime) + CLASS_MINUTES > toMinutes(h.end)) {
    reasons.push('운영 시간대 밖');
  }
  return reasons.length > 0 ? { kind: 'warn', reasons } : { kind: 'ok' };
}
