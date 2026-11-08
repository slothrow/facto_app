// 시안 반 상세(SPEC_simulator 5장): 아이 목록 + 상태 태그, 아이별 메모, [+ 대기자에서], [+ 임시 이름],
// 반 메모, 진도. 폰은 바텀시트, PC도 같은 시트(가운데 정렬)로 연다.
import { useState } from 'react';
import { BottomSheet, Button, inputClass } from '../../components/ui.tsx';
import { formatProgress, type CurriculumSettings, type Progress } from '../../engine/curriculum.ts';
import {
  SIM_HARD_MAX,
  TAG_LABEL,
  TAG_ORDER,
  headcount,
  simGradeLabel,
  slotText,
  type SimDraft,
} from '../../engine/simulator/index.ts';
import type { RosterData, SimClassRow } from '../../storage/rosterTypes.ts';
import { STAGE_LABEL } from '../roster/waitlist/waitlistModel.ts';
import { TAG_CHIP, freeWaitlist, memberViews, waitlistMatches } from './simReview.ts';
import { addMember, removeMember, setMember, updateClass } from './simOps.ts';

export function SimClassDetail({
  d,
  cls,
  roster,
  progress,
  curriculum,
  editable,
  onApply,
  onEditInfo,
  onClose,
}: {
  d: SimDraft;
  cls: SimClassRow;
  roster: RosterData;
  progress: Progress;
  curriculum: CurriculumSettings;
  editable: boolean;
  onApply: (next: SimDraft) => void;
  onEditInfo: () => void;
  onClose: () => void;
}) {
  const [adding, setAdding] = useState<'wait' | 'temp' | null>(null);
  const [tempName, setTempName] = useState('');
  const [showAllWait, setShowAllWait] = useState(false);
  const views = memberViews(d, cls.id, roster);
  const count = headcount(d, cls.id);
  const full = count >= SIM_HARD_MAX;
  const matches = waitlistMatches(d, cls, roster);
  const others = freeWaitlist(d, roster).filter((w) => !matches.includes(w));
  const title = `${slotText(cls.weekday, cls.startTime)} ${simGradeLabel(cls, d.draft)}${cls.alias ? ` ${cls.alias}` : ''}`;

  return (
    <BottomSheet title={title} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-stone-600">
          <span className={`font-semibold ${count > 4 ? 'text-red-600' : ''}`}>인원 {count}/4</span>
          <span>· {progress.kind === 'unset' ? '진도 미설정' : `진도 ${formatProgress(progress, curriculum)}`}</span>
          {!cls.sourceClassId && <span className="rounded bg-emerald-600 px-1.5 text-xs font-bold text-white">신규</span>}
          {editable && (
            <Button className="ml-auto px-3 text-sm" onClick={onEditInfo}>
              반 정보·진도
            </Button>
          )}
        </div>
        {cls.sourceClassId && <p className="-mt-2 text-xs text-stone-500">진도는 실제 반 진도를 그대로 따라가요(옮겨도 유지).</p>}

        <section>
          <h3 className="mb-2 text-base font-bold">아이 ({views.length})</h3>
          {views.length === 0 && <p className="text-sm text-stone-500">아직 아이가 없어요.</p>}
          <ul className="space-y-2">
            {views.map((v) => (
              <li key={v.m.id} className="rounded-xl border border-stone-200 p-2">
                <div className="flex items-center gap-2">
                  <span className={`text-base font-semibold ${v.m.tag === 'leaving' ? 'text-stone-400 line-through' : ''}`}>{v.name}</span>
                  <span className="text-xs text-stone-500">
                    {v.grade}
                    {v.kind === 'waitlist' ? ' · 대기자' : v.kind === 'temp' ? ' · 임시 이름' : ''}
                  </span>
                  {editable && v.kind !== 'student' && (
                    <button type="button" className="ml-auto h-9 px-2 text-sm text-red-600" onClick={() => onApply(removeMember(d, v.m.id))}>
                      빼기
                    </button>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {TAG_ORDER.map((t) => (
                    <button
                      key={t}
                      type="button"
                      disabled={!editable}
                      aria-pressed={v.m.tag === t}
                      onClick={() => v.m.tag !== t && onApply(setMember(d, v.m.id, { tag: t }))}
                      className={`h-9 rounded-lg border px-2 text-sm ${v.m.tag === t ? `${TAG_CHIP[t]} ring-2 ring-offset-1 ring-stone-500` : 'border-stone-200 bg-white text-stone-400'}`}
                    >
                      {TAG_LABEL[t]}
                    </button>
                  ))}
                </div>
                <MemoInput
                  value={v.m.memo ?? ''}
                  disabled={!editable}
                  placeholder="아이 메모(예: 화요일 학원 겹침)"
                  onSave={(memo) => onApply(setMember(d, v.m.id, { memo: memo || null }))}
                />
              </li>
            ))}
          </ul>
        </section>

        {editable && (
          <section className="space-y-2">
            {full && <p className="text-sm text-red-700">5명이 꽉 찼어요. 6명 이상은 담을 수 없어요.</p>}
            <div className="grid grid-cols-2 gap-2">
              <Button disabled={full} onClick={() => setAdding(adding === 'wait' ? null : 'wait')}>
                + 대기자에서
              </Button>
              <Button disabled={full} onClick={() => setAdding(adding === 'temp' ? null : 'temp')}>
                + 임시 이름
              </Button>
            </div>
            {adding === 'temp' && !full && (
              <div className="flex gap-2">
                <input className={inputClass} value={tempName} onChange={(e) => setTempName(e.target.value)} placeholder="상담 중인 아이 이름" />
                <Button
                  variant="primary"
                  disabled={!tempName.trim()}
                  onClick={() => {
                    onApply(addMember(d, cls.id, { tempName: tempName.trim() }));
                    setTempName('');
                    setAdding(null);
                  }}
                >
                  추가
                </Button>
              </div>
            )}
            {adding === 'temp' && <p className="text-xs text-stone-500">임시 이름은 적용할 때 반영되지 않아요. 대기자로 먼저 등록해야 학생이 돼요.</p>}
          </section>
        )}

        <section>
          <h3 className="mb-2 text-base font-bold">맞는 대기자 ({matches.length})</h3>
          <p className="mb-2 text-xs text-stone-500">학년({d.draft.gradeView === 'next' ? '다음' : '현재'} 학년도 기준)과 희망 요일·시간이 맞는 대기자. 누르면 "신규"로 추가.</p>
          <WaitList list={matches} disabled={!editable || full} onPick={(id) => onApply(addMember(d, cls.id, { waitlistId: id }))} />
          {(adding === 'wait' || showAllWait) && others.length > 0 && (
            <>
              <h4 className="mt-3 mb-1 text-sm font-semibold text-stone-600">다른 대기자</h4>
              <WaitList list={others} disabled={!editable || full} onPick={(id) => onApply(addMember(d, cls.id, { waitlistId: id }))} />
            </>
          )}
          {adding !== 'wait' && !showAllWait && others.length > 0 && (
            <Button variant="ghost" className="mt-1 text-sm" onClick={() => setShowAllWait(true)}>
              다른 대기자 보기 ({others.length})
            </Button>
          )}
        </section>

        <section>
          <h3 className="mb-1 text-base font-bold">반 메모</h3>
          <MemoInput
            value={cls.memo ?? ''}
            disabled={!editable}
            multiline
            placeholder="예: ?? 4명 채울 수 있을지"
            onSave={(memo) => onApply(updateClass(d, cls.id, { memo: memo || null }))}
          />
        </section>
      </div>
    </BottomSheet>
  );

}


function WaitList({ list, disabled, onPick }: { list: RosterData['waitlist']; disabled: boolean; onPick: (id: string) => void }) {
  if (list.length === 0) return <p className="text-sm text-stone-500">없어요.</p>;
  return (
    <ul className="space-y-1">
      {list.map((w) => (
        <li key={w.id}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onPick(w.id)}
            className="flex min-h-11 w-full items-center justify-between rounded-xl border border-sky-200 bg-sky-50 px-3 text-left text-sm disabled:opacity-50"
          >
            <span className="font-semibold">{w.name}</span>
            <span className="text-xs text-stone-500">{STAGE_LABEL[w.stage]}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** 입력을 마치면(포커스가 빠지면) 저장 */
function MemoInput({
  value,
  onSave,
  placeholder,
  disabled,
  multiline,
}: {
  value: string;
  onSave: (v: string) => void;
  placeholder: string;
  disabled: boolean;
  multiline?: boolean;
}) {
  const [text, setText] = useState(value);
  const commit = () => text.trim() !== value && onSave(text.trim());
  return multiline ? (
    <textarea className={`${inputClass} mt-1 min-h-20 py-2`} value={text} disabled={disabled} placeholder={placeholder} onChange={(e) => setText(e.target.value)} onBlur={commit} />
  ) : (
    <input className={`${inputClass} mt-1 min-h-10 text-sm`} value={text} disabled={disabled} placeholder={placeholder} onChange={(e) => setText(e.target.value)} onBlur={commit} />
  );
}
