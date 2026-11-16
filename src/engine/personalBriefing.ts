// 개인브리핑: 부르는 이름과 {이름} 치환(docs/SPEC_personal_briefing.md 3장, 8장). UI·DB와 분리된 순수 함수.

export const NAME_SLOT = '{이름}';

const HANGUL_FIRST = 0xac00;
const HANGUL_LAST = 0xd7a3;
/** 종성 번호 8 = ㄹ */
const JONG_RIEUL = 8;

/** 한글 음절의 종성 번호(0 = 받침 없음). 한글이 아니면 null */
function jongOf(ch: string | undefined): number | null {
  if (!ch) return null;
  const code = ch.charCodeAt(0);
  if (code < HANGUL_FIRST || code > HANGUL_LAST) return null;
  return (code - HANGUL_FIRST) % 28;
}

/** 마지막 글자에 받침이 있는가(한글이 아니면 false) */
export function hasBatchim(word: string): boolean {
  const j = jongOf([...word.trim()].pop());
  return j !== null && j !== 0;
}

/**
 * 자동 부르는 이름(3.1): 3글자 → 앞 1글자(성) 빼기, 4글자 → 앞 2글자 빼기, 그 밖은 그대로.
 * 남은 이름이 받침으로 끝나면 "이"를 붙인다. 예: 최하솜 → 하솜이, 김선우 → 선우, 이안 → 이안이
 */
export function defaultCallName(name: string): string {
  const chars = [...name.replace(/\s/g, '')];
  if (chars.length === 0) return '';
  const given = chars.length === 3 ? chars.slice(1) : chars.length === 4 ? chars.slice(2) : chars;
  const base = given.join('');
  return hasBatchim(base) ? `${base}이` : base;
}

/** 학생 정보에 저장된 부르는 이름, 없으면 자동값 */
export function callNameOf(s: { name: string; callName?: string | null }): string {
  return s.callName?.trim() || defaultCallName(s.name);
}

// 모음으로 끝나는 이름을 기준으로 쓴 조사 → 받침 있는 이름일 때 바꿀 조사. 긴 것부터 맞춘다
const PARTICLES: [string, string][] = [
  ['예요', '이에요'],
  ['는', '은'],
  ['가', '이'],
  ['를', '을'],
  ['와', '과'],
  ['로', '으로'],
];

export interface PersonalPart {
  text: string;
  /** 이름이 들어간 부분(화면에서 강조) */
  isName: boolean;
}

/** {이름} 치환 결과를 조각으로(이름 부분 강조용). 조사 보정은 이름 바로 뒤 글자에만 */
export function renderPersonalParts(template: string, callName: string): PersonalPart[] {
  const name = callName.trim();
  const jong = jongOf([...name].pop());
  const batchim = jong !== null && jong !== 0;
  const pieces = template.split(NAME_SLOT);
  const parts: PersonalPart[] = [];
  pieces.forEach((piece, i) => {
    let rest = piece;
    if (i > 0) {
      parts.push({ text: name, isName: true });
      if (batchim) {
        for (const [from, to] of PARTICLES) {
          if (!rest.startsWith(from)) continue;
          if (from === '로' && jong === JONG_RIEUL) break; // ㄹ 받침은 "로" 그대로(예: 하늘로)
          rest = to + rest.slice(from.length);
          break;
        }
      }
    }
    if (rest) parts.push({ text: rest, isName: false });
  });
  return parts;
}

/** {이름}을 부르는 이름으로 바꾸고 조사를 맞춘다(3.2). {이름}이 여러 번이어도 모두 바꾼다 */
export function renderPersonal(template: string, callName: string): string {
  return renderPersonalParts(template, callName)
    .map((p) => p.text)
    .join('');
}

export const hasNameSlot = (template: string) => template.includes(NAME_SLOT);
