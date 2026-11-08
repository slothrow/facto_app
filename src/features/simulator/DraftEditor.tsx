// 시안 화면(SPEC_simulator 3·4장). 탭 방식 옮기기: 반 탭 → 칸 색 표시 → 칸 탭으로 이동.
// 폰 세로: 요일 탭으로 한 요일씩. 가로·PC: 전체 격자. 선택은 요일 탭을 바꿔도 유지된다.
// 드래그(4.3): PC는 마우스로 5px 이상 끌면, 폰은 0.25초 길게 누르면 들린다(짧게 쓸면 스크롤).
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useAppData } from '../../app/AppDataContext.tsx';
import { navigate } from '../../app/router.ts';
import { useRoster } from '../../app/RosterContext.tsx';
import { Button, Card, ConfirmDialog } from '../../components/ui.tsx';
import { ChevronLeft, PlusIcon } from '../../components/icons.tsx';
import { formatProgress, withCurriculumDefaults, type Progress } from '../../engine/curriculum.ts';
import {
  SIM_CAPACITY,
  SIM_WEEKDAYS,
  canPlace,
  checkDraft,
  diffDraft,
  headcount,
  isGraduating,
  liveClasses,
  progressGap,
  removedClasses,
  resetDraft,
  simGradeCode,
  simGradeLabel,
  slotText,
  summarize,
  summaryLine,
  viewDateOf,
  type SimDraft,
} from '../../engine/simulator/index.ts';
import type { Weekday } from '../../engine/types.ts';
import { CLASS_MINUTES, fromMinutes, toMinutes } from '../../engine/classTime.ts';
import type { Placement } from '../../engine/simulator/index.ts';
import type { SimClassRow } from '../../storage/rosterTypes.ts';
import { WEEKDAY_NAMES } from '../roster/rosterModel.ts';
import { ReviewPanel } from './ReviewPanel.tsx';
import { SimClassDetail } from './SimClassDetail.tsx';
import { SimClassSheet } from './SimClassSheet.tsx';
import { TAG_TONE, blockPeople, memberViews, waitDots, waitlistMatches } from './simReview.ts';
import { SimGrid, type BlockView, type GhostView } from './SimGrid.tsx';
import { gridRange, hoursOf, lookupFor, simProgress } from './simModel.ts';
import { addClass, deleteNewClass, mergeClass, moveClass, removeClass, updateClass } from './simOps.ts';
import { useMedia, useSimEditor } from './useSimEditor.ts';

