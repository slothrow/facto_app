// 반 추가·수정 바텀시트. 시간이 겹치면 저장 불가, 간격 10분 미만이면 경고만.
import { useState } from 'react';
import { todayStr, useRoster } from '../../../app/RosterContext.tsx';
import { Button, BottomSheet, Field, inputClass } from '../../../components/ui.tsx';
import { checkClassTime, formatTimeKo, startTimeOptions } from '../../../engine/classTime.ts';
import { classGradeCodeOn, gradeOptions, gradeToStore } from '../../../engine/grade.ts';
import type { Weekday } from '../../../engine/types.ts';
import { newId, type ClassRow } from '../../../storage/rosterTypes.ts';
import { CLASS_WEEKDAYS, WEEKDAY_NAMES, classDisplayName, classEndTime } from '../rosterModel.ts';

export function ClassForm({ initial, onClose, onSaved }: { initial?: ClassRow; onClose: () => void; onSaved?: (c: ClassRow) => void }) {
  const { roster, mutate } = useRoster();
  const today = todayStr();
  const [weekday, setWeekday] = useState<Weekday>(initial?.weekday ?? 1);
  const [startTime, setStartTime] = useState(initial?.startTime ?? '16:30');
  // -1 = 학년 미정
  const [grade, setGrade] = useState<number>(initial ? (classGradeCodeOn(initial, today) ?? -1) : 7);
  const [alias, setAlias] = useState(initial?.alias ?? '');
  const [openedOn, setOpenedOn] = useState(initial?.openedOn ?? '');
  const [memo, setMemo] = useState(initial?.memo ?? '');
  const [id] = useState(() => initial?.id ?? newId());

  const draft: ClassRow = {
    id,
    weekday,
    startTime,
    ...(grade < 0 ? { gradeCode: null, gradeBasisYear: null } : gradeToStore(grade, today)),
    alias: alias.trim() || null,
    openedOn: openedOn || null,
    closedOn: initial?.closedOn ?? null,
    memo: memo.trim() || null,
  };
  // 학년을 바꾸지 않았으면 원래 기준 학년도를 그대로 둔다
  if (initial && (classGradeCodeOn(initial, today) ?? -1) === grade) {
    draft.gradeCode = initial.gradeCode;
    draft.gradeBasisYear = initial.gradeBasisYear;
  }

  const { conflicts, tight } = checkClassTime(draft, roster.classes, today);
  const times = startTimeOptions();
  if (!times.includes(startTime)) times.push(startTime);

  const save = async () => {
    if (conflicts.length > 0) return;
    const ok = await mutate({ upsert: { classes: [draft] } }, initial ? '반 정보를 고쳤어요' : '반을 만들었어요');
    if (ok) {
      onSaved?.(draft);
      onClose();
    }
  };

  return (
    <BottomSheet title={initial ? '반 정보 수정' : '반 추가'} onClose={onClose}>
      <div className="space-y-4">
        <Field label="요일">
          <div className="flex gap-2">
            {CLASS_WEEKDAYS.map((wd) => (
              <button
                key={wd}
                type="button"
                aria-pressed={weekday === wd}
                onClick={() => setWeekday(wd)}
                className={`h-11 flex-1 rounded-xl border text-base font-medium ${
                  weekday === wd ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-stone-300 bg-white'
                }`}
              >
                {WEEKDAY_NAMES[wd]}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="시작 시간" hint={`${formatTimeKo(startTime)} ~ ${formatTimeKo(classEndTime(draft))}`}>
            <select className={inputClass} value={startTime} onChange={(e) => setStartTime(e.target.value)}>
              {times.map((t) => (
                <option key={t} value={t}>
                  {formatTimeKo(t)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="학년">
            <select className={inputClass} value={grade} onChange={(e) => setGrade(Number(e.target.value))}>
              <option value={-1}>학년 미정</option>
              {gradeOptions().map((g) => (
                <option key={g.code} value={g.code}>
                  {g.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="별칭 (선택)" hint={`반 이름: ${classDisplayName(draft, today)}`}>
          <input className={inputClass} value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="예: 심화" />
        </Field>
        <Field label="개설일 (선택)">
          <input type="date" className={inputClass} value={openedOn} onChange={(e) => setOpenedOn(e.target.value)} />
        </Field>
        <Field label="메모 (선택)">
          <textarea className={`${inputClass} min-h-20 py-2`} value={memo} onChange={(e) => setMemo(e.target.value)} />
        </Field>

        {conflicts.length > 0 && (
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-base text-red-800">
            시간이 겹쳐서 저장할 수 없어요: {conflicts.map((c) => classDisplayName(c, today)).join(', ')}
          </p>
        )}
        {conflicts.length === 0 && tight.length > 0 && (
          <p className="rounded-xl bg-amber-50 p-3 text-base text-amber-900">
            앞뒤 반과 쉬는 시간이 10분보다 짧아요: {tight.map((c) => classDisplayName(c, today)).join(', ')}. 저장은 할 수 있어요.
          </p>
        )}

        <Button variant="primary" className="w-full" disabled={conflicts.length > 0} onClick={save}>
          저장
        </Button>
      </div>
    </BottomSheet>
  );
}
