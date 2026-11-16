import { describe, expect, it } from 'vitest';
import { sharePayload } from './share.ts';

describe('공유 내용', () => {
  it('보낼 글만 넘기고 앞뒤 공백·줄바꿈을 정리한다', () => {
    expect(sharePayload('  하솜이는 오늘\r\n잘했어요\n')).toEqual({ text: '하솜이는 오늘\n잘했어요' });
  });
});
