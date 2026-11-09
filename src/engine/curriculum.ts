// 교육과정 진도 계산(SPEC_briefing 2·3장). 순수 함수.
// 입력은 회차 엔진 결과(그 날짜의 수업월·주차)와 반의 진도 기준점. 달력월이 아니라 수업월 기준으로 센다.
import { monthIndex } from './label.ts';
import type { SessionLabel, WeekNo } from './types.ts';

/** 교육과정 단계. 순서 고정 */
export type StageId = 'basic' | 'K' | 'P' | 'A' | 'B' | 'S';
export const STAGES: StageId[] = ['basic', 'K', 'P', 'A', 'B', 'S'];
/** 단원(1~12)이 있는 단계. 베이직은 날짜별 수업 계획을 써서 자동 진행하지 않는다(SPEC 2.1) */
export const UNIT_STAGES: StageId[] = ['K', 'P', 'A', 'B', 'S'];
export const UNITS_PER_STAGE = 12;

export const STAGE_NAMES: Record<StageId, string> = { basic: '베이직', K: 'K', P: 'P', A: 'A', B: 'B', S: 'S' };

export interface StageSetting {
  /** 코드 앞 글자(예: P → P1-1). 베이직은 코드가 없어 쓰지 않는다 */
  prefix: string;
  /** 기본 매칭 학년(학년 코드: 4=5세 … 9=초3) */
  gradeCode: number | null;
}
export type CurriculumSettings = Record<StageId, StageSetting>;

export const DEFAULT_CURRICULUM: CurriculumSettings = {
  basic: { prefix: '베이직', gradeCode: 4 },
  K: { prefix: 'K', gradeCode: 5 },
  P: { prefix: 'P', gradeCode: 6 },
  A: { prefix: 'A', gradeCode: 7 },
  B: { prefix: 'B', gradeCode: 8 },
  S: { prefix: 'S', gradeCode: 9 },
};

/** 저장된 설정(없거나 일부만 있을 수 있음)에 기본값을 채운다 */
export function withCurriculumDefaults(saved?: Partial<Record<StageId, Partial<StageSetting>>> | null): CurriculumSettings {
  const out = {} as CurriculumSettings;
  for (const s of STAGES) out[s] = { ...DEFAULT_CURRICULUM[s], ...(saved?.[s] ?? {}) };
  return out;
}

export interface ProgressAnchor {
  courseMonth: string;
  stage: StageId;
  /** 베이직이면 null */
  unit: number | null;
  /**
   * 그 수업월 1회차의 주차(1~4). 예: 단원 1·주차 3 = 1회차 B1-3 → 2회차 B1-4 → 3회차 B2-1.
   * 없으면 1(수업월과 단원이 딱 맞음)
   */
  unitWeek?: number | null;
}

export type Progress =
  | { kind: 'unset' }
  | { kind: 'done' }
  | { kind: 'basic' }
  | { kind: 'unit'; stage: StageId; unit: number; /** 물어본 회차의 수업 주차 */ week: WeekNo };

const WEEKS_PER_UNIT = 4;

/**
 * 수업월 M·주차 W 회차의 진도: M 이하인 가장 최근 기준점에서 회차마다 한 주씩 나아간다(3.2).
 * 기준점 주차가 1이면 수업월마다 단원 +1, 주차가 W이면 W만큼 앞선 자리에서 센다.
 * 주차를 안 주면 그 수업월 1회차 기준.
 */
export function progressAt(anchors: ProgressAnchor[], courseMonth: string, weekNo: WeekNo = 1): Progress {
  const anchor = anchors
    .filter((a) => a.courseMonth <= courseMonth)
    .sort((a, b) => b.courseMonth.localeCompare(a.courseMonth))[0];
  if (!anchor) return { kind: 'unset' };
  if (anchor.stage === 'basic' || anchor.unit === null) return { kind: 'basic' };
  const startWeek = Math.min(Math.max(anchor.unitWeek ?? 1, 1), WEEKS_PER_UNIT);
  // 단계 처음(1단원 1주)부터 몇 번째 수업인지
  const n =
    (anchor.unit - 1) * WEEKS_PER_UNIT +
    (startWeek - 1) +
    (monthIndex(courseMonth) - monthIndex(anchor.courseMonth)) * WEEKS_PER_UNIT +
    (weekNo - 1);
  const perStage = UNITS_PER_STAGE * WEEKS_PER_UNIT;
  const stageIndex = UNIT_STAGES.indexOf(anchor.stage) + Math.floor(n / perStage);
  if (stageIndex >= UNIT_STAGES.length) return { kind: 'done' };
  const inStage = n % perStage;
  return {
    kind: 'unit',
    stage: UNIT_STAGES[stageIndex],
    unit: Math.floor(inStage / WEEKS_PER_UNIT) + 1,
    week: ((inStage % WEEKS_PER_UNIT) + 1) as WeekNo,
  };
}

