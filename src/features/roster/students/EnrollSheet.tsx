// 반 배정·이동 바텀시트(학생 카드, 반 상세에서 함께 쓴다).
// 적용일 기본값: 다른 반에서 옮기면 새 반 요일의 "다음 수업월 1주", 처음 배정이면 그 반의 다음 수업일.
// 정원: 4명까지는 그냥, 5번째는 확인 후 허용, 6명 이상은 불가.
import { useMemo, useState } from 'react';
import { useAppData } from '../../../app/AppDataContext.tsx';
import { todayStr, useRoster } from '../../../app/RosterContext.tsx';
import { BottomSheet, Button, ConfirmDialog, Field, inputClass } from '../../../components/ui.tsx';
import { isClassActive } from '../../../engine/classTime.ts';
import type { ClassRow } from '../../../storage/rosterTypes.ts';
import { CAPACITY, CAPACITY_MAX, classDisplayName, classHeadcount, compareClasses, currentEnrollment } from '../rosterModel.ts';
import { nextSessionDate, nextWeek1Date, planEnroll } from './studentModel.ts';

export function EnrollSheet({
  studentId,
  presetClassId,
  onClose,
}: {
  studentId: string;
  presetClassId?: string;
  onClose: () => void;
}) {
  const { data } = useAppData();
  const { roster, mutate } = useRoster();
  const today = todayStr();
  const student = roster.students.find((s) => s.id === studentId);
  const current = currentEnrollment(roster.enrollments, studentId, today);
  const classes = roster.classes.filter((c) => isClassActive(c, today) && c.id !== current?.classId).sort(compareClasses);
  const [classId, setClassId] = useState(presetClassId ?? classes[0]?.id ?? '');
  const target = roster.classes.find((c) => c.id === classId) ?? null;

  const suggested = useMemo(() => {
    if (!target) return today;
    return (current ? nextWeek1Date(data, target.weekday, today) : nextSessionDate(data, target.weekday, today)) ?? today;
  }, [data, target, current, today]);
  const [dateEdited, setDateEdited] = useState<string | null>(null);
  const applyDate = dateEdited ?? suggested;
  const [confirmOver, setConfirmOver] = useState(false);

  if (!student) return null;
  const count = target ? classHeadcount(roster, target.id, applyDate < today ? today : applyDate) : 0;
  const after = count + 1;
  const blocked = after > CAPACITY_MAX;

  const save = async () => {
    if (!target || blocked) return;
    const change = planEnroll(roster, studentId, target, applyDate, today);
    // 첫 배정이면 첫 수업일을 제안값으로 채운다
    if (!current && !student.firstClassOn) {
      change.upsert = { ...change.upsert, students: [{ ...student, firstClassOn: applyDate }] };
    }
    const ok = await mutate(change, current ? '반을 옮겼어요' : '반에 넣었어요');
    if (ok) onClose();
  };

  const currentClass = current ? roster.classes.find((c) => c.id === current.classId) : null;

  return (
    <BottomSheet title={current ? '반 이동' : '반 배정'} onClose={onClose}>
      <div className="space-y-4">
        {currentClass && (
          <p className="text-base text-stone-600">
            지금 반: <b>{classDisplayName(currentClass, today)}</b>
          </p>
        )}
        {!presetClassId && (
          <Field label={current ? '옮길 반' : '반'}>
            <select className={inputClass} value={classId} onChange={(e) => {
                setClassId(e.target.value);
                setDateEdited(null);
              }}>
              {classes.map((c: ClassRow) => (
                <option key={c.id} value={c.id}>
                  {classDisplayName(c, today)} ({classHeadcount(roster, c.id, today)}/{CAPACITY})
                </option>
              ))}
            </select>
          </Field>
        )}
        {presetClassId && target && (
          <p className="text-base">
            <b>{classDisplayName(target, today)}</b>에 <b>{student.name}</b> 넣기
          </p>
        )}
        <Field label="적용일" hint={current ? '기본값: 새 반 요일의 다음 수업월 1주' : '기본값: 그 반의 다음 수업일'}>
          <input type="date" className={inputClass} value={applyDate} onChange={(e) => setDateEdited(e.target.value || null)} />
        </Field>
        {blocked && <p className="rounded-xl bg-red-50 p-3 text-base text-red-800">이 반은 이미 {count}명이라 더 넣을 수 없어요(최대 {CAPACITY_MAX}명).</p>}
        <Button
          variant="primary"
          className="w-full"
          disabled={!target || blocked}
          onClick={() => (after > CAPACITY ? setConfirmOver(true) : save())}
        >
          {current ? '옮기기' : '넣기'}
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
