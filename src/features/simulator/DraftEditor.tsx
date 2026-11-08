// 시안 화면(SPEC_simulator 3·4장). 탭 방식 옮기기: 반 탭 → 칸 색 표시 → 칸 탭으로 이동.
// 폰 세로: 요일 탭으로 한 요일씩. 가로·PC: 전체 격자. 선택은 요일 탭을 바꿔도 유지된다.
import { useMemo, useState, type ReactNode } from 'react';
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
import type { SimClassRow } from '../../storage/rosterTypes.ts';
import { WEEKDAY_NAMES } from '../roster/rosterModel.ts';
import { SimClassSheet } from './SimClassSheet.tsx';
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
      waitCount: 0,
    };
  });
  const ghosts: GhostView[] = liveClasses(d).flatMap((c) => {
    const s = c.sourceClassId ? snap.get(c.sourceClassId) : undefined;
    if (!s || (s.weekday === c.weekday && s.startTime === c.startTime)) return [];
    return [{ weekday: s.weekday, startTime: s.startTime, text: `→ ${slotText(c.weekday, c.startTime)}` }];
  });

  const select = (id: string | null) => setSelectedId(id);

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
    if (!editable) {
      select(selectedId === id ? null : id);
      return;
    }
    if (!selectedId) return select(id);
    if (selectedId === id) {
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

  const days: Weekday[] = phonePortrait ? [day] : SIM_WEEKDAYS;
  const removed = removedClasses(d);

  return (
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
        />
        <RemovedArea
          classes={removed}
          titleOf={titleOf}
          countOf={(id) => headcount(d, id)}
          selectedId={selectedId}
          onPick={(id) => select(selectedId === id ? null : id)}
          canDrop={Boolean(selected && !selected.removed && editable)}
          onDrop={doRemove}
          phone={phonePortrait}
        />
      </div>

      {selected && (
        <div className="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 flex justify-center px-3">
          <div className="flex w-full max-w-[480px] flex-wrap items-center gap-2 rounded-2xl bg-stone-900/95 px-3 py-2 text-white shadow-xl md:max-w-2xl">
            <span className="min-w-0 flex-1 text-sm">
              <b>{titleOf(selected)}</b>
              <br />
              {editable ? (selected.removed ? '넣을 위치를 누르세요' : '옮길 위치를 누르세요 · 다른 반을 누르면 합치기') : '읽기 전용'}
            </span>
            {editable && (
              <Button className="px-3" onClick={() => setSheet({ edit: selected })}>
                반 정보
              </Button>
            )}
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
  dropRef,
}: {
  classes: SimClassRow[];
  titleOf: (c: SimClassRow) => string;
  countOf: (id: string) => number;
  selectedId: string | null;
  onPick: (id: string) => void;
  canDrop: boolean;
  onDrop: () => void;
  phone: boolean;
  dropRef?: (el: HTMLElement | null) => void;
}) {
  const [open, setOpen] = useState(true);
  const body: ReactNode = (
    <div className="space-y-2">
      {canDrop && (
        <button type="button" onClick={onDrop} className="h-11 w-full rounded-xl border-2 border-dashed border-stone-400 text-sm font-semibold text-stone-600">
          여기로 빼놓기
        </button>
      )}
      {classes.length === 0 && !canDrop && <p className="text-sm text-stone-500">빼놓은 반이 없어요. 반을 선택하고 [빼놓기]를 누르세요.</p>}
      {classes.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onPick(c.id)}
          className={`flex min-h-11 w-full items-center justify-between rounded-xl border px-3 text-left text-sm ${selectedId === c.id ? 'border-emerald-600 ring-2 ring-emerald-600' : 'border-stone-300 bg-stone-50'}`}
        >
          <span className="font-semibold">{titleOf(c)}</span>
          <span className="text-stone-500">{countOf(c.id)}명</span>
        </button>
      ))}
    </div>
  );
  return (
    <section ref={dropRef} className="mt-3 rounded-2xl border border-stone-200 bg-white p-3 md:sticky md:top-4 md:mt-0">
      <button type="button" className="flex h-9 w-full items-center justify-between text-base font-bold" onClick={() => phone && setOpen(!open)}>
        빼놓은 반 ({classes.length})
        {phone && <span className="text-sm font-normal text-stone-500">{open ? '접기' : '펼치기'}</span>}
      </button>
      {(open || !phone) && <div className="mt-2">{body}</div>}
    </section>
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

