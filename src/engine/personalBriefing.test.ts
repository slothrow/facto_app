import { describe, expect, it } from 'vitest';
import { callNameOf, defaultCallName, hasBatchim, hasNameSlot, renderPersonal, renderPersonalParts } from './personalBriefing.ts';

describe('defaultCallName (SPEC_personal_briefing 3.1)', () => {
  it.each([
    ['최하솜', '하솜이'],
    ['김선우', '선우'],
    ['김리원', '리원이'],
    ['이안', '이안이'],
    ['남궁민수', '민수'],
  ])('%s → %s', (name, expected) => {
    expect(defaultCallName(name)).toBe(expected);
  });

  it('공백은 무시하고, 빈 이름은 빈 값', () => {
    expect(defaultCallName(' 최 하솜 ')).toBe('하솜이');
    expect(defaultCallName('')).toBe('');
  });

  it('직접 고친 값이 있으면 그 값을 쓴다', () => {
    expect(callNameOf({ name: '최하솜', callName: '솜솜이' })).toBe('솜솜이');
    expect(callNameOf({ name: '최하솜', callName: '  ' })).toBe('하솜이');
    expect(callNameOf({ name: '최하솜' })).toBe('하솜이');
  });

  it('받침 판정', () => {
    expect(hasBatchim('솜')).toBe(true);
    expect(hasBatchim('우')).toBe(false);
    expect(hasBatchim('Amy')).toBe(false);
  });
});

describe('renderPersonal (3.2 조사 보정)', () => {
  it('SPEC 예시', () => {
    expect(renderPersonal('{이름}는 오늘', '하솜이')).toBe('하솜이는 오늘');
    expect(renderPersonal('{이름}는 오늘', '별님')).toBe('별님은 오늘');
    expect(renderPersonal('찾아보는 {이름}입니다', '선우')).toBe('찾아보는 선우입니다');
  });

  it('받침 있는 이름: 는→은, 가→이, 를→을, 와→과, 예요→이에요, 로→으로', () => {
    const t = '{이름}는/{이름}가/{이름}를/{이름}와/{이름}예요/{이름}로';
    expect(renderPersonal(t, '별님')).toBe('별님은/별님이/별님을/별님과/별님이에요/별님으로');
    expect(renderPersonal(t, '선우')).toBe('선우는/선우가/선우를/선우와/선우예요/선우로');
  });

  it('ㄹ 받침은 "로" 그대로, 다른 조사는 보정', () => {
    expect(renderPersonal('{이름}로 불러요, {이름}는', '하늘')).toBe('하늘로 불러요, 하늘은');
  });

  it('{이름}이 여러 번 나와도 모두 바꾼다', () => {
    expect(renderPersonal('{이름}가 웃었어요. {이름}는 최고!', '하솜이')).toBe('하솜이가 웃었어요. 하솜이는 최고!');
  });

  it('{이름}이 없으면 문구 그대로', () => {
    expect(renderPersonal('오늘 수업 잘했어요', '선우')).toBe('오늘 수업 잘했어요');
    expect(hasNameSlot('오늘')).toBe(false);
    expect(hasNameSlot('{이름}는')).toBe(true);
  });

  it('이름 부분을 조각으로 표시', () => {
    expect(renderPersonalParts('{이름}는 오늘', '별님')).toEqual([
      { text: '별님', isName: true },
      { text: '은 오늘', isName: false },
    ]);
  });
});
