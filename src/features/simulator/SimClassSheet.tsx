// 시안 반 만들기·고치기(SPEC_simulator 4.5). 학년은 지금 보고 있는 학년 보기 기준으로 고르고,
// 저장할 때 그 학년도와 함께 기록한다. 시작 진도 기본값 = 학년 기본 단계 1단원.
import { useState } from 'react';
import { BottomSheet, Button, Field, inputClass } from '../../components/ui.tsx';
import { shortTime, startTimeOptions } from '../../engine/classTime.ts';
import { STAGES, STAGE_NAMES, type StageId } from '../../engine/curriculum.ts';
import { classGradeCodeOn, gradeOptions, schoolYearOf } from '../../engine/grade.ts';
import { canPlace, viewDateOf, type OperatingHours, type SimDraft } from '../../engine/simulator/index.ts';
import type { Weekday } from '../../engine/types.ts';
import type { SimClassRow } from '../../storage/rosterTypes.ts';
import { CLASS_WEEKDAYS, WEEKDAY_NAMES } from '../roster/rosterModel.ts';

export type SimClassFields = Pick<SimClassRow, 'weekday' | 'startTime' | 'gradeCode' | 'gradeBasisYear' | 'alias' | 'memo' | 'startStage' | 'startUnit'>;

export function SimClassSheet({
  d,
  hours,
  initial,
  preset,
  onSave,
  onClose,
}: {
  d: SimDraft;
  hours: OperatingHours;
  /** 고치기: 기존 시안 반 */
  initial?: SimClassRow;
  preset?: { weekday: Weekday; startTime: string };
  onSave: (fields: SimClassFields) => void;
  onClose: () => void;
}) {
  const view = d.draft.gradeView;
  const viewDate = viewDateOf(d.draft);
  const [weekday, setWeekday] = useState<Weekday>(initial?.weekday ?? preset?.weekday ?? 1);
  const [startTime, setStartTime] = useState(initial?.startTime ?? preset?.startTime ?? '14:30');
  const [grade, setGrade] = useState<number>(initial ? (classGradeCodeOn(initial, viewDate) ?? -1) : 4);
  const [alias, setAlias] = useState(initial?.alias ?? '');
  const [memo, setMemo] = useState(initial?.memo ?? '');
  const [stage, setStage] = useState<StageId | ''>(initial?.startStage ?? '');
  const [unit, setUnit] = useState(initial?.startUnit ?? 1);
  const isSource = Boolean(initial?.sourceClassId);

  const place = canPlace(d, initial?.id ?? null, weekday, startTime, hours);
  const save = () =>
    onSave({
      weekday,
      startTime,
      ...(grade < 0 ? { gradeCode: null, gradeBasisYear: null } : { gradeCode: grade, gradeBasisYear: schoolYearOf(viewDate) }),
      alias: alias.trim() || null,
      memo: memo.trim() || null,
      startStage: isSource ? (initial?.startStage ?? null) : stage || null,
      startUnit: isSource ? (initial?.startUnit ?? null) : stage && stage !== 'basic' ? unit : null,
    });

  return (
    <BottomSheet title={initial ? '반 정보' : '새 반 만들기'} onClose={onClose}>
      <div className="space-y-3">
        {!initial && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="요일">
              <select className={inputClass} value={weekday} onChange={(e) => setWeekday(Number(e.target.value) as Weekday)}>
                {CLASS_WEEKDAYS.map((wd) => (
                  <option key={wd} value={wd}>
                    {WEEKDAY_NAMES[wd]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="시작 시간">
              <select className={inputClass} value={startTime} onChange={(e) => setStartTime(e.target.value)}>
                {startTimeOptions('12:00', '20:00').map((t) => (
                  <option key={t} value={t}>
                    {shortTime(t)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
        <Field label={`학년 (${view === 'next' ? '다음 학년도' : '현재 학년도'} 기준)`}>
          <select className={inputClass} value={grade} onChange={(e) => setGrade(Number(e.target.value))}>
            <option value={-1}>학년 미정</option>
            {gradeOptions().map((g) => (
              <option key={g.code} value={g.code}>
                {g.label}
                {view === 'next' ? '(예비)' : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="별칭">
          <input className={inputClass} value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="예: A, 예비" />
        </Field>
        <Field label="반 메모" hint="고민 메모. 적용할 때 실제 반에는 반영하지 않아요">
          <textarea className={`${inputClass} min-h-20 py-2`} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: ?? 4명 채울 수 있을지" />
        </Field>
        {isSource ? (
          <p className="text-sm text-stone-500">진도는 실제 반 진도를 그대로 따라가요(옮겨도 유지).</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Field label="시작 진도">
              <select className={inputClass} value={stage} onChange={(e) => setStage(e.target.value as StageId | '')}>
                <option value="">학년 기본 단계</option>
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {STAGE_NAMES[s]}
                  </option>
                ))}
              </select>
            </Field>
            {stage && stage !== 'basic' ? (
              <Field label="단원">
                <select className={inputClass} value={unit} onChange={(e) => setUnit(Number(e.target.value))}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((u) => (
                    <option key={u} value={u}>
                      {u}단원
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <p className="self-end pb-2 text-sm text-stone-500">{stage ? '' : '1단원부터'}</p>
            )}
          </div>
        )}
        {!initial && place.kind !== 'ok' && (
          <p className={`rounded-xl px-3 py-2 text-sm ${place.kind === 'block' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>
            {place.kind === 'block' ? '놓을 수 없어요: ' : '경고: '}
            {place.reasons.join(', ')}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" disabled={!initial && place.kind === 'block'} onClick={save}>
            {initial ? '저장' : '만들기'}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
