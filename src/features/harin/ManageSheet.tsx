// 관리(SPEC_harin 4·5·8장, 3장 보이는 범위): 시간표 버전 / 학원 / 종류 / 보기.
import { useState, type ReactNode } from 'react';
import { useAppData } from '../../app/AppDataContext.tsx';
import { useRoster } from '../../app/RosterContext.tsx';
import { BottomSheet, Button, ConfirmDialog, Field, inputClass } from '../../components/ui.tsx';
import { shortTime } from '../../engine/classTime.ts';
import { DEFAULT_TRAVEL, KID_PALETTE, VIEW_END, VIEW_START } from '../../engine/harin/index.ts';
import { newId, type KidActivityRow, type KidCategoryRow, type KidTimetableRow } from '../../storage/rosterTypes.ts';
import {
  activityUseCount,
  categoryUseCount,
  deleteTimetableChange,
  duplicateTimetable,
  newTimetable,
  setMainChange,
  timeOptions,
} from './harinModel.ts';

export type ManageTab = 'timetables' | 'activities' | 'categories' | 'view';
const TABS: { id: ManageTab; label: string }[] = [
  { id: 'timetables', label: '시간표' },
  { id: 'activities', label: '학원' },
  { id: 'categories', label: '종류' },
  { id: 'view', label: '보기' },
];

const EMOJI_SUGGEST = ['🎹', '🎻', '🏊', '⚽', '🩰', '🎨', '📚', '🧮', '💻', '🔤', '🥋', '🎤', '🍙', '🍚', '🧸', '✏️', '⭐', '🛁', '📺', '😴'];

