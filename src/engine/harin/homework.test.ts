import { describe, expect, it } from 'vitest';
import type { KidBlockRow, KidHomeworkRow } from '../../storage/rosterTypes.ts';
import { currentWeekDates, homeworksForDate, missedHomeworks, nextWorkdayOnOrAfter, previousWorkday, repeatLabel, weekDates } from './homework.ts';

// 2026-11-30 = 월요일
const MON = '2026-11-30';
const TUE = '2026-12-01';
const WED = '2026-12-02';
const THU = '2026-12-03';
const FRI = '2026-12-04';
const SAT = '2026-12-05';
const SUN = '2026-12-06';

let n = 0;
const hw = (over: Partial<KidHomeworkRow>): KidHomeworkRow => ({
  id: `h${++n}`,
  name: `숙제${n}`,
  subject: 'other',
  emoji: '✏️',
  minutes: null,
  memo: null,
  active: true,
  repeatType: 'daily',
  weekdays: [1, 2, 3, 4, 5],
  activityId: null,
  dueRule: null,
  dueDate: null,
  sort: n,
  ...over,
});
const block = (weekday: number, activityId: string | null = 'eng'): Pick<KidBlockRow, 'weekday' | 'activityId'> => ({ weekday, activityId });
const ACTS = [{ id: 'eng' }];
const ids = (list: KidHomeworkRow[]) => list.map((h) => h.id);

describe('homeworksForDate', () => {
  it('매일(월·수·금) → 화요일엔 없고 수요일엔 있다', () => {
    const h = hw({ weekdays: [1, 3, 5] });
    expect(homeworksForDate(TUE, [h], [], ACTS)).toEqual([]);
    expect(ids(homeworksForDate(WED, [h], [], ACTS))).toEqual([h.id]);
  });

  it('학원 화·목 + 전날 → 월·수에 있고 화·목엔 없다', () => {
    const h = hw({ repeatType: 'academy', weekdays: null, activityId: 'eng', dueRule: 'day_before' });
    const blocks = [block(2), block(4)];
    expect(ids(homeworksForDate(MON, [h], blocks, ACTS))).toEqual([h.id]);
    expect(ids(homeworksForDate(WED, [h], blocks, ACTS))).toEqual([h.id]);
    expect(homeworksForDate(TUE, [h], blocks, ACTS)).toEqual([]);
    expect(homeworksForDate(THU, [h], blocks, ACTS)).toEqual([]);
    expect(homeworksForDate(FRI, [h], blocks, ACTS)).toEqual([]);
  });

  it('학원 화·목 + 당일 → 화·목에 있다', () => {
    const h = hw({ repeatType: 'academy', weekdays: null, activityId: 'eng', dueRule: 'same_day' });
    const blocks = [block(2), block(4)];
    expect(ids(homeworksForDate(TUE, [h], blocks, ACTS))).toEqual([h.id]);
    expect(ids(homeworksForDate(THU, [h], blocks, ACTS))).toEqual([h.id]);
    expect(homeworksForDate(MON, [h], blocks, ACTS)).toEqual([]);
    expect(homeworksForDate(WED, [h], blocks, ACTS)).toEqual([]);
  });

  it('학원 월만 + 전날 → 금요일(주말 건너뜀)에 있고, 주말·월요일엔 없다', () => {
    const h = hw({ repeatType: 'academy', weekdays: null, activityId: 'eng', dueRule: 'day_before' });
    const blocks = [block(1)];
    expect(ids(homeworksForDate(FRI, [h], blocks, ACTS))).toEqual([h.id]);
    expect(homeworksForDate(SAT, [h], blocks, ACTS)).toEqual([]);
    expect(homeworksForDate(SUN, [h], blocks, ACTS)).toEqual([]);
    expect(homeworksForDate(MON, [h], blocks, ACTS)).toEqual([]);
  });

  it('한 번만 2026-12-03 → 그날만', () => {
    const h = hw({ repeatType: 'once', weekdays: null, dueDate: '2026-12-03' });
    expect(ids(homeworksForDate(THU, [h], [], ACTS))).toEqual([h.id]);
    expect(homeworksForDate(WED, [h], [], ACTS)).toEqual([]);
    expect(homeworksForDate(FRI, [h], [], ACTS)).toEqual([]);
  });

  it('주말 날짜 → 빈 목록(매일·한 번만·학원 모두)', () => {
    const list = [
      hw({}),
      hw({ repeatType: 'once', weekdays: null, dueDate: SAT }),
      hw({ repeatType: 'academy', weekdays: null, activityId: 'eng', dueRule: 'same_day' }),
    ];
    expect(homeworksForDate(SAT, list, [block(1), block(5)], ACTS)).toEqual([]);
    expect(homeworksForDate(SUN, list, [block(1), block(5)], ACTS)).toEqual([]);
  });

  it('사용 안 함은 빠지고, 시간표에 없는 학원·지워진 학원 숙제는 어느 날에도 안 뜬다', () => {
    const off = hw({ active: false });
    const noBlock = hw({ repeatType: 'academy', weekdays: null, activityId: 'eng', dueRule: 'same_day' });
    const noAct = hw({ repeatType: 'academy', weekdays: null, activityId: 'gone', dueRule: 'same_day' });
    for (const d of [MON, TUE, WED, THU, FRI]) {
      expect(homeworksForDate(d, [off, noBlock], [], ACTS)).toEqual([]);
      expect(homeworksForDate(d, [noAct], [block(1, 'gone')], ACTS)).toEqual([]);
    }
  });

  it('숙제 순서(sort)대로 나온다', () => {
    const a = hw({ sort: 5 });
    const b = hw({ sort: 1 });
    expect(ids(homeworksForDate(MON, [a, b], [], ACTS))).toEqual([b.id, a.id]);
  });
});

