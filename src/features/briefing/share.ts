// 카톡 보내기 도우미(SPEC_briefing 5.2). 브라우저 기능만 쓴다(추가 라이브러리 없음).
// 순서: ① 카톡 검색어를 클립보드에 복사 → ② 공유 창(navigator.share, 텍스트만) → 카톡 선택 → 검색창에 붙여넣기 추천 탭.

export type ShareOutcome = 'shared' | 'cancelled' | 'blocked' | 'unsupported';

export const canShare = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function';

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * 공유 창 열기. 공유 대상(카톡)을 고르면 'shared', 창을 닫으면 'cancelled'.
 * 'blocked' = 브라우저가 "사용자가 누른 직후가 아니다"로 막음(복사 뒤 공유가 한 번의 탭으로 안 되는 경우).
 */
/**
 * 공유 창에 넘길 내용. 안드로이드 크롬은 title을 안 주면 빈 제목(EXTRA_SUBJECT "")을 같이 넘기고,
 * 카톡은 그 빈 제목을 한 줄로 붙여 메시지 끝에 빈 줄이 생긴다.
 * 크롬은 title이 보낼 글과 똑같으면 제목을 아예 넘기지 않는다(ShareHelper: text와 title이 같으면 EXTRA_SUBJECT 생략).
 */
export function sharePayload(text: string): ShareData {
  const body = text.replace(/\r\n?/g, '\n').trim();
  return { title: body, text: body };
}

export async function shareText(text: string): Promise<ShareOutcome> {
  if (!canShare()) return 'unsupported';
  try {
    await navigator.share(sharePayload(text));
    return 'shared';
  } catch (e) {
    const name = e instanceof DOMException ? e.name : '';
    if (name === 'AbortError') return 'cancelled';
    if (name === 'NotAllowedError') return 'blocked';
    throw e;
  }
}

// 한 번의 탭(복사+공유)이 이 기기에서 막히면 [이름 복사] [공유] 두 버튼으로 나눈다. 기기마다 기억한다.
const TWO_STEP_KEY = 'facto-app:briefing:twoStep';

export function loadTwoStep(): boolean {
  try {
    return window.localStorage.getItem(TWO_STEP_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveTwoStep(on: boolean) {
  try {
    if (on) window.localStorage.setItem(TWO_STEP_KEY, '1');
    else window.localStorage.removeItem(TWO_STEP_KEY);
  } catch {
    /* 저장이 안 돼도 이번 화면에서는 적용된다 */
  }
}
