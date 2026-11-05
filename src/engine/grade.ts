// 학년 계산. SPEC_students 2장. 순수 함수.
// 학년도: 3월 1일 ~ 다음 해 2월 말. 학년 코드 n = 학년도 - 출생연도 + 보정값 (4=5세 … 10=초4)

export const GRADE_MIN = 4;
export const GRADE_MAX = 10;

/** 선택지 순서대로: 5세·6세·7세·초1·초2·초3·초4 */
export const GRADE_CODES = [4, 5, 6, 7, 8, 9, 10] as const;

const LABELS: Record<number, string> = { 4: '5세', 5: '6세', 6: '7세', 7: '초1', 8: '초2', 9: '초3', 10: '초4' };

export const OUT_OF_RANGE_LABEL = '운영 대상 외';

/** 'YYYY-MM-DD' → 학년도 */
export function schoolYearOf(date: string): number {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  return m >= 3 ? y : y - 1;
}

export function gradeLabel(code: number | null): string {
  if (code === null) return '학년 미정';
  return LABELS[code] ?? OUT_OF_RANGE_LABEL;
}

export const isInRange = (code: number) => code >= GRADE_MIN && code <= GRADE_MAX;

/** 학년 코드 → 표시 이름 (예: 4 → '5세'), 선택지용 */
export const gradeOptions = () => GRADE_CODES.map((code) => ({ code, label: LABELS[code] }));

export interface GradeSource {
  birthday: string | null;
  gradeCode: number | null;
  gradeBasisYear: number | null;
  gradeAdjust?: number;
}

/**
 * 그 날짜 기준 학년 코드. 알 수 없으면 null.
 * - 생일이 있으면 생일 기준(+ 보정값)
 * - 없으면 입력한 학년(gradeBasisYear 학년도 기준)에서 해마다 자동 진급
 */
export function gradeCodeOn(src: GradeSource, date: string): number | null {
  const sy = schoolYearOf(date);
  if (src.birthday) return sy - Number(src.birthday.slice(0, 4)) + (src.gradeAdjust ?? 0);
  if (src.gradeCode !== null && src.gradeBasisYear !== null) return src.gradeCode + (sy - src.gradeBasisYear);
  return null;
}

/** 반 학년: 기준 학년도 + 학년을 저장하고 해마다 자동 진급 */
export function classGradeCodeOn(cls: { gradeCode: number | null; gradeBasisYear: number | null }, date: string): number | null {
  if (cls.gradeCode === null || cls.gradeBasisYear === null) return null;
  return cls.gradeCode + (schoolYearOf(date) - cls.gradeBasisYear);
}

/** 화면에서 고른 학년(오늘 기준 표시 학년) → 저장할 값 */
export function gradeToStore(displayCode: number, today: string): { gradeCode: number; gradeBasisYear: number } {
  return { gradeCode: displayCode, gradeBasisYear: schoolYearOf(today) };
}
