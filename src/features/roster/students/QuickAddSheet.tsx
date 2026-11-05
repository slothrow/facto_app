// 빠른 등록(SPEC 5.4): 이름·학년·반만 받고 저장. 나머지는 학생 카드에서 이어서.
// 대기자에서 [등록하기]로 올 때는 대기자 정보를 채워서 시작한다(9단계).
import { useState } from 'react';
import { useAppData } from '../../../app/AppDataContext.tsx';
import { navigate } from '../../../app/router.ts';
import { todayStr, useRoster } from '../../../app/RosterContext.tsx';
import { BottomSheet, Button, ConfirmDialog, Field, inputClass } from '../../../components/ui.tsx';
import { isClassActive } from '../../../engine/classTime.ts';
import { gradeCodeOn, gradeOptions, gradeToStore } from '../../../engine/grade.ts';
import type { RosterChange, StudentRow } from '../../../storage/rosterTypes.ts';
import { CAPACITY, CAPACITY_MAX, classDisplayName, classHeadcount, compareClasses } from '../rosterModel.ts';
import { blankStudent, nextSessionDate, planEnroll } from './studentModel.ts';

export function QuickAddSheet({
  onClose,
  prefill,
  extraChange,
  presetClassId,
  title = '학생 추가',
}: {
  onClose: () => void;
  /** 미리 채울 학생 정보(대기자 → 학생) */
  prefill?: Partial<StudentRow>;
  /** 저장할 때 함께 저장할 변경(대기자 단계 변경 등). 새 학생 id를 받는다 */
  extraChange?: (studentId: string) => RosterChange;
  presetClassId?: string;
  title?: string;
}) {
  const { data } = useAppData();
  const { roster, mutate } = useRoster();
  const today = todayStr();
  const [name, setName] = useState(prefill?.name ?? '');
  const [grade, setGrade] = useState<number | ''>(() => {
    if (!prefill) return '';
    const g = gradeCodeOn({ birthday: prefill.birthday ?? null, gradeCode: prefill.gradeCode ?? null, gradeBasisYear: prefill.gradeBasisYear ?? null }, today);
    return g ?? '';
  });
  const [classId, setClassId] = useState(presetClassId ?? '');
  const [saved, setSaved] = useState<string | null>(null);
  const [confirmOver, setConfirmOver] = useState(false);
  const classes = roster.classes.filter((c) => isClassActive(c, today)).sort(compareClasses);
  const target = roster.classes.find((c) => c.id === classId) ?? null;
  const after = target ? classHeadcount(roster, target.id, today) + 1 : 0;

  const save = async () => {
    const s: StudentRow = { ...blankStudent(name.trim(), today), ...prefill, name: name.trim() };
    if (grade !== '' && !s.birthday) Object.assign(s, gradeToStore(grade, today));
    const change: RosterChange = { upsert: { students: [s] } };
    if (target) {
      const date = nextSessionDate(data, target.weekday, today) ?? today;
      s.firstClassOn = date;
      change.upsert!.enrollments = planEnroll(roster, s.id, target, date, today).upsert?.enrollments;
    }
    if (extraChange) {
      const extra = extraChange(s.id);
      for (const [k, v] of Object.entries(extra.upsert ?? {})) (change.upsert as Record<string, unknown[]>)[k] = [...(((change.upsert as Record<string, unknown[]>)[k]) ?? []), ...(v as unknown[])];
    }
    if (await mutate(change, '학생을 등록했어요')) setSaved(s.id);
  };

  if (saved) {
    return (
      <BottomSheet title="등록했어요" onClose={onClose}>
        <div className="space-y-3">
          <p className="text-base text-stone-700">연락처·생일 같은 나머지 정보는 지금 넣어도 되고 나중에 넣어도 돼요.</p>
          <Button variant="primary" className="w-full" onClick={() => navigate(`/roster/student/${saved}/edit`)}>
            나머지 정보 입력하기
          </Button>
          <Button className="w-full" onClick={onClose}>
            나중에
          </Button>
        </div>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet title={title} onClose={onClose}>
      <div className="space-y-4">
        <Field label="이름 *">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="학년">
          <select className={inputClass} value={grade} onChange={(e) => setGrade(e.target.value === '' ? '' : Number(e.target.value))}>
            <option value="">선택 안 함</option>
            {gradeOptions().map((g) => (
              <option key={g.code} value={g.code}>
                {g.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="반" hint={target ? `첫 수업: ${nextSessionDate(data, target.weekday, today) ?? '-'}` : undefined}>
          <select className={inputClass} value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">나중에 배정</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {classDisplayName(c, today)} ({classHeadcount(roster, c.id, today)}/{CAPACITY})
              </option>
            ))}
          </select>
        </Field>
        {after > CAPACITY_MAX && <p className="rounded-xl bg-red-50 p-3 text-base text-red-800">이 반은 더 넣을 수 없어요(최대 {CAPACITY_MAX}명).</p>}
        <Button
          variant="primary"
          className="w-full"
          disabled={!name.trim() || after > CAPACITY_MAX}
          onClick={() => (after > CAPACITY ? setConfirmOver(true) : void save())}
        >
          저장
        </Button>
      </div>
      {confirmOver && (
        <ConfirmDialog
          title="정원을 넘어요"
          body={`정원 ${CAPACITY}명을 넘습니다. ${after}명으로 진행할까요?`}
          confirmLabel={`${after}명으로 진행`}
          onCancel={() => setConfirmOver(false)}
          onConfirm={() => {
            setConfirmOver(false);
            void save();
          }}
        />
      )}
    </BottomSheet>
  );
}