export function DraftEditor({ draftId }: { draftId: string }) {
  const { data, showToast } = useAppData();
  const { roster } = useRoster();
  const { d, apply, quiet, undo, redo, canUndo, canRedo } = useSimEditor(draftId);
  const phonePortrait = useMedia('(max-width: 767px) and (orientation: portrait)');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [day, setDay] = useState<Weekday>(1);
  const [sheet, setSheet] = useState<{ preset?: { weekday: Weekday; startTime: string }; edit?: SimClassRow } | null>(null);
  const [merge, setMerge] = useState<{ from: string; into: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [drag, setDrag] = useState<{ id: string; offset: number; touch: boolean } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ weekday: number; startTime: string; kind: Placement['kind'] } | null>(null);
  const justDragged = useRef(0);
  const selectedAt = useRef(0);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
  );

  const hours = hoursOf(data);
  const curriculum = withCurriculumDefaults(data.settings.curriculum);
  const baseDate = d?.draft.baseDate ?? '';
  const sched = useMemo(() => (baseDate ? lookupFor(data, baseDate) : null), [data, baseDate]);

  const progressOf = useMemo(() => {
    const cache = new Map<string, Progress>();
    return (id: string): Progress => {
      if (!d || !sched) return { kind: 'unset' };
      if (!cache.has(id)) {
        const c = d.classes.find((x) => x.id === id);
        cache.set(id, c ? simProgress(c, roster, sched, baseDate, data) : { kind: 'unset' });
      }
      return cache.get(id)!;
    };
  }, [d, sched, roster, baseDate, data]);

  const warnings = useMemo(() => (d ? checkDraft(d, roster, { hours, progressOf, curriculum }) : []), [d, roster, hours, progressOf, curriculum]);

  if (!d) {
    return (
      <Card>
        <p className="mb-3 text-base">시안을 찾을 수 없어요.</p>
        <Button onClick={() => navigate('/roster/sim')}>시안 목록으로</Button>
      </Card>
    );
  }

  const editable = d.draft.status === 'editing';
  const summary = summarize(d, warnings);
  const warnIds = new Set(warnings.map((w) => w.simClassId));
  const selected = selectedId ? (d.classes.find((c) => c.id === selectedId) ?? null) : null;
  const range = gridRange(d, hours);
  const snap = new Map(d.draft.baseSnapshot.classes.map((c) => [c.id, c]));
  const titleOf = (c: SimClassRow) => `${slotText(c.weekday, c.startTime)} ${simGradeLabel(c, d.draft)}${c.alias ? ` ${c.alias}` : ''}`;

  const blocks: BlockView[] = liveClasses(d).map((c) => {
    const p = progressOf(c.id);
    return {
      cls: c,
      grade: simGradeLabel(c, d.draft),
      count: headcount(d, c.id),
      progress: p.kind === 'unset' ? '' : formatProgress(p, curriculum),
      isNew: !c.sourceClassId,
      graduating: d.draft.gradeView === 'next' && isGraduating(c, d.draft),
      warn: warnIds.has(c.id),
      memo: Boolean(c.memo),
      waitCount: waitlistMatches(d, c, roster).length,
      people: phonePortrait ? undefined : blockPeople(d, c.id, roster),
    };
  });
  const ghosts: GhostView[] = liveClasses(d).flatMap((c) => {
    const s = c.sourceClassId ? snap.get(c.sourceClassId) : undefined;
    if (!s || (s.weekday === c.weekday && s.startTime === c.startTime)) return [];
    return [{ weekday: s.weekday, startTime: s.startTime, text: `→ ${slotText(c.weekday, c.startTime)}` }];
  });

  const select = (id: string | null) => {
    selectedAt.current = Date.now();
    setSelectedId(id);
  };

  const tryMove = (id: string, weekday: Weekday, start: string) => {
    const p = canPlace(d, id, weekday, start, hours);
    if (p.kind === 'block') {
      showToast(`놓을 수 없어요: ${p.reasons.join(', ')}`);
      return;
    }
    apply(moveClass(d, id, weekday, start));
    select(null);
    showToast(p.kind === 'warn' ? `옮겼어요 (경고: ${p.reasons.join(', ')})` : `${slotText(weekday, start)}로 옮겼어요`);
  };

  const onCell = (weekday: Weekday, start: string) => {
    if (!editable) return;
    if (selected) tryMove(selected.id, weekday, start);
    else setSheet({ preset: { weekday, startTime: start } });
  };

  const onBlock = (id: string, tappedStart: string) => {
    if (Date.now() - justDragged.current < 400) return; // 끌기 끝의 클릭은 무시
    if (!editable) {
      select(selectedId === id ? null : id);
      return;
    }
    if (!selectedId) return select(id);
    if (selectedId === id) {
      if (Date.now() - selectedAt.current < 500) return; // 더블클릭의 두 번째 클릭
      const c = d.classes.find((x) => x.id === id)!;
      if (tappedStart === c.startTime) select(null);
      else tryMove(id, c.weekday, tappedStart);
      return;
    }
    setMerge({ from: selectedId, into: id });
  };

  const doRemove = () => {
    if (!selected) return;
    apply(removeClass(d, selected.id));
    showToast('빼놓았어요');
    select(null);
  };

  // ---------- 드래그 ----------
  // 블록 위 > 빼놓은 반 영역 > 10분 칸 순서로 놓을 곳을 고른다(손가락·마우스 위치 기준)
  const collision: CollisionDetection = (args) => {
    const hits = pointerWithin(args);
    const pick =
      hits.find((h) => String(h.id).startsWith('block:')) ?? hits.find((h) => h.id === 'removed') ?? hits.find((h) => String(h.id).startsWith('cell:'));
    return pick ? [pick] : [];
  };
  type Target = { kind: 'cell'; weekday: Weekday; start: string } | { kind: 'block'; into: string } | { kind: 'removed' } | null;
  const targetOf = (overId: string | undefined, dragId: string, offset: number): Target => {
    if (!overId) return null;
    if (overId === 'removed') return { kind: 'removed' };
    if (overId.startsWith('block:')) {
      const into = overId.slice(6);
      return into === dragId ? null : { kind: 'block', into };
    }
    const [wd, t] = overId.slice(5).split('|');
    // 잡은 위치만큼 빼서 블록 윗변 = 시작 시간. 10분 칸에 붙는다
    let m = toMinutes(t) - offset;
    m = Math.max(range.start, Math.min(range.end - CLASS_MINUTES, m));
    return { kind: 'cell', weekday: Number(wd) as Weekday, start: fromMinutes(m) };
  };
  const onDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id).slice(6);
    const el = document.querySelector(`[data-sim-block="${id}"]`);
    const ev = e.activatorEvent as MouseEvent | TouchEvent;
    const y = 'touches' in ev ? (ev.touches[0]?.clientY ?? 0) : ev.clientY;
    // 빼놓은 반 목록에서 끌면 손가락이 블록 가운데쯤(20분)
    let offset = 20;
    const removedNow = d.classes.find((c) => c.id === id)?.removed;
    if (el && !removedNow) {
      const r = el.getBoundingClientRect();
      offset = Math.max(0, Math.min(40, Math.floor((((y - r.top) / r.height) * CLASS_MINUTES) / 10) * 10));
    }
    if ('touches' in ev && navigator.vibrate) navigator.vibrate(30);
    setDrag({ id, offset, touch: 'touches' in ev });
    setSelectedId(id);
  };
  const onDragOver = (e: DragOverEvent) => {
    if (!drag) return;
    const t = targetOf(e.over ? String(e.over.id) : undefined, drag.id, drag.offset);
    setPreview(t?.kind === 'cell' ? { weekday: t.weekday, startTime: t.start, kind: canPlace(d, drag.id, t.weekday, t.start, hours).kind } : null);
  };
  const endDrag = () => {
    setDrag(null);
    setPreview(null);
    justDragged.current = Date.now();
  };
  const onDragEnd = (e: DragEndEvent) => {
    const cur = drag;
    endDrag();
    if (!cur) return;
    // 폰: 길게 누르고 움직이지 않고 떼면 반 상세(5장)
    if (cur.touch && Math.hypot(e.delta.x, e.delta.y) < 8) {
      setDetailId(cur.id);
      return;
    }
    const t = targetOf(e.over ? String(e.over.id) : undefined, cur.id, cur.offset);
    if (!t) {
      select(null);
      return;
    }
    if (t.kind === 'removed') {
      apply(removeClass(d, cur.id));
      showToast('빼놓았어요');
      select(null);
    } else if (t.kind === 'block') {
      setMerge({ from: cur.id, into: t.into });
    } else {
      const c = d.classes.find((x) => x.id === cur.id);
      if (c && c.weekday === t.weekday && c.startTime === t.start && !c.removed) return select(null);
      const p = canPlace(d, cur.id, t.weekday, t.start, hours);
      if (p.kind === 'block') {
        showToast('놓을 수 없는 자리라 원래 자리로 돌아갔어요');
        select(null);
      } else tryMove(cur.id, t.weekday, t.start);
    }
  };

  const days: Weekday[] = phonePortrait ? [day] : SIM_WEEKDAYS;
  const changes = diffDraft(d.draft.baseSnapshot, d, d.draft.baseDate);
  const pickFromReview = (id: string) => {
    const c = d.classes.find((x) => x.id === id);
    const target = c?.mergedInto ? d.classes.find((x) => x.id === c.mergedInto) : c;
    if (!target) return;
    select(target.id);
    if (phonePortrait) setDay(target.weekday);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const removed = removedClasses(d);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        endDrag();
        select(null);
      }}
    >
    <div className="space-y-3 pb-24">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => navigate('/roster/sim')} className="flex h-11 items-center gap-1 text-base text-stone-600">
          <ChevronLeft className="h-5 w-5" /> 시안 목록
        </button>
        <h1 className="min-w-0 flex-1 truncate text-lg font-bold">{d.draft.name}</h1>
        {editable && (
          <div className="flex gap-1">
            <Button className="px-3" disabled={!canUndo} onClick={undo} aria-label="되돌리기">
              ↶ 되돌리기
            </Button>
            <Button className="px-3" disabled={!canRedo} onClick={redo} aria-label="다시 실행">
              ↷
            </Button>
          </div>
        )}
      </div>

      {!editable && (
        <p className="rounded-xl bg-stone-100 px-3 py-2 text-sm text-stone-700">
          {d.draft.status === 'applied' ? '적용된 시안이에요. 읽기 전용입니다.' : '보관한 시안이에요. 목록에서 보관을 풀면 고칠 수 있어요.'}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" className="grid grid-cols-2 gap-1 rounded-xl bg-stone-200/70 p-1">
          {(['current', 'next'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={d.draft.gradeView === v}
              onClick={() => editable && quiet({ ...d, draft: { ...d.draft, gradeView: v } })}
              className={`h-9 rounded-lg px-3 text-sm font-semibold ${d.draft.gradeView === v ? 'bg-white text-emerald-800 shadow-sm' : 'text-stone-600'}`}
            >
              {v === 'current' ? '현재 학년도' : '다음 학년도'}
            </button>
          ))}
        </div>
        {editable && (
          <>
            <Button className="px-3" onClick={() => setSheet({})}>
              <PlusIcon className="inline h-4 w-4" /> 새 반
            </Button>
            <Button variant="ghost" className="px-3 text-sm" onClick={() => setConfirmReset(true)}>
              처음으로
            </Button>
          </>
        )}
      </div>

      <p className="text-sm font-semibold text-stone-700">
        기준일 {d.draft.baseDate} · {summaryLine(summary)}
      </p>

      {phonePortrait && (
        <div role="tablist" className="grid grid-cols-5 gap-1">
          {SIM_WEEKDAYS.map((wd) => (
            <button
              key={wd}
              type="button"
              role="tab"
              aria-selected={day === wd}
              onClick={() => setDay(wd)}
              className={`h-11 rounded-xl text-base font-bold ${day === wd ? 'bg-emerald-700 text-white' : 'bg-white text-stone-700 border border-stone-200'}`}
            >
              {WEEKDAY_NAMES[wd]}
              <span className="ml-0.5 text-xs font-normal">{liveClasses(d).filter((c) => c.weekday === wd).length}</span>
            </button>
          ))}
        </div>
      )}

      <div className="md:grid md:grid-cols-[1fr_14rem] md:items-start md:gap-4">
        <SimGrid
          days={days}
          range={range}
          blocks={blocks}
          ghosts={ghosts}
          selectedId={selectedId}
          placement={selected && editable ? (wd, t) => canPlace(d, selected.id, wd, t, hours) : null}
          compact={!phonePortrait}
          onCell={onCell}
          onBlock={onBlock}
          preview={preview}
          draggingId={drag?.id ?? null}
          dragDisabled={!editable}
          onBlockDouble={(id) => setDetailId(id)}
          waitDots={selected && editable && !selected.removed ? waitDots(d, selected, roster, days, range) : undefined}
        />
        <div className="space-y-3">
        <RemovedArea
          classes={removed}
          titleOf={titleOf}
          countOf={(id) => headcount(d, id)}
          selectedId={selectedId}
          onPick={(id) => select(selectedId === id ? null : id)}
          canDrop={Boolean(selected && !selected.removed && editable)}
          onDrop={doRemove}
          phone={phonePortrait}
          dropEnabled={editable}
        />
        <ReviewPanel warnings={warnings} changes={changes} summary={summary} onPick={pickFromReview} />
        </div>
      </div>

      {selected && (
        <div className="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 flex justify-center px-3">
          <div className="flex w-full max-w-[480px] flex-wrap items-center gap-2 rounded-2xl bg-stone-900/95 px-3 py-2 text-white shadow-xl md:max-w-2xl">
            <span className="min-w-0 flex-1 text-sm">
              <b>{titleOf(selected)}</b>
              {phonePortrait && (
                <span className="ml-1 text-xs">
                  {memberViews(d, selected.id, roster).map((v, i) => (
                    <span key={v.m.id} className={`${TAG_TONE[v.m.tag]} !text-inherit`}>
                      {i > 0 ? ', ' : ''}
                      {v.name}
                    </span>
                  ))}
                </span>
              )}
              <br />
              {editable ? (selected.removed ? '넣을 위치를 누르세요' : '옮길 위치를 누르세요 · 다른 반을 누르면 합치기') : '읽기 전용'}
            </span>
            <Button className="px-3" onClick={() => setDetailId(selected.id)}>
              상세
            </Button>
            {editable && !selected.removed && (
              <Button className="px-3" onClick={doRemove}>
                빼놓기
              </Button>
            )}
            {editable && !selected.sourceClassId && (
              <Button
                variant="danger"
                className="px-3"
                onClick={() => {
                  apply(deleteNewClass(d, selected.id));
                  select(null);
                }}
              >
                지우기
              </Button>
            )}
            <Button variant="ghost" className="px-3 text-white" onClick={() => select(null)}>
              취소
            </Button>
          </div>
        </div>
      )}

      {detailId && d.classes.some((c) => c.id === detailId) && (
        <SimClassDetail
          d={d}
          cls={d.classes.find((c) => c.id === detailId)!}
          roster={roster}
          progress={progressOf(detailId)}
          curriculum={curriculum}
          editable={editable}
          onApply={apply}
          onEditInfo={() => setSheet({ edit: d.classes.find((c) => c.id === detailId)! })}
          onClose={() => setDetailId(null)}
        />
      )}

      {sheet && (
        <SimClassSheet
          d={d}
          hours={hours}
          initial={sheet.edit}
          preset={sheet.preset}
          onClose={() => setSheet(null)}
          onSave={(f) => {
            if (sheet.edit) {
              apply(updateClass(d, sheet.edit.id, f));
              showToast('반 정보를 바꿨어요');
            } else {
              const { next, id } = addClass(d, f);
              apply(next);
              if (phonePortrait) setDay(f.weekday);
              select(id);
              showToast('새 반을 만들었어요');
            }
            setSheet(null);
          }}
        />
      )}

      {merge && <MergeDialog d={d} from={merge.from} into={merge.into} titleOf={titleOf} progressOf={progressOf} curriculum={curriculum}
        onCancel={() => setMerge(null)}
        onConfirm={() => {
          apply(mergeClass(d, merge.from, merge.into));
          setMerge(null);
          select(null);
          showToast('합쳤어요 (되돌리기 가능)');
        }}
      />}

      {confirmReset && (
        <ConfirmDialog
          title="처음으로 되돌릴까요?"
          body="시안을 만들었을 때 상태(기준일의 실제 시간표)로 돌아가요. 옮긴 반·새 반·태그·메모가 모두 사라져요. 되돌리기로 다시 살릴 수 있어요."
          confirmLabel="처음으로"
          danger
          onCancel={() => setConfirmReset(false)}
          onConfirm={() => {
            apply(resetDraft(d, roster));
            setConfirmReset(false);
            select(null);
          }}
        />
      )}
    </div>
    </DndContext>
  );
}

