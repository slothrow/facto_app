// 홈 할 일 영역(SPEC_home 3.1, 4.2): 오늘(지난 것 빨간색 맨 위) / 이번 주 / 다가오는 일, [+] 직접 추가.
// 할 일을 누르면: 바로 가기, [완료](메모 선택), [미루기](내일·다음 주 월요일), [숨기기](자동 할 일).
import { useState } from 'react';
import { navigate } from '../../app/router.ts';
import { useRoster } from '../../app/RosterContext.tsx';
import { PlusIcon } from '../../components/icons.tsx';
import { BottomSheet, Button, Card, ConfirmDialog, Field, inputClass } from '../../components/ui.tsx';
import { addDays, weekdayOf } from '../../engine/dates.ts';
import { WEEKDAY_NAMES } from '../../engine/label.ts';
import { nextMonday, type Buckets, type ShownTask } from '../../engine/tasks/index.ts';
import { newId, type TaskCategory, type TaskRow } from '../../storage/rosterTypes.ts';
import { setTaskState } from './taskModel.ts';

export const TASK_CATEGORIES: TaskCategory[] = ['운영', '행사', '세무', '홍보'];

const dueText = (due: string, today: string) => {
  if (due === today) return '오늘';
  if (due === addDays(today, 1)) return '내일';
  return `${Number(due.slice(5, 7))}/${Number(due.slice(8))}(${WEEKDAY_NAMES[weekdayOf(due)]})`;
};

export function TaskSections({ buckets, today }: { buckets: Buckets; today: string }) {
  const [picked, setPicked] = useState<ShownTask | null>(null);
  const [adding, setAdding] = useState(false);
  const empty = buckets.today.length + buckets.week.length + buckets.upcoming.length === 0;

  return (
    <>
      <Card
        title={
          <span className="flex items-center">
            <span className="flex-1">오늘 할 일 {buckets.today.length > 0 && <span className="text-emerald-800">{buckets.today.length}</span>}</span>
            <button type="button" aria-label="할 일 추가" onClick={() => setAdding(true)} className="flex h-10 items-center gap-1 rounded-xl border border-stone-300 px-3 text-base font-semibold active:bg-stone-100">
              <PlusIcon className="h-4 w-4" /> 추가
            </button>
          </span>
        }
      >
        {buckets.today.length === 0 ? <p className="text-base text-stone-500">{empty ? '할 일이 없어요.' : '오늘은 할 일이 없어요.'}</p> : <TaskList tasks={buckets.today} today={today} onPick={setPicked} />}
      </Card>
      {buckets.week.length > 0 && (
        <Card title={`이번 주 ${buckets.week.length}`}>
          <TaskList tasks={buckets.week} today={today} onPick={setPicked} />
        </Card>
      )}
      {buckets.upcoming.length > 0 && (
        <Card title={`다가오는 일 (2주 안) ${buckets.upcoming.length}`}>
          <TaskList tasks={buckets.upcoming} today={today} onPick={setPicked} />
        </Card>
      )}
      {picked && <TaskSheet task={picked} today={today} onClose={() => setPicked(null)} />}
      {adding && <TaskForm today={today} onClose={() => setAdding(false)} />}
    </>
  );
}

