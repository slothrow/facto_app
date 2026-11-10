// 하단 탭 설정. 새 탭(반 편성, 학생 등록 등)은 이 배열에 한 줄 추가하면 된다.
import type { ComponentType, ReactNode } from 'react';
import { CalendarIcon, ChatIcon, GearIcon, HomeIcon, UsersIcon } from '../components/icons.tsx';
import { HomePage } from '../features/home/HomePage.tsx';
import { BriefingPage } from '../features/briefing/BriefingPage.tsx';
import { AttendancePage } from '../features/attendance/AttendancePage.tsx';
import { ExportPage } from '../features/export/ExportPage.tsx';
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

// SPEC_home 1.1: 홈 / 브리핑 / 시간표 / 달력 / 설정. 숨은 화면은 hiddenUnder 탭이 켜진 것으로 표시
export const TABS: TabDef[] = [
  { id: 'home', label: '홈', icon: HomeIcon, render: () => <HomePage /> },
  { id: 'briefing', label: '브리핑', icon: ChatIcon, render: (params) => <BriefingPage params={params} /> },
  { id: 'roster', label: '시간표', icon: UsersIcon, render: (params) => <RosterPage params={params} /> },
  { id: 'plan', label: '달력', icon: CalendarIcon, render: ([month]) => <PlanPage month={month} /> },
  { id: 'settings', label: '설정', icon: GearIcon, render: () => <SettingsPage /> },
  { id: 'export', label: '안내 달력 만들기', icon: CalendarIcon, hiddenUnder: 'plan', render: () => <ExportPage /> },
  { id: 'attend', label: '출석', icon: CalendarIcon, hiddenUnder: 'plan', render: (params) => <AttendancePage params={params} /> },
  { id: 'makeup', label: '토요보강', icon: CalendarIcon, hiddenUnder: 'plan', render: ([month]) => <MakeupPage month={month} /> },
];
