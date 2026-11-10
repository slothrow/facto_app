// 시간표 탭 [빈자리] (SPEC_home 2장). 상담할 때: 학년·기준일을 고르면
// A. 기존 반 빈자리(곧 생길 자리) → B. 새 반 개설 가능 시각 → C. 맞는 대기자 수.
import { useMemo, useState } from 'react';
import { useAppData } from '../../app/AppDataContext.tsx';
import { navigate } from '../../app/router.ts';
import { todayStr, useRoster } from '../../app/RosterContext.tsx';
import { BottomSheet, Button, Card, inputClass } from '../../components/ui.tsx';
import { formatTimeKo, shortTime } from '../../engine/classTime.ts';
import { addDays, weekdayOf } from '../../engine/dates.ts';
import { gradeLabel, schoolYearOf } from '../../engine/grade.ts';
import { WEEKDAY_NAMES } from '../../engine/label.ts';
import { SIM_WEEKDAYS } from '../../engine/simulator/model.ts';
import type { Weekday } from '../../engine/types.ts';
import { computeVacancies, gradeFromBirthYear, type ClassVacancy, type SlotOption, type VacancySource } from '../../engine/vacancy.ts';
import { VACANCY_GRADES, preferredOf } from '../settings/HoursSection.tsx';
import { draftOf, hoursOf } from '../simulator/simModel.ts';
import { TrialForm } from '../roster/waitlist/TrialForm.tsx';
import { WaitlistForm } from '../roster/waitlist/WaitlistView.tsx';
import { fitsWish } from '../roster/waitlist/waitlistModel.ts';

type Target = { kind: 'class'; v: ClassVacancy } | { kind: 'slot'; s: SlotOption };

