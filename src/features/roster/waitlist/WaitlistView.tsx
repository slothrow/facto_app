// 대기자(SPEC 6장) + 체험수업(7장).
// 주소: #/roster/waitlist(목록), #/roster/waitlist/<id>(상세), #/roster/waitlist/class/<classId>(그 반에 맞는 대기자)
import { useState } from 'react';
import { navigate } from '../../../app/router.ts';
import { todayStr, useRoster } from '../../../app/RosterContext.tsx';
import { ChevronLeft, PlusIcon } from '../../../components/icons.tsx';
import { BottomSheet, Button, Card, ConfirmDialog, Field, inputClass } from '../../../components/ui.tsx';
import { shortTime } from '../../../engine/classTime.ts';
import { gradeLabel, gradeOptions, gradeToStore } from '../../../engine/grade.ts';
import type { Weekday } from '../../../engine/types.ts';
import {
  newId,
  type GuardianRelation,
  type RosterChange,
  type StudentRow,
  type TrialLessonRow,
  type WaitlistRow,
  type WaitlistSource,
  type WaitlistStage,
} from '../../../storage/rosterTypes.ts';
import { CLASS_WEEKDAYS, WEEKDAY_NAMES, classDisplayName, compareClasses } from '../rosterModel.ts';
import { QuickAddSheet } from '../students/QuickAddSheet.tsx';
import { ContactPickButton } from '../students/StudentForm.tsx';
import { RELATION_LABEL, digitsOnly, formatPhone } from '../students/studentModel.ts';
import { TrialForm } from './TrialForm.tsx';
import { OPEN_STAGES, STAGE_LABEL, STAGE_ORDER, classMatchesForWaitlist, waitlistGradeOn, waitlistMatchesForClass } from './waitlistModel.ts';

const SOURCE_LABEL: Record<WaitlistSource, string> = { referral: '지인 소개', blog: '블로그', flyer: '전단', other: '기타' };

export function WaitlistView({ itemId, mode }: { itemId?: string; mode?: string }) {
  if (itemId === 'class' && mode) return <ClassMatches classId={mode} />;
  if (itemId) return <WaitlistDetail id={itemId} />;
  return <WaitlistList />;
}

/** 단계 바꾸기(기록 남김) */
export function withStage(w: WaitlistRow, stage: WaitlistStage, date: string): WaitlistRow {
  if (w.stage === stage) return w;
  return { ...w, stage, stageHistory: [...w.stageHistory, { stage, date }] };
}

function wishText(w: WaitlistRow): string {
  const days = Object.entries(w.wish);
  if (days.length === 0) return '희망 시간 없음';
  return days.map(([wd, t]) => `${WEEKDAY_NAMES[Number(wd)]}${t ? ` ${t}~` : ''}`).join(', ');
}

