// 체험수업 기록(SPEC 7장): 날짜, 시간, 대상(대기자 연결 또는 이름·학년), 반(선택), 메모.
// 체험은 보통 정규수업이 끝난 6:30 이후에 따로 잡으므로 기본은 "따로" + 6:30.
// 대기자에 연결하면 대기자 단계를 "체험 예약"으로 바꾼다(이미 더 진행된 단계면 그대로).
import { useState } from 'react';
import { todayStr, useRoster } from '../../../app/RosterContext.tsx';
import { BottomSheet, Button, ConfirmDialog, Field, inputClass } from '../../../components/ui.tsx';
import { formatTimeKo, isClassOpenOn, startTimeOptions } from '../../../engine/classTime.ts';
import { weekdayOf } from '../../../engine/dates.ts';
import { gradeCodeOn, gradeOptions, gradeToStore } from '../../../engine/grade.ts';
import { newId, type TrialLessonRow } from '../../../storage/rosterTypes.ts';
import { classDisplayName, compareClasses } from '../rosterModel.ts';
import { OPEN_STAGES, trialChange } from './waitlistModel.ts';

export const DEFAULT_TRIAL_TIME = '18:30';

export function TrialForm({
  onClose,
  initial,
  presetWaitlistId,
  presetDate,
  presetClassId,
}: {
  onClose: () => void;
  /** 있으면 수정 모드(삭제 버튼 포함) */
  initial?: TrialLessonRow;
  presetWaitlistId?: string;
  presetDate?: string;
  presetClassId?: string;
}) {
  const { roster, mutate } = useRoster();
  const today = todayStr();
  const presetClass = presetClassId ? roster.classes.find((c) => c.id === presetClassId) : null;
  const [date, setDate] = useState(initial?.date ?? presetDate ?? today);
  const [classId, setClassId] = useState(initial?.classId ?? presetClassId ?? '');
  const [time, setTime] = useState(initial?.startTime ?? presetClass?.startTime ?? DEFAULT_TRIAL_TIME);
  const [waitlistId, setWaitlistId] = useState(initial?.waitlistId ?? presetWaitlistId ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [grade, setGrade] = useState<number | ''>(() => {
    if (!initial || initial.gradeCode === null || initial.gradeBasisYear === null) return '';
    return gradeCodeOn({ birthday: null, gradeCode: initial.gradeCode, gradeBasisYear: initial.gradeBasisYear }, today) ?? '';
  });
  const [memo, setMemo] = useState(initial?.memo ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const wd = weekdayOf(date);
  const classes = roster.classes.filter((c) => c.weekday === wd && isClassOpenOn(c, date)).sort(compareClasses);
  const candidates = roster.waitlist.filter((w) => OPEN_STAGES.includes(w.stage) || w.id === presetWaitlistId);
  const times = startTimeOptions('09:00', '21:00');

  const save = async () => {
    const inClass = classes.find((c) => c.id === classId) ?? null;
    const trial: TrialLessonRow = {
      id: initial?.id ?? newId(),
      date,
      classId: inClass?.id ?? null,
      waitlistId: waitlistId || null,
      name: waitlistId ? '' : name.trim(),
      memo: memo.trim() || null,
      startTime: inClass?.startTime ?? time,
      ...(waitlistId || grade === '' ? { gradeCode: null, gradeBasisYear: null } : gradeToStore(grade, today)),
    };
    if (await mutate(trialChange(trial, roster.waitlist, today), initial ? '체험수업을 고쳤어요' : '체험수업을 기록했어요')) onClose();
  };

  if (confirmDelete && initial) {
    return (
      <ConfirmDialog
        title="체험 기록을 지울까요?"
        body={`${initial.date} ${initial.startTime ? formatTimeKo(initial.startTime) : ''}`}
        confirmLabel="지우기"
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          if (await mutate({ remove: { trialLessons: [initial] } }, '체험 기록을 지웠어요')) onClose();
        }}
      />
    );
  }

  return (
    <BottomSheet title={initial ? '체험수업 수정' : '체험수업 기록'} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="날짜">
            <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value || today)} />
          </Field>
          <Field label="시간">
            <select className={inputClass} value={time} disabled={Boolean(classId)} onChange={(e) => setTime(e.target.value)}>
              {times.map((t) => (
                <option key={t} value={t}>
                  {formatTimeKo(t)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="대상">
          <select className={inputClass} value={waitlistId} onChange={(e) => setWaitlistId(e.target.value)} disabled={Boolean(presetWaitlistId)}>
            <option value="">이름 직접 입력</option>
            {candidates.map((w) => (
              <option key={w.id} value={w.id}>
                대기자: {w.name}
              </option>
            ))}
          </select>
        </Field>
        {!waitlistId && (
          <div className="grid grid-cols-[1fr_7rem] gap-3">
            <Field label="이름">
              <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="나이·학년">
              <select className={inputClass} value={grade} onChange={(e) => setGrade(e.target.value === '' ? '' : Number(e.target.value))}>
                <option value="">-</option>
                {gradeOptions().map((g) => (
                  <option key={g.code} value={g.code}>
                    {g.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
        <Field label="정규 반에 들어가서 체험" hint="보통은 '따로'(정규수업 뒤 별도 시간)">
          <select
            className={inputClass}
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              const c = classes.find((x) => x.id === e.target.value);
              if (c) setTime(c.startTime);
            }}
          >
            <option value="">따로</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {classDisplayName(c, date)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="메모 (선택)">
          <input className={inputClass} value={memo} onChange={(e) => setMemo(e.target.value)} />
        </Field>
        <Button variant="primary" className="w-full" disabled={!waitlistId && !name.trim()} onClick={save}>
          저장
        </Button>
        {initial && (
          <Button variant="ghost" className="w-full text-red-700" onClick={() => setConfirmDelete(true)}>
            이 체험 기록 삭제
          </Button>
        )}
      </div>
    </BottomSheet>
  );
}
