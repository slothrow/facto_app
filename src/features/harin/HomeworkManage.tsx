// 관리 → [숙제] 탭(SPEC_harin 15.1): 숙제 목록 + 추가·고치기. 학원 목록처럼 한 번 등록해 두는 곳.
import { useState } from 'react';
import { useRoster } from '../../app/RosterContext.tsx';
import { Button, ConfirmDialog, Field, inputClass } from '../../components/ui.tsx';
import { HOMEWORK_SUBJECTS, academyDays, mainTimetable, repeatLabel, subjectOf } from '../../engine/harin/index.ts';
import { newId, type KidHomeworkRepeat, type KidHomeworkRow, type KidSubject } from '../../storage/rosterTypes.ts';
import { EmojiField } from './KidFields.tsx';
import { WEEKDAY_LABEL } from './harinModel.ts';

const REPEATS: { id: KidHomeworkRepeat; label: string; hint: string }[] = [
  { id: 'daily', label: '매일', hint: '요일을 골라요 (예: 연산, 독서)' },
  { id: 'academy', label: '학원 숙제', hint: '학원 수업 날에 맞춰 자동으로' },
  { id: 'once', label: '한 번만', hint: '마감일 하루만 (예: 수행평가)' },
];
const MINUTES = [5, 10, 15, 20, 30, 40, 50, 60, 90, 120];

