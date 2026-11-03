// 하단 탭 설정. 새 탭(반 편성, 학생 등록 등)은 이 배열에 한 줄 추가하면 된다.
import type { ComponentType, ReactNode } from 'react';
import { CalendarIcon, GearIcon, ImageIcon } from '../components/icons.tsx';
import { ExportPage } from '../features/export/ExportPage.tsx';
import { PlanPage } from '../features/plan/PlanPage.tsx';
import { SettingsPage } from '../features/settings/SettingsPage.tsx';

export interface TabDef {
  /** 주소의 첫 부분. 예: #/plan */
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** params = 주소의 나머지 부분. 예: #/plan/2027-01 → ['2027-01'] */
  render: (params: string[]) => ReactNode;
}

export const TABS: TabDef[] = [
  { id: 'plan', label: '회차 계획', icon: CalendarIcon, render: ([month]) => <PlanPage month={month} /> },
  { id: 'export', label: '달력 만들기', icon: ImageIcon, render: () => <ExportPage /> },
  { id: 'settings', label: '설정', icon: GearIcon, render: () => <SettingsPage /> },
];