function RemovedArea({
  classes,
  titleOf,
  countOf,
  selectedId,
  onPick,
  canDrop,
  onDrop,
  phone,
  dropEnabled,
}: {
  classes: SimClassRow[];
  titleOf: (c: SimClassRow) => string;
  countOf: (id: string) => number;
  selectedId: string | null;
  onPick: (id: string) => void;
  canDrop: boolean;
  onDrop: () => void;
  phone: boolean;
  dropEnabled: boolean;
}) {
  const [open, setOpen] = useState(true);
  const { setNodeRef, isOver } = useDroppable({ id: 'removed', disabled: !dropEnabled });
  const body: ReactNode = (
    <div className="space-y-2">
      {canDrop && (
        <button type="button" onClick={onDrop} className="h-11 w-full rounded-xl border-2 border-dashed border-stone-400 text-sm font-semibold text-stone-600">
          여기로 빼놓기
        </button>
      )}
      {classes.length === 0 && !canDrop && <p className="text-sm text-stone-500">빼놓은 반이 없어요. 반을 선택하고 [빼놓기]를 누르세요.</p>}
      {classes.map((c) => (
        <RemovedItem key={c.id} id={c.id} title={titleOf(c)} count={countOf(c.id)} selected={selectedId === c.id} onPick={onPick} disabled={!dropEnabled} />
      ))}
    </div>
  );
  return (
    <section ref={setNodeRef} className={`mt-3 rounded-2xl border bg-white p-3 md:sticky md:top-4 md:mt-0 ${isOver ? 'border-violet-500 ring-4 ring-violet-300' : 'border-stone-200'}`}>
      <button type="button" className="flex h-9 w-full items-center justify-between text-base font-bold" onClick={() => phone && setOpen(!open)}>
        빼놓은 반 ({classes.length})
        {phone && <span className="text-sm font-normal text-stone-500">{open ? '접기' : '펼치기'}</span>}
      </button>
      {(open || !phone) && <div className="mt-2">{body}</div>}
    </section>
  );
}