function WaitlistList() {
  const { roster } = useRoster();
  const today = todayStr();
  const [adding, setAdding] = useState(false);
  const [addingTrial, setAddingTrial] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const open = roster.waitlist.filter((w) => OPEN_STAGES.includes(w.stage));
  const closed = roster.waitlist.filter((w) => !OPEN_STAGES.includes(w.stage));
  const upcomingTrials = roster.trialLessons.filter((t) => t.date >= today).sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button variant="primary" className="flex flex-1 items-center justify-center gap-1" onClick={() => setAdding(true)}>
          <PlusIcon className="h-5 w-5" /> 대기자 추가
        </Button>
        <Button className="flex-1" onClick={() => setAddingTrial(true)}>
          체험수업 기록
        </Button>
      </div>

      {open.length === 0 && <p className="py-6 text-center text-base text-stone-500">진행 중인 대기자가 없어요.</p>}
      {OPEN_STAGES.map((stage) => {
        const list = open.filter((w) => w.stage === stage).sort((a, b) => (a.inquiredOn ?? '').localeCompare(b.inquiredOn ?? ''));
        if (list.length === 0) return null;
        return (
          <section key={stage}>
            <h2 className="mb-2 px-1 text-base font-bold text-stone-700">
              {STAGE_LABEL[stage]} {list.length}
            </h2>
            <ul className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
              {list.map((w) => (
                <li key={w.id} className="border-b border-stone-100 last:border-b-0">
                  <WaitlistRowButton w={w} today={today} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {upcomingTrials.length > 0 && (
        <Card title="다가오는 체험수업">
          <TrialList trials={upcomingTrials} />
        </Card>
      )}

      {closed.length > 0 && (
        <div>
          <Button variant="ghost" className="w-full text-stone-500" onClick={() => setShowClosed((v) => !v)}>
            등록·포기 {closed.length}명 {showClosed ? '숨기기' : '보기'}
          </Button>
          {showClosed && (
            <ul className="overflow-hidden rounded-2xl border border-stone-200 bg-white opacity-70">
              {closed.map((w) => (
                <li key={w.id} className="border-b border-stone-100 last:border-b-0">
                  <WaitlistRowButton w={w} today={today} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {adding && <WaitlistForm onClose={() => setAdding(false)} />}
      {addingTrial && <TrialForm onClose={() => setAddingTrial(false)} />}
    </div>
  );
}

function WaitlistRowButton({ w, today }: { w: WaitlistRow; today: string }) {
  const { roster } = useRoster();
  const matches = OPEN_STAGES.includes(w.stage) ? classMatchesForWaitlist(roster, w, today).length : 0;
  return (
    <button type="button" onClick={() => navigate(`/roster/waitlist/${w.id}`)} className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left active:bg-stone-50">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-base">
          <span className="font-semibold">{w.name}</span>
          <span className="text-stone-500">{gradeLabel(waitlistGradeOn(w, today))}</span>
          {!OPEN_STAGES.includes(w.stage) && <span className="rounded-full bg-stone-200 px-2 text-sm">{STAGE_LABEL[w.stage]}</span>}
        </div>
        <div className="truncate text-sm text-stone-500">
          {wishText(w)}
          {w.inquiredOn && ` · 문의 ${w.inquiredOn}`}
        </div>
      </div>
      {matches > 0 && <span className="shrink-0 rounded-full bg-sky-100 px-2 py-0.5 text-sm text-sky-900">가능한 반 {matches}</span>}
    </button>
  );
}

function ClassMatches({ classId }: { classId: string }) {
  const { roster } = useRoster();
  const today = todayStr();
  const cls = roster.classes.find((c) => c.id === classId);
  if (!cls) return <p className="text-base">반을 찾을 수 없어요.</p>;
  const list = waitlistMatchesForClass(roster, cls, today);
  return (
    <div className="space-y-4">
      <button type="button" onClick={() => navigate(`/roster/class/${classId}`)} className="flex h-11 items-center gap-1 text-base text-stone-600">
        <ChevronLeft className="h-5 w-5" /> {classDisplayName(cls, today)}
      </button>
      <h1 className="text-xl font-bold">이 반에 맞는 대기자 {list.length}명</h1>
      <ul className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
        {list.map((w) => (
          <li key={w.id} className="border-b border-stone-100 last:border-b-0">
            <WaitlistRowButton w={w} today={today} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function WaitlistDetail({ id }: { id: string }) {
  const { roster, mutate } = useRoster();
  const today = todayStr();
  const w = roster.waitlist.find((x) => x.id === id);
  const [editing, setEditing] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [addingTrial, setAddingTrial] = useState(false);
  const [deleting, setDeleting] = useState(false);
  if (!w) {
    return (
      <Card>
        <p className="mb-3 text-base">대기자를 찾을 수 없어요.</p>
        <Button onClick={() => navigate('/roster/waitlist')}>대기자 목록으로</Button>
      </Card>
    );
  }
  const matches = classMatchesForWaitlist(roster, w, today);
  const trials = roster.trialLessons.filter((t) => t.waitlistId === w.id).sort((a, b) => b.date.localeCompare(a.date));
  const linkedStudent = w.studentId ? roster.students.find((s) => s.id === w.studentId) : null;

  const setStage = (stage: WaitlistStage) => mutate({ upsert: { waitlist: [withStage(w, stage, today)] } }, `${STAGE_LABEL[stage]}(으)로 바꿨어요`);

  // 대기자 정보 → 학생 추가 화면 미리 채우기(SPEC 6.4)
  const prefill: Partial<StudentRow> = {
    name: w.name,
    birthday: w.birthday,
    gradeCode: w.gradeCode,
    gradeBasisYear: w.gradeBasisYear,
    guardians: w.guardian?.phone ? [{ name: w.guardian.name, relation: w.guardian.relation, phone: w.guardian.phone, isPrimary: true }] : [],
    availability: w.wish,
    notice: w.memo,
  };
  const extra = (studentId: string): RosterChange => ({
    upsert: {
      waitlist: [{ ...withStage(w, 'enrolled', today), studentId }],
      counselingNotes: [
        {
          id: newId(),
          studentId,
          date: w.inquiredOn ?? today,
          type: 'new',
          content: `대기자에서 등록${w.source ? ` (유입: ${SOURCE_LABEL[w.source]})` : ''}${w.memo ? `\n${w.memo}` : ''}`,
          nextContactOn: null,
        },
      ],
    },
  });

  return (
    <div className="space-y-4">
      <button type="button" onClick={() => navigate('/roster/waitlist')} className="flex h-11 items-center gap-1 text-base text-stone-600">
        <ChevronLeft className="h-5 w-5" /> 대기자 목록
      </button>

      <Card>
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{w.name}</h1>
            <p className="mt-1 text-base text-stone-600">
              {gradeLabel(waitlistGradeOn(w, today))} · {wishText(w)}
            </p>
          </div>
          <Button onClick={() => setEditing(true)}>수정</Button>
        </div>
        {w.guardian?.phone && (
          <a href={`tel:${w.guardian.phone}`} className="mt-3 flex min-h-12 items-center justify-center rounded-xl bg-emerald-700 text-lg font-semibold text-white">
            {w.guardian.name || RELATION_LABEL[w.guardian.relation]} {formatPhone(w.guardian.phone)} 전화
          </a>
        )}
        <dl className="mt-3 grid grid-cols-[5rem_1fr] gap-y-1 text-base">
          {w.inquiredOn && (
            <>
              <dt className="text-stone-500">문의일</dt>
              <dd>{w.inquiredOn}</dd>
            </>
          )}
          {w.source && (
            <>
              <dt className="text-stone-500">유입</dt>
              <dd>{SOURCE_LABEL[w.source]}</dd>
            </>
          )}
        </dl>
        {w.memo && <p className="mt-2 whitespace-pre-wrap rounded-xl bg-stone-50 p-3 text-base">{w.memo}</p>}
      </Card>

      <Card title="진행 단계">
        <div className="grid grid-cols-3 gap-2">
          {STAGE_ORDER.filter((s) => s !== 'enrolled').map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={w.stage === s}
              onClick={() => setStage(s)}
              className={`min-h-11 rounded-xl border text-base font-medium ${w.stage === s ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-stone-300 bg-white'}`}
            >
              {STAGE_LABEL[s]}
            </button>
          ))}
        </div>
        {w.stageHistory.length > 0 && (
          <ol className="mt-3 space-y-1 text-sm text-stone-600">
            {[...w.stageHistory].reverse().map((h, i) => (
              <li key={i}>
                {h.date} {STAGE_LABEL[h.stage]}
              </li>
            ))}
          </ol>
        )}
        {linkedStudent ? (
          <Button className="mt-3 w-full" onClick={() => navigate(`/roster/student/${linkedStudent.id}`)}>
            등록된 학생 카드 보기
          </Button>
        ) : (
          <Button variant="primary" className="mt-3 w-full" onClick={() => setRegistering(true)}>
            등록하기
          </Button>
        )}
      </Card>

      <Card title={`가능한 반 ${matches.length}`}>
        {matches.length === 0 ? (
          <p className="text-base text-stone-500">지금 조건(학년·희망 시간·빈자리)에 맞는 반이 없어요.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {matches.sort(compareClasses).map((c) => (
              <li key={c.id}>
                <button type="button" className="min-h-12 w-full text-left text-base" onClick={() => navigate(`/roster/class/${c.id}`)}>
                  {classDisplayName(c, today)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        title={
          <span className="flex items-center justify-between">
            체험수업 <Button onClick={() => setAddingTrial(true)}>+ 기록</Button>
          </span>
        }
      >
        {trials.length === 0 ? <p className="text-base text-stone-500">체험 기록이 없어요.</p> : <TrialList trials={trials} />}
      </Card>

      <Button variant="ghost" className="w-full text-red-700" onClick={() => setDeleting(true)}>
        대기자 삭제
      </Button>

      {editing && <WaitlistForm initial={w} onClose={() => setEditing(false)} />}
      {addingTrial && <TrialForm presetWaitlistId={w.id} onClose={() => setAddingTrial(false)} />}
      {registering && (
        <QuickAddSheet
          title="대기자 → 학생 등록"
          prefill={prefill}
          presetClassId={matches[0]?.id}
          extraChange={extra}
          onClose={() => setRegistering(false)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="대기자를 삭제할까요?"
          body="대기자 정보와 연결된 체험 기록의 연결이 지워져요. 체험 기록 자체는 남아요."
          confirmLabel="삭제"
          danger
          onCancel={() => setDeleting(false)}
          onConfirm={async () => {
            setDeleting(false);
            const unlinked = roster.trialLessons.filter((t) => t.waitlistId === w.id).map((t) => ({ ...t, waitlistId: null, name: t.name || w.name }));
            if (await mutate({ upsert: { trialLessons: unlinked }, remove: { waitlist: [w] } }, '삭제했어요')) navigate('/roster/waitlist');
          }}
        />
      )}
    </div>
  );
}

export function TrialList({ trials }: { trials: TrialLessonRow[] }) {
  const { roster, mutate } = useRoster();
  const today = todayStr();
  const [removing, setRemoving] = useState<TrialLessonRow | null>(null);
  const [editing, setEditing] = useState<TrialLessonRow | null>(null);
  return (
    <>
      <ul className="divide-y divide-stone-100">
        {trials.map((t) => {
          const c = t.classId ? roster.classes.find((x) => x.id === t.classId) : null;
          const w = t.waitlistId ? roster.waitlist.find((x) => x.id === t.waitlistId) : null;
          return (
            <li key={t.id} className="flex items-center gap-2 py-2">
              <button type="button" onClick={() => setEditing(t)} className="min-h-11 min-w-0 flex-1 text-left text-base active:bg-stone-50">
                <span className="font-semibold">{t.date}{t.startTime && ` ${shortTime(t.startTime)}`}</span> {w ? w.name : t.name}
                <div className="text-sm text-stone-500">
                  {c ? classDisplayName(c, today) : '따로'}
                  {t.memo && ` · ${t.memo}`} · 눌러서 수정
                </div>
              </button>
              <Button variant="ghost" className="px-3 text-stone-400" onClick={() => setRemoving(t)}>
                삭제
              </Button>
            </li>
          );
        })}
      </ul>
      {removing && (
        <ConfirmDialog
          title="체험 기록을 지울까요?"
          body={removing.date}
          confirmLabel="지우기"
          danger
          onCancel={() => setRemoving(null)}
          onConfirm={async () => {
            const r = removing;
            setRemoving(null);
            await mutate({ remove: { trialLessons: [r] } }, '지웠어요');
          }}
        />
      )}
      {editing && <TrialForm initial={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function WaitlistForm({ initial, onClose }: { initial?: WaitlistRow; onClose: () => void }) {
  const { mutate } = useRoster();
  const today = todayStr();
  const [w, setW] = useState<WaitlistRow>(
    initial ?? {
      id: newId(),
      name: '',
      gradeCode: null,
      gradeBasisYear: null,
      birthday: null,
      guardian: { name: '', relation: 'mom', phone: '' },
      wish: {},
      inquiredOn: today,
      source: null,
      stage: 'inquiry',
      stageHistory: [{ stage: 'inquiry', date: today }],
      memo: null,
      studentId: null,
    },
  );
  const [grade, setGrade] = useState<number | ''>(initial ? (waitlistGradeOn(initial, today) ?? '') : '');
  const set = <K extends keyof WaitlistRow>(k: K, v: WaitlistRow[K]) => setW((p) => ({ ...p, [k]: v }));
  const g = w.guardian ?? { name: '', relation: 'mom' as GuardianRelation, phone: '' };

  const save = async () => {
    const next: WaitlistRow = { ...w, name: w.name.trim(), memo: w.memo?.trim() || null };
    if (!next.birthday) {
      if (grade === '') Object.assign(next, { gradeCode: null, gradeBasisYear: null });
      else if (!initial || waitlistGradeOn(initial, today) !== grade) Object.assign(next, gradeToStore(grade, today));
    }
    next.guardian = g.phone || g.name ? { ...g, phone: digitsOnly(g.phone) } : null;
    if (await mutate({ upsert: { waitlist: [next] } }, initial ? '대기자 정보를 고쳤어요' : '대기자를 추가했어요')) {
      onClose();
      if (!initial) navigate(`/roster/waitlist/${next.id}`);
    }
  };

  const toggleDay = (wd: Weekday) => {
    const wish = { ...w.wish };
    if (wd in wish) delete wish[wd];
    else wish[wd] = null;
    set('wish', wish);
  };

  return (
    <BottomSheet title={initial ? '대기자 수정' : '대기자 추가'} onClose={onClose}>
      <div className="space-y-4">
        <Field label="이름 *">
          <input className={inputClass} value={w.name} onChange={(e) => set('name', e.target.value)} autoFocus={!initial} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="학년">
            <select className={inputClass} value={grade} disabled={Boolean(w.birthday)} onChange={(e) => setGrade(e.target.value === '' ? '' : Number(e.target.value))}>
              <option value="">미정</option>
              {gradeOptions().map((o) => (
                <option key={o.code} value={o.code}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="생일 (있으면 학년 자동)">
            <input type="date" className={inputClass} value={w.birthday ?? ''} onChange={(e) => set('birthday', e.target.value || null)} />
          </Field>
        </div>
        <div className="space-y-2 rounded-xl border border-stone-200 p-3">
          <div className="flex items-center gap-2">
            <span className="flex-1 text-sm font-semibold text-stone-600">학부모 연락처</span>
            <ContactPickButton onPick={(c) => set('guardian', { ...g, name: c.name, phone: c.phone })} />
          </div>
          <div className="grid grid-cols-[1fr_6rem] gap-2">
            <input className={inputClass} placeholder="이름" value={g.name} onChange={(e) => set('guardian', { ...g, name: e.target.value })} />
            <select className={inputClass} value={g.relation} onChange={(e) => set('guardian', { ...g, relation: e.target.value as GuardianRelation })}>
              {(Object.keys(RELATION_LABEL) as GuardianRelation[]).map((r) => (
                <option key={r} value={r}>
                  {RELATION_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
          <input
            className={inputClass}
            inputMode="tel"
            placeholder="010-0000-0000"
            value={formatPhone(g.phone)}
            onChange={(e) => set('guardian', { ...g, phone: digitsOnly(e.target.value) })}
          />
        </div>
        <div>
          <span className="mb-1 block text-sm font-medium text-stone-600">희망 요일·시간 (비우면 학년만 비교)</span>
          <div className="space-y-2">
            {CLASS_WEEKDAYS.map((wd) => {
              const on = wd in w.wish;
              return (
                <div key={wd} className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleDay(wd)}
                    className={`h-11 w-11 shrink-0 rounded-full border text-base ${on ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-stone-300 bg-white'}`}
                  >
                    {WEEKDAY_NAMES[wd]}
                  </button>
                  {on && (
                    <>
                      <input
                        type="time"
                        step={600}
                        className={inputClass}
                        value={w.wish[wd] ?? ''}
                        onChange={(e) => set('wish', { ...w.wish, [wd]: e.target.value || null })}
                        aria-label={`${WEEKDAY_NAMES[wd]}요일 몇 시 이후`}
                      />
                      <span className="shrink-0 text-sm text-stone-500">이후</span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="문의일">
            <input type="date" className={inputClass} value={w.inquiredOn ?? ''} onChange={(e) => set('inquiredOn', e.target.value || null)} />
          </Field>
          <Field label="유입 경로">
            <select className={inputClass} value={w.source ?? ''} onChange={(e) => set('source', (e.target.value || null) as WaitlistSource | null)}>
              <option value="">-</option>
              {(Object.keys(SOURCE_LABEL) as WaitlistSource[]).map((s) => (
                <option key={s} value={s}>
                  {SOURCE_LABEL[s]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="메모">
          <textarea className={`${inputClass} min-h-20 py-2`} value={w.memo ?? ''} onChange={(e) => set('memo', e.target.value)} />
        </Field>
        <Button variant="primary" className="w-full" disabled={!w.name.trim()} onClick={save}>
          저장
        </Button>
      </div>
    </BottomSheet>
  );
}

