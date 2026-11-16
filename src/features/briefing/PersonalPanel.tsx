// 개인브리핑(SPEC_personal_briefing 5장): 오늘 개인 문구에 아이마다 부르는 이름을 넣어 확인 → 보내기.
// - 미리보기 탭 = 이 아이에게만 수정(저장소 문구는 그대로), 이름 탭 = 부르는 이름 수정(학생 정보에 저장)
// - 확인 상태·아이별 수정은 이 기기에 그날·그 반 단위로 저장(personalModel)
import { useState } from 'react';
import { useRoster } from '../../app/RosterContext.tsx';
import { PlusIcon, ShareIcon } from '../../components/icons.tsx';
import { BottomSheet, Button, Card, ConfirmDialog, inputClass } from '../../components/ui.tsx';
import { NAME_SLOT, callNameOf } from '../../engine/personalBriefing.ts';
import type { BriefingRow, StudentRow } from '../../storage/rosterTypes.ts';
import { classesOnDate } from '../attendance/attendanceModel.ts';
import { curriculumOf } from '../curriculum/curriculumModel.ts';
import { studentGradeLabel } from '../roster/rosterModel.ts';
import type { PanelProps } from './BriefingHome.tsx';
import { cancelSent, classBriefing, recipients, recordSent, type Recipient } from './briefingModel.ts';
import { CallNameInput } from './CallNameInput.tsx';
import { CodeCard } from './CodeCard.tsx';
import { GuestSheet } from './GuestSheet.tsx';
import { cardStatus, loadLocalCards, personalText, saveLocalCards, type LocalCard, type LocalCards } from './personalModel.ts';
import { Badges, SentMark } from './RecipientBits.tsx';
import { TextSheet } from './TextsPage.tsx';
import { TwoStepToggle, useSendFlow, type SendFlow } from './useSendFlow.tsx';