export function ManageSheet({
  initialTab,
  currentId,
  onOpenTimetable,
  onClose,
}: {
  initialTab: ManageTab;
  currentId: string | null;
  onOpenTimetable: (id: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<ManageTab>(initialTab);
  return (
    <BottomSheet title="관리" onClose={onClose}>
      <div className="mb-4 flex gap-1 rounded-full bg-rose-50 p-1" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`h-11 flex-1 rounded-full text-base font-semibold ${tab === t.id ? 'bg-rose-400 text-white' : 'text-stone-600'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'timetables' && <TimetablesTab currentId={currentId} onOpen={onOpenTimetable} />}
      {tab === 'activities' && <ActivitiesTab />}
      {tab === 'categories' && <CategoriesTab />}
      {tab === 'view' && <ViewTab />}
    </BottomSheet>
  );
}

// ---------------------------------------------------------------
// 시간표 버전
// ---------------------------------------------------------------

function TimetablesTab({ currentId, onOpen }: { currentId: string | null; onOpen: (id: string) => void }) {
  const { roster, mutate } = useRoster();
  const list = [...roster.kidTimetables].sort((a, b) => a.sort - b.sort);
  const [form, setForm] = useState<{ mode: 'new' | 'edit' | 'copy'; src?: KidTimetableRow; name: string; memo: string } | null>(null);
  const [del, setDel] = useState<KidTimetableRow | null>(null);
  const count = (id: string) => roster.kidBlocks.filter((b) => b.timetableId === id).length;

  const submit = async () => {
    if (!form) return;
    const name = form.name.trim();
    if (!name) return;
    if (form.mode === 'new') {
      const t = newTimetable(list, name, form.memo);
      if (await mutate({ upsert: { kidTimetables: [t] } }, '새 시간표를 만들었어요')) onOpen(t.id);
    } else if (form.mode === 'copy' && form.src) {
      const c = duplicateTimetable(roster, form.src.id, name);
      const t = c.upsert?.kidTimetables?.[0];
      if (t) t.memo = form.memo.trim() || null;
      if ((await mutate(c, `"${name}"을 만들었어요`)) && t) onOpen(t.id);
    } else if (form.src) {
      await mutate({ upsert: { kidTimetables: [{ ...form.src, name, memo: form.memo.trim() || null }] } });
    }
    setForm(null);
  };

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {list.map((t) => (
          <li key={t.id} className={`rounded-2xl border-2 p-3 ${t.id === currentId ? 'border-rose-300 bg-rose-50/50' : 'border-stone-200'}`}>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={t.isMain ? '대표 시간표' : '대표로 정하기'}
                title={t.isMain ? '대표 시간표' : '대표로 정하기'}
                onClick={() => !t.isMain && void mutate(setMainChange(list, t.id), `"${t.name}"을 대표로 정했어요`)}
                className={`h-11 w-11 shrink-0 rounded-full text-2xl ${t.isMain ? 'text-amber-400' : 'text-stone-300 active:bg-stone-100'}`}
              >
                {t.isMain ? '★' : '☆'}
              </button>
              <button type="button" onClick={() => onOpen(t.id)} className="min-h-11 min-w-0 flex-1 text-left">
                <span className="block truncate font-jua text-lg">{t.name}</span>
                <span className="block truncate text-sm text-stone-500">
                  일정 {count(t.id)}개{t.memo ? ` · ${t.memo}` : ''}
                </span>
              </button>
            </div>
            <div className="mt-2 flex gap-2">
              <SmallButton onClick={() => setForm({ mode: 'edit', src: t, name: t.name, memo: t.memo ?? '' })}>이름·메모</SmallButton>
              <SmallButton onClick={() => setForm({ mode: 'copy', src: t, name: '', memo: '' })}>복제</SmallButton>
              <SmallButton danger onClick={() => setDel(t)}>
                삭제
              </SmallButton>
            </div>
          </li>
        ))}
      </ul>
      {!form && (
        <Button className="w-full" onClick={() => setForm({ mode: 'new', name: '', memo: '' })}>
          + 빈 시간표 만들기
        </Button>
      )}
      {form && (
        <div className="space-y-3 rounded-2xl bg-stone-50 p-3">
          <p className="font-semibold">
            {form.mode === 'new' ? '새 시간표' : form.mode === 'copy' ? `"${form.src?.name}" 복제(일정까지 복사)` : '이름·메모 바꾸기'}
          </p>
          <Field label="이름">
            <input className={inputClass} value={form.name} maxLength={40} placeholder="예: 겨울방학" onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
          </Field>
          <Field label="메모(적용 기간 등, 선택)">
            <input className={inputClass} value={form.memo} maxLength={200} placeholder="예: 12/24~2/28" onChange={(e) => setForm({ ...form, memo: e.target.value })} />
          </Field>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => setForm(null)}>
              취소
            </Button>
            <Button variant="primary" className="flex-1 !bg-rose-500 disabled:!bg-stone-300" disabled={!form.name.trim()} onClick={() => void submit()}>
              {form.mode === 'edit' ? '저장' : '만들기'}
            </Button>
          </div>
        </div>
      )}
      <p className="text-sm text-stone-500">★ = 대표 시간표. 하린이 시간표를 열면 대표가 먼저 보여요.</p>
      {del && (
        <ConfirmDialog
          title={`"${del.name}"을 지울까요?`}
          body={`일정 ${count(del.id)}개도 함께 지워지고 되돌릴 수 없어요.${del.isMain && list.length > 1 ? ' 남은 시간표 중 맨 위가 대표가 돼요.' : ''}`}
          confirmLabel="지우기"
          danger
          onConfirm={() => {
            void mutate(deleteTimetableChange(roster, del.id), '지웠어요');
            setDel(null);
          }}
          onCancel={() => setDel(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------
// 학원
// ---------------------------------------------------------------

function ActivitiesTab() {
  const { roster, mutate } = useRoster();
  const list = [...roster.kidActivities].sort((a, b) => a.sort - b.sort);
  const [edit, setEdit] = useState<KidActivityRow | null>(null);
  const [del, setDel] = useState<KidActivityRow | null>(null);
  const blank = (): KidActivityRow => ({
    id: newId(),
    name: '',
    emoji: '🎹',
    color: KID_PALETTE[list.length % KID_PALETTE.length],
    place: null,
    memo: null,
    travelMinutes: DEFAULT_TRAVEL,
    isHome: false,
    sort: list.reduce((m, a) => Math.max(m, a.sort), 0) + 1,
  });

  if (edit) {
    const isNew = !list.some((a) => a.id === edit.id);
    return (
      <div className="space-y-3">
        <Field label="이름">
          <input className={inputClass} value={edit.name} maxLength={30} placeholder="예: 피아노" onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus={isNew} />
        </Field>
        <EmojiField value={edit.emoji} onChange={(emoji) => setEdit({ ...edit, emoji })} />
        <ColorField value={edit.color} onChange={(color) => setEdit({ ...edit, color })} />
        <Field label="장소(선택)">
          <input className={inputClass} value={edit.place ?? ''} maxLength={60} placeholder="예: 해솔음악학원" onChange={(e) => setEdit({ ...edit, place: e.target.value || null })} />
        </Field>
        <Field label="메모(선택)">
          <input className={inputClass} value={edit.memo ?? ''} maxLength={200} onChange={(e) => setEdit({ ...edit, memo: e.target.value || null })} />
        </Field>
        <label className="flex min-h-11 items-center gap-3 rounded-xl bg-stone-50 px-3">
          <input type="checkbox" className="h-6 w-6 accent-rose-500" checked={edit.isHome} onChange={(e) => setEdit({ ...edit, isHome: e.target.checked })} />
          <span className="text-base">
            집에서 듣는 수업 <span className="text-sm text-stone-500">(예: 화상영어 — 이동 없음)</span>
          </span>
        </label>
        {!edit.isHome && (
          <Field label="이동 시간(한쪽)">
            <div className="flex items-center gap-3">
              <Button className="w-12 text-xl" onClick={() => setEdit({ ...edit, travelMinutes: Math.max(0, edit.travelMinutes - 5) })} aria-label="5분 줄이기">
                −
              </Button>
              <span className="w-20 text-center text-2xl font-bold">{edit.travelMinutes}분</span>
              <Button className="w-12 text-xl" onClick={() => setEdit({ ...edit, travelMinutes: Math.min(120, edit.travelMinutes + 5) })} aria-label="5분 늘리기">
                +
              </Button>
            </div>
          </Field>
        )}
        <p className="text-sm text-stone-500">이동 시간·집 수업을 바꾸면 모든 시간표의 이동 블록이 바로 다시 계산돼요.</p>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => setEdit(null)}>
            취소
          </Button>
          <Button
            variant="primary"
            className="flex-1 !bg-rose-500 disabled:!bg-stone-300"
            disabled={!edit.name.trim()}
            onClick={() => {
              void mutate({ upsert: { kidActivities: [{ ...edit, name: edit.name.trim() }] } });
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
      {list.length === 0 && <p className="text-base text-stone-500">하린이가 다니는 학원을 등록해 두면 시간표에 바로 놓을 수 있어요.</p>}
      <ul className="space-y-2">
        {list.map((a) => {
          const used = activityUseCount(roster, a.id);
          return (
            <li key={a.id} className="flex items-center gap-2 rounded-2xl border-2 border-stone-200 p-2">
              <button type="button" onClick={() => setEdit(a)} className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-2xl" style={{ backgroundColor: a.color }}>
                  {a.emoji}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-jua text-lg">{a.name}</span>
                  <span className="block truncate text-sm text-stone-500">
                    {a.isHome ? '집 수업(이동 없음)' : `이동 ${a.travelMinutes}분`}
                    {a.place ? ` · ${a.place}` : ''}
                    {used ? ` · 일정 ${used}개` : ''}
                  </span>
                </span>
              </button>
              <SmallButton narrow danger disabled={used > 0} onClick={() => setDel(a)} title={used > 0 ? '시간표에서 쓰는 학원은 지울 수 없어요' : undefined}>
                삭제
              </SmallButton>
            </li>
          );
        })}
      </ul>
      <Button className="w-full" onClick={() => setEdit(blank())}>
        + 학원 추가
      </Button>
      {list.some((a) => activityUseCount(roster, a.id) > 0) && <p className="text-sm text-stone-500">시간표에서 쓰는 학원은 일정을 먼저 지워야 삭제할 수 있어요.</p>}
      {del && (
        <ConfirmDialog
          title={`"${del.name}"을 지울까요?`}
          body="학원 목록에서 지워요."
          confirmLabel="지우기"
          danger
          onConfirm={() => {
            void mutate({ remove: { kidActivities: [del] } }, '지웠어요');
            setDel(null);
          }}
          onCancel={() => setDel(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------
// 종류
// ---------------------------------------------------------------

function CategoriesTab() {
  const { roster, mutate } = useRoster();
  const list = [...roster.kidCategories].sort((a, b) => a.sort - b.sort);
  const [edit, setEdit] = useState<KidCategoryRow | null>(null);
  const [del, setDel] = useState<KidCategoryRow | null>(null);

  if (edit) {
    return (
      <div className="space-y-3">
        <Field label="이름">
          <input className={inputClass} value={edit.name} maxLength={20} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
        </Field>
        <EmojiField value={edit.emoji} onChange={(emoji) => setEdit({ ...edit, emoji })} />
        {!edit.isTravel && <ColorField value={edit.color} onChange={(color) => setEdit({ ...edit, color })} />}
        {edit.isActivity && <p className="text-sm text-stone-500">학원 블록은 학원마다 정한 색을 써요. 이 색은 학원 색이 없을 때만 써요.</p>}
        {!edit.isTravel && (
          <Field label="새 일정 기본 길이">
            <select className={inputClass} value={edit.defaultMinutes} onChange={(e) => setEdit({ ...edit, defaultMinutes: Number(e.target.value) })}>
              {[10, 20, 30, 40, 50, 60, 90, 120].map((m) => (
                <option key={m} value={m}>
                  {m}분
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => setEdit(null)}>
            취소
          </Button>
          <Button
            variant="primary"
            className="flex-1 !bg-rose-500 disabled:!bg-stone-300"
            disabled={!edit.name.trim()}
            onClick={() => {
              void mutate({ upsert: { kidCategories: [{ ...edit, name: edit.name.trim() }] } });
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
      <ul className="space-y-2">
        {list.map((c) => {
          const used = categoryUseCount(roster, c.id);
          const locked = c.isTravel || c.isActivity;
          return (
            <li key={c.id} className="flex items-center gap-2 rounded-2xl border-2 border-stone-200 p-2">
              <button type="button" onClick={() => setEdit(c)} className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left">
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-2xl"
                  style={c.isTravel ? { backgroundImage: 'repeating-linear-gradient(135deg, #e7e5e4 0 6px, #f5f5f4 6px 12px)' } : { backgroundColor: c.color }}
                >
                  {c.emoji}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-jua text-lg">{c.name}</span>
                  <span className="block truncate text-sm text-stone-500">
                    {c.isTravel ? '자동 계산' : c.isActivity ? '학원 목록에서 고름' : `기본 ${c.defaultMinutes}분`}
                    {used ? ` · 일정 ${used}개` : ''}
                  </span>
                </span>
              </button>
              {!locked && (
                <SmallButton narrow danger disabled={used > 0} onClick={() => setDel(c)} title={used > 0 ? '쓰는 일정이 있어 지울 수 없어요' : undefined}>
                  삭제
                </SmallButton>
              )}
            </li>
          );
        })}
      </ul>
      <Button
        className="w-full"
        onClick={() =>
          setEdit({
            id: newId(),
            name: '',
            color: KID_PALETTE[(list.length * 5) % KID_PALETTE.length],
            emoji: '⭐',
            isTravel: false,
            isActivity: false,
            defaultMinutes: 50,
            sort: list.reduce((m, c) => Math.max(m, c.sort), 0) + 1,
          })
        }
      >
        + 종류 추가
      </Button>
      <p className="text-sm text-stone-500">이동·학원 종류는 지울 수 없어요. 쓰는 일정이 있는 종류도 먼저 일정을 바꿔야 지울 수 있어요.</p>
      {del && (
        <ConfirmDialog
          title={`"${del.name}" 종류를 지울까요?`}
          body="종류 목록에서 지워요."
          confirmLabel="지우기"
          danger
          onConfirm={() => {
            void mutate({ remove: { kidCategories: [del] } }, '지웠어요');
            setDel(null);
          }}
          onCancel={() => setDel(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------
// 보기(보이는 시간 범위)
// ---------------------------------------------------------------

function ViewTab() {
  const { data, commit } = useAppData();
  const view = data.settings.harin ?? {};
  const start = view.viewStart ?? VIEW_START;
  const end = view.viewEnd ?? VIEW_END;
  const save = (next: { viewStart: string; viewEnd: string }) => void commit({ ...data, settings: { ...data.settings, harin: next } });
  const starts = timeOptions('13:30', '18:00').filter((t) => t.endsWith('00') || t.endsWith('30'));
  const ends = timeOptions('17:00', '23:00').filter((t) => t.endsWith('00') || t.endsWith('30'));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="위쪽 시작">
          <select className={inputClass} value={start} onChange={(e) => save({ viewStart: e.target.value, viewEnd: end })}>
            {starts.map((t) => (
              <option key={t} value={t}>
                {shortTime(t)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="아래쪽 끝">
          <select className={inputClass} value={end} onChange={(e) => save({ viewStart: start, viewEnd: e.target.value })}>
            {ends.map((t) => (
              <option key={t} value={t}>
                {shortTime(t)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Button onClick={() => save({ viewStart: VIEW_START, viewEnd: VIEW_END })}>기본값(2:00~11:00)으로</Button>
      <p className="text-sm text-stone-500">범위 밖에 일정이 있으면 자동으로 넓혀서 보여 줘요. 이미지도 이 범위로 만들어요.</p>
    </div>
  );
}

// ---------------------------------------------------------------
// 공통
// ---------------------------------------------------------------

function EmojiField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field label="이모지">
      <div className="space-y-2">
        <input className={`${inputClass} text-2xl`} value={value} maxLength={8} onChange={(e) => onChange(e.target.value)} aria-label="이모지 직접 입력" />
        <div className="flex flex-wrap gap-1">
          {EMOJI_SUGGEST.map((e) => (
            <button key={e} type="button" onClick={() => onChange(e)} className={`h-11 w-11 rounded-xl text-2xl ${value === e ? 'bg-rose-100 ring-2 ring-rose-400' : 'bg-stone-50'}`}>
              {e}
            </button>
          ))}
        </div>
      </div>
    </Field>
  );
}

function ColorField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-stone-600">색</span>
      <div className="flex flex-wrap gap-2">
        {KID_PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`색 ${c}`}
            aria-pressed={value === c}
            onClick={() => onChange(c)}
            className={`h-11 w-11 rounded-full border-2 border-white shadow ${value === c ? 'ring-4 ring-rose-400' : ''}`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
    </div>
  );
}

function SmallButton({ onClick, danger, disabled, title, narrow, children }: { onClick: () => void; danger?: boolean; disabled?: boolean; title?: string; narrow?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`min-h-11 ${narrow ? 'shrink-0' : 'flex-1'} rounded-full border-2 px-3 text-base font-semibold disabled:border-stone-100 disabled:text-stone-300 ${
        danger ? 'border-red-200 text-red-600 active:bg-red-50' : 'border-stone-200 text-stone-700 active:bg-stone-50'
      }`}
    >
      {children}
    </button>
  );
}
