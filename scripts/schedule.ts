// 확인용 스크립트: 시드 데이터 기준으로 달력월의 요일별 회차를 표로 출력한다.
// 사용법: npm run schedule -- 2027-01            (한 달)
//         npm run schedule -- 2026-11 2027-02    (여러 달)
// Node 22.18+ 의 TypeScript 직접 실행 기능을 쓴다(별도 라이브러리 없음).
import { seedInput } from '../src/data/seed.ts';
import {
  WEEKDAY_NAMES,
  formatCode,
  formatOffset,
  monthEnd,
  monthOf,
  monthStart,
  monthsBetween,
  schedule,
  type DayCell,
} from '../src/engine/index.ts';

const [fromArg, toArg] = process.argv.slice(2);
const isYm = (s?: string) => !!s && /^\d{4}-\d{2}$/.test(s);
if (!isYm(fromArg) || (toArg && !isYm(toArg))) {
  console.error('사용법: npm run schedule -- 2027-01   또는   npm run schedule -- 2026-11 2027-02');
  process.exit(1);
}
const toYm = toArg ?? fromArg;
const months = monthsBetween(fromArg, toYm);

const out = schedule(seedInput({ from: monthStart(fromArg), to: monthEnd(toYm) }));

const md = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

function cellText(c: DayCell): string {
  switch (c.status) {
    case 'session': {
      const mark = c.session!.pinned ? '(고정)' : '';
      return `${md(c.date)} ${formatCode(c.session!)}${mark}`;
    }
    case 'holiday':
      return `${md(c.date)} [${c.holidayName}]`;
    case 'closed':
      return `${md(c.date)} [휴원:${c.closureLabel}]`;
    case 'skipped':
      return `${md(c.date)} [비움]`;
    default:
      return `${md(c.date)} -`;
  }
}

for (const ym of months) {
  const [y, m] = ym.split('-');
  const summary = out.monthSummaries.find((s) => s.calendarMonth === ym)!;
  const monthDays = out.days.filter((d) => monthOf(d.date) === ym);
  const isConfirmed = monthDays.some((d) => d.session?.confirmed);

  console.log('');
  console.log(`━━━ ${y}년 ${Number(m)}월 ${isConfirmed ? '[확정]' : '[초안]'} ━━━`);
  for (const t of summary.tracks) {
    const cells = monthDays.filter((d) => d.weekday === t.weekday).map(cellText);
    console.log(`${WEEKDAY_NAMES[t.weekday]} | ${cells.join('  ')}`);
  }

  console.log('');
  console.log('요약');
  for (const t of summary.tracks) {
    const off = t.offset === null ? '-' : formatOffset(t.offset);
    console.log(`  ${WEEKDAY_NAMES[t.weekday]} ${t.count}회 · ${t.sessionsText || '없음'} · 월말 ${off}`);
  }
  console.log(`  보강데이: ${summary.makeupDays.map(md).join(', ') || '없음'}`);

  const events = monthDays.flatMap((d) => d.events.map((e) => `${md(d.date)} ${e}`));
  if (events.length) console.log(`  행사: ${events.join(', ')}`);

  const warnings = out.warnings.filter((w) => w.calendarMonth === ym);
  if (warnings.length) {
    console.log('  경고:');
    for (const w of warnings) console.log(`    ! ${w.message}`);
  }
}
console.log('');
console.log('표기: 11-1 = 11월 1주, [ ] = 수업 없음, (고정) = 직접 지정, 수업월이 연도를 넘으면 1-1은 다음 해 1월');
