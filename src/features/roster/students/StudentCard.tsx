// 학생 카드(SPEC 4.3): 이름·학년·현재 반·상태·특이사항, 대표 연락처 [전화][문자], 기본 정보, 반 이력, 상담 기록, 결석 기록.
import { useState, type ReactNode } from 'react';
import { navigate } from '../../../app/router.ts';
import { todayStr, useRoster } from '../../../app/RosterContext.tsx';
import { ChevronLeft, MessageIcon, PhoneIcon } from '../../../components/icons.tsx';
import { Button, Card, ConfirmDialog, Field, inputClass } from '../../../components/ui.tsx';
import { newId, type CounselingNoteRow, type CounselingType, type StudentRow } from '../../../storage/rosterTypes.ts';
import { WEEKDAY_NAMES, classDisplayName, currentEnrollment, studentGradeLabel, studentStatusOn } from '../rosterModel.ts';
import { EnrollSheet } from './EnrollSheet.tsx';
import { StudentForm } from './StudentForm.tsx';
import { LearnedSection } from '../../briefing/LearnedSections.tsx';
import {
  COUNSELING_LABEL,
  RELATION_LABEL,
  STATUS_LABEL,
  formatPhone,
  planDeleteStudent,
  planUnenroll,
  primaryContact,
  siblingsOf,
} from './studentModel.ts';

