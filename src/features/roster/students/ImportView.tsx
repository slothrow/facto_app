// 엑셀/CSV 붙여넣기 가져오기 화면(SPEC 5.1): 붙여넣기 → 열 매칭 → 미리보기 → 가져오기.
import { useMemo, useState } from 'react';
import { navigate } from '../../../app/router.ts';
import { todayStr, useRoster } from '../../../app/RosterContext.tsx';
import { ChevronLeft } from '../../../components/icons.tsx';
import { Button, Card, ConfirmDialog, Field, inputClass } from '../../../components/ui.tsx';
import { gradeLabel, schoolYearOf } from '../../../engine/grade.ts';
import { WEEKDAY_NAMES } from '../rosterModel.ts';
import { shortTime } from '../../../engine/classTime.ts';
import { FIELD_LABEL, IMPORT_FIELDS, autoMap, buildImportPlan, parseTable, planToChange, type ImportField } from './importModel.ts';
import { gradeCodeOn } from '../../../engine/grade.ts';

export function ImportView() {
  const { roster, mutate } = useRoster();
  const today = todayStr();
  const [text, setText] = useState('');
  const [step, setStep] = useState<'paste' | 'map' | 'preview'>('paste');
  const [mapping, setMapping] = useState<(ImportField | null)[]>([]);
  const [basisYear, setBasisYear] = useState(schoolYearOf(today));
  const [startDate, setStartDate] = useState(today);
  const [skip, setSkip] = useState<Set<number>>(new Set());
  const [confirming, setConfirming] = useState(false);

  const table = useMemo(() => parseTable(text), [text]);
  const plan = useMemo(
    () => (step === 'preview' ? buildImportPlan(table, mapping, roster, today, basisYear) : null),
    [step, table, mapping, roster, today, basisYear],
  );

  const toMap = () => {
    const m = autoMap(table[0] ?? []);
    setMapping(m);
    setStep('map');
  };
  const toPreview = () => {
    const p = buildImportPlan(table, mapping, roster, today, basisYear);
    // 중복 의심은 기본으로 건너뛰기
    setSkip(new Set(p.rows.filter((r) => r.duplicate).map((r) => r.line)));
    setStep('preview');
  };

  const run = async () => {
    if (!plan) return;
    const change = planToChange(plan, skip, roster, startDate);
    const n = change.upsert?.students?.length ?? 0;
    if (await mutate(change, `학생 ${n}명을 가져왔어요`)) navigate('/roster/students');
  };

  return (
    <div className="space-y-4">
      <button type="button" onClick={() => navigate('/roster/students')} className="flex h-12 shrink-0 items-center gap-1 rounded-xl border border-stone-300 bg-white pr-4 pl-2 text-lg font-semibold text-stone-800 shadow-sm active:bg-stone-100">
        <ChevronLeft className="h-7 w-7" /> 학생 목록
      </button>
      <h1 className="text-xl font-bold">붙여넣기로 가져오기</h1>

      {step === 'paste' && (
        <Card>
          <p className="mb-2 text-base text-stone-700">엑셀에서 표를 복사해 붙여 넣거나, CSV 파일 내용을 붙여 넣으세요. 첫 줄은 열 이름이어야 해요.</p>
          <p className="mb-3 text-sm text-stone-500">자동으로 알아보는 열 이름: {IMPORT_FIELDS.map((f) => FIELD_LABEL[f]).join(', ')}</p>
          <textarea
            className={`${inputClass} min-h-48 py-2 font-mono text-sm`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'요일,시작시간,반학년,이름,상태,확인필요,메모\n화,16:30,초2,홍길동,재원,,'}
          />
          <label className="mt-2 block">
            <span className="text-sm text-stone-600">또는 파일 선택</span>
            <input
              type="file"
              accept=".csv,.txt,.tsv"
              className="mt-1 block w-full text-base"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setText(await f.text());
              }}
            />
          </label>
          <Button variant="primary" className="mt-3 w-full" disabled={table.length < 2} onClick={toMap}>
            다음: 열 확인 ({Math.max(0, table.length - 1)}줄)
          </Button>
        </Card>
      )}

      {step === 'map' && (
        <Card title="열 매칭">
          <p className="mb-3 text-base text-stone-600">각 열이 무엇인지 확인하세요. 필요 없는 열은 "사용 안 함".</p>
          <div className="space-y-2">
            {(table[0] ?? []).map((h, i) => (
              <div key={i} className="grid grid-cols-2 items-center gap-2">
                <span className="truncate text-base font-medium">{h.replace(/^\\xEF\\xBB\\xBF/, '') || `(${i + 1}번째 열)`}</span>
                <select
                  className={inputClass}
                  value={mapping[i] ?? ''}
                  onChange={(e) => {
                    const next = [...mapping];
                    next[i] = (e.target.value || null) as ImportField | null;
                    setMapping(next);
                  }}
                >
                  <option value="">사용 안 함</option>
                  {IMPORT_FIELDS.map((f) => (
                    <option key={f} value={f}>
                      {FIELD_LABEL[f]}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field label="반학년 기준 학년도" hint="적힌 반 학년이 어느 학년도 기준인지">
              <input type="number" className={inputClass} value={basisYear} onChange={(e) => setBasisYear(Number(e.target.value) || schoolYearOf(today))} />
            </Field>
            <Field label="반 배정 시작일">
              <input type="date" className={inputClass} value={startDate} onChange={(e) => setStartDate(e.target.value || today)} />
            </Field>
          </div>
          {!mapping.includes('name') && <p className="mt-3 text-base text-red-700">"이름" 열을 골라 주세요.</p>}
          <div className="mt-4 flex gap-2">
            <Button className="flex-1" onClick={() => setStep('paste')}>
              이전
            </Button>
            <Button variant="primary" className="flex-1" disabled={!mapping.includes('name')} onClick={toPreview}>
              다음: 미리보기
            </Button>
          </div>
        </Card>
      )}

      {step === 'preview' && plan && (
        <>
          <Card>
            <p className="text-base">
              학생 <b>{plan.rows.length - [...skip].filter((l) => plan.rows.some((r) => r.line === l)).length}명</b> 가져오기 · 새 반{' '}
              <b>{plan.newClasses.length}개</b> · 확인 필요 <b>{plan.rows.filter((r) => r.student.needsReview && !skip.has(r.line)).length}명</b>
            </p>
            {plan.newClasses.length > 0 && (
              <p className="mt-2 text-sm text-stone-600">
                새로 만들 반:{' '}
                {plan.newClasses
                  .map((c) => `${WEEKDAY_NAMES[c.row.weekday]} ${shortTime(c.row.startTime)} ${c.row.gradeCode === null ? '학년 미정' : gradeLabel(c.row.gradeCode + (schoolYearOf(today) - basisYear))}`)
                  .join(', ')}
              </p>
            )}
          </Card>
          <ul className="space-y-2">
            {plan.rows.map((r) => {
              const skipped = skip.has(r.line);
              const cls = r.classKey
                ? (roster.classes.find((c) => c.id === r.classKey) ?? plan.newClasses.find((c) => c.key === r.classKey)?.row)
                : null;
              return (
                <li key={r.line} className={`rounded-xl border bg-white p-3 ${skipped ? 'border-stone-200 opacity-50' : 'border-stone-300'}`}>
                  <div className="flex flex-wrap items-center gap-1.5 text-base">
                    <span className="text-sm text-stone-400">{r.line}</span>
                    <span className="font-semibold">{r.student.name}</span>
                    <span className="text-stone-500">{gradeLabel(gradeCodeOn(r.student, today))}</span>
                    <span className="text-sm text-stone-600">{cls ? `${WEEKDAY_NAMES[cls.weekday]} ${shortTime(cls.startTime)}` : '반 미배정'}</span>
                    {r.student.needsReview && <span className="rounded-full bg-amber-100 px-2 text-sm text-amber-900">확인 필요</span>}
                  </div>
                  {r.problems.length > 0 && <p className="mt-1 text-sm text-red-700">{r.problems.join(' / ')}</p>}
                  {r.duplicate && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="flex-1 text-sm font-semibold text-amber-800">중복 의심: 같은 이름이 이미 있어요</span>
                      <Button
                        className="px-3"
                        onClick={() => {
                          const next = new Set(skip);
                          if (skipped) next.delete(r.line);
                          else next.add(r.line);
                          setSkip(next);
                        }}
                      >
                        {skipped ? '새로 추가' : '건너뛰기'}
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => setStep('map')}>
              이전
            </Button>
            <Button variant="primary" className="flex-1" onClick={() => setConfirming(true)}>
              가져오기
            </Button>
          </div>
        </>
      )}

      {confirming && (
        <ConfirmDialog
          title="가져올까요?"
          body="미리보기대로 학생과 반을 만들어요. 나중에 학생 카드에서 하나씩 고칠 수 있어요."
          confirmLabel="가져오기"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            void run();
          }}
        />
      )}
    </div>
  );
}
