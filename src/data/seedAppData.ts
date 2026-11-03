// 앱 초기 데이터(SPEC 6장). 설정 탭 "초기 데이터 불러오기"가 이 상태로 되돌린다.
import { monthOf } from '../engine/dates.ts';
import type { AppData, AppSettings } from '../storage/types.ts';
import { seedConfirmedSessions, seedTracks } from './seed.ts';

export const DEFAULT_NOTICE_TEMPLATE = `* 보강 - 결석 시 주차 진도가 같은 수업이 있을 경우 해당 타임에 참여 가능합니다.
  (망포꿈수학은 4인 소수정예 수업을 유지하며, 해당 보강 친구가 있을 경우 5인까지 진행됩니다.)
  그 외의 경우 토요 보강데이(30분)로 진행되며 선생님과 상담 후 예약해 주세요.
  (당일 결석 보강 불가 / 보강은 월 1회로 제한됩니다)
* 결제 - 랠리즈 앱을 통해 월말 일괄 발송됩니다. (수원페이, 랠리즈앱 카카오페이로 등록 가능 /
  매월 수업 첫 주까지 교육비를 마감하고 있습니다.) 항상 협조해 주시는 학부모님께 감사드립니다.`;

export const DEFAULT_SETTINGS: AppSettings = {
  academyName: '플레이팩토 망포꿈수학',
  slogan: '수학에 생각과 재미를 더하는 플레이팩토망포꿈수학',
  noticeTemplate: DEFAULT_NOTICE_TEMPLATE,
  operatingWeekdays: [1, 2, 3, 4, 5],
  offsetWarningThreshold: 2,
};

const SEED_CONFIRMED_AT = '2026-11-01T00:00:00+09:00';

export function createSeedAppData(): AppData {
  const months = ['2026-11', '2026-12'];
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS, operatingWeekdays: [...DEFAULT_SETTINGS.operatingWeekdays] },
    trackAnchors: seedTracks.map((t) => ({
      weekday: t.weekday,
      startDate: t.anchor.date,
      courseMonth: t.anchor.courseMonth,
      weekNo: t.anchor.weekNo,
    })),
    customHolidays: [],
    closures: [
      {
        id: 'seed-event-boardgame',
        kind: 'event',
        startDate: '2026-11-14',
        endDate: '2026-11-14',
        weekdays: null,
        label: '2026 수원 플레이팩토 보드게임 페스티벌',
        showOnCalendar: true,
      },
    ],
    sessionOverrides: [],
    makeupOverrides: [{ date: '2026-12-19', type: 'add' }],
    monthPlans: months.map((ym) => ({
      calendarMonth: ym,
      status: 'confirmed',
      confirmedAt: SEED_CONFIRMED_AT,
      snapshot: seedConfirmedSessions.filter((s) => monthOf(s.date) === ym),
    })),
    exportHistory: [],
  };
}
