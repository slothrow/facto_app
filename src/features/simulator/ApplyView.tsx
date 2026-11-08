// 적용하기(SPEC_simulator 7장): 적용 시점 선택 → 미리보기(반별 적용일) → 아이별 체크 → 실행.
// 실행은 DB 함수 하나에서 한 번에(전부 성공 또는 전부 취소). 적용된 시안은 읽기 전용.
import { format } from 'date-fns';
import { useMemo, useState } from 'react';
import { useAppData } from '../../app/AppDataContext.tsx';
import { navigate } from '../../app/router.ts';
import { todayStr, useRoster } from '../../app/RosterContext.tsx';
import { Button, Card, ConfirmDialog, inputClass } from '../../components/ui.tsx';
import { ChevronLeft } from '../../components/icons.tsx';
import { withCurriculumDefaults } from '../../engine/curriculum.ts';
import { addMonthsYm } from '../../engine/dates.ts';
import { liveClasses, planApply, realChangesSince, type ApplyOption } from '../../engine/simulator/index.ts';
import { toFullBackupJson } from '../../storage/backup.ts';
import { downloadBlob } from '../export/imageExport.ts';
import { courseMonthFull } from '../curriculum/curriculumModel.ts';
import { draftOf, lookupFor } from './simModel.ts';

