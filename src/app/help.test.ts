// 모든 화면에 사용법이 있는지
import { describe, expect, it } from 'vitest';
import { helpFor } from './help.ts';

const ROUTES: [string, string[], string][] = [
  ['home', [], '할 일'],
  ['briefing', [], '수업 후 브리핑'],
  ['briefing', ['texts'], '문구 관리'],
  ['roster', [], '시간표'],
  ['roster', ['classes', 'list'], '시간표'],
  ['roster', ['class', 'x'], '반 상세'],
  ['roster', ['students'], '학생'],
  ['roster', ['student', 'x'], '학생 카드'],
  ['roster', ['waitlist'], '대기자'],
  ['roster', ['waitlist', 'x'], '대기자'],
  ['roster', ['vacancy'], '빈자리'],
  ['roster', ['sim'], '반 편성 시안'],
  ['roster', ['sim', 'x'], '시안 고치기'],
  ['roster', ['sim', 'x', 'apply'], '시안 적용'],
  ['roster', ['sim-compare'], '시안 비교'],
  ['plan', [], '수업 달력'],
  ['makeup', [], '토요 보강데이'],
  ['export', [], '안내 달력 만들기'],
  ['attend', ['2026-11-10'], '출석'],
  ['attend', ['2026-11-10', 'c'], '반 출석'],
  ['settings', [], '설정'],
];

describe('helpFor', () => {
  it.each(ROUTES)('%s %j → %s', (tab, params, title) => {
    const h = helpFor(tab, params);
    expect(h?.title).toBe(title);
    expect(h!.lines.length).toBeGreaterThan(0);
    expect(h!.lines.length).toBeLessThanOrEqual(5);
  });
});
