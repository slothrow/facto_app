// 할 일 첫 화면 맨 위 "🛠 앱 개선 요청" 메모(SPEC_home 9장). 고칠 점을 적어 두고 [전체 복사]로 Claude Code에 붙여넣는다.
// 입력은 바로 화면에 반영하고 저장은 뒤에서 한다(RosterContext.mutate, 실패하면 알림 후 되돌림).
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { useAppData } from '../../app/AppDataContext.tsx';
import { useRoster } from '../../app/RosterContext.tsx';
import { ChevronLeft } from '../../components/icons.tsx';
import { Button, ConfirmDialog } from '../../components/ui.tsx';
import type { DevRequestRow } from '../../storage/rosterTypes.ts';
import { useAuth } from '../auth/AuthGate.tsx';
import { MAX_REQUEST_LENGTH, authorLabel, copyText, editText, localDate, makeRequest, shortDate, sortRequests, toggleDone } from './devRequestModel.ts';

const OPEN_KEY = 'facto-app:dev-requests-open';

const readOpen = () => {
  try {
    return window.localStorage.getItem(OPEN_KEY) !== '0';
  } catch {
    return true;
  }
};

/** 내용에 맞춰 textarea 높이를 늘린다 */
function useAutoGrow(ref: RefObject<HTMLTextAreaElement | null>, value: string) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [ref, value]);
}

export function DevRequestsCard() {
  const { roster, mutate } = useRoster();
  const { showToast } = useAppData();
  const userId = useAuth()?.userId ?? null;
  const [open, setOpenState] = useState(readOpen);
  const [hideDone, setHideDone] = useState(false);
  const [draft, setDraft] = useState('');
  const [del, setDel] = useState<DevRequestRow | null>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  useAutoGrow(draftRef, draft);

  const list = roster.devRequests;
  const sorted = useMemo(() => sortRequests(list), [list]);
  const shown = hideDone ? sorted.filter((r) => !r.done) : sorted;
  const openCount = list.filter((r) => !r.done).length;

  const setOpen = (v: boolean) => {
    setOpenState(v);
    try {
      window.localStorage.setItem(OPEN_KEY, v ? '1' : '0');
    } catch {
      /* 기억 못 해도 화면은 그대로 */
    }
  };

  const save = (r: DevRequestRow) => void mutate({ upsert: { devRequests: [r] } }, '');

  const add = () => {
    const r = makeRequest(list, draft, new Date(), userId);
    if (!r) return;
    save(r);
    setDraft('');
    draftRef.current?.focus();
  };

  const onDraftKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter는 줄바꿈. Ctrl/Cmd+Enter로 추가(한글 조합 중에는 무시)
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) {
      e.preventDefault();
      add();
    }
  };

  const copy = async () => {
    const text = copyText(list);
    if (!text) {
      showToast('복사할 요청이 없어요');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showToast(`안 한 요청 ${openCount}개를 복사했어요`);
    } catch {
      showToast('복사하지 못했어요. 브라우저에서 클립보드를 허용해 주세요');
    }
  };

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/60">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-2 px-3 text-left"
      >
        <span className="flex-1 text-base font-bold text-amber-900">
          🛠 앱 개선 요청{openCount > 0 && <span className="ml-1.5 rounded-full bg-amber-200 px-2 py-0.5 text-sm">{openCount}</span>}
        </span>
        <ChevronLeft className={`h-5 w-5 text-amber-800 transition-transform ${open ? '-rotate-90' : ''}`} />
      </button>

      {open && (
        <div className="space-y-2 px-3 pb-3">
          <div className="flex gap-2">
            <Button className="flex-1 !bg-white" onClick={() => void copy()} disabled={openCount === 0}>
              전체 복사
            </Button>
            <Button className="flex-1 !bg-white" onClick={() => setHideDone((v) => !v)} aria-pressed={hideDone}>
              {hideDone ? '완료 보이기' : '완료 숨기기'}
            </Button>
          </div>

          {shown.length === 0 && <p className="px-1 text-sm text-stone-500">{list.length === 0 ? '고쳤으면 하는 점을 적어 두세요.' : '안 한 요청이 없어요.'}</p>}
          <ul className="space-y-1.5">
            {shown.map((r) => (
              <RequestItem key={r.id} r={r} userId={userId} onSave={save} onDelete={() => setDel(r)} />
            ))}
          </ul>

          <div className="space-y-1.5">
            <textarea
              ref={draftRef}
              value={draft}
              rows={2}
              maxLength={MAX_REQUEST_LENGTH}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onDraftKey}
              placeholder="고칠 점을 적어요 (Enter는 줄바꿈, Ctrl+Enter로 추가)"
              aria-label="새 개선 요청"
              className="block min-h-16 w-full resize-none overflow-hidden rounded-xl border border-stone-300 bg-white px-3 py-2 text-base focus:border-amber-600 focus:outline-none"
            />
            <Button variant="primary" className="w-full" onClick={add} disabled={!draft.trim()}>
              + 추가
            </Button>
          </div>
        </div>
      )}

      {del && (
        <ConfirmDialog
          title="이 요청을 지울까요?"
          body={del.text.length > 60 ? `${del.text.slice(0, 60)}…` : del.text}
          confirmLabel="지우기"
          danger
          onConfirm={() => {
            void mutate({ remove: { devRequests: [del] } }, '');
            setDel(null);
          }}
          onCancel={() => setDel(null)}
        />
      )}
    </section>
  );
}

