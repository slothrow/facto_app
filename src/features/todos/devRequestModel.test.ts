import { describe, expect, it } from 'vitest';
import type { DevRequestRow } from '../../storage/rosterTypes.ts';
import { authorLabel, copyText, editText, makeRequest, sortRequests, toggleDone } from './devRequestModel.ts';

// 시간대와 상관없이 같은 날짜가 나오도록 이 기기 기준 한낮으로 만든다
const at = (m: number, d: number) => new Date(2026, m - 1, d, 12, 0, 0);
const row = (over: Partial<DevRequestRow>): DevRequestRow => ({
  id: over.id ?? 'r',
  text: '글',
  done: false,
  doneAt: null,
  sort: 1,
  createdBy: 'me',
  createdAt: at(11, 26).toISOString(),
  ...over,
});

describe('개선 요청 메모', () => {
  it('안 한 것은 쓴 순서, 완료한 것은 아래로(완료한 순서)', () => {
    const list = [
      row({ id: 'a', sort: 1, done: true, doneAt: at(11, 27).toISOString() }),
      row({ id: 'b', sort: 2 }),
      row({ id: 'c', sort: 3, done: true, doneAt: at(11, 26).toISOString() }),
      row({ id: 'd', sort: 4 }),
    ];
    expect(sortRequests(list).map((r) => r.id)).toEqual(['b', 'd', 'c', 'a']);
  });

  it('새 항목은 맨 아래, 빈 글은 만들지 않고, 줄바꿈은 그대로 둔다', () => {
    const list = [row({ id: 'a', sort: 5 })];
    const r = makeRequest(list, '  첫 줄\n둘째 줄  ', at(11, 26), 'me');
    expect(r).toMatchObject({ text: '첫 줄\n둘째 줄', done: false, sort: 6, createdBy: 'me' });
    expect(makeRequest(list, '   \n ', at(11, 26), 'me')).toBeNull();
  });

  it('완료 체크는 완료 시각을 남기고, 다시 누르면 지운다', () => {
    const done = toggleDone(row({}), at(11, 27));
    expect(done.done).toBe(true);
    expect(done.doneAt).toBe(at(11, 27).toISOString());
    expect(toggleDone(done, at(11, 28))).toMatchObject({ done: false, doneAt: null });
  });

  it('고치기: 바뀐 글만 새 행, 빈 글·같은 글은 null', () => {
    const r = row({ text: '원래' });
    expect(editText(r, ' 새 글 ')).toMatchObject({ text: '새 글' });
    expect(editText(r, '원래')).toBeNull();
    expect(editText(r, '   ')).toBeNull();
  });

  it('[전체 복사]: 안 한 항목만 "- 내용(작성일)", 여러 줄은 들여쓰기', () => {
    const list = [
      row({ id: 'a', text: '하린 주간 글씨를 크게', sort: 1, createdAt: at(11, 26).toISOString() }),
      row({ id: 'b', text: '끝낸 일', sort: 2, done: true, doneAt: at(11, 27).toISOString() }),
      row({ id: 'c', text: '출석 화면\n- 결석 버튼을 위로\n- 색을 진하게', sort: 3, createdAt: at(12, 1).toISOString() }),
    ];
    expect(copyText(list)).toBe('- 하린 주간 글씨를 크게(11/26)\n- 출석 화면\n  - 결석 버튼을 위로\n  - 색을 진하게(12/1)');
    expect(copyText([row({ done: true })])).toBe('');
  });

  it('작성자: 내 글은 나, 남의 글은 다른 사람', () => {
    expect(authorLabel(row({ createdBy: 'me' }), 'me')).toBe('나');
    expect(authorLabel(row({ createdBy: 'other' }), 'me')).toBe('다른 사람');
    expect(authorLabel(row({ createdBy: null }), null)).toBe('나');
  });
});