const mdText = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8))}일`;

/** 기준일 빠른 버튼 */
function quickDates(today: string) {
  const [y, m] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const march = m < 3 ? `${y}-03-01` : `${y + 1}-03-01`;
  return [
    { label: '오늘', date: today },
    { label: '다음 달 1일', date: next },
    { label: '3월 새 학기', date: march },
  ];
}

/** from 이후(포함) 처음 오는 그 요일 */
function nextWeekday(from: string, wd: number) {
  let d = from;
  for (let i = 0; i < 7 && weekdayOf(d) !== wd; i++) d = addDays(d, 1);
  return d;
}

export function VacancyView() {
  const { data } = useAppData();
  const { roster } = useRoster();
  const today = todayStr();
  const [gradeMode, setGradeMode] = useState<'chip' | 'year'>('chip');
  const [chip, setChip] = useState(6);
  const [birthYear, setBirthYear] = useState('');
  const [baseDate, setBaseDate] = useState(today);
  const [sourceId, setSourceId] = useState('real');
  const [wishDay, setWishDay] = useState<Weekday | ''>('');
  const [wishTime, setWishTime] = useState('');
  const [target, setTarget] = useState<Target | null>(null);
  const [waitIds, setWaitIds] = useState<string[] | null>(null);
  const [form, setForm] = useState<'wait' | 'trial' | null>(null);

  const drafts = roster.simDrafts.filter((d) => d.status === 'editing');
  const year = Number(birthYear);
  const grade = gradeMode === 'year' ? (year > 2000 && year < 2100 ? gradeFromBirthYear(year, baseDate) : null) : chip;

  const result = useMemo(() => {
    if (grade === null) return null;
    const draft = sourceId === 'real' ? null : draftOf(roster, sourceId);
    const source: VacancySource = draft ? { kind: 'draft', draft } : { kind: 'real', classes: roster.classes, enrollments: roster.enrollments, students: roster.students };
    return computeVacancies({
      baseDate,
      grade,
      source,
      waitlist: roster.waitlist,
      hours: hoursOf(data),
      preferredAfter: preferredOf(data.settings.gradePreferredAfter),
    });
  }, [grade, sourceId, baseDate, roster, data]);

  const wish = wishDay === '' ? null : { [wishDay]: wishTime || null };
  const wished = (x: { weekday: Weekday; startTime: string }) => (wish ? fitsWish(wish, x) : false);
  const isTarget = (key: string) => target && (target.kind === 'class' ? `c:${target.v.id}` : `s:${target.s.weekday}|${target.s.startTime}`) === key;
  const targetSlot = target ? (target.kind === 'class' ? target.v : target.s) : null;
  // 오늘 기준 학년(대기자·체험 화면은 오늘 기준으로 학년을 받는다)
  const gradeToday = grade === null ? undefined : grade - (schoolYearOf(baseDate) - schoolYearOf(today));

  return (
    <div className="space-y-4 pb-24">
      <Card>
        <div className="space-y-3">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="text-sm font-semibold text-stone-600">학년</span>
              <button type="button" className="ml-auto text-sm text-emerald-800 underline" onClick={() => setGradeMode(gradeMode === 'chip' ? 'year' : 'chip')}>
                {gradeMode === 'chip' ? '출생연도로 입력' : '학년 칩으로'}
              </button>
            </div>
            {gradeMode === 'chip' ? (
              <div className="grid grid-cols-6 gap-1">
                {VACANCY_GRADES.map((g) => (
                  <button
                    key={g}
                    type="button"
                    aria-pressed={chip === g}
                    onClick={() => setChip(g)}
                    className={`h-11 rounded-xl border text-base font-semibold ${chip === g ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-stone-300 bg-white'}`}
                  >
                    {gradeLabel(g)}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input inputMode="numeric" placeholder="예: 2020" className={inputClass} value={birthYear} onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, '').slice(0, 4))} />
                <span className="shrink-0 text-base font-semibold">{grade === null ? '년생' : `년생 → ${gradeLabel(grade)}`}</span>
              </div>
            )}
          </div>

          <div>
            <span className="mb-1 block text-sm font-semibold text-stone-600">기준일</span>
            <div className="grid grid-cols-3 gap-1">
              {quickDates(today).map((q) => (
                <button
                  key={q.label}
                  type="button"
                  aria-pressed={baseDate === q.date}
                  onClick={() => setBaseDate(q.date)}
                  className={`h-11 rounded-xl border text-[15px] font-semibold ${baseDate === q.date ? 'border-emerald-700 bg-emerald-50 text-emerald-900' : 'border-stone-300 bg-white'}`}
                >
                  {q.label}
                </button>
              ))}
            </div>
            <input type="date" className={`${inputClass} mt-1`} value={baseDate} onChange={(e) => e.target.value && setBaseDate(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-stone-600">데이터 기준</span>
              <select className={inputClass} value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                <option value="real">실제 시간표</option>
                {drafts.map((d) => (
                  <option key={d.id} value={d.id}>
                    시안: {d.name}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <span className="mb-1 block text-sm font-semibold text-stone-600">희망 요일·시간 (선택)</span>
              <div className="flex gap-1">
                <select className={inputClass} value={wishDay} onChange={(e) => setWishDay(e.target.value === '' ? '' : (Number(e.target.value) as Weekday))}>
                  <option value="">-</option>
                  {SIM_WEEKDAYS.map((wd) => (
                    <option key={wd} value={wd}>
                      {WEEKDAY_NAMES[wd]}
                    </option>
                  ))}
                </select>
                {wishDay !== '' && <input type="time" step={600} aria-label="몇 시 이후" className={inputClass} value={wishTime} onChange={(e) => setWishTime(e.target.value)} />}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {!result ? (
        <Card>
          <p className="text-base text-stone-500">출생연도를 4자리로 넣어 주세요.</p>
        </Card>
      ) : (
        <div className="space-y-4 md:grid md:grid-cols-2 md:items-start md:gap-4 md:space-y-0">
          <div className="space-y-4">
            <Card title={`A. ${gradeLabel(grade)}반 빈자리 · ${mdText(baseDate)} 기준`}>
              {result.same.length === 0 ? (
                <p className="text-base text-stone-500">같은 학년 반에 빈자리가 없어요. 아래 새 반 시각을 보세요.</p>
              ) : (
                <ul className="space-y-2">
                  {result.same.map((v) => (
                    <ClassLine key={v.id} v={v} on={Boolean(isTarget(`c:${v.id}`))} wished={wished(v)} onPick={() => setTarget({ kind: 'class', v })} onWait={() => setWaitIds(v.waitIds)} />
                  ))}
                </ul>
              )}
              {result.nearby.length > 0 && (
                <details className="mt-3">
                  <summary className="min-h-11 cursor-pointer py-2 text-base font-semibold text-stone-600">참고: 위아래 학년 반 {result.nearby.length}개</summary>
                  <ul className="space-y-2">
                    {result.nearby.map((v) => (
                      <ClassLine key={v.id} v={v} on={Boolean(isTarget(`c:${v.id}`))} wished={wished(v)} onPick={() => setTarget({ kind: 'class', v })} onWait={() => setWaitIds(v.waitIds)} />
                    ))}
                  </ul>
                </details>
              )}
            </Card>
            {result.graduating.length > 0 && (
              <Card title="곧 비는 시간 (졸업 대상 · 운영 여부 확인)">
                <ul className="space-y-1 text-base">
                  {result.graduating.map((v) => (
                    <li key={v.id}>
                      {WEEKDAY_NAMES[v.weekday]} {shortTime(v.startTime)} {gradeLabel(v.grade)}반 {v.count}명
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-sm text-stone-500">이 시간은 새 반 시각에 넣지 않았어요. 운영을 안 하기로 하면 비는 시간이에요.</p>
              </Card>
            )}
          </div>

          <Card title="B. 새 반 개설 가능 시간">
            <p className="mb-3 text-sm text-stone-500">학생 2명 이상이면 새 반을 열 수 있어요. 기존 반과 앞뒤 10분 이상, 운영 시간 안.</p>
            <div className="space-y-3">
              {SIM_WEEKDAYS.map((wd) => {
                const day = result.slots.filter((s) => s.weekday === wd);
                const basic = day.filter((s) => s.basic);
                const other = day.filter((s) => !s.basic);
                return (
                  <div key={wd}>
                    <div className="mb-1 text-base font-bold">{WEEKDAY_NAMES[wd]}요일</div>
                    {day.length === 0 ? (
                      <p className="text-sm text-stone-500">가능한 시간이 없어요.</p>
                    ) : (
                      <>
                        <ul className="space-y-1">
                          {basic.map((s) => (
                            <SlotLine key={s.startTime} s={s} on={Boolean(isTarget(`s:${s.weekday}|${s.startTime}`))} wished={wished(s)} onPick={() => setTarget({ kind: 'slot', s })} onWait={() => setWaitIds(s.waitIds)} />
                          ))}
                        </ul>
                        {other.length > 0 && (
                          <details className="mt-1">
                            <summary className="min-h-10 cursor-pointer py-1.5 text-sm font-semibold text-stone-500">기타 가능 시간 {other.length}개</summary>
                            <ul className="space-y-1">
                              {other.map((s) => (
                                <SlotLine key={s.startTime} s={s} on={Boolean(isTarget(`s:${s.weekday}|${s.startTime}`))} wished={wished(s)} onPick={() => setTarget({ kind: 'slot', s })} onWait={() => setWaitIds(s.waitIds)} />
                              ))}
                            </ul>
                          </details>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {/* 고른 칸으로 대기자 등록 / 체험 예약 */}
      <div className="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 flex justify-center px-3">
        <div className="flex w-full max-w-[480px] items-center gap-2 rounded-2xl bg-stone-900/95 px-3 py-2 text-white shadow-xl md:max-w-2xl">
          <span className="min-w-0 flex-1 truncate text-sm">
            {targetSlot ? `${WEEKDAY_NAMES[targetSlot.weekday]} ${shortTime(targetSlot.startTime)}${target?.kind === 'slot' ? ' 새 반' : ' 반'}` : '칸을 고르면 그 시간으로 채워져요'}
          </span>
          <Button className="shrink-0 px-3" disabled={grade === null} onClick={() => setForm('wait')}>
            대기자로 등록
          </Button>
          <Button className="shrink-0 px-3" disabled={grade === null} onClick={() => setForm('trial')}>
            체험 예약
          </Button>
        </div>
      </div>

      {waitIds && (
        <BottomSheet title={`맞는 대기자 ${waitIds.length}명`} onClose={() => setWaitIds(null)}>
          <ul className="divide-y divide-stone-100">
            {waitIds.map((id) => {
              const w = roster.waitlist.find((x) => x.id === id);
              if (!w) return null;
              return (
                <li key={id}>
                  <button type="button" className="min-h-12 w-full text-left text-base" onClick={() => navigate(`/roster/waitlist/${id}`)}>
                    {w.name}
                    {w.inquiredOn && <span className="ml-2 text-sm text-stone-500">문의 {w.inquiredOn}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </BottomSheet>
      )}

      {form === 'wait' && (
        <WaitlistForm
          preset={{
            grade: gradeToday,
            wish: targetSlot ? { [targetSlot.weekday]: targetSlot.startTime } : {},
            wishStartMonth: baseDate.slice(0, 7),
          }}
          onClose={() => setForm(null)}
        />
      )}
      {form === 'trial' && (
        <TrialForm
          presetDate={targetSlot ? nextWeekday(baseDate > today ? baseDate : today, targetSlot.weekday) : undefined}
          presetClassId={target?.kind === 'class' && sourceId === 'real' && target.v.realClassId ? target.v.realClassId : undefined}
          presetTime={targetSlot?.startTime}
          presetGrade={gradeToday}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  );
}

const rowClass = (on: boolean, wished: boolean) =>
  `flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left ${on ? 'border-emerald-700 bg-emerald-50 ring-2 ring-emerald-600' : wished ? 'border-amber-400 bg-amber-50' : 'border-stone-200 bg-white'}`;

function ClassLine({ v, on, wished, onPick, onWait }: { v: ClassVacancy; on: boolean; wished: boolean; onPick: () => void; onWait: () => void }) {
  return (
    <li className={rowClass(on, wished)}>
      <button type="button" className="min-h-11 min-w-0 flex-1 text-left" onClick={onPick}>
        <div className="text-base font-semibold">
          {WEEKDAY_NAMES[v.weekday]} {formatTimeKo(v.startTime)} {gradeLabel(v.grade)}반{v.alias ? ` ${v.alias}` : ''} {v.count}/4
          {v.seats > 0 && <span className="ml-1 text-emerald-800">· {v.seats}자리</span>}
        </div>
        {v.soon.map((s) => (
          <div key={s.date} className="text-sm text-sky-800">
            {mdText(s.date)}부터 {s.seats}자리
          </div>
        ))}
      </button>
      <WaitCount n={v.waitIds.length} onClick={onWait} />
    </li>
  );
}

function SlotLine({ s, on, wished, onPick, onWait }: { s: SlotOption; on: boolean; wished: boolean; onPick: () => void; onWait: () => void }) {
  const n = s.waitIds.length;
  const hint = n === 0 ? '' : n === 1 ? '대기 1명 · 이번 문의까지 2명이면 개설 가능' : `대기 ${n}명 · 이번 문의와 함께 개설 가능`;
  return (
    <li className={rowClass(on, wished)}>
      <button type="button" className="min-h-11 min-w-0 flex-1 text-left" onClick={onPick}>
        <span className="text-base font-semibold">{formatTimeKo(s.startTime)}</span>
        {s.preferred && <span className="ml-2 rounded bg-emerald-100 px-1.5 text-xs font-bold text-emerald-800">선호</span>}
        {hint && <div className="text-sm text-stone-600">{hint}</div>}
      </button>
      <WaitCount n={n} onClick={onWait} />
    </li>
  );
}

function WaitCount({ n, onClick }: { n: number; onClick: () => void }) {
  if (n === 0) return <span className="shrink-0 text-sm text-stone-400">대기 0</span>;
  return (
    <button type="button" onClick={onClick} className="min-h-11 shrink-0 rounded-xl bg-sky-600 px-3 text-sm font-bold text-white active:bg-sky-700">
      대기 {n}명
    </button>
  );
}
