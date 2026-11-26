// 하린이 시간표 기본 종류(SPEC_harin 4장). Supabase는 마이그레이션 20261125000000_harin.sql이 같은 값을 넣는다.
import type { KidCategoryRow } from '../../storage/rosterTypes.ts';

export const SEED_KID_CATEGORIES: Omit<KidCategoryRow, 'id'>[] = [
  { name: '학원', color: '#fbcfe8', emoji: '🏫', isTravel: false, isActivity: true, defaultMinutes: 50, sort: 1 },
  { name: '이동', color: '#e7e5e4', emoji: '🚶', isTravel: true, isActivity: false, defaultMinutes: 20, sort: 2 },
  { name: '식사', color: '#fed7aa', emoji: '🍽️', isTravel: false, isActivity: false, defaultMinutes: 30, sort: 3 },
  { name: '휴식', color: '#d9f99d', emoji: '🧸', isTravel: false, isActivity: false, defaultMinutes: 20, sort: 4 },
  { name: '숙제', color: '#bae6fd', emoji: '✏️', isTravel: false, isActivity: false, defaultMinutes: 50, sort: 5 },
  { name: '기타', color: '#e9d5ff', emoji: '⭐', isTravel: false, isActivity: false, defaultMinutes: 50, sort: 6 },
];

/** 학원·종류 색 고르기용 파스텔 색 */
export const KID_PALETTE = [
  '#fbcfe8', '#fecdd3', '#fed7aa', '#fde68a', '#d9f99d', '#bbf7d0',
  '#a7f3d0', '#99f6e4', '#bae6fd', '#c7d2fe', '#ddd6fe', '#e9d5ff',
];
