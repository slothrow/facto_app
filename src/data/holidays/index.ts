import type { Holiday } from '../../engine/types.ts';
import { holidays2026 } from './2026.ts';
import { holidays2027 } from './2027.ts';

/** 앱에 내장된 공휴일 전체. 새 연도는 파일을 추가하고 여기에 이어 붙인다. */
export const builtInHolidays: Holiday[] = [...holidays2026, ...holidays2027];
