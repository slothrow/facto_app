// SPEC_home 6장 할 일 테스트(자동 할 일·나누기)
import { describe, expect, it } from 'vitest';
import type { TaskStateRow } from '../../storage/rosterTypes.ts';
import { buildAutoTasks, type AutoTaskInput } from './autoTasks.ts';
import { bucketize, nextMonday } from './bucketize.ts';
import type { Task } from './types.ts';

const base = (over: Partial<AutoTaskInput> = {}): AutoTaskInput => ({
  nowMinutes: 12 * 60,
  exportStartMonths: [],
  confirmedMonths: ['2026-12', '2027-01', '2027-02'],
  progressMissing: 0,
  todayClasses: [],
  trials: [],
  counseling: [],
  waitlist: [],
  needsReview: 0,
  availabilityMissing: 0,
  returning: [],
  lastBackupAt: '2026-11-01T10:00:00Z',
  ...over,
});
const keys = (ts: Task[]) => ts.map((t) => t.key);

describe('calendar_export', () => {
  it('11월 19일엔 없음, 20일엔 있음, 12·1월 안내 달력을 내보내면 사라짐', () => {
    expect(keys(buildAutoTasks('2026-11-19', base()))).not.toContain('auto:calendar_export:2026-12');
    expect(keys(buildAutoTasks('2026-11-20', base()))).toContain('auto:calendar_export:2026-12');
    expect(keys(buildAutoTasks('2026-11-20', base({ exportStartMonths: ['2026-12'] })))).not.toContain('auto:calendar_export:2026-12');
  });
  it('11·12월 안내 달력도 12월이 들어가 있으니 해결', () => {
    expect(keys(buildAutoTasks('2026-11-25', base({ exportStartMonths: ['2026-11'] })))).not.toContain('auto:calendar_export:2026-12');
  });
  it('끄면 안 뜨고, 시작일을 바꿀 수 있다', () => {
    expect(keys(buildAutoTasks('2026-11-25', base(), { calendar_export: { enabled: false } }))).not.toContain('auto:calendar_export:2026-12');
    expect(keys(buildAutoTasks('2026-11-10', base(), { calendar_export: { params: { day: 10 } } }))).toContain('auto:calendar_export:2026-12');
  });
});

describe('month_confirm · backup', () => {
  it('15일부터 다음 달 미확정이면', () => {
    const input = base({ confirmedMonths: [] });
    expect(keys(buildAutoTasks('2026-11-14', input))).not.toContain('auto:month_confirm:2026-12');
    expect(keys(buildAutoTasks('2026-11-15', input))).toContain('auto:month_confirm:2026-12');
  });
  it('이번 달 백업 기록이 있으면 없음', () => {
    expect(keys(buildAutoTasks('2026-12-02', base()))).toContain('auto:backup:2026-12');
    expect(keys(buildAutoTasks('2026-12-02', base({ lastBackupAt: '2026-12-01T09:00:00Z' })))).not.toContain('auto:backup:2026-12');
  });
});

describe('오늘 수업 출석·브리핑', () => {
  const classes = [
    { id: 'a', label: '화 1:30 초1반', startTime: '13:30', checked: false, unsent: 2 },
    { id: 'b', label: '화 4:30 7세반', startTime: '16:30', checked: false, unsent: 3 },
  ];
  it('수업이 끝난 반만, 처리하면 사라짐', () => {
    const at15 = buildAutoTasks('2026-11-10', base({ nowMinutes: 15 * 60, todayClasses: classes }));
    expect(at15.find((t) => t.rule === 'attendance_today')?.detail).toBe('화 1:30 초1반');
    expect(at15.find((t) => t.rule === 'briefing_today')?.detail).toBe('화 1:30 초1반 2명');
    const done = buildAutoTasks('2026-11-10', base({ nowMinutes: 15 * 60, todayClasses: [{ ...classes[0], checked: true, unsent: 0 }, classes[1]] }));
    expect(done.some((t) => t.rule === 'attendance_today' || t.rule === 'briefing_today')).toBe(false);
  });
});

