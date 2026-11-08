// 시안 목록(SPEC_simulator 2.1·2.2). 새 시안: 현재 시간표(기준일) 또는 다른 시안 복제.
// 이름 바꾸기·복제·보관·삭제. 두 시안 비교는 [비교]로.
import { useMemo, useState } from 'react';
import { useAppData } from '../../app/AppDataContext.tsx';
import { navigate } from '../../app/router.ts';
import { todayStr, useRoster } from '../../app/RosterContext.tsx';
import { BottomSheet, Button, Card, ConfirmDialog, Field, inputClass } from '../../components/ui.tsx';
import { PlusIcon } from '../../components/icons.tsx';
import { checkDraft, cloneDraft, draftFromReal, summarize, summaryLine, type SimDraft } from '../../engine/simulator/index.ts';
import type { SimDraftRow, SimDraftStatus } from '../../storage/rosterTypes.ts';
import { draftInsertChange, draftOf, draftRemoveChange, hoursOf } from './simModel.ts';

const STATUS_LABEL: Record<SimDraftStatus, string> = { editing: '편집 중', applied: '적용됨', archived: '보관' };
const STATUS_TONE: Record<SimDraftStatus, string> = {
  editing: 'bg-emerald-100 text-emerald-800',
  applied: 'bg-sky-100 text-sky-800',
  archived: 'bg-stone-200 text-stone-600',
};