export type CodeResult =
  /** 그날 그 요일 회차가 없음(공휴일·휴원·비움) */
  | { kind: 'noSession' }
  | ({ kind: 'unset' } & SessionLabel)
  | ({ kind: 'done' } & SessionLabel)
  /** 베이직: 코드 없음. 그 날짜의 베이직 수업 계획을 쓴다 */
  | ({ kind: 'basic' } & SessionLabel)
  | ({ kind: 'code'; code: string; stage: StageId; unit: number } & SessionLabel);

export const formatUnitCode = (stage: StageId, unit: number, weekNo: WeekNo, settings: CurriculumSettings = DEFAULT_CURRICULUM) =>
  `${settings[stage].prefix}${unit}-${weekNo}`;

/** 단계·단원 짧은 표시(예: "P9", "베이직"). 수업월 1회차가 단원 중간이면 "B1-3"처럼 주차까지 */
export function formatProgress(p: Progress, settings: CurriculumSettings = DEFAULT_CURRICULUM): string {
  if (p.kind === 'unset') return '진도 미설정';
  if (p.kind === 'done') return '과정 완료';
  if (p.kind === 'basic') return STAGE_NAMES.basic;
  return `${settings[p.stage].prefix}${p.unit}${p.week !== 1 ? `-${p.week}` : ''}`;
}

/** 기준점 표시(예: "B1-3", "베이직") */
export function formatAnchor(
  a: Pick<ProgressAnchor, 'stage' | 'unit' | 'unitWeek'>,
  settings: CurriculumSettings = DEFAULT_CURRICULUM,
): string {
  if (a.stage === 'basic' || a.unit === null) return STAGE_NAMES.basic;
  return `${settings[a.stage].prefix}${a.unit}-${a.unitWeek ?? 1}`;
}

/** 그 날짜 회차(엔진 결과)와 기준점으로 수업 코드를 구한다 */
export function codeFor(
  anchors: ProgressAnchor[],
  session: SessionLabel | null | undefined,
  settings: CurriculumSettings = DEFAULT_CURRICULUM,
): CodeResult {
  if (!session) return { kind: 'noSession' };
  const label = { courseMonth: session.courseMonth, weekNo: session.weekNo };
  const p = progressAt(anchors, session.courseMonth, session.weekNo);
  if (p.kind === 'unit') {
    return { kind: 'code', code: formatUnitCode(p.stage, p.unit, p.week, settings), stage: p.stage, unit: p.unit, ...label };
  }
  return { kind: p.kind, ...label };
}

/** "P8-1" → 단계·단원·주차. 접두어가 겹치면 긴 것부터 본다. 형식이 틀리면 null */
export function parseUnitCode(
  code: string,
  settings: CurriculumSettings = DEFAULT_CURRICULUM,
): { stage: StageId; unit: number; weekNo: WeekNo } | null {
  const t = code.trim().toUpperCase();
  const stages = UNIT_STAGES.filter((s) => settings[s].prefix.trim()).sort(
    (a, b) => settings[b].prefix.length - settings[a].prefix.length,
  );
  for (const stage of stages) {
    const prefix = settings[stage].prefix.trim().toUpperCase();
    if (!t.startsWith(prefix)) continue;
    const m = /^(\d{1,2})-([1-4])$/.exec(t.slice(prefix.length));
    if (!m) continue;
    const unit = Number(m[1]);
    if (unit < 1 || unit > UNITS_PER_STAGE) continue;
    return { stage, unit, weekNo: Number(m[2]) as WeekNo };
  }
  return null;
}

/** 코드를 표준 표기로(소문자·공백 정리). 형식이 틀리면 null */
export function normalizeUnitCode(code: string, settings: CurriculumSettings = DEFAULT_CURRICULUM): string | null {
  const p = parseUnitCode(code, settings);
  return p ? formatUnitCode(p.stage, p.unit, p.weekNo, settings) : null;
}

/** 학년 → 기본 매칭 단계. 없으면 null */
export function stageForGrade(gradeCode: number | null, settings: CurriculumSettings = DEFAULT_CURRICULUM): StageId | null {
  if (gradeCode === null) return null;
  return STAGES.find((s) => settings[s].gradeCode === gradeCode) ?? null;
}

/** 입력값으로 단계 찾기("P", "베이직", "basic" 등) */
export function stageFromText(text: string, settings: CurriculumSettings = DEFAULT_CURRICULUM): StageId | null {
  const t = text.trim().toUpperCase();
  if (!t) return null;
  if (t === '베이직' || t === 'BASIC' || t === settings.basic.prefix.trim().toUpperCase()) return 'basic';
  return UNIT_STAGES.find((s) => s === t || settings[s].prefix.trim().toUpperCase() === t) ?? null;
}
