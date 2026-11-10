// 반 상세의 "진도" 영역(SPEC_briefing 3.4): 이번 수업월 단계·단원, 기준점 목록, 기준점 추가·수정·삭제.
import { useMemo, useState } from 'react';
import { useAppData } from '../../app/AppDataContext.tsx';
import { todayStr, useRoster } from '../../app/RosterContext.tsx';
import { BottomSheet, Button, Card, ConfirmDialog, Field, inputClass } from '../../components/ui.tsx';
import { STAGES, STAGE_NAMES, UNITS_PER_STAGE, codeFor, formatAnchor, formatProgress, type StageId } from '../../engine/curriculum.ts';
import { addMonthsYm, monthsBetween } from '../../engine/dates.ts';
import { newId, type ClassRow, type ProgressAnchorRow } from '../../storage/rosterTypes.ts';
import { anchorsOf, classProgressNow, courseMonthFull, courseMonthLabel, curriculumOf, currentSessionByWeekday, suggestedStage } from './curriculumModel.ts';

export function ClassProgress({ cls }: { cls: ClassRow }) {
  const { data } = useAppData();
  const { roster } = useRoster();
  const today = todayStr();
  const settings = curriculumOf(data);
  const current = useMemo(() => currentSessionByWeekday(data, today), [data, today]);
  const now = classProgressNow(roster, cls, current);
  const anchors = anchorsOf(roster, cls.id);
  const nowCode = codeFor(anchors, now.session, settings);
  const [editing, setEditing] = useState<ProgressAnchorRow | 'new' | null>(null);

  return (
    <Card title="진도">
      <div className="flex items-baseline gap-2">
        <span className={`text-2xl font-bold ${now.progress.kind === 'unset' ? 'text-amber-700' : 'text-emerald-800'}`}>
          {formatProgress(now.progress, settings)}
        </span>
        {now.session && <span className="text-base text-stone-600">· {courseMonthLabel(now.session.courseMonth)}</span>}
      </div>
      {nowCode.kind === 'code' && (
        <p className="mt-1 text-base text-stone-700">
          이번 수업 <b className="text-emerald-800">{nowCode.code}</b>
        </p>
      )}
      {now.progress.kind === 'unset' && <p className="mt-1 text-sm text-stone-600">기준점을 넣으면 달 진도마다 단원이 자동으로 올라가요.</p>}
      {now.progress.kind === 'basic' && <p className="mt-1 text-sm text-stone-600">베이직은 문구 관리 → 베이직 탭에서 날짜별 수업 내용을 미리 적어요.</p>}

      <h3 className="mt-4 mb-1 text-sm font-semibold text-stone-600">기준점</h3>
      {anchors.length === 0 ? (
        <p className="text-base text-stone-500">아직 없어요.</p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {anchors.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => setEditing(a)} className="flex min-h-11 w-full items-center gap-2 text-left active:bg-stone-50">
                <span className="text-base text-stone-600">{courseMonthFull(a.courseMonth)}</span>
                <span className="text-base font-semibold">= {formatAnchor(a, settings)}</span>
                {a.memo && <span className="truncate text-sm text-stone-500">{a.memo}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <Button className="mt-2 w-full" onClick={() => setEditing('new')}>
        기준점 추가
      </Button>

      {editing && (
        <AnchorForm
          cls={cls}
          initial={editing === 'new' ? null : editing}
          defaultMonth={now.session?.courseMonth ?? today.slice(0, 7)}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  );
}

function AnchorForm({
  cls,
  initial,
  defaultMonth,
  onClose,
}: {
  cls: ClassRow;
  initial: ProgressAnchorRow | null;
  defaultMonth: string;
  onClose: () => void;
}) {
  const { data } = useAppData();
  const { roster, mutate } = useRoster();
  const settings = curriculumOf(data);
  const [month, setMonth] = useState(initial?.courseMonth ?? defaultMonth);
  const [stage, setStage] = useState<StageId>(initial?.stage ?? suggestedStage(cls, defaultMonth, settings) ?? 'P');
  const [unit, setUnit] = useState(initial?.unit ?? 1);
  const [unitWeek, setUnitWeek] = useState(initial?.unitWeek ?? 1);
  const [memo, setMemo] = useState(initial?.memo ?? '');
  const [deleting, setDeleting] = useState(false);

  const months = monthsBetween(addMonthsYm(defaultMonth, -12), addMonthsYm(defaultMonth, 12));
  const expected = suggestedStage(cls, month, settings);
  const sameMonth = roster.progressAnchors.find((a) => a.classId === cls.id && a.courseMonth === month && a.id !== initial?.id);

  const save = async () => {
    const row: ProgressAnchorRow = {
      // 같은 수업월 기준점이 이미 있으면 그걸 고친다(반·수업월당 1개)
      id: sameMonth?.id ?? initial?.id ?? newId(),
      classId: cls.id,
      courseMonth: month,
      stage,
      unit: stage === 'basic' ? null : unit,
      unitWeek: stage === 'basic' ? 1 : unitWeek,
      memo: memo.trim() || null,
    };
    const remove = initial && sameMonth ? { progressAnchors: [initial] } : undefined;
    if (await mutate({ upsert: { progressAnchors: [row] }, remove }, '진도 기준점을 저장했어요')) onClose();
  };

  return (
    <BottomSheet title={initial ? '기준점 수정' : '기준점 추가'} onClose={onClose}>
      <div className="space-y-4">
        <Field label="진도 월" hint="달력의 달이 아니라 ○월 진도(4번 수업 묶음) 기준이에요">
          <select className={inputClass} value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.map((m) => (
              <option key={m} value={m}>
                {courseMonthFull(m)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="단계">
          <div className="grid grid-cols-6 gap-1">
            {STAGES.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={stage === s}
                onClick={() => setStage(s)}
                className={`h-11 rounded-xl border text-base font-semibold ${stage === s ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-stone-300 bg-white'} ${s === 'basic' ? 'text-sm' : ''}`}
              >
                {s === 'basic' ? STAGE_NAMES.basic : settings[s].prefix || s}
              </button>
            ))}
          </div>
        </Field>
        {stage !== 'basic' && (
          <Field label="단원">
            <select className={inputClass} value={unit} onChange={(e) => setUnit(Number(e.target.value))}>
              {Array.from({ length: UNITS_PER_STAGE }, (_, i) => i + 1).map((u) => (
                <option key={u} value={u}>
                  {settings[stage].prefix}
                  {u} ({u}단원)
                </option>
              ))}
            </select>
          </Field>
        )}
        {stage !== 'basic' && (
          <Field label="주" hint="그 달 진도 첫 수업이 몇 주 수업인지 골라요">
            <div className="grid grid-cols-4 gap-1">
              {[1, 2, 3, 4].map((w) => (
                <button
                  key={w}
                  type="button"
                  aria-pressed={unitWeek === w}
                  onClick={() => setUnitWeek(w)}
                  className={`h-11 rounded-xl border text-base font-semibold ${unitWeek === w ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-stone-300 bg-white'}`}
                >
                  {settings[stage].prefix}
                  {unit}-{w}
                </button>
              ))}
            </div>
            <p className="mt-2 rounded-xl bg-emerald-50 p-3 text-base text-emerald-900">
              {Number(month.slice(5, 7))}월 진도:{' '}
              {([1, 2, 3, 4] as const)
                .map((w) => {
                  const r = codeFor([{ courseMonth: month, stage, unit, unitWeek }], { courseMonth: month, weekNo: w }, settings);
                  return `${w}회 ${r.kind === 'code' ? r.code : '과정 완료'}`;
                })
                .join(' · ')}
            </p>
          </Field>
        )}
        {expected && expected !== stage && (
          <p className="rounded-xl bg-amber-50 p-3 text-base text-amber-900">
            이 반 학년의 기본 단계는 {expected === 'basic' ? STAGE_NAMES.basic : settings[expected].prefix}예요. 맞는지 확인하세요(저장은 돼요).
          </p>
        )}
        {sameMonth && <p className="rounded-xl bg-stone-100 p-3 text-base">이 달 진도에 기준점이 이미 있어서 그걸 바꿔요.</p>}
        <Field label="메모 (선택)">
          <input className={inputClass} value={memo} onChange={(e) => setMemo(e.target.value)} />
        </Field>
        <Button variant="primary" className="w-full" onClick={() => void save()}>
          저장
        </Button>
        {initial && (
          <Button variant="ghost" className="w-full text-red-700" onClick={() => setDeleting(true)}>
            이 기준점 지우기
          </Button>
        )}
      </div>
      {deleting && initial && (
        <ConfirmDialog
          title="기준점을 지울까요?"
          body="지우면 이 달 진도부터는 그 전 기준점으로 다시 계산돼요."
          confirmLabel="지우기"
          danger
          onCancel={() => setDeleting(false)}
          onConfirm={async () => {
            setDeleting(false);
            if (await mutate({ remove: { progressAnchors: [initial] } }, '기준점을 지웠어요')) onClose();
          }}
        />
      )}
    </BottomSheet>
  );
}