const editedText = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export function DraftListView() {
  const { roster, mutate } = useRoster();
  const { data } = useAppData();
  const [creating, setCreating] = useState(false);
  const [menu, setMenu] = useState<SimDraftRow | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const drafts = useMemo(() => {
    const order: Record<SimDraftStatus, number> = { editing: 0, applied: 1, archived: 2 };
    return [...roster.simDrafts].sort((a, b) => order[a.status] - order[b.status] || b.editedAt.localeCompare(a.editedAt));
  }, [roster.simDrafts]);
  const hours = hoursOf(data);
  const summaryOf = (id: string) => {
    const d = draftOf(roster, id);
    return d ? summaryLine(summarize(d, checkDraft(d, roster, { hours }))) : '';
  };
  const visible = drafts.filter((d) => showArchived || d.status !== 'archived');
  const archivedCount = drafts.filter((d) => d.status === 'archived').length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="flex-1 text-lg font-bold">반 편성 시안</h1>
        {drafts.length >= 2 && (
          <Button className="px-3" onClick={() => navigate('/roster/sim-compare')}>
            두 시안 비교
          </Button>
        )}
        <Button variant="primary" onClick={() => setCreating(true)}>
          <PlusIcon className="inline h-4 w-4" /> 새 시안
        </Button>
      </div>
      <details className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm" open={roster.simDrafts.length === 0}>
        <summary className="min-h-8 cursor-pointer font-bold text-emerald-900">편성 사용 안내</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-stone-700">
          <li>[새 시안] → 지금 시간표가 복사돼요. 여기서 무엇을 해도 실제 반은 그대로예요.</li>
          <li>반을 톡 누르고 초록 칸을 누르면 이동(길게 눌러 끌어도 돼요). 다른 반을 누르면 합치기.</li>
          <li>[상세](또는 길게 눌렀다 떼기) → 아이 태그·대기자·임시 이름·메모.</li>
          <li>아래 [경고]·[변경]으로 확인하고, 잘못하면 [↶ 되돌리기].</li>
          <li>다 되면 [적용하기] → 백업 → 수업월 고르기 → 미리보기 확인 후 적용.</li>
        </ol>
      </details>

      {visible.length === 0 && (
        <Card>
          <p className="text-base text-stone-600">아직 시안이 없어요. [새 시안]으로 지금 시간표를 복사해 시작하세요.</p>
        </Card>
      )}
      <div className="grid gap-2 md:grid-cols-2">
        {visible.map((d) => (
          <div key={d.id} className="flex items-stretch gap-1 rounded-2xl border border-stone-200 bg-white">
            <button type="button" onClick={() => navigate(`/roster/sim/${d.id}`)} className="min-w-0 flex-1 p-3 text-left">
              <span className="flex items-center gap-2">
                <span className="truncate text-base font-bold">{d.name}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_TONE[d.status]}`}>{STATUS_LABEL[d.status]}</span>
              </span>
              <span className="mt-1 block text-sm text-stone-500">
                기준일 {d.baseDate} · 수정 {editedText(d.editedAt)}
              </span>
              <span className="mt-0.5 block text-sm text-stone-700">{summaryOf(d.id)}</span>
              {d.status === 'applied' && d.appliedSummary && (
                <span className="mt-0.5 block text-xs text-sky-800">
                  {d.appliedSummary.option}: {d.appliedSummary.lines.join(', ')}
                </span>
              )}
            </button>
            <button type="button" aria-label="시안 메뉴" onClick={() => setMenu(d)} className="w-12 shrink-0 rounded-r-2xl text-xl text-stone-500 active:bg-stone-100">
              ⋯
            </button>
          </div>
        ))}
      </div>
      {archivedCount > 0 && (
        <Button variant="ghost" className="text-sm" onClick={() => setShowArchived(!showArchived)}>
          {showArchived ? '보관한 시안 숨기기' : `보관한 시안 보기 (${archivedCount})`}
        </Button>
      )}

      {creating && (
        <NewDraftSheet
          onClose={() => setCreating(false)}
          onCreate={async (d) => {
            if (await mutate(draftInsertChange(d), '시안을 만들었어요')) navigate(`/roster/sim/${d.draft.id}`);
            setCreating(false);
          }}
        />
      )}
      {menu && <DraftMenu row={menu} onClose={() => setMenu(null)} />}
    </div>
  );
}

function NewDraftSheet({ onClose, onCreate }: { onClose: () => void; onCreate: (d: SimDraft) => void }) {
  const { roster } = useRoster();
  const today = todayStr();
  const [source, setSource] = useState<string>('real');
  const [baseDate, setBaseDate] = useState(today);
  const [name, setName] = useState(`${today.slice(0, 4)} 시안 ${String.fromCharCode(65 + Math.min(25, roster.simDrafts.length))}안`);
  const src = source === 'real' ? null : draftOf(roster, source);
  const create = () => {
    const now = new Date().toISOString();
    const n = name.trim() || '새 시안';
    onCreate(src ? cloneDraft(src, n, now) : draftFromReal(roster, baseDate, n, now));
  };
  return (
    <BottomSheet title="새 시안" onClose={onClose}>
      <div className="space-y-3">
        <Field label="이름">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 2027 새학기 A안" />
        </Field>
        <Field label="원본">
          <select className={inputClass} value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="real">현재 시간표</option>
            {roster.simDrafts.map((d) => (
              <option key={d.id} value={d.id}>
                시안 복제: {d.name}
              </option>
            ))}
          </select>
        </Field>
        {source === 'real' ? (
          <Field label="기준일" hint="그날 운영 중인 반과 그날 배정된 학생을 복사해요">
            <input type="date" className={inputClass} value={baseDate} onChange={(e) => e.target.value && setBaseDate(e.target.value)} />
          </Field>
        ) : (
          <p className="text-sm text-stone-500">기준일은 원본 시안({src?.draft.baseDate})과 같아요.</p>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" onClick={create}>
            만들기
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}

function DraftMenu({ row, onClose }: { row: SimDraftRow; onClose: () => void }) {
  const { roster, mutate } = useRoster();
  const [name, setName] = useState(row.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const d = draftOf(roster, row.id);
  const save = (patch: Partial<SimDraftRow>, msg: string) => {
    void mutate({ upsert: { simDrafts: [{ ...row, ...patch, editedAt: new Date().toISOString() }] } }, msg);
    onClose();
  };
  if (!d) return null;
  return (
    <BottomSheet title={row.name} onClose={onClose}>
      <div className="space-y-3">
        <Field label="이름 바꾸기">
          <div className="flex gap-2">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
            <Button variant="primary" disabled={!name.trim() || name === row.name} onClick={() => save({ name: name.trim() }, '이름을 바꿨어요')}>
              저장
            </Button>
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Button
            onClick={async () => {
              const copy = cloneDraft(d, `${row.name} 복제`, new Date().toISOString());
              await mutate(draftInsertChange(copy), '복제했어요');
              onClose();
            }}
          >
            복제
          </Button>
          {row.status === 'archived' ? (
            <Button onClick={() => save({ status: row.appliedAt ? 'applied' : 'editing' }, '보관을 풀었어요')}>보관 풀기</Button>
          ) : (
            <Button onClick={() => save({ status: 'archived' }, '보관했어요')}>보관</Button>
          )}
          <Button variant="danger" className="col-span-2" onClick={() => setConfirmDelete(true)}>
            삭제
          </Button>
        </div>
      </div>
      {confirmDelete && (
        <ConfirmDialog
          title="시안을 삭제할까요?"
          body={`"${row.name}" 시안을 지워요. 실제 반·학생은 바뀌지 않아요. 되돌릴 수 없어요.`}
          confirmLabel="삭제"
          danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={async () => {
            await mutate(draftRemoveChange(d), '시안을 지웠어요');
            onClose();
          }}
        />
      )}
    </BottomSheet>
  );
}
