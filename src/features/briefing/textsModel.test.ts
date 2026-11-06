import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRICULUM } from '../../engine/curriculum.ts';
import { emptyRoster } from '../../storage/rosterTypes.ts';
import { buildTextImport, saveTextChange, stageFilledCount, stageGrid, textImportChange, textMap } from './textsModel.ts';

const roster = { ...emptyRoster(), briefingTexts: [{ code: 'P1-1', text: '있던 문구' }] };

describe('문구 격자', () => {
  it('단원 12 × 주차 4, 채워진 칸 수', () => {
    const grid = stageGrid('P', DEFAULT_CURRICULUM, textMap(roster));
    expect(grid).toHaveLength(12);
    expect(grid[0].map((c) => c.code)).toEqual(['P1-1', 'P1-2', 'P1-3', 'P1-4']);
    expect(grid[11][3].code).toBe('P12-4');
    expect(stageFilledCount(grid)).toBe(1);
  });
  it('빈 문구로 저장하면 지운다', () => {
    expect(saveTextChange('P1-1', '  ')).toEqual({ remove: { briefingTexts: [{ code: 'P1-1', text: '  ' }] } });
    expect(saveTextChange('P1-2', '첫 줄\r\n둘째 줄\n')).toEqual({ upsert: { briefingTexts: [{ code: 'P1-2', text: '첫 줄\n둘째 줄' }] } });
  });
});

describe('문구 일괄 가져오기', () => {
  it('엑셀 붙여넣기(탭): 따옴표 안 줄바꿈 유지, 코드 정리, 머리글 건너뜀', () => {
    const input = '코드\t문구\np1-2\t"오늘은 도형을 배웠어요.\n집에서도 칭찬해 주세요!"\nP1-3\t한 줄 문구';
    const rows = buildTextImport(input, roster, DEFAULT_CURRICULUM);
    expect(rows.map((r) => [r.line, r.code, r.text, r.error])).toEqual([
      [2, 'P1-2', '오늘은 도형을 배웠어요.\n집에서도 칭찬해 주세요!', null],
      [3, 'P1-3', '한 줄 문구', null],
    ]);
  });
  it('CSV 쉼표: 따옴표 없이 문구에 쉼표가 있으면 다시 합친다', () => {
    const rows = buildTextImport('K1-1,안녕하세요, 어머님', roster, DEFAULT_CURRICULUM);
    expect(rows[0]).toMatchObject({ code: 'K1-1', text: '안녕하세요, 어머님', error: null });
  });
  it('형식 오류·빈 문구·중복 줄 표시', () => {
    const rows = buildTextImport('X1-1,문구\nP13-1,문구\nP2-1,\nP2-2,a\nP2-2,b', roster, DEFAULT_CURRICULUM);
    expect(rows.map((r) => r.error)).toEqual([
      '코드 형식이 아니에요(예: P1-1)',
      '코드 형식이 아니에요(예: P1-1)',
      '문구가 비어 있어요',
      null,
      '같은 코드가 위에 이미 있어요',
    ]);
  });
  it('이미 있는 코드: 덮어쓰기 / 건너뛰기', () => {
    const rows = buildTextImport('P1-1,새 문구\nP1-4,다른 문구', roster, DEFAULT_CURRICULUM);
    expect(rows[0].exists).toBe(true);
    expect(textImportChange(rows, 'overwrite').upsert?.briefingTexts?.map((t) => t.code)).toEqual(['P1-1', 'P1-4']);
    expect(textImportChange(rows, 'skip').upsert?.briefingTexts?.map((t) => t.code)).toEqual(['P1-4']);
  });
});