function RequestItem({ r, userId, onSave, onDelete }: { r: DevRequestRow; userId: string | null; onSave: (r: DevRequestRow) => void; onDelete: () => void }) {
  const [text, setText] = useState(r.text);
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const press = useRef<{ x: number; y: number; timer: number; fired: boolean } | null>(null);
  useAutoGrow(ref, text);
  // 다른 기기·되돌리기로 글이 바뀌면 따라간다(고치는 중이 아닐 때만)
  useEffect(() => {
    if (document.activeElement !== ref.current) setText(r.text);
  }, [r.text]);

  const commit = () => {
    const next = editText(r, text);
    if (next) onSave(next);
    else setText(r.text); // 다 지웠거나 같은 글이면 원래대로
  };

  const cancelPress = () => {
    if (press.current) window.clearTimeout(press.current.timer);
  };
  const startPress = (x: number, y: number) => {
    cancelPress();
    const p = { x, y, fired: false, timer: 0 };
    p.timer = window.setTimeout(() => {
      p.fired = true;
      setMenu(true);
    }, 500);
    press.current = p;
  };

  return (
    <li className={`rounded-xl bg-white p-1.5 ring-1 ring-amber-100 ${r.done ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-1">
        <label className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center">
          <input type="checkbox" className="h-6 w-6 accent-emerald-600" checked={r.done} onChange={() => onSave(toggleDone(r, new Date()))} aria-label={r.done ? '완료 취소' : '완료'} />
        </label>
        <div className="min-w-0 flex-1">
          <textarea
            ref={ref}
            value={text}
            rows={1}
            maxLength={MAX_REQUEST_LENGTH}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            aria-label="개선 요청 내용"
            className={`block w-full resize-none overflow-hidden rounded-lg bg-transparent px-1 py-2.5 text-base leading-snug focus:bg-amber-50 focus:outline-none ${r.done ? 'text-stone-400 line-through' : 'text-stone-900'}`}
          />
          <p
            className="px-1 pb-1 text-xs text-stone-500 select-none"
            onPointerDown={(e) => startPress(e.clientX, e.clientY)}
            onPointerUp={cancelPress}
            onPointerLeave={cancelPress}
            onPointerCancel={cancelPress}
          >
            {authorLabel(r, userId)} · {shortDate(localDate(r.createdAt))}
            {r.done && r.doneAt ? ` · 완료 ${shortDate(localDate(r.doneAt))}` : ''}
          </p>
        </div>
        <button
          type="button"
          aria-label="더 보기"
          aria-haspopup="menu"
          onClick={() => setMenu((v) => !v)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-xl text-stone-500 active:bg-stone-100"
        >
          …
        </button>
      </div>
      {menu && (
        <div className="mt-1 flex gap-2 px-1 pb-1">
          <Button
            className="flex-1 !border !border-red-200 !bg-white !text-red-600"
            onClick={() => {
              setMenu(false);
              onDelete();
            }}
          >
            삭제
          </Button>
          <Button className="flex-1" onClick={() => setMenu(false)}>
            닫기
          </Button>
        </div>
      )}
    </li>
  );
}