/** 빼놓은 반 하나: 탭하면 선택, 끌어서 격자에 놓으면 복귀 */
function RemovedItem({ id, title, count, selected, onPick, disabled }: { id: string; title: string; count: number; selected: boolean; onPick: (id: string) => void; disabled: boolean }) {
  const { setNodeRef, listeners, attributes, transform, isDragging } = useDraggable({ id: `block:${id}`, disabled });
  return (
    <button
      ref={setNodeRef}
      type="button"
      data-sim-block={id}
      onClick={() => onPick(id)}
      {...listeners}
      {...attributes}
      style={{ transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined }}
      className={`relative flex min-h-11 w-full items-center justify-between rounded-xl border px-3 text-left text-sm select-none ${selected ? 'border-emerald-600 ring-2 ring-emerald-600' : 'border-stone-300 bg-stone-50'} ${isDragging ? 'z-50 shadow-2xl' : ''}`}
    >
      <span className="font-semibold">{title}</span>
      <span className="text-stone-500">{count}명</span>
    </button>
  );
}

function MergeDialog({
  d,
  from,
  into,
  titleOf,
  progressOf,
  curriculum,
  onCancel,
  onConfirm,
}: {
  d: SimDraft;
  from: string;
  into: string;
  titleOf: (c: SimClassRow) => string;
  progressOf: (id: string) => Progress;
  curriculum: ReturnType<typeof withCurriculumDefaults>;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const a = d.classes.find((c) => c.id === from)!;
  const b = d.classes.find((c) => c.id === into)!;
  const n = headcount(d, a.id);
  const total = n + headcount(d, b.id);
  const vd = viewDateOf(d.draft);
  const warns: string[] = [];
  if (total > SIM_CAPACITY) warns.push(`정원 초과 (${total}/${SIM_CAPACITY})${total > 5 ? ' — 6명 이상은 합칠 수 없어요' : ''}`);
  if (simGradeCode(a, vd) !== simGradeCode(b, vd)) warns.push(`학년 차이 (${simGradeLabel(a, d.draft)} / ${simGradeLabel(b, d.draft)})`);
  const pa = progressOf(a.id);
  const pb = progressOf(b.id);
  const gap = progressGap(pb, pa);
  if (gap !== 0) {
    const t = `${formatProgress(pb, curriculum)} / ${formatProgress(pa, curriculum)}`;
    warns.push(gap === null ? `진도 다름 (${t})` : `진도 차이 ${gap}단원 (${t})`);
  }
  const tooMany = total > 5;
  return (
    <ConfirmDialog
      title="반 합치기"
      body={
        <div className="space-y-2">
          <p>
            <b>{titleOf(a)}</b> 학생 {n}명을 <b>{titleOf(b)}</b>으로 합칠까요?
          </p>
          <p>합친 뒤 인원: {total}명 · 합친 반은 {titleOf(b)} 진도를 따라요.</p>
          {warns.length > 0 && (
            <ul className="list-disc rounded-xl bg-amber-50 py-2 pr-2 pl-6 text-sm text-amber-900">
              {warns.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      }
      confirmLabel={tooMany ? '닫기' : '합치기'}
      onCancel={onCancel}
      onConfirm={tooMany ? onCancel : onConfirm}
    />
  );
}

