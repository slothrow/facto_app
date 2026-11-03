// 달력월 요약과 앞섬/밀림(offset). SPEC 3.3.
import { monthEnd, monthOf } from './dates.ts';
import { formatSessionList, labelIndex, monthIndex } from './label.ts';
import type { TrackEntry } from './schedule.ts';
import type { DatedLabel, SessionLabel, Track, TrackMonthSummary } from './types.ts';

/**
 * 달력월 X가 끝난 뒤 다음 회차가 next일 때의 offset.
 * offset = (monthIndex(M) - monthIndex(X+1)) * 4 + (w - 1)
 */
export function computeOffset(calendarMonth: string, next: SessionLabel): number {
  return labelIndex(next) - (monthIndex(calendarMonth) + 1) * 4;
}

const toDated = (e: TrackEntry): DatedLabel => ({ date: e.date, ...e.label! });

export function summarizeTrackMonth(
  calendarMonth: string,
  track: Track,
  entries: TrackEntry[],
): TrackMonthSummary {
  const end = monthEnd(calendarMonth);
  const sessionEntries = entries.filter((e) => e.kind === 'session');
  const sessions = sessionEntries.filter((e) => monthOf(e.date) === calendarMonth).map(toDated);
  const nextEntry = sessionEntries.find((e) => e.date > end);
  const nextSession = nextEntry ? toDated(nextEntry) : null;
  const offset =
    end < track.anchor.date || !nextSession ? null : computeOffset(calendarMonth, nextSession);
  return {
    weekday: track.weekday,
    count: sessions.length,
    sessions,
    sessionsText: formatSessionList(sessions),
    nextSession,
    offset,
  };
}
