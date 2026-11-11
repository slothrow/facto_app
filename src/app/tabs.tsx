// 하단 탭 설정. 새 탭(반 편성, 학생 등록 등)은 이 배열에 한 줄 추가하면 된다.
import { Suspense, lazy, type ComponentType, type ReactNode } from 'react';

// 안내 달력 만들기(이미지 도구 포함)는 열 때만 불러온다
const ExportPage = lazy(() => import('../features/export/ExportPage.tsx').then((m) => ({ default: m.ExportPage })));
import { CalendarIcon, ChatIcon, CheckIcon, GearIcon, UsersIcon } from '../components/icons.tsx';
// 예전 홈(features/home: 오늘 수업·할 일 알림)은 보관 중(26단계, CLAUDE.md "보관 중인 모듈")
import { TodoPage } from '../features/todos/TodoPage.tsx';
import { BriefingPage } from '../features/briefing/BriefingPage.tsx';
import { AttendancePage } from '../features/attendance/AttendancePage.tsx';

import { MakeupPage } from '../features/makeup/MakeupPage.tsx';
import { PlanPage } from '../features/plan/PlanPage.tsx';
import { RosterPage } from '../features/roster/RosterPage.tsx';
import { SettingsPage } from '../features/settings/SettingsPage.tsx';

export interface TabDef {
  /** 주소의 첫 부분. 예: #/plan */
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** params = 주소의 나머지 부분. 예: #/plan/2027-01 → ['2027-01'] */
  render: (params: string[]) => ReactNode;
  /** 하단 탭에 안 보이는 화면. 이 탭이 선택된 것처럼 표시한다 */
  hiddenUnder?: string;
}

// SPEC_home 1.1·6장: 할 일(주소는 예전 그대로 #/home) / 브리핑 / 시간표 / 달력 / 설정. 숨은 화면은 hiddenUnder 탭이 켜진 것으로 표시
export const TABS: TabDef[] = [
  { id: 'home', label: '할 일', icon: CheckIcon, render: () => <TodoPage /> },
  { id: 'briefing', label: '브리핑', icon: ChatIcon, render: (params) => <BriefingPage params={params} /> },
  { id: 'roster', label: '시간표', icon: UsersIcon, render: (params) => <RosterPage params={params} /> },
  { id: 'plan', label: '달력', icon: CalendarIcon, render: ([month]) => <PlanPage month={month} /> },
  { id: 'settings', label: '설정', icon: GearIcon, render: () => <SettingsPage /> },
  { id: 'export', label: '안내 달력 만들기', icon: CalendarIcon, hiddenUnder: 'plan', render: () => (
      <Suspense fallback={<p className="py-8 text-center text-base text-stone-500">불러오는 중…</p>}>
        <ExportPage />
      </Suspense>
    ) },
  { id: 'attend', label: '출석', icon: CalendarIcon, hiddenUnder: 'plan', render: (params) => <AttendancePage params={params} /> },
  { id: 'makeup', label: '토요보강', icon: CalendarIcon, hiddenUnder: 'plan', render: ([month]) => <MakeupPage month={month} /> },
];