describe('availability_missing', () => {
  it('3~10월에는 뜨지 않음', () => {
    const input = base({ availabilityMissing: 3 });
    expect(buildAutoTasks('2026-11-10', input).some((t) => t.rule === 'availability_missing')).toBe(true);
    expect(buildAutoTasks('2027-02-10', input).some((t) => t.rule === 'availability_missing')).toBe(true);
    expect(buildAutoTasks('2027-03-10', input).some((t) => t.rule === 'availability_missing')).toBe(false);
    expect(buildAutoTasks('2027-10-31', input).some((t) => t.rule === 'availability_missing')).toBe(false);
  });
});

describe('waitlist_followup · leave_return', () => {
  it('문의인 채로 7일 변화 없으면', () => {
    const input = base({ waitlist: [{ id: 'w', name: '하준', stage: 'inquiry', since: '2026-11-03' }] });
    expect(buildAutoTasks('2026-11-09', input).some((t) => t.rule === 'waitlist_followup')).toBe(false);
    expect(buildAutoTasks('2026-11-10', input).some((t) => t.rule === 'waitlist_followup')).toBe(true);
  });
  it('복귀일 3일 전부터', () => {
    const input = base({ returning: [{ id: 's', name: '서연', returnOn: '2026-11-20' }] });
    const t = buildAutoTasks('2026-11-10', input).find((x) => x.rule === 'leave_return')!;
    expect(t).toBeUndefined();
    expect(buildAutoTasks('2026-11-17', input).find((x) => x.rule === 'leave_return')?.due).toBe('2026-11-20');
  });
});

describe('bucketize', () => {
  const task = (key: string, due: string, over: Partial<Task> = {}): Task => ({ key, kind: 'manual', title: key, due, ...over });
  const today = '2026-11-11'; // 수요일

  it('지난 것은 빨간 표시로 맨 위, 이번 주(일요일까지), 다가오는 일(14일)', () => {
    const b = bucketize([task('t', today), task('old', '2026-11-05'), task('fri', '2026-11-13'), task('next', '2026-11-20'), task('far', '2026-12-30')], [], today);
    expect(b.today.map((t) => t.key)).toEqual(['old', 't']);
    expect(b.today[0].overdue).toBe(true);
    expect(b.week.map((t) => t.key)).toEqual(['fri']);
    expect(b.upcoming.map((t) => t.key)).toEqual(['next']);
  });

  it("미루기 '다음 주' → 다음 월요일까지 숨김", () => {
    expect(nextMonday(today)).toBe('2026-11-16');
    expect(nextMonday('2026-11-16')).toBe('2026-11-23');
    const st: TaskStateRow = { taskKey: 't', status: 'snoozed', snoozeUntil: nextMonday(today), memo: null, doneAt: null };
    expect(bucketize([task('t', today)], [st], today).today).toHaveLength(0);
    expect(bucketize([task('t', today)], [st], '2026-11-15').today).toHaveLength(0);
    const mon = bucketize([task('t', today)], [st], '2026-11-16');
    expect(mon.today.map((t) => t.key)).toEqual(['t']);
    expect(mon.today[0].overdue).toBe(false);
  });

  it('완료·숨김은 안 보이고, 미리 표시 전에는 안 보임', () => {
    const states: TaskStateRow[] = [
      { taskKey: 'd', status: 'done', snoozeUntil: null, memo: null, doneAt: '2026-11-10T00:00:00Z' },
      { taskKey: 'h', status: 'hidden', snoozeUntil: null, memo: null, doneAt: null },
    ];
    const b = bucketize([task('d', today), task('h', today), task('v', '2026-11-20', { visibleFrom: '2026-11-13' })], states, today);
    expect(b.today).toHaveLength(0);
    expect(b.upcoming).toHaveLength(0);
  });
});

