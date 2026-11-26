import { describe, expect, it } from 'vitest';
import { createSeedAppData } from '../data/seedAppData.ts';
import { parseFullBackup, toBackupJson, toFullBackupJson } from './backup.ts';
import { emptyRoster } from './rosterTypes.ts';
import { rosterToDb } from './rosterRepository.ts';

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
  it('5단계 표(출석 확인·할 일·할 일 상태·반복 할 일)도 백업에 들어가고, 예전 백업엔 빠졌다고 알려 준다', () => {
    const app = createSeedAppData();
    const roster = {
      ...emptyRoster(),
      attendanceChecks: [{ date: '2026-11-10', classId: 'c', checkedAt: '2026-11-10T08:00:00Z' }],
      tasks: [{ id: 't', title: '전단지', dueDate: '2026-11-20', memo: null, category: null, createdAt: '2026-11-10T00:00:00Z' }],
      taskStates: [{ taskKey: 'manual:t', status: 'done' as const, snoozeUntil: null, memo: '끝', doneAt: '2026-11-10T00:00:00Z' }],
      taskTemplates: [{ id: 'tp', title: '교육비', description: null, category: '운영' as const, recurrence: { type: 'monthly' as const, day: 'last' as const }, leadDays: 3, enabled: true, sort: 1, memo: null }],
    };
    const back = parseFullBackup(toFullBackupJson(app, roster));
    expect(back.roster).toEqual(roster);
    expect(back.rosterMissing).toEqual([]);
    const old = JSON.parse(toFullBackupJson(app, roster));
    for (const k of ['attendanceChecks', 'tasks', 'taskStates', 'taskTemplates']) delete old.roster[k];
    const oldBack = parseFullBackup(JSON.stringify(old));
    expect(oldBack.rosterMissing).toEqual(['attendanceChecks', 'tasks', 'taskStates', 'taskTemplates']);
    expect(oldBack.roster?.tasks).toEqual([]);
  });

  it('7단계 하린이 시간표 표도 백업에 들어가고(DB 이름도 kid_*), 예전 백업엔 빠졌다고 알려 준다', () => {
    const app = createSeedAppData();
    const roster = {
      ...emptyRoster(),
      kidTimetables: [{ id: 't', name: '2학기', memo: null, isMain: true, sort: 1 }],
      kidCategories: [{ id: 'c', name: '식사', color: '#fed7aa', emoji: '🍚', isTravel: false, isActivity: false, defaultMinutes: 30, sort: 1 }],
      kidActivities: [{ id: 'a', name: '피아노', emoji: '🎹', color: '#fbcfe8', place: null, memo: null, travelMinutes: 20, isHome: false, sort: 1 }],
      kidBlocks: [{ id: 'b', timetableId: 't', weekday: 1, startTime: '15:00', endTime: '15:50', categoryId: 'c', activityId: 'a', title: null, memo: null, travelBeforeOverride: 0, travelAfterOverride: null }],
    };
    const back = parseFullBackup(toFullBackupJson(app, roster));
    expect(back.roster).toEqual(roster);
    const db = rosterToDb(roster);
    expect(db.kid_blocks[0]).toMatchObject({ timetable_id: 't', start_time: '15:00', travel_before_override: 0 });
    expect(Object.keys(db)).toEqual(expect.arrayContaining(['kid_timetables', 'kid_categories', 'kid_activities', 'kid_blocks']));
    const old = JSON.parse(toFullBackupJson(app, roster));
    for (const k of ['kidTimetables', 'kidCategories', 'kidActivities', 'kidBlocks']) delete old.roster[k];
    expect(parseFullBackup(JSON.stringify(old)).rosterMissing).toEqual(['kidTimetables', 'kidCategories', 'kidActivities', 'kidBlocks']);
  });

  it('8단계 숙제·숙제 체크·개선 요청도 백업에 들어가고(DB 이름 변환), 예전 백업엔 빠졌다고 알려 준다', () => {
    const app = createSeedAppData();
    const roster = {
      ...emptyRoster(),
      kidHomeworks: [
        { id: 'h', name: '영어 숙제', subject: 'english' as const, emoji: '🔤', minutes: 20, memo: null, active: true, repeatType: 'academy' as const, weekdays: null, activityId: 'a', dueRule: 'day_before' as const, dueDate: null, sort: 1 },
      ],
      kidHomeworkChecks: [{ date: '2026-12-01', homeworkId: 'h', doneAt: '2026-12-01T10:00:00Z' }],
      devRequests: [{ id: 'd', text: '버튼을 크게\n두 줄', done: false, doneAt: null, sort: 1, createdAt: '2026-11-26T00:00:00Z' }],
    };
    const back = parseFullBackup(toFullBackupJson(app, roster));
    expect(back.roster).toEqual(roster);
    expect(back.rosterMissing).toEqual([]);
    const db = rosterToDb(roster);
    expect(db.kid_homeworks[0]).toMatchObject({ repeat_type: 'academy', activity_id: 'a', due_rule: 'day_before' });
    expect(db.kid_homework_checks[0]).toMatchObject({ homework_id: 'h', date: '2026-12-01' });
    expect(db.dev_requests[0]).toMatchObject({ text: '버튼을 크게\n두 줄', done: false });
    const old = JSON.parse(toFullBackupJson(app, roster));
    for (const k of ['kidHomeworks', 'kidHomeworkChecks', 'devRequests']) delete old.roster[k];
    expect(parseFullBackup(JSON.stringify(old)).rosterMissing).toEqual(['kidHomeworks', 'kidHomeworkChecks', 'devRequests']);
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