function TaskList({ tasks, today, onPick }: { tasks: ShownTask[]; today: string; onPick: (t: ShownTask) => void }) {
  return (
    <ul className="divide-y divide-stone-100">
      {tasks.map((t) => (
        <li key={t.key}>
          <button type="button" onClick={() => onPick(t)} className="flex min-h-12 w-full items-start gap-2 py-2 text-left active:bg-stone-50">
            <span className={`mt-0.5 shrink-0 rounded px-1.5 text-sm font-bold ${t.overdue ? 'bg-red-600 text-white' : 'bg-stone-100 text-stone-700'}`}>{dueText(t.effectiveDue, today)}</span>
            <span className="min-w-0 flex-1">
              <span className={`block text-base font-semibold ${t.overdue ? 'text-red-700' : ''}`}>
                {t.category && <span className="mr-1 text-sm font-normal text-stone-500">[{t.category}]</span>}
                {t.title}
              </span>
              {t.detail && <span className="block truncate text-sm text-stone-600">{t.detail}</span>}
              {t.lastMemo && <span className="block truncate text-sm text-sky-800">지난번 메모: {t.lastMemo}</span>}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function TaskSheet({ task, today, onClose }: { task: ShownTask; today: string; onClose: () => void }) {
  const { roster, mutate } = useRoster();
  const [memo, setMemo] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const now = new Date().toISOString();
  const save = async (patch: Parameters<typeof setTaskState>[1], msg: string) => {
    if (await mutate(setTaskState(task.key, patch, now), msg)) onClose();
  };
  const manual = task.kind === 'manual' ? roster.tasks.find((t) => `manual:${t.id}` === task.key) : undefined;

  if (confirmDelete && manual) {
    return (
      <ConfirmDialog
        title="이 할 일을 지울까요?"
        body={manual.title}
        confirmLabel="지우기"
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          const st = roster.taskStates.filter((s) => s.taskKey === task.key);
          if (await mutate({ remove: { tasks: [manual], taskStates: st } }, '할 일을 지웠어요')) onClose();
        }}
      />
    );
  }

  return (
    <BottomSheet title={task.title} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-base text-stone-600">
          기한 {dueText(task.due, today)}
          {task.detail && <> · {task.detail}</>}
        </p>
        {task.lastMemo && <p className="rounded-xl bg-sky-50 p-3 text-base text-sky-900">지난번 메모: {task.lastMemo}</p>}
        {task.link && (
          <Button
            variant="primary"
            className="w-full"
            onClick={() => {
              onClose();
              navigate(task.link!);
            }}
          >
            바로 가기
          </Button>
        )}
        {!task.autoResolve && (
          <div className="space-y-2 rounded-xl border border-stone-200 p-3">
            <Field label="메모 (선택)">
              <textarea className={`${inputClass} min-h-16 py-2`} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="다음에 같은 할 일이 뜰 때 함께 보여요" />
            </Field>
            <Button variant="primary" className="w-full" onClick={() => save({ status: 'done', memo: memo.trim() || null }, '완료했어요')}>
              완료
            </Button>
          </div>
        )}
        {task.autoResolve && <p className="text-sm text-stone-500">처리하면 저절로 사라져요.</p>}
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => save({ status: 'snoozed', snoozeUntil: addDays(today, 1) }, '내일로 미뤘어요')}>내일로 미루기</Button>
          <Button onClick={() => save({ status: 'snoozed', snoozeUntil: nextMonday(today) }, '다음 주 월요일로 미뤘어요')}>다음 주 월요일</Button>
        </div>
        {task.kind !== 'manual' && (
          <Button variant="ghost" className="w-full" onClick={() => save({ status: 'hidden' }, '이번 건은 숨겼어요')}>
            이번 건 숨기기
          </Button>
        )}
        {manual && (
          <Button variant="ghost" className="w-full text-red-700" onClick={() => setConfirmDelete(true)}>
            할 일 지우기
          </Button>
        )}
      </div>
    </BottomSheet>
  );
}

function TaskForm({ today, onClose }: { today: string; onClose: () => void }) {
  const { mutate } = useRoster();
  const [title, setTitle] = useState('');
  const [due, setDue] = useState(today);
  const [category, setCategory] = useState<TaskCategory | ''>('');
  const [memo, setMemo] = useState('');
  const save = async () => {
    const row: TaskRow = { id: newId(), title: title.trim(), dueDate: due, memo: memo.trim() || null, category: category || null, createdAt: new Date().toISOString() };
    if (await mutate({ upsert: { tasks: [row] } }, '할 일을 추가했어요')) onClose();
  };
  return (
    <BottomSheet title="할 일 추가" onClose={onClose}>
      <div className="space-y-4">
        <Field label="할 일 *">
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="기한">
            <input type="date" className={inputClass} value={due} onChange={(e) => setDue(e.target.value || today)} />
          </Field>
          <Field label="분류">
            <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value as TaskCategory | '')}>
              <option value="">-</option>
              {TASK_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="메모">
          <textarea className={`${inputClass} min-h-16 py-2`} value={memo} onChange={(e) => setMemo(e.target.value)} />
        </Field>
        <Button variant="primary" className="w-full" disabled={!title.trim()} onClick={save}>
          저장
        </Button>
      </div>
    </BottomSheet>
  );
}
