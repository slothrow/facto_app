import { describe, expect, it } from 'vitest';
import { emptyRoster } from '../../storage/rosterTypes.ts';
import { blankStudent } from '../roster/students/studentModel.ts';
import { callNameChange, callNameList, cardStatus, personalText } from './personalModel.ts';
import { buildTextImport, saveTextChange, stageFilledCount, stageGrid, textImportChange, textMap } from './textsModel.ts';
import { DEFAULT_CURRICULUM } from '../../engine/curriculum.ts';

const st = (id: string, name: string, extra = {}) => ({ ...blankStudent(name, '2026-11-01'), id, ...extra });

describe('부르는 이름', () => {
  it('목록: 퇴원 제외, 이름순, 자동값(최하솜 → 하솜이)', () => {
    const roster = { ...emptyRoster(), students: [st('b', '최하솜'), st('a', '김선우', { callName: '선우야' }), st('c', '박퇴원', { status: 'left' })] };
    expect(callNameList(roster).map((x) => [x.student.name, x.callName, x.custom])).toEqual([
      ['김선우', '선우야', true],
      ['최하솜', '하솜이', false],
    ]);
  });
  it('저장: 비우거나 자동값과 같으면 null', () => {
    const s = st('a', '최하솜');
    expect(callNameChange(s, '하솜이').upsert!.students![0].callName).toBeNull();
    expect(callNameChange(s, '  ').upsert!.students![0].callName).toBeNull();
    expect(callNameChange(s, ' 솜이 ').upsert!.students![0].callName).toBe('솜이');
  });
});

describe('아이 카드 상태', () => {
  const s = st('a', '최하솜');
  it('완성 문장: 부르는 이름 + 조사, 아이별 수정이 있으면 그 문장', () => {
    expect(personalText('{이름}는 오늘 잘했어요', s, undefined).text).toBe('하솜이는 오늘 잘했어요');
    expect(personalText('{이름}는', s, undefined).parts[0]).toEqual({ text: '하솜이', isName: true });
    expect(personalText('{이름}는', s, { override: '직접 쓴 문장' }).text).toBe('직접 쓴 문장');
  });
  it('확인 → 문장이 바뀌면 다시 확인 전, 보냄이 가장 우선', () => {
    expect(cardStatus('A', undefined, null)).toBe('pending');
    expect(cardStatus('A', { confirmedText: 'A' }, null)).toBe('confirmed');
    expect(cardStatus('B', { confirmedText: 'A' }, null)).toBe('pending');
    const sent = { id: 'x', date: '2027-01-05', classId: 'c', studentId: 'a', kind: 'personal' as const, code: 'P1-1', textSnapshot: 'A', sharedAt: '' };
    expect(cardStatus('B', undefined, sent)).toBe('sent');
  });
});

describe('개인 문구 저장소', () => {
  const roster = { ...emptyRoster(), briefingTexts: [{ code: 'P1-1', text: '전체' }], personalBriefingTexts: [{ code: 'P1-2', text: '{이름}는' }] };
  it('격자는 고른 저장소 기준', () => {
    expect(stageFilledCount(stageGrid('P', DEFAULT_CURRICULUM, textMap(roster, 'personalBriefingTexts')))).toBe(1);
    expect(textMap(roster, 'personalBriefingTexts').get('P1-2')).toBe('{이름}는');
  });
  it('저장·일괄 가져오기가 개인 문구로 간다({이름} 유지)', () => {
    expect(saveTextChange('P1-3', '{이름}가 웃었어요', 'personalBriefingTexts')).toEqual({ upsert: { personalBriefingTexts: [{ code: 'P1-3', text: '{이름}가 웃었어요' }] } });
    const rows = buildTextImport('P1-2,{이름}는 새 문구\nP1-1,{이름}와 함께', roster, DEFAULT_CURRICULUM, 'personalBriefingTexts');
    expect(rows.map((r) => r.exists)).toEqual([true, false]);
    expect(textImportChange(rows, 'skip', 'personalBriefingTexts')).toEqual({ upsert: { personalBriefingTexts: [{ code: 'P1-1', text: '{이름}와 함께' }] } });
  });
});