export function StudentCard({ studentId, mode }: { studentId: string; mode?: string }) {
  const { roster, mutate } = useRoster();
  const today = todayStr();
  const s = roster.students.find((x) => x.id === studentId);
  const [editing, setEditing] = useState(mode === 'edit');
  const [enrolling, setEnrolling] = useState(false);
  const [unenrolling, setUnenrolling] = useState(false);

  if (!s) {
    return (
      <Card>
        <p className="mb-3 text-base">학생을 찾을 수 없어요.</p>
        <Button onClick={() => navigate('/roster/students')}>학생 목록으로</Button>
      </Card>
    );
  }

  const status = studentStatusOn(s, today);
  const cur = currentEnrollment(roster.enrollments, s.id, today);
  const curClass = cur ? roster.classes.find((c) => c.id === cur.classId) : null;
  const contact = primaryContact(s);

  return (
    <div className="space-y-4">
      <button type="button" onClick={() => navigate('/roster/students')} className="flex h-12 shrink-0 items-center gap-1 rounded-xl border border-stone-300 bg-white pr-4 pl-2 text-lg font-semibold text-stone-800 shadow-sm active:bg-stone-100">
        <ChevronLeft className="h-7 w-7" /> 학생 목록
      </button>

      <Card>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold">{s.name}</h1>
            <p className="mt-1 text-base text-stone-600">
              {studentGradeLabel(s, today)} · {curClass ? classDisplayName(curClass, today) : '반 미배정'}
              {cur && cur.startDate > today && <span className="text-sm"> ({cur.startDate}부터)</span>}
            </p>
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${status === 'active' ? 'bg-emerald-100 text-emerald-900' : 'bg-stone-200 text-stone-700'}`}>
            {STATUS_LABEL[status]}
          </span>
        </div>
        {s.needsReview && (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 p-3">
            <span className="flex-1 text-base font-semibold text-amber-900">확인 필요</span>
            <Button onClick={() => mutate({ upsert: { students: [{ ...s, needsReview: false }] } }, '확인 필요 표시를 지웠어요')}>확인 완료</Button>
          </div>
        )}
        {s.notice && <p className="mt-3 whitespace-pre-wrap rounded-xl bg-yellow-50 p-3 text-base text-stone-800">📌 {s.notice}</p>}

        {contact ? (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <a href={`tel:${contact.phone}`} className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-emerald-700 text-lg font-semibold text-white active:bg-emerald-800">
              <PhoneIcon className="h-6 w-6" /> 전화
            </a>
            <a href={`sms:${contact.phone}`} className="flex min-h-14 items-center justify-center gap-2 rounded-xl border border-emerald-700 bg-white text-lg font-semibold text-emerald-800">
              <MessageIcon className="h-6 w-6" /> 문자
            </a>
            <p className="col-span-2 text-center text-sm text-stone-500">
              {contact.label} {formatPhone(contact.phone)}
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-stone-500">연락처가 없어요. [정보 수정]에서 넣어 주세요.</p>
        )}
      </Card>

      <BasicInfo s={s} onEdit={() => setEditing(true)} />

      <Card title="반 이력">
        <div className="mb-3 flex gap-2">
          <Button variant="primary" className="flex-1" onClick={() => setEnrolling(true)}>
            {cur ? '반 이동' : '반 배정'}
          </Button>
          {cur && (
            <Button className="flex-1" onClick={() => setUnenrolling(true)}>
              반에서 빼기
            </Button>
          )}
        </div>
        <ClassHistory studentId={s.id} />
      </Card>

      <Counseling student={s} />
      <LearnedSection studentId={s.id} />
      <AbsenceSummary studentId={s.id} />
      <DeleteStudent student={s} />

      {editing && (
        <StudentForm
          student={s}
          onClose={() => {
            setEditing(false);
            if (mode === 'edit') navigate(`/roster/student/${s.id}`);
          }}
        />
      )}
      {enrolling && <EnrollSheet studentId={s.id} onClose={() => setEnrolling(false)} />}
      {unenrolling && cur && <UnenrollDialog studentId={s.id} classId={cur.classId} onClose={() => setUnenrolling(false)} />}
    </div>
  );
}

export function UnenrollDialog({ studentId, classId, onClose }: { studentId: string; classId: string; onClose: () => void }) {
  const { roster, mutate } = useRoster();
  const today = todayStr();
  const [date, setDate] = useState(today);
  const cls = roster.classes.find((c) => c.id === classId);
  return (
    <ConfirmDialog
      title="반에서 뺄까요?"
      body={
        <div className="space-y-3">
          <p>{cls ? classDisplayName(cls, today) : ''}에서 빼요. 지난 기록은 남아요.</p>
          <Field label="이 날부터 반 없음">
            <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value || today)} />
          </Field>
        </div>
      }
      confirmLabel="빼기"
      onCancel={onClose}
      onConfirm={async () => {
        onClose();
        await mutate(planUnenroll(roster, studentId, classId, date), '반에서 뺐어요');
      }}
    />
  );
}

function BasicInfo({ s, onEdit }: { s: StudentRow; onEdit: () => void }) {
  const { roster } = useRoster();
  const today = todayStr();
  const sibs = siblingsOf(roster, s.id)
    .map((id) => roster.students.find((x) => x.id === id))
    .filter((x): x is StudentRow => Boolean(x));
  const avail = Object.entries(s.availability)
    .map(([wd, t]) => `${WEEKDAY_NAMES[Number(wd)]}${t ? ` ${t} 이후` : ''}`)
    .join(', ');
  const rows: [string, ReactNode][] = [
    ['성별', s.gender === 'M' ? '남' : s.gender === 'F' ? '여' : null],
    ['생일', s.birthday],
    ['학년', s.gradeAdjust ? `${studentGradeLabel(s, today)} (보정 ${s.gradeAdjust > 0 ? '+1' : '-1'})` : null],
    ['학교', s.school],
    ['카톡 검색어', s.kakaoSearch || <span className="text-stone-400">{s.name} (이름)</span>],
    ...s.guardians.map(
      (g, i) =>
        [
          `학부모 ${i + 1}`,
          <a key={i} href={`tel:${g.phone}`} className="text-emerald-800 underline">
            {g.name ? `${g.name}(${RELATION_LABEL[g.relation]})` : RELATION_LABEL[g.relation]} {formatPhone(g.phone)}
            {g.isPrimary ? ' · 대표' : ''}
          </a>,
        ] as [string, ReactNode],
    ),
    ['학생 연락처', s.studentPhone ? <a href={`tel:${s.studentPhone}`} className="text-emerald-800 underline">{formatPhone(s.studentPhone)}</a> : null],
    ['주소', s.address],
    ['등록일', s.registeredOn],
    ['첫 수업일', s.firstClassOn],
    ['휴원', s.status === 'paused' ? `${s.statusFrom ?? ''} ~ ${s.statusTo ?? ''}` : null],
    ['퇴원', s.status === 'left' ? `${s.statusFrom ?? ''} ${s.leaveReason ?? ''}` : null],
    ['가능 시간', avail || null],
    [
      '형제자매',
      sibs.length
        ? sibs.map((x) => (
            <button key={x.id} type="button" className="mr-2 text-emerald-800 underline" onClick={() => navigate(`/roster/student/${x.id}`)}>
              {x.name}
            </button>
          ))
        : null,
    ],
  ];
  return (
    <Card
      title={
        <span className="flex items-center justify-between">
          기본 정보 <Button onClick={onEdit}>정보 수정</Button>
        </span>
      }
    >
      <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-2 text-base">
        {rows
          .filter(([, v]) => v !== null && v !== '' && v !== undefined)
          .map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-stone-500">{k}</dt>
              <dd className="min-w-0 break-words">{v}</dd>
            </div>
          ))}
      </dl>
      {!s.birthday && s.gradeCode === null && <p className="mt-2 text-sm text-stone-500">학년이 비어 있어요.</p>}
    </Card>
  );
}

function ClassHistory({ studentId }: { studentId: string }) {
  const { roster } = useRoster();
  const today = todayStr();
  const list = roster.enrollments.filter((e) => e.studentId === studentId).sort((a, b) => b.startDate.localeCompare(a.startDate));
  if (list.length === 0) return <p className="text-base text-stone-500">아직 배정 기록이 없어요.</p>;
  return (
    <ul className="divide-y divide-stone-100">
      {list.map((e) => {
        const c = roster.classes.find((x) => x.id === e.classId);
        return (
          <li key={e.id} className="py-2">
            <button type="button" className="text-left text-base font-medium text-stone-900" onClick={() => c && navigate(`/roster/class/${c.id}`)}>
              {c ? classDisplayName(c, today) : '(삭제된 반)'}
            </button>
            <div className="text-sm text-stone-500">
              {e.startDate} ~ {e.endDate ?? '현재'}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Counseling({ student }: { student: StudentRow }) {
  const { roster, mutate } = useRoster();
  const today = todayStr();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [type, setType] = useState<CounselingType>('regular');
  const [content, setContent] = useState('');
  const [next, setNext] = useState('');
  const [removing, setRemoving] = useState<CounselingNoteRow | null>(null);
  const notes = roster.counselingNotes
    .filter((n) => n.studentId === student.id)
    .sort((a, b) => b.date.localeCompare(a.date));

  const add = async () => {
    const note: CounselingNoteRow = { id: newId(), studentId: student.id, date, type, content: content.trim(), nextContactOn: next || null };
    if (await mutate({ upsert: { counselingNotes: [note] } }, '상담 기록을 남겼어요')) {
      setContent('');
      setNext('');
      setOpen(false);
    }
  };

  return (
    <Card
      title={
        <span className="flex items-center justify-between">
          상담 기록 {notes.length > 0 && `${notes.length}건`}
          {!open && <Button onClick={() => setOpen(true)}>+ 기록</Button>}
        </span>
      }
    >
      {open && (
        <div className="mb-4 space-y-3 rounded-xl bg-stone-50 p-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="날짜">
              <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value || today)} />
            </Field>
            <Field label="유형">
              <select className={inputClass} value={type} onChange={(e) => setType(e.target.value as CounselingType)}>
                {(Object.keys(COUNSELING_LABEL) as CounselingType[]).map((t) => (
                  <option key={t} value={t}>
                    {COUNSELING_LABEL[t]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="내용">
            <textarea className={`${inputClass} min-h-24 py-2`} value={content} onChange={(e) => setContent(e.target.value)} />
          </Field>
          <Field label="다음 연락일 (선택)">
            <input type="date" className={inputClass} value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button variant="primary" className="flex-1" disabled={!content.trim()} onClick={add}>
              저장
            </Button>
          </div>
        </div>
      )}
      {notes.length === 0 ? (
        <p className="text-base text-stone-500">상담 기록이 없어요.</p>
      ) : (
        <ul className="space-y-3">
          {notes.map((n) => (
            <li key={n.id} className="rounded-xl border border-stone-200 p-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-semibold text-stone-800">{n.date}</span>
                <span className="rounded-full bg-stone-100 px-2 text-stone-700">{COUNSELING_LABEL[n.type]}</span>
                <button type="button" className="ml-auto min-h-11 px-2 text-stone-400" onClick={() => setRemoving(n)} aria-label="기록 삭제">
                  삭제
                </button>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-base">{n.content}</p>
              {n.nextContactOn && <p className="mt-1 text-sm text-sky-800">다음 연락: {n.nextContactOn}</p>}
            </li>
          ))}
        </ul>
      )}
      {removing && (
        <ConfirmDialog
          title="상담 기록을 지울까요?"
          body={`${removing.date} ${COUNSELING_LABEL[removing.type]}`}
          confirmLabel="지우기"
          danger
          onCancel={() => setRemoving(null)}
          onConfirm={async () => {
            const r = removing;
            setRemoving(null);
            await mutate({ remove: { counselingNotes: [r] } }, '지웠어요');
          }}
        />
      )}
    </Card>
  );
}

function AbsenceSummary({ studentId }: { studentId: string }) {
  const { roster } = useRoster();
  const list = roster.absences.filter((a) => a.studentId === studentId).sort((a, b) => b.date.localeCompare(a.date));
  const byMonth = new Map<string, string[]>();
  for (const a of list) byMonth.set(a.date.slice(0, 7), [...(byMonth.get(a.date.slice(0, 7)) ?? []), a.date]);
  return (
    <Card title={`결석 기록${list.length ? ` ${list.length}회` : ''}`}>
      {list.length === 0 ? (
        <p className="text-base text-stone-500">결석 기록이 없어요.</p>
      ) : (
        <ul className="space-y-2">
          {[...byMonth].map(([ym, dates]) => (
            <li key={ym} className="text-base">
              <span className="font-semibold">
                {Number(ym.slice(0, 4))}년 {Number(ym.slice(5))}월 {dates.length}회
              </span>
              <span className="ml-2 text-stone-600">{dates.map((d) => `${Number(d.slice(8))}일`).join(', ')}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function DeleteStudent({ student }: { student: StudentRow }) {
  const { roster, mutate } = useRoster();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [typed, setTyped] = useState('');
  return (
    <div className="pt-4">
      <Button variant="ghost" className="w-full text-red-700" onClick={() => setStep(1)}>
        개인정보 완전 삭제
      </Button>
      <p className="mt-1 text-center text-sm text-stone-500">그만둔 학생은 보통 [정보 수정]에서 퇴원으로 바꿔요(기록 보존).</p>
      {step === 1 && (
        <ConfirmDialog
          title="완전히 삭제할까요?"
          body="이 학생의 정보와 반 이력, 상담 기록, 결석 기록이 모두 지워지고 되돌릴 수 없어요."
          confirmLabel="다음"
          danger
          onCancel={() => setStep(0)}
          onConfirm={() => setStep(2)}
        />
      )}
      {step === 2 && (
        <ConfirmDialog
          title="이름을 다시 입력하세요"
          body={
            <div className="space-y-2">
              <p>
                삭제하려면 <b>{student.name}</b>을(를) 똑같이 입력하세요.
              </p>
              <input className={inputClass} value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
            </div>
          }
          confirmLabel="완전 삭제"
          danger
          onCancel={() => {
            setStep(0);
            setTyped('');
          }}
          onConfirm={async () => {
            if (typed.trim() !== student.name.trim()) return;
            setStep(0);
            if (await mutate(planDeleteStudent(roster, student.id), '삭제했어요')) navigate('/roster/students');
          }}
        />
      )}
    </div>
  );
}
