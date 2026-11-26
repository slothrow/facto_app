// 하린이 이모지 고르기 그룹(SPEC_harin 16장). 주요 과목은 2~3종 이상.
export interface EmojiGroup {
  id: string;
  label: string;
  emojis: string[];
}

export const EMOJI_GROUPS: EmojiGroup[] = [
  { id: 'korean', label: '국어', emojis: ['📖', '✍️', '📝', '📕'] },
  { id: 'english', label: '영어', emojis: ['🔤', '🗣️', '🇬🇧', '🅰️'] },
  { id: 'math', label: '수학', emojis: ['➕', '🔢', '📐', '🧮'] },
  { id: 'activity', label: '학원·활동', emojis: ['🎹', '🎨', '🥋', '🏊', '⚽', '🩰', '🎻', '🧪', '🎤', '🏫'] },
  { id: 'home', label: '집 공부', emojis: ['💻', '🎧', '📚', '📔', '✏️', '🧠'] },
  { id: 'life', label: '생활', emojis: ['🪢', '🚴', '🍪', '🍽️', '🍙', '🍚', '🧸', '📺', '🎮', '🛁', '🪥', '🌙', '😴', '🚶', '🚌', '⭐'] },
];

/** 그룹 안 이모지를 한 줄로 펼친 목록(중복 없음) */
export const ALL_EMOJIS = [...new Set(EMOJI_GROUPS.flatMap((g) => g.emojis))];