describe('어제 못 한 숙제·주 계산', () => {
  it('직전 평일: 월요일이면 금요일, 주말은 null', () => {
    expect(previousWorkday(TUE)).toBe(MON);
    expect(previousWorkday(MON)).toBe('2026-11-27');
    expect(previousWorkday(SAT)).toBeNull();
  });

  it('어제 숙제 중 체크 안 한 것만 나온다', () => {
    const a = hw({ weekdays: [1] });
    const b = hw({ weekdays: [1] });
    const r = missedHomeworks(TUE, [a, b], [{ date: MON, homeworkId: a.id, doneAt: 'x' }], [], ACTS);
    expect(r.date).toBe(MON);
    expect(ids(r.homeworks)).toEqual([b.id]);
    expect(missedHomeworks(SAT, [a], [], [], ACTS).homeworks).toEqual([]);
  });

  it('weekDates는 월~금, 주말이면 다음 주를 보여 준다', () => {
    expect(weekDates(WED)).toEqual([MON, TUE, WED, THU, FRI]);
    expect(currentWeekDates(SAT)[0]).toBe('2026-12-07');
    expect(currentWeekDates(SUN)[0]).toBe('2026-12-07');
    expect(currentWeekDates(WED)[0]).toBe(MON);
  });

  it('nextWorkdayOnOrAfter: 평일은 그날, 주말은 다음 월요일', () => {
    expect(nextWorkdayOnOrAfter(WED)).toBe(WED);
    expect(nextWorkdayOnOrAfter(SAT)).toBe('2026-12-07');
    expect(nextWorkdayOnOrAfter(SUN)).toBe('2026-12-07');
  });

  it('repeatLabel', () => {
    expect(repeatLabel(hw({ weekdays: [1, 3] }))).toBe('매일 · 월수');
    expect(repeatLabel(hw({ repeatType: 'academy', dueRule: 'same_day' }), '영어학원')).toBe('영어학원 숙제 · 수업 당일 학원 가기 전');
    expect(repeatLabel(hw({ repeatType: 'once', dueDate: '2026-12-03' }))).toBe('한 번만 · 12/3까지');
  });
});
