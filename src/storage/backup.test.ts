import { describe, expect, it } from 'vitest';
import { createSeedAppData } from '../data/seedAppData.ts';
import { parseFullBackup, toBackupJson, toFullBackupJson } from './backup.ts';
import { emptyRoster } from './rosterTypes.ts';

describe('백업(학생 데이터 포함)', () => {
  it('학생 데이터까지 내보내고 다시 읽는다', () => {
    const app = createSeedAppData();
    const roster = { ...emptyRoster(), absences: [{ date: '2026-11-10', classId: 'c', studentId: 's' }] };
    const back = parseFullBackup(toFullBackupJson(app, roster));
    expect(back.app).toEqual(app);
    expect(back.roster).toEqual(roster);
  });
  it('3단계 표(진도 기준점·베이직 계획·문구·보낸 기록)도 백업에 들어간다', () => {
    const app = createSeedAppData();
    const roster = {
      ...emptyRoster(),
      progressAnchors: [{ id: 'p', classId: 'c', courseMonth: '2026-12', stage: 'P' as const, unit: 8, memo: null }],
      basicLessons: [{ id: 'b', classId: 'c', date: '2026-12-04', title: '제목', text: '문구' }],
      briefingTexts: [{ code: 'P8-1', text: '첫 줄\n둘째 줄' }],
      briefings: [{ id: 'x', date: '2026-12-01', classId: 'c', studentId: 's', code: 'P8-1', textSnapshot: '첫 줄', sharedAt: '2026-12-01T08:00:00Z' }],
    };
    const json = toFullBackupJson(app, roster);
    for (const k of ['progressAnchors', 'basicLessons', 'briefingTexts', 'briefings']) expect(json).toContain(`"${k}"`);
    const back = parseFullBackup(json);
    expect(back.roster).toEqual(roster);
    expect(back.rosterMissing).toEqual([]);
  });
  it('3단계 전 백업은 새 표를 빈 목록으로 채우고, 빠졌다고 알려 준다(복원 때 지금 문구는 남긴다)', () => {
    const old = JSON.parse(toFullBackupJson(createSeedAppData(), emptyRoster()));
    for (const k of ['progressAnchors', 'basicLessons', 'briefingTexts', 'briefings']) delete old.roster[k];
    const back = parseFullBackup(JSON.stringify(old));
    expect(back.roster?.briefingTexts).toEqual([]);
    expect(back.rosterMissing).toEqual(['progressAnchors', 'basicLessons', 'briefingTexts', 'briefings']);
  });
  it('예전 백업(학생 데이터 없음)도 읽는다', () => {
    const back = parseFullBackup(toBackupJson(createSeedAppData()));
    expect(back.roster).toBeNull();
  });
  it('학생 데이터 형식이 틀리면 알려 준다', () => {
    const bad = JSON.stringify({ ...createSeedAppData(), roster: { classes: [] } });
    expect(() => parseFullBackup(bad)).toThrow(/students/);
  });
});