export function HomeworksTab() {
  const { roster, mutate } = useRoster();
  const list = [...roster.kidHomeworks].sort((a, b) => a.sort - b.sort);
  const acts = [...roster.kidActivities].sort((a, b) => a.sort - b.sort);
  const main = mainTimetable(roster.kidTimetables);
  const mainBlocks = main ? roster.kidBlocks.filter((b) => b.timetableId === main.id) : [];
  const [edit, setEdit] = useState<KidHomeworkRow | null>(null);
  const [del, setDel] = useState<KidHomeworkRow | null>(null);

  const blank = (): KidHomeworkRow => ({
    id: newId(),
    name: '',
    subject: 'other',
    emoji: subjectOf('other').emoji,
    minutes: null,
    memo: null,
    active: true,
    repeatType: 'daily',
    weekdays: [1, 2, 3, 4, 5],
    activityId: null,
    dueRule: null,
    dueDate: null,
    sort: list.reduce((m, h) => Math.max(m, h.sort), 0) + 1,
  });

  if (edit) {
    const isNew = !list.some((h) => h.id === edit.id);
    const valid =
      edit.name.trim().length > 0 &&
      (edit.repeatType === 'daily' ? (edit.weekdays ?? []).length > 0 : edit.repeatType === 'academy' ? Boolean(edit.activityId) : Boolean(edit.dueDate));
    const setRepeat = (repeatType: KidHomeworkRepeat) =>
      setEdit({
        ...edit,
        repeatType,
        weekdays: repeatType === 'daily' ? (edit.weekdays?.length ? edit.weekdays : [1, 2, 3, 4, 5]) : null,
        activityId: repeatType === 'academy' ? edit.activityId : null,
        dueRule: repeatType === 'academy' ? (edit.dueRule ?? 'day_before') : null,
        dueDate: repeatType === 'once' ? edit.dueDate : null,
      });
    const pickSubject = (subject: KidSubject) => {
      // 이모지를 직접 바꾸지 않았다면(지금 과목의 기본 이모지) 새 과목의 기본 이모지로 따라간다
      const follow = !edit.emoji || edit.emoji === subjectOf(edit.subject).emoji;
      setEdit({ ...edit, subject, emoji: follow ? subjectOf(subject).emoji : edit.emoji });
    };
    const toggleDay = (wd: number) => {
      const cur = edit.weekdays ?? [];
      setEdit({ ...edit, weekdays: cur.includes(wd) ? cur.filter((d) => d !== wd) : [...cur, wd].sort() });
    };
    return (
      <div className="space-y-3">
        <Field label="이름">
          <input
            className={inputClass}
            value={edit.name}
            maxLength={40}
            placeholder="예: 국어 문제집 2쪽"
            onChange={(e) => setEdit({ ...edit, name: e.target.value })}
            autoFocus={isNew}
          />
        </Field>
        <div>
          <span className="mb-1 block text-sm font-medium text-stone-600">과목</span>
          <div className="flex flex-wrap gap-1.5">
            {HOMEWORK_SUBJECTS.map((s) => (
              <Chip key={s.id} on={edit.subject === s.id} onClick={() => pickSubject(s.id)}>
                {s.emoji} {s.label}
              </Chip>
            ))}
          </div>
        </div>
        <EmojiField value={edit.emoji} onChange={(emoji) => setEdit({ ...edit, emoji })} />
        <Field label="예상 시간(선택)">
          <select className={inputClass} value={edit.minutes ?? ''} onChange={(e) => setEdit({ ...edit, minutes: e.target.value ? Number(e.target.value) : null })}>
            <option value="">정하지 않음</option>
            {MINUTES.map((m) => (
              <option key={m} value={m}>
                {m}분
              </option>
            ))}
          </select>
        </Field>

        <div>
          <span className="mb-1 block text-sm font-medium text-stone-600">언제 하는 숙제인가요?</span>
          <div className="grid grid-cols-3 gap-1.5">
            {REPEATS.map((r) => (
              <Chip key={r.id} on={edit.repeatType === r.id} onClick={() => setRepeat(r.id)} wide>
                {r.label}
              </Chip>
            ))}
          </div>
          <p className="mt-1 text-sm text-stone-500">{REPEATS.find((r) => r.id === edit.repeatType)?.hint}</p>
        </div>

        {edit.repeatType === 'daily' && (
          <div>
            <span className="mb-1 block text-sm font-medium text-stone-600">하는 요일</span>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((wd) => (
                <Chip key={wd} on={(edit.weekdays ?? []).includes(wd)} onClick={() => toggleDay(wd)} wide>
                  {WEEKDAY_LABEL[wd]}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {edit.repeatType === 'academy' && (
          <div className="space-y-3">
            <Field label="어느 학원 숙제인가요?">
              <select className={inputClass} value={edit.activityId ?? ''} onChange={(e) => setEdit({ ...edit, activityId: e.target.value || null })}>
                <option value="">학원 고르기</option>
                {acts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.emoji} {a.name}
                  </option>
                ))}
              </select>
            </Field>
            {acts.length === 0 && <p className="text-sm text-amber-700">먼저 [학원] 탭에서 학원을 등록해 주세요.</p>}
            <div>
              <span className="mb-1 block text-sm font-medium text-stone-600">언제까지?</span>
              <div className="grid grid-cols-2 gap-1.5">
                <Chip on={(edit.dueRule ?? 'day_before') === 'day_before'} onClick={() => setEdit({ ...edit, dueRule: 'day_before' })} wide>
                  다음 수업 전날
                </Chip>
                <Chip on={edit.dueRule === 'same_day'} onClick={() => setEdit({ ...edit, dueRule: 'same_day' })} wide>
                  수업 당일(가기 전)
                </Chip>
              </div>
            </div>
            {edit.activityId && <AcademyPreview activityId={edit.activityId} dueRule={edit.dueRule ?? 'day_before'} blocks={mainBlocks} hasMain={Boolean(main)} />}
          </div>
        )}

        {edit.repeatType === 'once' && (
          <Field label="마감일">
            <input type="date" className={inputClass} value={edit.dueDate ?? ''} onChange={(e) => setEdit({ ...edit, dueDate: e.target.value || null })} />
          </Field>
        )}

        <Field label="메모(선택)">
          <input className={inputClass} value={edit.memo ?? ''} maxLength={200} onChange={(e) => setEdit({ ...edit, memo: e.target.value || null })} />
        </Field>
        <label className="flex min-h-11 items-center gap-3 rounded-xl bg-stone-50 px-3">
          <input type="checkbox" className="h-6 w-6 accent-rose-500" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} />
          <span className="text-base">
            사용 중 <span className="text-sm text-stone-500">(끄면 숙제 목록에서만 남고 화면엔 안 떠요)</span>
          </span>
        </label>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => setEdit(null)}>
            취소
          </Button>
          <Button
            variant="primary"
            className="flex-1 !bg-rose-500 disabled:!bg-stone-300"
            disabled={!valid}
            onClick={() => {
              void mutate({ upsert: { kidHomeworks: [{ ...edit, name: edit.name.trim() }] } }, isNew ? '숙제를 넣었어요' : '저장했어요');
              setEdit(null);
            }}
          >
            저장
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {list.length === 0 && <p className="text-base text-stone-500">숙제를 한 번 등록해 두면 날마다 "오늘의 숙제"에 자동으로 떠요.</p>}
      <ul className="space-y-2">
        {list.map((h) => {
          const act = h.activityId ? acts.find((a) => a.id === h.activityId) : undefined;
          const noClass = h.repeatType === 'academy' && (!h.activityId || academyDays(mainBlocks, h.activityId).length === 0);
          return (
            <li key={h.id} className={`flex items-center gap-2 rounded-2xl border-2 p-2 ${h.active ? 'border-stone-200' : 'border-stone-100 opacity-60'}`}>
              <button type="button" onClick={() => setEdit(h)} className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-2xl">{h.emoji}</span>
                <span className="min-w-0">
                  <span className="block truncate font-jua text-lg">{h.name}</span>
                  <span className="block truncate text-sm text-stone-500">
                    {subjectOf(h.subject).label} · {repeatLabel(h, act?.name)}
                    {h.minutes ? ` · ${h.minutes}분` : ''}
                    {!h.active ? ' · 사용 안 함' : ''}
                  </span>
                  {noClass && h.active && <span className="block text-sm text-amber-700">⚠️ 대표 시간표에 이 학원이 없어요</span>}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setDel(h)}
                className="min-h-11 shrink-0 rounded-full border-2 border-red-200 px-3 text-base font-semibold text-red-600 active:bg-red-50"
              >
                삭제
              </button>
            </li>
          );
        })}
      </ul>
      <Button className="w-full" onClick={() => setEdit(blank())}>
        + 숙제 추가
      </Button>
      <p className="text-sm text-stone-500">학원 숙제는 대표 시간표(★)에서 그 학원이 있는 요일을 읽어요. 체크는 하린 화면 맨 위 "오늘의 숙제"에서 해요.</p>
      {del && (
        <ConfirmDialog
          title={`"${del.name}"을 지울까요?`}
          body="이 숙제의 체크 기록도 함께 지워져요. 잠시 안 쓰려면 '사용 중'을 끄면 돼요."
          confirmLabel="지우기"
          danger
          onConfirm={() => {
            void mutate({ remove: { kidHomeworks: [del] } }, '지웠어요');
            setDel(null);
          }}
          onCancel={() => setDel(null)}
        />
      )}
    </div>
  );
}

