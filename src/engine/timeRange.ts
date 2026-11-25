// 시간 칸 계산(편성 시뮬레이터와 하린이 시간표가 함께 쓴다). 시각은 하루 0시부터의 분.

/** [aStart, aEnd)와 [bStart, bEnd)가 겹치는지(끝과 시작이 같으면 안 겹침) */
export const rangesOverlap = (aStart: number, aEnd: number, bStart: number, bEnd: number) => aStart < bEnd && bStart < aEnd;

/** 가까운 step분 칸으로 맞춘다 */
export const snapMinutes = (m: number, step = 10) => Math.round(m / step) * step;

/**
 * 블록 안에서 누르거나 잡은 위치가 블록 시작에서 몇 분 지점인지(step분 단위로 내림).
 * 끌 때 블록 윗변 = 손가락 위치 - 이 값, 탭으로 옮길 때 누른 칸 계산에 쓴다.
 */
export function grabOffset(pointerY: number, rectTop: number, rectHeight: number, durationMin: number, step = 10): number {
  if (rectHeight <= 0) return 0;
  const raw = Math.floor((((pointerY - rectTop) / rectHeight) * durationMin) / step) * step;
  return Math.max(0, Math.min(durationMin - step, raw));
}

/** 끌어서 놓을 때: 칸 시각 - 잡은 위치를 [min, max - 길이] 안으로 */
export function dropStart(cellMinute: number, offset: number, duration: number, min: number, max: number): number {
  return Math.max(min, Math.min(max - duration, cellMinute - offset));
}
