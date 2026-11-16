// 수업 후 브리핑 화면(SPEC_briefing 5장, SPEC_personal_briefing 5장).
// 주소: #/briefing/<날짜>/<반 id>(/personal) (이름은 주소에 넣지 않는다)
// 날짜 → [전체브리핑]/[개인브리핑] → 그날 수업 반(시작 시간 버튼, "전체 3/4 · 개인 2/4") → 오늘 코드·문구 → 아이별 [보내기].
import { useState } from 'react';
import { useAppData } from '../../app/AppDataContext.tsx';
import { navigate } from '../../app/router.ts';
import { todayStr, useRoster } from '../../app/RosterContext.tsx';
import { ChevronLeft, ChevronRight, PlusIcon, ShareIcon } from '../../components/icons.tsx';
import { Button, Card, ConfirmDialog, inputClass } from '../../components/ui.tsx';
import { shortTime } from '../../engine/classTime.ts';
import { addDays } from '../../engine/dates.ts';
import type { BriefingRow, ClassRow, RosterData } from '../../storage/rosterTypes.ts';
import type { AppData } from '../../storage/types.ts';
import { classesOnDate } from '../attendance/attendanceModel.ts';
import { curriculumOf } from '../curriculum/curriculumModel.ts';
import { studentGradeLabel } from '../roster/rosterModel.ts';
import { cancelSent, classBriefing, defaultClass, progressCount, recipients, recordSent, type Recipient } from './briefingModel.ts';
import { CodeCard } from './CodeCard.tsx';
import { Badges, SentMark } from './RecipientBits.tsx';
import { GuestSheet } from './GuestSheet.tsx';
import { PersonalPanel } from './PersonalPanel.tsx';
import { PlanSheet, TextSheet, dateLabel } from './TextsPage.tsx';
import { TwoStepToggle, useSendFlow } from './useSendFlow.tsx';

const isDate = (s?: string): s is string => Boolean(s && /^\d{4}-\d{2}-\d{2}$/.test(s));
const nowMinutes = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

export type BriefingMode = 'class' | 'personal';