export function ApplyView({ draftId }: { draftId: string }) {
  const { data } = useAppData();
  const { roster, applyDraft } = useRoster();
  const today = todayStr();
  const d = draftOf(roster, draftId);
  const baseDate = d?.draft.baseDate ?? today;
  const sched = useMemo(() => lookupFor(data, baseDate > today ? baseDate : today), [data, baseDate, today]);

  // 고를 수 있는 수업월: 시안의 모든 요일에서 1주 날짜가 오늘 이후인 수업월(12개월 안)
  const months = useMemo(() => {
    if (!d) return [];
    const wds = [...new Set(d.classes.map((c) => c.weekday))];
    const first = sched.firstSessionFrom(1, today)?.courseMonth ?? today.slice(0, 7);
    const out: string[] = [];
    for (let i = 0; i < 13; i++) {
      const m = addMonthsYm(first, i);
      if (wds.every((wd) => {
        const w1 = sched.week1Of(wd, m);
        return w1 !== null && w1 >= today;
      })) out.push(m);
    }
    return out;
  }, [d, sched, today]);

  const [mode, setMode] = useState<'month' | 'date'>('month');
  const [month, setMonth] = useState<string>('');
  const [date, setDate] = useState<string>('');
  const [skip, setSkip] = useState<string[]>([]);
  const [ack, setAck] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!d) {
    return (
      <Card>
        <p className="mb-3">시안을 찾을 수 없어요.</p>
        <Button onClick={() => navigate('/roster/sim')}>시안 목록으로</Button>
      </Card>
    );
  }
  const back = () => navigate(`/roster/sim/${d.draft.id}`);
  if (d.draft.status !== 'editing') {
    return (
      <Card>
        <p className="mb-3">{d.draft.status === 'applied' ? '이미 적용한 시안이에요.' : '보관한 시안은 적용할 수 없어요. 먼저 보관을 풀어 주세요.'}</p>
        <Button onClick={back}>시안으로</Button>
      </Card>
    );
  }

  const cm = month || months[0] || '';
  const dt = date || (cm ? (liveClasses(d).map((c) => sched.week1Of(c.weekday, cm)).filter(Boolean).sort()[0] ?? today) : today);
  const option: ApplyOption = mode === 'month' ? { mode: 'month', courseMonth: cm } : { mode: 'date', date: dt };
  const plan = planApply({ draft: d, roster, sched, option, skip, today, now: new Date().toISOString(), curriculum: withCurriculumDefaults(data.settings.curriculum) });
  const realChanges = realChangesSince(d.draft.baseSnapshot, roster, d.draft.baseDate);
  const nothing = plan.summary.length === 0;
  const blocked = !plan.ok || (realChanges.length > 0 && !ack) || (mode === 'month' && !cm) || (mode === 'date' && dt < today);
  const toggle = (id: string) => setSkip((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const exportBackup = () =>
    downloadBlob(new Blob([toFullBackupJson(data, roster)], { type: 'application/json' }), `facto-backup-${format(new Date(), 'yyyyMMdd-HHmm')}.json`);

  const run = async () => {
    setBusy(true);
    const ok = await applyDraft(d.draft.id, plan.change);
    setBusy(false);
    setConfirm(false);
    if (ok) back();
  };

  return (
    <div className="space-y-3 pb-8">
      <button type="button" onClick={back} className="flex h-11 items-center gap-1 text-base text-stone-600">
        <ChevronLeft className="h-5 w-5" /> 시안으로
      </button>
      <h1 className="text-lg font-bold">적용하기 · {d.draft.name}</h1>

      <div className="md:grid md:grid-cols-2 md:items-start md:gap-4 space-y-3 md:space-y-0">
        <div className="space-y-3">
          {realChanges.length > 0 && (
            <Card title={`시안 만든 뒤 바뀐 내용 ${realChanges.length}건`} className="border-amber-300 bg-amber-50">
              <ul className="mb-2 list-disc space-y-0.5 pl-5 text-sm">
                {realChanges.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
              <p className="mb-2 text-sm text-stone-600">시안은 기준일({d.draft.baseDate}) 당시 시간표로 만들었어요. 바뀐 내용은 시안에 없어요.</p>
              <label className="flex min-h-11 items-center gap-2 text-base">
                <input type="checkbox" className="h-5 w-5" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                확인했어요. 그래도 계속할게요
              </label>
            </Card>
          )}

          <Card title="1. 백업 먼저">
            <p className="mb-2 text-sm text-stone-600">적용은 되돌릴 수 없어요. 문제가 생기면 백업 파일로만 되돌릴 수 있으니 먼저 내려받아 두세요.</p>
            <Button onClick={exportBackup}>백업 내보내기</Button>
          </Card>

          <Card title="2. 언제부터 바꿀까요?">
            <div role="tablist" className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1">
              {(['month', 'date'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => setMode(m)}
                  className={`h-10 rounded-lg text-sm font-semibold ${mode === m ? 'bg-white text-emerald-800 shadow-sm' : 'text-stone-600'}`}
                >
                  {m === 'month' ? '수업월 기준(기본)' : '날짜 기준'}
                </button>
              ))}
            </div>
            {mode === 'month' ? (
              <>
                <select className={inputClass} value={cm} onChange={(e) => setMonth(e.target.value)}>
                  {months.map((m) => (
                    <option key={m} value={m}>
                      {courseMonthFull(m)}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-sm text-stone-500">반마다 그 요일의 "그 수업월 1주" 날짜부터 바뀌어요. 요일마다 날짜가 다를 수 있어요.</p>
              </>
            ) : (
              <>
                <input type="date" className={inputClass} value={dt} min={today} onChange={(e) => e.target.value && setDate(e.target.value)} />
                <p className="mt-1 text-sm text-stone-500">모든 변경이 이 날짜부터. 새 학기처럼 모든 요일을 같은 날 바꿀 때.</p>
              </>
            )}
          </Card>

          {(plan.leavers.length > 0 || plan.newcomers.length > 0) && (
            <Card title="3. 아이별 확인">
              {plan.leavers.length > 0 && (
                <>
                  <h3 className="mb-1 text-sm font-semibold text-stone-600">퇴원 처리 (체크한 아이만)</h3>
                  <Checks list={plan.leavers} skip={skip} onToggle={toggle} />
                </>
              )}
              {plan.newcomers.length > 0 && (
                <>
                  <h3 className="mt-3 mb-1 text-sm font-semibold text-stone-600">대기자 → 학생 등록 + 배정 (체크한 아이만)</h3>
                  <Checks list={plan.newcomers} skip={skip} onToggle={toggle} />
                </>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-3">
          <Card title="미리보기">
            {plan.errors.length > 0 && (
              <ul className="mb-3 space-y-1 rounded-xl bg-red-50 p-3 text-sm text-red-800">
                {plan.errors.map((e) => (
                  <li key={e}>⛔ {e}</li>
                ))}
              </ul>
            )}
            {nothing && plan.ok && <p className="text-sm text-stone-500">바뀌는 것이 없어요.</p>}
            <ul className="space-y-2">
              {plan.classes
                .filter((c) => c.lines.length > 0)
                .map((c) => (
                  <li key={c.simClassId} className="rounded-xl border border-stone-200 p-2 text-sm">
                    <div className="flex justify-between gap-2 font-semibold">
                      <span>{c.title}</span>
                      <span className="shrink-0 text-emerald-800">{c.applyDate}</span>
                    </div>
                    <ul className="mt-1 list-disc pl-5 text-stone-700">
                      {c.lines.map((l) => (
                        <li key={l}>{l}</li>
                      ))}
                    </ul>
                  </li>
                ))}
            </ul>
            {plan.summary.length > 0 && <p className="mt-3 text-sm font-semibold">합계: {plan.summary.join(' · ')}</p>}
          </Card>
          {plan.warnings.length > 0 && (
            <Card title="주의" className="border-amber-300 bg-amber-50">
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {plan.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </Card>
          )}
          {plan.notes.length > 0 && (
            <Card title="반영하지 않는 것">
              <ul className="list-disc space-y-1 pl-5 text-sm text-stone-600">
                {plan.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </Card>
          )}
          <Button variant="primary" className="w-full" disabled={blocked || nothing || busy} onClick={() => setConfirm(true)}>
            적용하기
          </Button>
          {realChanges.length > 0 && !ack && <p className="text-sm text-amber-800">위의 "바뀐 내용"을 확인하면 적용할 수 있어요.</p>}
        </div>
      </div>

      {confirm && (
        <ConfirmDialog
          title="시안을 적용할까요?"
          body={
            <>
              <p className="mb-2">{plan.summary.join(' · ')}</p>
              <p className="text-sm text-stone-600">실제 반·배정이 바뀌고 되돌릴 수 없어요(백업으로만 복원). 과거 출석·브리핑 기록은 이전 반에 그대로 남아요.</p>
            </>
          }
          confirmLabel={busy ? '적용 중…' : '적용하기'}
          onCancel={() => !busy && setConfirm(false)}
          onConfirm={() => !busy && void run()}
        />
      )}
    </div>
  );
}

function Checks({ list, skip, onToggle }: { list: { memberId: string; name: string; classTitle: string; date: string | null }[]; skip: string[]; onToggle: (id: string) => void }) {
  return (
    <ul className="space-y-1">
      {list.map((p) => (
        <li key={p.memberId}>
          <label className="flex min-h-11 items-center gap-2 rounded-xl border border-stone-200 px-3 text-sm">
            <input type="checkbox" className="h-5 w-5" checked={!skip.includes(p.memberId)} onChange={() => onToggle(p.memberId)} />
            <span className="font-semibold">{p.name}</span>
            <span className="text-stone-500">
              {p.classTitle}
              {p.date ? ` · ${p.date}부터` : ''}
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}
