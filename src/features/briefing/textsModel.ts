// 브리핑 문구 저장소(SPEC_briefing 4장). 순수 함수.
import {
  UNITS_PER_STAGE,
  formatUnitCode,
  normalizeUnitCode,
  type CurriculumSettings,
  type StageId,
} from '../../engine/curriculum.ts';
import type { WeekNo } from '../../engine/types.ts';
import type { BriefingTextRow, RosterChange, RosterData } from '../../storage/rosterTypes.ts';
import { parseTable } from '../roster/students/importModel.ts';

export const textMap = (roster: Pick<RosterData, 'briefingTexts'>) => new Map(roster.briefingTexts.map((t) => [t.code, t.text]));

export interface GridCell {
  code: string;
  unit: number;
  weekNo: WeekNo;
  filled: boolean;
}

/** 단원 12 × 주차 4 격자 */
export function stageGrid(stage: StageId, settings: CurriculumSettings, texts: Map<string, string>): GridCell[][] {
  return Array.from({ length: UNITS_PER_STAGE }, (_, i) =>
    ([1, 2, 3, 4] as WeekNo[]).map((w) => {
      const code = formatUnitCode(stage, i + 1, w, settings);
      return { code, unit: i + 1, weekNo: w, filled: Boolean(texts.get(code)?.trim()) };
    }),
  );
}

export const stageFilledCount = (grid: GridCell[][]) => grid.flat().filter((c) => c.filled).length;

/** 문구 저장(빈 문구면 지운다) */
export function saveTextChange(code: string, text: string): RosterChange {
  const row: BriefingTextRow = { code, text };
  return text.trim() ? { upsert: { briefingTexts: [{ code, text: text.replace(/\r\n?/g, '\n').trimEnd() }] } } : { remove: { briefingTexts: [row] } };
}

// ---------------------------------------------------------------
// 일괄 가져오기: 코드, 문구 (문구 안 줄바꿈 유지)
// ---------------------------------------------------------------

export interface TextImportRow {
  line: number;
  code: string | null;
  raw: string;
  text: string;
  error: string | null;
  /** 저장소에 이미 문구가 있음 */
  exists: boolean;
}

const HEADER_CODE = ['코드', '수업코드', 'code'];

export function buildTextImport(
  input: string,
  roster: Pick<RosterData, 'briefingTexts'>,
  settings: CurriculumSettings,
): TextImportRow[] {
  const table = parseTable(input);
  if (table.length === 0) return [];
  const hasHeader = HEADER_CODE.includes((table[0][0] ?? '').replace(/﻿/g, '').replace(/\s/g, '').toLowerCase());
  const existing = textMap(roster);
  const seen = new Set<string>();
  return (hasHeader ? table.slice(1) : table).map((r, i) => {
    const raw = r[0] ?? '';
    // 따옴표로 묶인 칸 안의 줄바꿈은 parseTable이 그대로 둔다. 문구 칸이 여러 개로 쪼개졌으면 다시 합친다
    const text = r.slice(1).join(', ').replace(/\r\n?/g, '\n').trim();
    const row: TextImportRow = { line: i + (hasHeader ? 2 : 1), code: null, raw, text, error: null, exists: false };
    const code = normalizeUnitCode(raw, settings);
    if (!code) return { ...row, error: '코드 형식이 아니에요(예: P1-1)' };
    if (!text) return { ...row, code, error: '문구가 비어 있어요' };
    if (seen.has(code)) return { ...row, code, error: '같은 코드가 위에 이미 있어요' };
    seen.add(code);
    return { ...row, code, exists: Boolean(existing.get(code)?.trim()) };
  });
}

export function textImportChange(rows: TextImportRow[], mode: 'overwrite' | 'skip'): RosterChange {
  const rowsToSave = rows.filter((r) => !r.error && r.code && (mode === 'overwrite' || !r.exists));
  return { upsert: { briefingTexts: rowsToSave.map((r) => ({ code: r.code!, text: r.text })) } };
}
