// 하단 탭 설정. 새 탭(반 편성, 학생 등록 등)은 이 배열에 한 줄 추가하면 된다.
import type { ComponentType, ReactNode } from 'react';
import { CalendarIcon, GearIcon, ImageIcon, UsersIcon } from '../components/icons.tsx';
import { ExportPage } from '../features/export/ExportPage.tsx';
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
  /** PC·태블릿에서 넓게 쓰는 탭(시간표 격자 등) */
  wide?: boolean;
}

export const TABS: TabDef[] = [
  { id: 'plan', label: '회차 계획', icon: CalendarIcon, render: ([month]) => <PlanPage month={month} /> },
  { id: 'roster', label: '반·학생', icon: UsersIcon, wide: true, render: (params) => <RosterPage params={params} /> },
  { id: 'export', label: '달력 만들기', icon: ImageIcon, render: () => <ExportPage /> },
  { id: 'settings', label: '설정', icon: GearIcon, render: () => <SettingsPage /> },
];
