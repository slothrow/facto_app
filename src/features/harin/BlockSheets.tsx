// 블록 편집 창들(SPEC_harin 6·7장): 새 블록/블록 고치기, 이동 시간 바꾸기, 여러 요일에 복사.
import { useState } from 'react';
import { BottomSheet, Button, Field, inputClass } from '../../components/ui.tsx';
import { shortTime, toMinutes } from '../../engine/classTime.ts';
import { INPUT_END, INPUT_START, KID_WEEKDAYS, canPlaceKid, travelOf, type TravelBlock } from '../../engine/harin/index.ts';
import type { KidActivityRow, KidBlockRow, KidCategoryRow } from '../../storage/rosterTypes.ts';
import { WEEKDAY_LABEL, defaultEnd, makeBlock, timeOptions } from './harinModel.ts';

const chip = (on: boolean) =>
  `min-h-11 rounded-full border-2 px-3 text-base ${on ? 'border-rose-400 bg-rose-50 font-semibold text-rose-700' : 'border-stone-200 bg-white text-stone-700'}`;

export type BlockSheetMode = { kind: 'new'; weekday: number; start: string } | { kind: 'edit'; block: KidBlockRow };

export function BlockSheet({
  mode,
  timetableId,
  blocks,
  categories,
  activities,
  onSave,
  onDelete,
  onCopy,
  onManageActivities,
  onClose,
}: {
  mode: BlockSheetMode;
  timetableId: string;
  blocks: KidBlockRow[];
  categories: KidCategoryRow[];
  activities: KidActivityRow[];
  onSave: (b: KidBlockRow) => void;
  onDelete?: (b: KidBlockRow) => void;
  onCopy?: (b: KidBlockRow) => void;
  onManageActivities: () => void;
  onClose: () => void;
}) {
  const editing = mode.kind === 'edit' ? mode.block : null;
  const usable = categories.filter((c) => !c.isTravel).sort((a, b) => a.sort - b.sort);
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? '');
  const [activityId, setActivityId] = useState<string | null>(editing?.activityId ?? null);
  const [title, setTitle] = useState(editing?.title ?? '');
  const [memo, setMemo] = useState(editing?.memo ?? '');
  const [weekday, setWeekday] = useState(editing?.weekday ?? (mode.kind === 'new' ? mode.weekday : 1));
  const [start, setStart] = useState(editing?.startTime ?? (mode.kind === 'new' ? mode.start : '15:00'));
  const [end, setEnd] = useState(editing?.endTime ?? '');
  const cat = usable.find((c) => c.id === categoryId) ?? null;

  const pickCategory = (c: KidCategoryRow) => {
    setCategoryId(c.id);
    if (!editing) setEnd(defaultEnd(start, c.defaultMinutes));
    if (!c.isActivity) setActivityId(null);
  };
  const endValue = end || (cat ? defaultEnd(start, cat.defaultMinutes) : defaultEnd(start, 50));
  const sortedActs = [...activities].sort((a, b) => a.sort - b.sort);

  const draft: KidBlockRow | null = cat
    ? editing
      ? { ...editing, weekday, startTime: start, endTime: endValue, categoryId: cat.id, activityId: cat.isActivity ? activityId : null, title: title.trim() || null, memo: memo.trim() || null }
      : makeBlock({ timetableId, weekday, startTime: start, endTime: endValue, category: cat, activityId, title, memo })
    : null;
  const place = draft ? canPlaceKid(blocks, draft, weekday, start, endValue) : null;
  const missingActivity = Boolean(cat?.isActivity && !activityId);
  const canSave = Boolean(draft && place?.ok && !missingActivity);

  const starts = timeOptions(INPUT_START, '22:50');
  const ends = timeOptions(INPUT_START, INPUT_END).filter((t) => toMinutes(t) > toMinutes(start));

  return (
    <BottomSheet title={editing ? '일정 고치기' : `새 일정 · ${WEEKDAY_LABEL[weekday]} ${shortTime(start)}`} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <p className="mb-1 text-sm font-medium text-stone-600">종류</p>
          <div className="flex flex-wrap gap-2">
            {usable.map((c) => (
              <button key={c.id} type="button" onClick={() => pickCategory(c)} className={chip(c.id === categoryId)} style={c.id === categoryId ? undefined : { backgroundColor: `${c.color}55` }}>
                {c.emoji} {c.name}
              </button>
            ))}
          </div>
        </div>

        {cat?.isActivity && (
          <div>
            <p className="mb-1 text-sm font-medium text-stone-600">학원</p>
            {sortedActs.length === 0 ? (
              <p className="text-base text-stone-500">아직 등록한 학원이 없어요.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {sortedActs.map((a) => (
                  <button key={a.id} type="button" onClick={() => setActivityId(a.id)} className={chip(a.id === activityId)} style={a.id === activityId ? undefined : { backgroundColor: `${a.color}66` }}>
                    {a.emoji} {a.name}
                    {a.isHome && <span className="text-sm text-stone-500"> (집)</span>}
                  </button>
                ))}
              </div>
            )}
            <button type="button" onClick={onManageActivities} className="mt-2 min-h-11 text-base font-semibold text-rose-600 underline">
              학원 목록 관리
            </button>
          </div>
        )}

        {cat && (
          <Field label={cat.isActivity ? '이름(비우면 학원 이름)' : `이름(비우면 "${cat.name}")`}>
            <input className={inputClass} value={title} maxLength={30} onChange={(e) => setTitle(e.target.value)} placeholder="예: 간식, 저녁, 독서" />
          </Field>
        )}

        <div className="grid grid-cols-3 gap-2">
          <Field label="요일">
            <select className={inputClass} value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
              {KID_WEEKDAYS.map((wd) => (
                <option key={wd} value={wd}>
                  {WEEKDAY_LABEL[wd]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="시작">
            <select
              className={inputClass}
              value={start}
              onChange={(e) => {
                const s = e.target.value;
                // 길이를 유지하며 시작을 옮긴다
                const len = toMinutes(endValue) - toMinutes(start);
                setStart(s);
                setEnd(defaultEnd(s, len));
              }}
            >
              {starts.map((t) => (
                <option key={t} value={t}>
                  {shortTime(t)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="끝">
            <select className={inputClass} value={endValue} onChange={(e) => setEnd(e.target.value)}>
              {ends.map((t) => (
                <option key={t} value={t}>
                  {shortTime(t)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="메모(선택)">
          <input className={inputClass} value={memo} maxLength={200} onChange={(e) => setMemo(e.target.value)} />
        </Field>

        {place && !place.ok && <p className="rounded-xl bg-amber-50 px-3 py-2 text-base text-amber-800">{place.reason}</p>}
        {missingActivity && <p className="text-base text-stone-500">학원을 골라 주세요.</p>}

        <div className="flex flex-wrap gap-2">
          <Button variant="primary" className="flex-1 !bg-rose-500 disabled:!bg-stone-300" disabled={!canSave} onClick={() => draft && onSave(draft)}>
            {editing ? '저장' : '넣기'}
          </Button>
          {editing && onCopy && <Button onClick={() => onCopy(editing)}>다른 요일에 복사</Button>}
          {editing && onDelete && (
            <Button variant="danger" onClick={() => onDelete(editing)}>
              삭제
            </Button>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}

/** 이동 블록 탭: 이 블록만 이동 시간 바꾸기 / 이번만 이동 없음 / 기본값으로 */
export function TravelSheet({
  travel,
  owner,
  activity,
  onSet,
  onClose,
}: {
  travel: TravelBlock;
  owner: KidBlockRow;
  activity: KidActivityRow | undefined;
  onSet: (minutes: number | null) => void;
  onClose: () => void;
}) {
  const base = activity && !activity.isHome ? activity.travelMinutes : 0;
  const current = travelOf(owner, activity, travel.side);
  const overridden = (travel.side === 'before' ? owner.travelBeforeOverride : owner.travelAfterOverride) !== null;
  const [minutes, setMinutes] = useState(current);
  const sideText = travel.fromId ? '두 학원 사이 이동' : travel.side === 'before' ? `${activity?.name ?? '학원'} 가는 길` : `${activity?.name ?? '학원'} 끝나고 오는 길`;
  return (
    <BottomSheet title={`🚶 ${sideText}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-base text-stone-600">
          {shortTime(travel.startTime)}~{shortTime(travel.endTime)} · {travel.minutes}분
          {overridden ? ' (이 블록만 바꾼 값)' : ` (학원 기본값 ${base}분)`}
        </p>
        {travel.warnings.length > 0 && <p className="rounded-xl bg-amber-50 px-3 py-2 text-base text-amber-800">⚠️ {travel.warnings.join(', ')}</p>}
        <div className="flex items-center justify-center gap-3">
          <Button className="w-14 text-2xl" onClick={() => setMinutes((m) => Math.max(5, m - 5))} aria-label="5분 줄이기">
            −
          </Button>
          <span className="w-24 text-center text-3xl font-bold">{minutes}분</span>
          <Button className="w-14 text-2xl" onClick={() => setMinutes((m) => Math.min(120, m + 5))} aria-label="5분 늘리기">
            +
          </Button>
        </div>
        <Button variant="primary" className="w-full !bg-rose-500" onClick={() => onSet(minutes)}>
          이 블록만 {minutes}분으로
        </Button>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => onSet(0)}>
            이번만 이동 없음
          </Button>
          <Button className="flex-1" disabled={!overridden} onClick={() => onSet(null)}>
            기본값으로
          </Button>
        </div>
        <p className="text-sm text-stone-500">학원 자체의 이동 시간은 [관리 → 학원]에서 바꿔요. 바꾸면 모든 시간표에 적용돼요.</p>
      </div>
    </BottomSheet>
  );
}

/** 블록을 다른 요일들에 같은 시간으로 복사 */
export function CopySheet({ block, label, onCopy, onClose }: { block: KidBlockRow; label: string; onCopy: (days: number[]) => void; onClose: () => void }) {
  const [days, setDays] = useState<number[]>([]);
  const toggle = (wd: number) => setDays((d) => (d.includes(wd) ? d.filter((x) => x !== wd) : [...d, wd]));
  const others = KID_WEEKDAYS.filter((wd) => wd !== block.weekday);
  return (
    <BottomSheet title="다른 요일에 복사" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-base text-stone-600">
          {label} · {WEEKDAY_LABEL[block.weekday]} {shortTime(block.startTime)}~{shortTime(block.endTime)}
        </p>
        <div className="flex gap-2">
          {others.map((wd) => (
            <button key={wd} type="button" aria-pressed={days.includes(wd)} onClick={() => toggle(wd)} className={`${chip(days.includes(wd))} flex-1 text-lg`}>
              {WEEKDAY_LABEL[wd]}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setDays(days.length === others.length ? [] : [...others])} className="min-h-11 text-base font-semibold text-rose-600 underline">
          {days.length === others.length ? '모두 해제' : '나머지 요일 모두'}
        </button>
        <Button variant="primary" className="w-full !bg-rose-500 disabled:!bg-stone-300" disabled={days.length === 0} onClick={() => onCopy(days)}>
          같은 시간에 복사
        </Button>
        <p className="text-sm text-stone-500">그 시간에 이미 일정이 있는 요일은 건너뛰어요.</p>
      </div>
    </BottomSheet>
  );
}