import { bucketize as bucketize2 } from './bucketize.ts';
import { SEED_TEMPLATES, expandTemplates, lastMemoFor, templateTasksFrom } from './templates.ts';
import type { TaskTemplateRow } from '../../storage/rosterTypes.ts';

const tpl = (over: Partial<TaskTemplateRow>): TaskTemplateRow => ({
  id: 't1',
  title: '할 일',
  description: null,
  category: '운영',
  recurrence: { type: 'monthly', day: 1 },
  leadDays: 0,
  enabled: true,
  sort: 1,
  memo: null,
  ...over,
});

describe('expandTemplates', () => {
  it("매월 'last' → 2027-02는 28일, 2028-02는 29일", () => {
    const t = tpl({ recurrence: { type: 'monthly', day: 'last' } });
    expect(expandTemplates([t], [], { from: '2027-02-01', to: '2027-02-28' }).map((o) => o.due)).toEqual(['2027-02-28']);
    expect(expandTemplates([t], [], { from: '2028-02-01', to: '2028-02-29' }).map((o) => o.due)).toEqual(['2028-02-29']);
  });

  it('매월 31일은 짧은 달엔 말일', () => {
    const t = tpl({ recurrence: { type: 'monthly', day: 31 } });
    expect(expandTemplates([t], [], { from: '2027-04-01', to: '2027-04-30' }).map((o) => o.due)).toEqual(['2027-04-30']);
  });

  it('행사 "2027 페스티벌" 2027-09-26 + offset −42 → 2027-08-15, lead 7 → 08-08부터 표시', () => {
    const t = tpl({ id: 'fest', recurrence: { type: 'event', keyword: '페스티벌', offsetDays: -42 }, leadDays: 7 });
    const events = [{ label: '2027 수원 플레이팩토 페스티벌', date: '2027-09-26' }];
    const occ = expandTemplates([t], events, { from: '2027-07-01', to: '2027-09-30' });
    expect(occ.map((o) => o.due)).toEqual(['2027-08-15']);
    const tasks = templateTasksFrom(occ, []);
    expect(tasks[0].visibleFrom).toBe('2027-08-08');
    expect(bucketize2(tasks, [], '2027-08-07').upcoming).toHaveLength(0);
    expect(bucketize2(tasks, [], '2027-08-08').upcoming.map((x) => x.key)).toEqual(['tpl:fest:2027-08-15']);
    // 행사가 없으면 뜨지 않음, 템플릿을 끄면 사라짐
    expect(expandTemplates([t], [], { from: '2027-07-01', to: '2027-09-30' })).toHaveLength(0);
    expect(expandTemplates([{ ...t, enabled: false }], events, { from: '2027-07-01', to: '2027-09-30' })).toHaveLength(0);
  });

  it('작년 메모: 2026-02-10 사업장현황신고 완료 메모가 2027-02-10 건에 표시', () => {
    const t = tpl({ id: 'tax', title: '사업장현황신고', recurrence: { type: 'yearly', month: 2, day: 10 }, leadDays: 14 });
    const states = [{ taskKey: 'tpl:tax:2026-02-10', status: 'done' as const, snoozeUntil: null, memo: '홈택스로 신고, 수입금액 확인', doneAt: '2026-02-09T00:00:00Z' }];
    expect(lastMemoFor('tax', '2027-02-10', states)).toBe('홈택스로 신고, 수입금액 확인');
    const tasks = templateTasksFrom(expandTemplates([t], [], { from: '2027-01-01', to: '2027-03-01' }), states);
    expect(tasks[0].lastMemo).toBe('홈택스로 신고, 수입금액 확인');
    expect(lastMemoFor('tax', '2026-02-10', states)).toBeNull();
  });

  it('초기 템플릿 16개', () => {
    expect(SEED_TEMPLATES).toHaveLength(16);
  });
});
