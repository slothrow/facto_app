// 반 상세: 반 정보, 현재 명단(학생 추가·이동·빼기), 수정, 폐반.
import { useState } from 'react';
import { navigate } from '../../../app/router.ts';
import { todayStr, useRoster } from '../../../app/RosterContext.tsx';
import { ChevronLeft } from '../../../components/icons.tsx';
import { Button, Card, ConfirmDialog, Field, inputClass } from '../../../components/ui.tsx';
import { formatTimeKo, isClassActive } from '../../../engine/classTime.ts';
import { CAPACITY, classBadges, classDisplayName, classEndTime, classHeadcount } from '../rosterModel.ts';
import { ClassMembers } from './ClassMembers.tsx';
import { ClassForm } from './ClassForm.tsx';
import { ClassProgress } from '../../curriculum/ClassProgress.tsx';

export function ClassDetail({ classId }: { classId: string }) {
  const { roster, mutate } = useRoster();
  const today = todayStr();
  const cls = roster.classes.find((c) => c.id === classId);
  const [editing, setEditing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeDate, setCloseDate] = useState(today);

  if (!cls) {
    return (
      <Card>
        <p className="mb-3 text-base">반을 찾을 수 없어요.</p>
        <Button onClick={() => navigate('/roster/classes')}>반 목록으로</Button>
      </Card>
    );
  }

  const active = isClassActive(cls, today);
  const count = classHeadcount(roster, cls.id, today);
  const badges = classBadges(roster, cls, today);

  return (
    <div className="space-y-4">
      <button type="button" onClick={() => navigate('/roster/classes')} className="flex h-11 items-center gap-1 text-base text-stone-600">
        <ChevronLeft className="h-5 w-5" /> 시간표
      </button>

      <Card>
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <h1 className="text-xl font-bold">{classDisplayName(cls, today)}</h1>
            <p className="mt-1 text-base text-stone-600">
              {formatTimeKo(cls.startTime)} ~ {formatTimeKo(classEndTime(cls))} · {count}/{CAPACITY}명
            </p>
            {!active && <p className="mt-1 text-base font-semibold text-stone-500">{cls.closedOn} 폐반</p>}
            {cls.openedOn && <p className="text-sm text-stone-500">개설일 {cls.openedOn}</p>}
          </div>
          <Button onClick={() => setEditing(true)}>수정</Button>
        </div>
        {badges.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {badges.map((b) => (
              <span key={b.kind} className="rounded-full bg-amber-100 px-2 py-0.5 text-sm text-amber-900">
                {b.text}
              </span>
            ))}
          </div>
        )}
        {cls.memo && <p className="mt-3 whitespace-pre-wrap rounded-xl bg-stone-50 p-3 text-base text-stone-700">{cls.memo}</p>}
      </Card>

      <ClassMembers cls={cls} />

      <ClassProgress cls={cls} />

      {active ? (
        <Button variant="ghost" className="w-full text-red-700" onClick={() => setClosing(true)}>
          폐반하기
        </Button>
      ) : (
        <Button
          className="w-full"
          onClick={() => mutate({ upsert: { classes: [{ ...cls, closedOn: null }] } }, '반을 다시 운영해요')}
        >
          폐반 취소(다시 운영)
        </Button>
      )}

      {editing && <ClassForm initial={cls} onClose={() => setEditing(false)} />}
      {closing && (
        <ConfirmDialog
          title="폐반할까요?"
          body={
            <div className="space-y-3">
              <p>반은 지우지 않고 폐반으로 남겨요. 지난 출석 기록은 그대로 보존돼요.</p>
              {count > 0 && <p className="font-semibold text-amber-800">아직 학생 {count}명이 배정돼 있어요. 먼저 다른 반으로 옮기는 게 좋아요.</p>}
              <Field label="폐반일(이 날부터 수업 없음)">
                <input type="date" className={inputClass} value={closeDate} onChange={(e) => setCloseDate(e.target.value)} />
              </Field>
            </div>
          }
          confirmLabel="폐반"
          danger
          onCancel={() => setClosing(false)}
          onConfirm={async () => {
            setClosing(false);
            await mutate({ upsert: { classes: [{ ...cls, closedOn: closeDate || today }] } }, '폐반했어요');
          }}
        />
      )}
    </div>
  );
}