export function BriefingHome({ dateParam, classParam, modeParam }: { dateParam?: string; classParam?: string; modeParam?: string }) {
  const { data } = useAppData();
  const { roster } = useRoster();
  const today = todayStr();
  const date = isDate(dateParam) ? dateParam : today;
  const mode: BriefingMode = modeParam === 'personal' ? 'personal' : 'class';
  const { noClassReason, classes, cell } = classesOnDate(data, roster, date);
  const settings = curriculumOf(data);
  // 반 버튼의 진행 표시를 위해 이번 화면에서 [+ 아이 추가]한 아이를 반별로 기억(전체·개인 공유)
  const [guests, setGuests] = useState<Record<string, string[]>>({});
  const dayClassIds = classes.map((c) => c.id);
  const selected =
    classes.find((c) => c.id === classParam) ?? defaultClass(classes, date === today ? nowMinutes() : null);

  // 날짜·반·화면(전체/개인)을 함께 주소에 둔다 → 전환해도 날짜·반이 유지된다
  const go = (d: string, classId?: string, m: BriefingMode = mode) =>
    navigate(`/briefing/${d}${classId ? `/${classId}` : m === 'personal' ? '/-' : ''}${m === 'personal' ? '/personal' : ''}`);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="flex-1 text-xl font-bold">수업 후 브리핑</h1>
        <Button onClick={() => navigate(mode === 'personal' ? '/briefing/texts/P/personal' : '/briefing/texts')}>문구 관리</Button>
      </div>

      <div role="tablist" className="grid grid-cols-2 gap-1 rounded-2xl bg-stone-200/70 p-1 md:max-w-md">
        {(['class', 'personal'] as BriefingMode[]).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => go(date, selected?.id, m)}
            className={`h-12 rounded-xl text-base font-bold ${mode === m ? 'bg-white text-emerald-800 shadow-sm' : 'text-stone-600'}`}
          >
            {m === 'class' ? '전체브리핑' : '개인브리핑'}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1 md:max-w-md">
        <Button variant="ghost" className="px-2" aria-label="전날" onClick={() => go(addDays(date, -1))}>
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <input type="date" className={`${inputClass} text-center font-semibold`} value={date} onChange={(e) => isDate(e.target.value) && go(e.target.value)} />
        <Button variant="ghost" className="px-2" aria-label="다음 날" onClick={() => go(addDays(date, 1))}>
          <ChevronRight className="h-6 w-6" />
        </Button>
        {/* 날짜칸 크기가 바뀌지 않게 [오늘]은 항상 두고, 오늘이면 눌리지 않게만 */}
        <Button className="shrink-0 px-3" disabled={date === today} onClick={() => go(today)}>
          오늘
        </Button>
      </div>

      {noClassReason || classes.length === 0 ? (
        <Card>
          <p className="text-base text-stone-600">
            {date === today ? '오늘은' : `${dateLabel(date)}은`} 수업이 없습니다{noClassReason && noClassReason !== '수업 없음' ? ` (${noClassReason})` : ''}.
          </p>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {classes.map((c) => {
              const b = classBriefing(roster, c, cell, settings);
              const list = recipients(roster, c.id, date, guests[c.id] ?? [], dayClassIds);
              const whole = progressCount(list);
              const mine = progressCount(list, 'personal');
              const cur = mode === 'class' ? whole : mine;
              const done = cur.total > 0 && cur.sent === cur.total;
              const on = selected?.id === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => go(date, c.id)}
                  className={`flex min-h-16 min-w-[5.5rem] flex-col items-center justify-center rounded-2xl border-2 px-2 py-1 leading-tight ${
                    on ? 'border-emerald-700 bg-emerald-700 text-white' : done ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-stone-200 bg-white'
                  }`}
                >
                  <span className="text-lg font-bold">{shortTime(c.startTime)}</span>
                  {b.code === null ? (
                    <span className={`text-sm ${on ? 'text-emerald-50' : 'text-stone-500'}`}>진도?</span>
                  ) : (
                    <span className={`text-xs ${on ? 'text-emerald-50' : 'text-stone-500'}`}>
                      <span className={mode === 'class' ? 'font-bold' : ''}>전체 {whole.sent}/{whole.total}</span>
                      <br />
                      <span className={mode === 'personal' ? 'font-bold' : ''}>개인 {mine.sent}/{mine.total}</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {selected &&
            (mode === 'class' ? (
              <ClassPanel
                key={`${date}-${selected.id}`}
                data={data}
                roster={roster}
                cls={selected}
                date={date}
                guests={guests[selected.id] ?? []}
                dayClassIds={dayClassIds}
                onAddGuest={(id) => setGuests((g) => ({ ...g, [selected.id]: [...(g[selected.id] ?? []), id] }))}
              />
            ) : (
              <PersonalPanel
                key={`p-${date}-${selected.id}`}
                data={data}
                roster={roster}
                cls={selected}
                date={date}
                guests={guests[selected.id] ?? []}
                dayClassIds={dayClassIds}
                onAddGuest={(id) => setGuests((g) => ({ ...g, [selected.id]: [...(g[selected.id] ?? []), id] }))}
              />
            ))}
        </>
      )}
    </div>
  );
}

export interface PanelProps {
  data: AppData;
  roster: RosterData;
  cls: ClassRow;
  date: string;
  guests: string[];
  dayClassIds: string[];
  onAddGuest: (studentId: string) => void;
}

/** 전체브리핑: 같은 반 아이 모두 같은 문구 */
function ClassPanel({ data, roster, cls, date, guests, dayClassIds, onAddGuest }: PanelProps) {
  const { mutate } = useRoster();
  const flow = useSendFlow();
  const settings = curriculumOf(data);
  const { cell } = classesOnDate(data, roster, date);
  const b = classBriefing(roster, cls, cell, settings);
  const list = recipients(roster, cls.id, date, guests, dayClassIds);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [canceling, setCanceling] = useState<BriefingRow | null>(null);

  const recorder = (studentId: string) => async () => {
    if (!b.code || !b.text) return;
    await mutate(recordSent(roster, date, cls.id, studentId, b.code, b.text, new Date().toISOString()), '전체브리핑 보냄으로 기록했어요');
  };

  return (
    <div className="space-y-4 md:grid md:grid-cols-2 md:items-start md:gap-6 md:space-y-0">
      <CodeCard b={b} cls={cls} date={date}>
        {b.text ? (
          <>
            <p className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl bg-stone-50 p-3 text-base leading-relaxed">{b.text}</p>
            <Button variant="ghost" className="mt-1 w-full" onClick={() => setEditing(true)}>
              문구 수정
            </Button>
          </>
        ) : (
          <div className="mt-3 space-y-2 rounded-xl border border-dashed border-stone-300 p-3">
            <p className="text-base text-stone-600">{b.result.kind === 'basic' ? '이 날짜의 베이직 수업 내용이 아직 없어요.' : '이 코드의 전체 문구가 아직 없어요.'}</p>
            <Button variant="primary" className="w-full" onClick={() => setEditing(true)}>
              지금 작성
            </Button>
          </div>
        )}
      </CodeCard>

      <Card title={`아이 ${list.filter((r) => !r.absent).length}명`}>
        <ul className="divide-y divide-stone-100">
          {list.map((r) => (
            <RecipientRow
              key={r.student.id}
              r={r}
              date={date}
              canSend={Boolean(b.text && b.code)}
              twoStep={flow.twoStep}
              onSend={() => b.text && void flow.sendOneTap(r.student, b.text, recorder(r.student.id))}
              onCopyName={() => void flow.copyName(r.student)}
              onShare={() => b.text && void flow.share(b.text, recorder(r.student.id))}
              onCancel={() => r.sent && setCanceling(r.sent)}
            />
          ))}
        </ul>
        <Button className="mt-2 flex w-full items-center justify-center gap-1" onClick={() => setAdding(true)}>
          <PlusIcon className="h-5 w-5" /> 아이 추가 (보강 등)
        </Button>
        <TwoStepToggle flow={flow} />
      </Card>

      {editing &&
        (b.result.kind === 'basic' ? (
          <PlanSheet cls={cls} date={date} plan={b.plan} onClose={() => setEditing(false)} />
        ) : b.code ? (
          <TextSheet code={b.code} onClose={() => setEditing(false)} />
        ) : null)}
      {adding && (
        <GuestSheet
          roster={roster}
          exclude={new Set(list.map((r) => r.student.id))}
          date={date}
          onPick={(id) => {
            onAddGuest(id);
            setAdding(false);
          }}
          onClose={() => setAdding(false)}
        />
      )}
      {canceling && (
        <ConfirmDialog
          title="보냄을 취소할까요?"
          body="앱의 보냄 표시만 지워요. 카톡으로 이미 보낸 메시지는 그대로예요."
          confirmLabel="보냄 취소"
          danger
          onCancel={() => setCanceling(null)}
          onConfirm={async () => {
            const row = canceling;
            setCanceling(null);
            await mutate(cancelSent(row), '보냄 표시를 지웠어요');
          }}
        />
      )}
      {flow.dialog}
    </div>
  );
}

function RecipientRow({
  r,
  date,
  canSend,
  twoStep,
  onSend,
  onCopyName,
  onShare,
  onCancel,
}: {
  r: Recipient;
  date: string;
  canSend: boolean;
  twoStep: boolean;
  onSend: () => void;
  onCopyName: () => void;
  onShare: () => void;
  onCancel: () => void;
}) {
  const s = r.student;
  return (
    <li className={`flex min-h-14 items-center gap-2 py-1.5 ${r.absent ? 'text-stone-400' : ''}`}>
      <span className="min-w-0 flex-1">
        <span className="text-lg font-semibold">{s.name}</span> <span className="text-sm text-stone-500">{studentGradeLabel(s, date)}</span>
        <Badges r={r} />
      </span>
      {r.absent ? (
        <span className="shrink-0 text-base">결석</span>
      ) : r.sent ? (
        <SentMark row={r.sent} onCancel={onCancel} />
      ) : twoStep ? (
        <span className="flex shrink-0 gap-1">
          <Button className="px-3" disabled={!canSend} onClick={onCopyName}>
            이름 복사
          </Button>
          <Button variant="primary" className="px-3" disabled={!canSend} onClick={onShare}>
            공유
          </Button>
        </span>
      ) : (
        <Button variant="primary" className="flex shrink-0 items-center gap-1 px-4" disabled={!canSend} onClick={onSend}>
          <ShareIcon className="h-5 w-5" /> 보내기
        </Button>
      )}
    </li>
  );
}
