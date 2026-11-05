// 체험수업 기록(SPEC 7장): 날짜, 반(선택), 대상(대기자 연결 또는 이름), 메모.
// 대기자에 연결하면 대기자 단계를 "체험 예약"으로 바꾼다(이미 더 진행된 단계면 그대로).
import { useState } from 'react';
import { todayStr, useRoster } from '../../../app/RosterContext.tsx';
import { BottomSheet, Button, Field, inputClass } from '../../../components/ui.tsx';
import { isClassOpenOn } from '../../../engine/classTime.ts';
import { weekdayOf } from '../../../engine/dates.ts';
import { newId, type TrialLessonRow } from '../../../storage/rosterTypes.ts';
import { classDisplayName, compareClasses } from '../rosterModel.ts';
import { OPEN_STAGES, trialChange } from './waitlistModel.ts';

export function TrialForm({
  onClose,
  presetWaitlistId,
  presetDate,
  presetClassId,
}: {
  onClose: () => void;
  presetWaitlistId?: string;
  presetDate?: string;
  presetClassId?: string;
}) {
  const { roster, mutate } = useRoster();
  const today = todayStr();
  const [date, setDate] = useState(presetDate ?? today);
  const [classId, setClassId] = useState(presetClassId ?? '');
  const [waitlistId, setWaitlistId] = useState(presetWaitlistId ?? '');
  const [name, setName] = useState('');
  const [memo, setMemo] = useState('');
  const wd = weekdayOf(date);
  const classes = roster.classes.filter((c) => c.weekday === wd && isClassOpenOn(c, date)).sort(compareClasses);
  const candidates = roster.waitlist.filter((w) => OPEN_STAGES.includes(w.stage) || w.id === presetWaitlistId);

  const save = async () => {
    const trial: TrialLessonRow = {
      id: newId(),
      date,
      classId: classes.some((c) => c.id === classId) ? classId : null,
      waitlistId: waitlistId || null,
      name: waitlistId ? '' : name.trim(),
      memo: memo.trim() || null,
    };
    if (await mutate(trialChange(trial, roster.waitlist, today), '체험수업을 기록했어요')) onClose();
  };

  return (
    <BottomSheet title="체험수업 기록" onClose={onClose}>
      <div className="space-y-4">
        <Field label="날짜">
          <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value || today)} />
        </Field>
        <Field label="반 (선택)" hint={classes.length === 0 ? '이 날 요일에 운영하는 반이 없어요' : undefined}>
          <select className={inputClass} value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">반 미정</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {classDisplayName(c, date)}
              </option>
            ))}
          </select>
        </Field>
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
          <Field label="이름">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        )}
        <Field label="메모 (선택)">
          <input className={inputClass} value={memo} onChange={(e) => setMemo(e.target.value)} />
        </Field>
        <Button variant="primary" className="w-full" disabled={!waitlistId && !name.trim()} onClick={save}>
          저장
        </Button>
      </div>
    </BottomSheet>
  );
}