/** 학원 숙제가 어느 요일에 뜰지 미리 보여 준다 */
function AcademyPreview({
  activityId,
  dueRule,
  blocks,
  hasMain,
}: {
  activityId: string;
  dueRule: 'day_before' | 'same_day';
  blocks: { weekday: number; activityId: string | null }[];
  hasMain: boolean;
}) {
  const days = academyDays(blocks, activityId);
  const show = days.map((d) => (dueRule === 'same_day' ? d : d === 1 ? 5 : d - 1)).sort();
  return (
    <p className="rounded-xl bg-sky-50 p-3 text-sm text-sky-800">
      {!hasMain
        ? '대표 시간표가 없어요.'
        : days.length === 0
          ? '대표 시간표에 이 학원 수업이 없어서 아직 어느 날에도 안 떠요.'
          : `수업: ${days.map((d) => WEEKDAY_LABEL[d]).join('·')} → 숙제는 ${[...new Set(show)].map((d) => WEEKDAY_LABEL[d]).join('·')}요일에 떠요.`}
    </p>
  );
}

function Chip({ on, onClick, wide, children }: { on: boolean; onClick: () => void; wide?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`min-h-11 rounded-full border-2 px-3 text-base font-semibold ${wide ? 'flex-1' : ''} ${on ? 'border-rose-400 bg-rose-400 text-white' : 'border-stone-200 bg-white text-stone-600 active:bg-stone-50'}`}
    >
      {children}
    </button>
  );
}
