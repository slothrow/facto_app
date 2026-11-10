// 설정 → 할 일 관리 · 반복 할 일: 템플릿 추가·수정·끄기·순서 변경(SPEC_home 4.4).
// 행사 기준 템플릿은 맞는 행사가 없으면 "행사 날짜를 등록하면 표시됩니다".
import { useState } from 'react';
import { useAppData } from '../../app/AppDataContext.tsx';
import { useRoster } from '../../app/RosterContext.tsx';
import { BottomSheet, Button, Card, ConfirmDialog, Field, inputClass } from '../../components/ui.tsx';
import { eventMatches, recurrenceText } from '../../engine/tasks/index.ts';
import { newId, type TaskCategory, type TaskRecurrence, type TaskTemplateRow } from '../../storage/rosterTypes.ts';
import { TASK_CATEGORIES } from '../home/TaskSections.tsx';
import { eventDaysOf } from '../home/templateModel.ts';

export function TemplatesSection() {
  const { data } = useAppData();
  const { roster, mutate } = useRoster();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TaskTemplateRow | 'new' | null>(null);
  const list = [...roster.taskTemplates].sort((a, b) => a.sort - b.sort);
  const events = eventDaysOf(data);

  const move = (i: number, d: -1 | 1) => {
    const a = list[i];
    const b = list[i + d];
    if (!a || !b) return;
    void mutate({ upsert: { taskTemplates: [{ ...a, sort: b.sort }, { ...b, sort: a.sort }] } });
  };

  return (
    <Card title="할 일 관리 · 반복 할 일">
      <p className="text-sm text-stone-500">매월·매년·행사 날짜에 맞춰 홈에 뜨는 할 일이에요. 완료할 때 남긴 메모가 다음번에 함께 보여요.</p>
      <div className="mt-2 flex items-center gap-2">
        <button type="button" className="min-h-11 flex-1 text-left text-base font-semibold text-emerald-800 underline" onClick={() => setOpen(!open)}>
          {open ? '접기' : `${list.filter((t) => t.enabled).length}/${list.length}개 켜짐 · 펼치기`}
        </button>
        <Button className="px-3" onClick={() => setEditing('new')}>
          + 추가
        </Button>
      </div>
      {open && (
        <ul className="mt-2 divide-y divide-stone-100">
          {list.map((t, i) => {
            const needEvent = t.recurrence.type === 'event' && eventMatches(t, events).length === 0;
            return (
              <li key={t.id} className="flex items-center gap-2 py-2">
                <input
                  type="checkbox"
                  aria-label={`${t.title} 켜기`}
                  className="h-6 w-6 shrink-0 accent-emerald-700"
                  checked={t.enabled}
                  onChange={(e) => mutate({ upsert: { taskTemplates: [{ ...t, enabled: e.target.checked }] } }, e.target.checked ? '켰어요' : '껐어요')}
                />
                <button type="button" className="min-h-11 min-w-0 flex-1 text-left" onClick={() => setEditing(t)}>
                  <span className={`block text-base font-semibold ${t.enabled ? '' : 'text-stone-400 line-through'}`}>
                    <span className="mr-1 text-sm font-normal text-stone-500">[{t.category}]</span>
                    {t.title}
                  </span>
                  <span className="block text-sm text-stone-500">
                    {recurrenceText(t.recurrence)} · {t.leadDays}일 전부터
                  </span>
                  {needEvent && <span className="block text-sm text-amber-700">행사 날짜를 등록하면 표시됩니다</span>}
                </button>
                <div className="flex shrink-0 flex-col">
                  <button type="button" aria-label="위로" disabled={i === 0} onClick={() => move(i, -1)} className="h-8 w-9 rounded border border-stone-200 text-sm disabled:opacity-30">
                    ▲
                  </button>
                  <button type="button" aria-label="아래로" disabled={i === list.length - 1} onClick={() => move(i, 1)} className="h-8 w-9 rounded border border-stone-200 text-sm disabled:opacity-30">
                    ▼
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {editing && (
        <TemplateForm
          initial={editing === 'new' ? undefined : editing}
          nextSort={Math.max(0, ...list.map((t) => t.sort)) + 1}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  );
}

type Kind = TaskRecurrence['type'];

function TemplateForm({ initial, nextSort, onClose }: { initial?: TaskTemplateRow; nextSort: number; onClose: () => void }) {
  const { mutate } = useRoster();
  const r = initial?.recurrence;
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [category, setCategory] = useState<TaskCategory>(initial?.category ?? '운영');
  const [kind, setKind] = useState<Kind>(r?.type ?? 'yearly');
  const [day, setDay] = useState<string>(r?.type === 'monthly' ? String(r.day) : r?.type === 'yearly' ? String(r.day) : '1');
  const [month, setMonth] = useState(r?.type === 'yearly' ? r.month : 1);
  const [keyword, setKeyword] = useState(r?.type === 'event' ? r.keyword : '');
  const [offset, setOffset] = useState(r?.type === 'event' ? r.offsetDays : -14);
  const [lead, setLead] = useState(initial?.leadDays ?? 7);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const recurrence = (): TaskRecurrence | null => {
    if (kind === 'monthly') return day === 'last' ? { type: 'monthly', day: 'last' } : { type: 'monthly', day: Math.min(31, Math.max(1, Number(day) || 1)) };
    if (kind === 'yearly') return { type: 'yearly', month, day: Math.min(31, Math.max(1, Number(day) || 1)) };
    return keyword.trim() ? { type: 'event', keyword: keyword.trim(), offsetDays: offset } : null;
  };
  const rec = recurrence();

  const save = async () => {
    if (!rec || !title.trim()) return;
    const row: TaskTemplateRow = {
      id: initial?.id ?? newId(),
      title: title.trim(),
      description: description.trim() || null,
      category,
      recurrence: rec,
      leadDays: Math.max(0, Math.min(60, lead)),
      enabled: initial?.enabled ?? true,
      sort: initial?.sort ?? nextSort,
      memo: initial?.memo ?? null,
    };
    if (await mutate({ upsert: { taskTemplates: [row] } }, initial ? '반복 할 일을 고쳤어요' : '반복 할 일을 추가했어요')) onClose();
  };

  if (confirmDelete && initial) {
    return (
      <ConfirmDialog
        title="이 반복 할 일을 지울까요?"
        body={`${initial.title} — 끄기만 해도 홈에 뜨지 않아요. 지우면 되돌릴 수 없어요.`}
        confirmLabel="지우기"
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          if (await mutate({ remove: { taskTemplates: [initial] } }, '반복 할 일을 지웠어요')) onClose();
        }}
      />
    );
  }

  return (
    <BottomSheet title={initial ? '반복 할 일 수정' : '반복 할 일 추가'} onClose={onClose}>
      <div className="space-y-4">
        <Field label="할 일 *">
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="분류">
            <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value as TaskCategory)}>
              {TASK_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="반복">
            <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
              <option value="monthly">매월</option>
              <option value="yearly">매년</option>
              <option value="event">행사 기준</option>
            </select>
          </Field>
        </div>
        {kind === 'monthly' && (
          <Field label="매월 며칠">
            <select className={inputClass} value={day} onChange={(e) => setDay(e.target.value)}>
              {Array.from({ length: 31 }, (_, i) => String(i + 1)).map((d) => (
                <option key={d} value={d}>
                  {d}일
                </option>
              ))}
              <option value="last">말일</option>
            </select>
          </Field>
        )}
        {kind === 'yearly' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="월">
              <select className={inputClass} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {m}월
                  </option>
                ))}
              </select>
            </Field>
            <Field label="일">
              <select className={inputClass} value={day === 'last' ? '31' : day} onChange={(e) => setDay(e.target.value)}>
                {Array.from({ length: 31 }, (_, i) => String(i + 1)).map((d) => (
                  <option key={d} value={d}>
                    {d}일
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
        {kind === 'event' && (
          <div className="grid grid-cols-[1fr_8rem] gap-3">
            <Field label="행사 이름에 들어간 말" hint="달력에 등록한 행사일 이름">
              <input className={inputClass} value={keyword} placeholder="예: 페스티벌" onChange={(e) => setKeyword(e.target.value)} />
            </Field>
            <Field label="행사 며칠 전">
              <input type="number" inputMode="numeric" className={inputClass} value={-offset} onChange={(e) => setOffset(-(Number(e.target.value) || 0))} />
            </Field>
          </div>
        )}
        <Field label="미리 표시 (기한 며칠 전부터)">
          <input type="number" inputMode="numeric" min={0} max={60} className={inputClass} value={lead} onChange={(e) => setLead(Number(e.target.value) || 0)} />
        </Field>
        <Field label="설명 (선택)">
          <textarea className={`${inputClass} min-h-16 py-2`} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Button variant="primary" className="w-full" disabled={!rec || !title.trim()} onClick={save}>
          저장
        </Button>
        {initial && (
          <Button variant="ghost" className="w-full text-red-700" onClick={() => setConfirmDelete(true)}>
            이 반복 할 일 지우기
          </Button>
        )}
      </div>
    </BottomSheet>
  );
}