export function PersonalPanel({ data, roster, cls, date, guests, dayClassIds, onAddGuest }: PanelProps) {
  const { mutate } = useRoster();
  const flow = useSendFlow();
  const settings = curriculumOf(data);
  const { cell } = classesOnDate(data, roster, date);
  const b = classBriefing(roster, cls, cell, settings);
  const template = b.code ? roster.personalBriefingTexts.find((t) => t.code === b.code)?.text ?? '' : '';
  const hasTemplate = Boolean(template.trim());
  const list = recipients(roster, cls.id, date, guests, dayClassIds);
  const [cards, setCards] = useState<LocalCards>(() => loadLocalCards(date, cls.id));
  const [editingTemplate, setEditingTemplate] = useState(false);
  const [adding, setAdding] = useState(false);
  const [canceling, setCanceling] = useState<BriefingRow | null>(null);
  const [nameOf, setNameOf] = useState<StudentRow | null>(null);
  const [textOf, setTextOf] = useState<StudentRow | null>(null);

  const updateCard = (studentId: string, next: LocalCard) => {
    const all = { ...cards, [studentId]: next };
    setCards(all);
    saveLocalCards(date, cls.id, all);
  };

  const recorder = (studentId: string, text: string) => async () => {
    if (!b.code) return;
    await mutate(recordSent(roster, date, cls.id, studentId, b.code, text, new Date().toISOString(), 'personal'), '개인브리핑 보냄으로 기록했어요');
  };

  const targets = list.filter((r) => !r.absent);

  return (
    <div className="space-y-4 md:grid md:grid-cols-2 md:items-start md:gap-6 md:space-y-0">
      <CodeCard b={b} cls={cls} date={date}>
        {hasTemplate ? (
          <>
            <p className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl bg-stone-50 p-3 text-base leading-relaxed">
              {template.split(NAME_SLOT).map((piece, i) => (
                <span key={i}>
                  {i > 0 && <b className="rounded bg-emerald-100 px-1 text-emerald-800">{NAME_SLOT}</b>}
                  {piece}
                </span>
              ))}
            </p>
            <Button variant="ghost" className="mt-1 w-full" onClick={() => setEditingTemplate(true)}>
              개인 문구 수정
            </Button>
          </>
        ) : (
          <div className="mt-3 space-y-2 rounded-xl border border-dashed border-stone-300 p-3">
            <p className="text-base text-stone-600">이 코드의 개인 문구가 아직 없어요. {NAME_SLOT} 자리를 넣어 적으면 아이마다 이름이 들어가요.</p>
            <Button variant="primary" className="w-full" onClick={() => setEditingTemplate(true)}>
              지금 작성
            </Button>
          </div>
        )}
      </CodeCard>

      <Card title={`아이 ${targets.length}명`}>
        <ul className="divide-y divide-stone-100">
          {list.map((r) =>
            r.absent ? (
              <li key={r.student.id} className="flex min-h-12 items-center gap-2 py-1.5 text-stone-400">
                <span className="flex-1 text-lg font-semibold">{r.student.name}</span>
                <span className="text-base">결석</span>
              </li>
            ) : (
              <PersonalCard
                key={r.student.id}
                r={r}
                date={date}
                template={hasTemplate ? template : null}
                local={cards[r.student.id]}
                flow={flow}
                onConfirm={(text) => updateCard(r.student.id, { ...cards[r.student.id], confirmedText: text })}
                onEditName={() => setNameOf(r.student)}
                onEditText={() => setTextOf(r.student)}
                onSend={(text) => void flow.sendOneTap(r.student, text, recorder(r.student.id, text))}
                onShare={(text) => void flow.share(text, recorder(r.student.id, text))}
                onCancel={() => r.personalSent && setCanceling(r.personalSent)}
              />
            ),
          )}
        </ul>
        <Button className="mt-2 flex w-full items-center justify-center gap-1" onClick={() => setAdding(true)}>
          <PlusIcon className="h-5 w-5" /> 아이 추가 (보강 등)
        </Button>
        <TwoStepToggle flow={flow} />
      </Card>

      {editingTemplate && b.code && <TextSheet code={b.code} store="personalBriefingTexts" onClose={() => setEditingTemplate(false)} />}
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
      {nameOf && <CallNameSheet student={roster.students.find((s) => s.id === nameOf.id) ?? nameOf} onClose={() => setNameOf(null)} />}
      {textOf && (
        <ChildTextSheet
          student={textOf}
          template={template}
          local={cards[textOf.id]}
          onSave={(override) => {
            const cur = cards[textOf.id] ?? {};
            updateCard(textOf.id, { ...cur, override });
            setTextOf(null);
          }}
          onClose={() => setTextOf(null)}
        />
      )}
      {canceling && (
        <ConfirmDialog
          title="보냄을 취소할까요?"
          body="앱의 개인브리핑 보냄 표시만 지워요. 카톡으로 이미 보낸 메시지는 그대로예요."
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

function PersonalCard({
  r,
  date,
  template,
  local,
  flow,
  onConfirm,
  onEditName,
  onEditText,
  onSend,
  onShare,
  onCancel,
}: {
  r: Recipient;
  date: string;
  template: string | null;
  local: LocalCard | undefined;
  flow: SendFlow;
  onConfirm: (text: string) => void;
  onEditName: () => void;
  onEditText: () => void;
  onSend: (text: string) => void;
  onShare: (text: string) => void;
  onCancel: () => void;
}) {
  const s = r.student;
  const ready = template !== null || local?.override !== undefined;
  const { text, parts } = personalText(template ?? '', s, local);
  const status = cardStatus(text, local, r.personalSent);
  const sentText = r.personalSent?.textSnapshot;

  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
        <span className="text-lg font-semibold">{s.name}</span>
        <span className="text-sm text-stone-500">{studentGradeLabel(s, date)}</span>
        <Badges r={r} />
        {!r.sent && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">전체 아직</span>}
        <button
          type="button"
          onClick={onEditName}
          disabled={status === 'sent'}
          className="ml-auto min-h-11 rounded-xl border border-stone-200 px-3 text-sm text-stone-700 active:bg-stone-50 disabled:opacity-50"
          aria-label="부르는 이름 고치기"
        >
          부르는 이름 <b className="text-emerald-800">{callNameOf(s)}</b> ✎
        </button>
      </div>

      {status === 'sent' ? (
        <p className="whitespace-pre-wrap rounded-xl bg-emerald-50/60 p-3 text-base leading-relaxed text-stone-700">{sentText}</p>
      ) : ready ? (
        <button
          type="button"
          onClick={onEditText}
          className="block w-full whitespace-pre-wrap rounded-xl border border-stone-200 bg-stone-50 p-3 text-left text-base leading-relaxed active:bg-stone-100"
          aria-label="이 아이에게만 문장 고치기"
        >
          {parts.map((p, i) => (p.isName ? <b key={i} className="text-emerald-800">{p.text}</b> : <span key={i}>{p.text}</span>))}
          {local?.override !== undefined && <span className="mt-1 block text-xs font-semibold text-sky-700">이 아이만 고친 문장</span>}
        </button>
      ) : (
        <p className="rounded-xl border border-dashed border-stone-300 p-3 text-sm text-stone-500">개인 문구를 먼저 적어 주세요.</p>
      )}

      <div className="flex items-center justify-end gap-2">
        {status === 'sent' ? (
          <SentMark row={r.personalSent!} onCancel={onCancel} />
        ) : (
          <>
            <Button
              variant={status === 'confirmed' ? 'ghost' : 'primary'}
              className="px-4"
              disabled={!ready || status === 'confirmed'}
              onClick={() => onConfirm(text)}
            >
              {status === 'confirmed' ? '확인됨 ✓' : '확인'}
            </Button>
            {flow.twoStep ? (
              <>
                <Button className="px-3" disabled={status !== 'confirmed'} onClick={() => void flow.copyName(s)}>
                  이름 복사
                </Button>
                <Button variant="primary" className="px-3" disabled={status !== 'confirmed'} onClick={() => onShare(text)}>
                  공유
                </Button>
              </>
            ) : (
              <Button variant="primary" className="flex items-center gap-1 px-4" disabled={status !== 'confirmed'} onClick={() => onSend(text)}>
                <ShareIcon className="h-5 w-5" /> 보내기
              </Button>
            )}
          </>
        )}
      </div>
    </li>
  );
}

function CallNameSheet({ student, onClose }: { student: StudentRow; onClose: () => void }) {
  return (
    <BottomSheet title={`${student.name} 부르는 이름`} onClose={onClose}>
      <div className="space-y-3">
        <CallNameInput student={student} autoFocus onSaved={onClose} />
        <p className="text-sm text-stone-500">학생 정보에 저장돼서 다음에도 쓰여요. 비우면 회색 자동값을 써요. 다 고치면 엔터.</p>
      </div>
    </BottomSheet>
  );
}

function ChildTextSheet({
  student,
  template,
  local,
  onSave,
  onClose,
}: {
  student: StudentRow;
  template: string;
  local: LocalCard | undefined;
  onSave: (override: string | undefined) => void;
  onClose: () => void;
}) {
  const original = personalText(template, student, undefined).text;
  const [text, setText] = useState(local?.override ?? original);
  const save = () => {
    const t = text.replace(/\r\n?/g, '\n').trimEnd();
    onSave(t === original.trimEnd() ? undefined : t);
  };
  return (
    <BottomSheet title={`${student.name}에게만 고치기`} onClose={onClose}>
      <div className="space-y-3">
        <textarea className={`${inputClass} min-h-56 py-2 leading-relaxed`} value={text} onChange={(e) => setText(e.target.value)} />
        <p className="text-sm text-stone-500">이 아이에게 보낼 문장만 바뀌어요(개인 문구는 그대로). 고치면 다시 [확인]을 눌러야 해요.</p>
        <div className="grid grid-cols-2 gap-2">
          <Button disabled={local?.override === undefined && text === original} onClick={() => onSave(undefined)}>
            원래 문장으로
          </Button>
          <Button variant="primary" disabled={!text.trim()} onClick={save}>
            저장
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
