// 초기 데이터(시드). SPEC 6장.
// 2026-11, 2026-12는 이미 학부모에게 배포된 확정 상태 → SPEC 7.1 값을 스냅샷으로 둔다.
import { parseCode } from '../engine/label.ts';
import type { DatedLabel, ScheduleInput, Track } from '../engine/types.ts';
import { builtInHolidays } from './holidays/index.ts';

export const seedTracks: Track[] = [
  { weekday: 1, active: true, anchor: { date: '2026-11-02', courseMonth: '2026-11', weekNo: 1 } },
  { weekday: 2, active: true, anchor: { date: '2026-11-03', courseMonth: '2026-11', weekNo: 2 } },
  { weekday: 3, active: true, anchor: { date: '2026-11-04', courseMonth: '2026-11', weekNo: 2 } },
  { weekday: 4, active: true, anchor: { date: '2026-11-05', courseMonth: '2026-11', weekNo: 2 } },
  { weekday: 5, active: true, anchor: { date: '2026-11-06', courseMonth: '2026-11', weekNo: 1 } },
];

/** "11/2 11-1, 11/9 11-2" 같은 SPEC 7장 표기를 회차 목록으로 */
export function parseSessions(year: number, text: string): DatedLabel[] {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((item) => {
      const [md, code] = item.split(/\s+/);
      const [m, d] = md.split('/').map(Number);
      const date = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      return { date, ...parseCode(date, code) };
    });
}

/** 2026-11, 2026-12 확정 스냅샷 (SPEC 7.1 실제 배포본, 12/21 오기 수정 반영) */
export const seedConfirmedSessions: DatedLabel[] = parseSessions(
  2026,
  [
    // 월
    '11/2 11-1, 11/9 11-2, 11/16 11-3, 11/23 11-4, 11/30 12-1, 12/7 12-2, 12/14 12-3, 12/21 12-4, 12/28 1-1',
    // 화
    '11/3 11-2, 11/10 11-3, 11/17 11-4, 11/24 12-1, 12/1 12-2, 12/8 12-3, 12/15 12-4, 12/22 1-1, 12/29 1-2',
    // 수
    '11/4 11-2, 11/11 11-3, 11/18 11-4, 11/25 12-1, 12/2 12-2, 12/9 12-3, 12/16 12-4, 12/23 1-1, 12/30 1-2',
    // 목
    '11/5 11-2, 11/12 11-3, 11/19 11-4, 11/26 12-1, 12/3 12-2, 12/10 12-3, 12/17 12-4, 12/24 1-1, 12/31 1-2',
    // 금 (12/25 성탄절은 수업 없음)
    '11/6 11-1, 11/13 11-2, 11/20 11-3, 11/27 11-4, 12/4 12-1, 12/11 12-2, 12/18 12-3',
  ].join(', '),
);

/** 범위를 정해 시드 상태의 엔진 입력을 만든다. */
export function seedInput(range: { from: string; to: string }): ScheduleInput {
  return {
    range,
    tracks: seedTracks,
    holidays: builtInHolidays,
    ignoredHolidays: [],
    closures: [],
    events: [
      { date: '2026-11-14', label: '2026 수원 플레이팩토 보드게임 페스티벌', showOnCalendar: true },
    ],
    overrides: [],
    confirmedSessions: seedConfirmedSessions,
    makeupOverrides: [{ date: '2026-12-19', type: 'add' }],
    offsetWarningThreshold: 2,
  };
}
