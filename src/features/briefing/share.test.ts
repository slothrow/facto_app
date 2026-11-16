import { describe, expect, it } from 'vitest';
import { sharePayload } from './share.ts';

describe('공유 내용', () => {
  it('제목을 보낼 글과 똑같이 넣어 크롬이 빈 제목을 넘기지 않게 한다(카톡 끝 빈 줄 방지), 앞뒤 공백 정리', () => {
    expect(sharePayload('  하솜이는 오늘\r\n잘했어요\n')).toEqual({ title: '하솜이는 오늘\n잘했어요', text: '하솜이는 오늘\n잘했어요' });
  });
});
