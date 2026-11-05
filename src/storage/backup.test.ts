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
  it('예전 백업(학생 데이터 없음)도 읽는다', () => {
    const back = parseFullBackup(toBackupJson(createSeedAppData()));
    expect(back.roster).toBeNull();
  });
  it('학생 데이터 형식이 틀리면 알려 준다', () => {
    const bad = JSON.stringify({ ...createSeedAppData(), roster: { classes: [] } });
    expect(() => parseFullBackup(bad)).toThrow(/students/);
  });
});
