import { describe, expect, it } from 'vitest';
import { SEED_KID_CATEGORIES } from '../../engine/harin/seed.ts';
import { HOMEWORK_SUBJECTS } from '../../engine/harin/homework.ts';
import { ALL_EMOJIS, EMOJI_GROUPS } from './emojiGroups.ts';

describe('이모지 그룹', () => {
  it('주요 과목은 3종 이상, 기획서의 아이콘이 모두 들어 있다', () => {
    const by = (id: string) => EMOJI_GROUPS.find((g) => g.id === id)?.emojis ?? [];
    expect(by('korean')).toEqual(expect.arrayContaining(['📖', '✍️', '📝', '📕']));
    expect(by('english')).toEqual(expect.arrayContaining(['🔤', '🗣️', '🇬🇧', '🅰️']));
    expect(by('math')).toEqual(expect.arrayContaining(['➕', '🔢', '📐', '🧮']));
    expect(by('activity')).toEqual(expect.arrayContaining(['🎹', '🎨', '🥋', '🏊', '⚽', '🩰', '🎻', '🧪']));
    expect(by('home')).toEqual(expect.arrayContaining(['💻', '🎧', '📚', '📔', '✏️', '🧠']));
    expect(by('life')).toEqual(expect.arrayContaining(['🪢', '🚴', '🍪', '🍽️', '🧸', '📺', '🎮', '🛁', '🪥', '🌙', '😴', '🚶', '🚌']));
  });

  it('이전 선택기에 있던 이모지도 그대로 고를 수 있다', () => {
    for (const e of ['🎹', '🎻', '🏊', '⚽', '🩰', '🎨', '📚', '🧮', '💻', '🔤', '🥋', '🎤', '🍙', '🍚', '🧸', '✏️', '⭐', '🛁', '📺', '😴']) {
      expect(ALL_EMOJIS).toContain(e);
    }
  });

  it('기본 종류·과목 이모지는 선택기 안에 있다', () => {
    for (const c of SEED_KID_CATEGORIES) expect(ALL_EMOJIS).toContain(c.emoji);
    for (const s of HOMEWORK_SUBJECTS) expect(ALL_EMOJIS).toContain(s.emoji);
  });
});
