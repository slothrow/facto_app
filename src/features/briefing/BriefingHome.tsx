// 수업 후 브리핑 화면(SPEC_briefing 5장). 주소: #/briefing/<날짜>/<반 id> (이름은 주소에 넣지 않는다)
// 날짜 → 그날 수업 반(시작 시간 버튼, 진행 3/4) → 오늘 코드·문구 → 아이별 [보내기].
import { format } from 'date-fns';
import { useMemo, useState } from 'react';
import { useAppData } from '../../app/AppDataContext.tsx';
import { navigate } from '../../app/router.ts';
import { todayStr, useRoster } from '../../app/RosterContext.tsx';
import { CheckIcon, ChevronLeft, ChevronRight, PlusIcon, ShareIcon } from '../../components/icons.tsx';
import { BottomSheet, Button, Card, ConfirmDialog, inputClass } from '../../components/ui.tsx';
import { formatTimeKo, shortTime } from '../../engine/classTime.ts';
import { STAGE_NAMES } from '../../engine/curriculum.ts';
import { addDays } from '../../engine/dates.ts';
import type { BriefingRow, ClassRow, RosterData, StudentRow } from '../../storage/rosterTypes.ts';
import type { AppData } from '../../storage/types.ts';
import { classesOnDate } from '../attendance/attendanceModel.ts';
import { courseMonthLabel, curriculumOf } from '../curriculum/curriculumModel.ts';
import { classGradeLabel, studentGradeLabel } from '../roster/rosterModel.ts';
import { matchesName } from '../roster/students/studentModel.ts';
import { cancelSent, classBriefing, defaultClass, kakaoSearchOf, progressCount, recipients, recordSent, type Recipient } from './briefingModel.ts';
import { canShare, copyText, loadTwoStep, saveTwoStep, shareText } from './share.ts';
import { PlanSheet, TextSheet, dateLabel } from './TextsPage.tsx';

const isDate = (s?: string): s is string => Boolean(s && /^\d{4}-\d{2}-\d{2}$/.test(s));
const nowMinutes = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};
const KAKAO_TIP = '카톡에서 검색창을 누르고 키보드의 붙여넣기 추천을 탭하세요';

export function BriefingHome({ dateParam, classParam }: { dateParam?: string; classParam?: string }) {
  const { data } = useAppData();
  const { roster } = useRoster();
  const today = todayStr();
  const date = isDate(dateParam) ? dateParam : today;
  const { noClassReason, classes, cell } = classesOnDate(data, roster, date);
  const settings = curriculumOf(data);
  // 반 버튼의 진행 표시를 위해 이번 화면에서 [+ 아이 추가]한 아이를 반별로 기억
  const [guests, setGuests] = useState<Record<string, string[]>>({});
  const dayClassIds = classes.map((c) => c.id);
  const selected =
    classes.find((c) => c.id === classParam) ?? defaultClass(classes, date === today ? nowMinutes() : null);

  const go = (d: string, classId?: string) => navigate(`/briefing/${d}${classId ? `/${classId}` : ''}`);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="flex-1 text-xl font-bold">수업 후 브리핑</h1>
        <Button onClick={() => navigate('/briefing/texts')}>문구 관리</Button>
      </div>

      <div className="flex items-center gap-1 md:max-w-md">
        <Button variant="ghost" className="px-2" aria-label="전날" onClick={() => go(addDays(date, -1))}>
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <input type="date" className={`${inputClass} text-center font-semibold`} value={date} onChange={(e) => isDate(e.target.value) && go(e.target.value)} />
        <Button variant="ghost" className="px-2" aria-label="다음 날" onClick={() => go(addDays(date, 1))}>
          <ChevronRight className="h-6 w-6" />
        </Button>
        {date !== today && (
          <Button className="shrink-0 px-3" onClick={() => go(today)}>
            오늘
          </Button>
        )}
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
              const p = progressCount(recipients(roster, c.id, date, guests[c.id] ?? [], dayClassIds));
              const done = p.total > 0 && p.sent === p.total;
              const on = selected?.id === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => go(date, c.id)}
                  className={`flex min-h-14 min-w-[4.5rem] flex-col items-center justify-center rounded-2xl border-2 px-3 leading-tight ${
                    on ? 'border-emerald-700 bg-emerald-700 text-white' : done ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-stone-200 bg-white'
                  }`}
                >
                  <span className="text-lg font-bold">{shortTime(c.startTime)}</span>
                  <span className={`text-sm ${on ? 'text-emerald-50' : 'text-stone-500'}`}>
                    {b.code === null ? '진도?' : `${done ? '✓ ' : ''}${p.sent}/${p.total}`}
                  </span>
                </button>
              );
            })}
          </div>

          {selected && (
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
          )}
        </>
      )}
    </div>
  );
}

function ClassPanel({
  data,
  roster,
  cls,
  date,
  guests,
  dayClassIds,
  onAddGuest,
}: {
  data: AppData;
  roster: RosterData;
  cls: ClassRow;
  date: string;
  guests: string[];
  dayClassIds: string[];
  onAddGuest: (studentId: string) => void;
}) {
  const { showToast } = useAppData();
  const { mutate } = useRoster();
  const settings = curriculumOf(data);
  const { cell } = classesOnDate(data, roster, date);
  const b = classBriefing(roster, cls, cell, settings);
  const list = recipients(roster, cls.id, date, guests, dayClassIds);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [twoStep, setTwoStep] = useState(loadTwoStep);
  const [canceling, setCanceling] = useState<BriefingRow | null>(null);
  const [confirmPc, setConfirmPc] = useState<StudentRow | null>(null);
  const session = b.result.kind !== 'noSession' ? b.result : null;

  const record = async (s: StudentRow) => {
    if (!b.code || !b.text) return;
    await mutate(recordSent(roster, date, cls.id, s.id, b.code, b.text, new Date().toISOString()), '보냄으로 기록했어요');
  };

  const share = async (s: StudentRow) => {
    if (!b.text) return;
    if (!canShare()) {
      // PC 등 공유 창이 없는 곳: 문구를 복사하고, 보냈는지 물어본다
      const ok = await copyText(b.text);
      showToast(ok ? '문구를 복사했어요. 카톡에 붙여넣어 보내세요' : '복사하지 못했어요. 문구를 길게 눌러 복사하세요');
      if (ok) setConfirmPc(s);
      return;
    }
    showToast(KAKAO_TIP);
    const outcome = await shareText(b.text);
    if (outcome === 'shared') await record(s);
    else if (outcome === 'blocked') {
      // 복사 뒤 공유가 한 번의 탭으로 안 되는 기기 → 두 버튼으로 바꾼다
      setTwoStep(true);
      saveTwoStep(true);
      showToast('이 폰에서는 한 번에 안 돼요. 이름이 복사됐으니 [공유]를 눌러 주세요');
    }
  };

  const sendOneTap = async (s: StudentRow) => {
    await copyText(kakaoSearchOf(s));
    await share(s);
  };

  const copyName = async (s: StudentRow) => {
    showToast((await copyText(kakaoSearchOf(s))) ? '카톡 검색어를 복사했어요. 이제 [공유]를 누르세요' : '복사하지 못했어요');
  };

  return (
    <div className="space-y-4 md:grid md:grid-cols-2 md:items-start md:gap-6 md:space-y-0">
      <Card>
        <p className="text-base text-stone-600">
          {formatTimeKo(cls.startTime)} {classGradeLabel(cls, date)}
          {session && <> · {courseMonthLabel(session.courseMonth)} {session.weekNo}주</>}
        </p>

        {b.result.kind === 'unset' ? (
          <div className="mt-2 space-y-2 rounded-xl bg-amber-50 p-3 text-amber-900">
            <p className="text-base font-semibold">이 반의 진도를 먼저 설정하세요.</p>
            <Button className="w-full" onClick={() => navigate(`/roster/class/${cls.id}`)}>
              반 진도 설정하러 가기
            </Button>
          </div>
        ) : b.result.kind === 'done' ? (
          <p className="mt-2 rounded-xl bg-stone-100 p-3 text-base">이 반은 과정 완료예요(S12 다음). 반 진도에서 기준점을 확인하세요.</p>
        ) : (
          <>
            <p className="mt-1 text-4xl font-extrabold tracking-tight text-emerald-800">
              {b.result.kind === 'code' ? b.result.code : STAGE_NAMES.basic}
            </p>
            {b.result.kind === 'basic' && <p className="text-lg font-semibold">{b.plan?.title || '(제목 없음)'}</p>}
            {b.text ? (
              <>
                <p className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl bg-stone-50 p-3 text-base leading-relaxed">{b.text}</p>
                <Button variant="ghost" className="mt-1 w-full" onClick={() => setEditing(true)}>
                  문구 수정
                </Button>
              </>
            ) : (
              <div className="mt-3 space-y-2 rounded-xl border border-dashed border-stone-300 p-3">
                <p className="text-base text-stone-600">{b.result.kind === 'basic' ? '이 날짜의 베이직 수업 내용이 아직 없어요.' : '이 코드의 문구가 아직 없어요.'}</p>
                <Button variant="primary" className="w-full" onClick={() => setEditing(true)}>
                  지금 작성
                </Button>
              </div>
            )}
          </>
        )}
      </Card>

      <Card title={`아이 ${list.filter((r) => !r.absent).length}명`}>
        <ul className="divide-y divide-stone-100">
          {list.map((r) => (
            <RecipientRow
              key={r.student.id}
              r={r}
              date={date}
              canSend={Boolean(b.text && b.code)}
              twoStep={twoStep}
              onSend={() => void sendOneTap(r.student)}
              onCopyName={() => void copyName(r.student)}
              onShare={() => void share(r.student)}
              onCancel={() => r.sent && setCanceling(r.sent)}
            />
          ))}
        </ul>
        <Button className="mt-2 flex w-full items-center justify-center gap-1" onClick={() => setAdding(true)}>
          <PlusIcon className="h-5 w-5" /> 아이 추가 (보강 등)
        </Button>
        {canShare() && (
          <button
            type="button"
            className="mt-2 min-h-11 w-full text-sm text-stone-500 underline"
            onClick={() => {
              setTwoStep(!twoStep);
              saveTwoStep(!twoStep);
            }}
          >
            {twoStep ? '한 번에 보내기 버튼으로 돌아가기' : '[보내기]가 잘 안 되면: 이름 복사·공유 두 버튼으로 나누기'}
          </button>
        )}
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
      {confirmPc && (
        <ConfirmDialog
          title="보냄으로 기록할까요?"
          body="문구를 복사했어요. 카톡에 붙여넣어 보낸 뒤 [기록]을 눌러 주세요."
          confirmLabel="기록"
          onCancel={() => setConfirmPc(null)}
          onConfirm={async () => {
            const s = confirmPc;
            setConfirmPc(null);
            await record(s);
          }}
        />
      )}
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
        {r.sibling && <span className="ml-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800">형제</span>}
        {r.guest && <span className="ml-1 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">추가</span>}
      </span>
      {r.absent ? (
        <span className="shrink-0 text-base">결석</span>
      ) : r.sent ? (
        <button type="button" onClick={onCancel} className="flex h-11 shrink-0 items-center gap-1 rounded-xl px-2 text-base font-semibold text-emerald-700 active:bg-emerald-50">
          <CheckIcon className="h-5 w-5" /> {format(new Date(r.sent.sharedAt), 'H:mm')}
        </button>
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

function GuestSheet({
  roster,
  exclude,
  date,
  onPick,
  onClose,
}: {
  roster: RosterData;
  exclude: Set<string>;
  date: string;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const found = useMemo(
    () =>
      q.trim()
        ? roster.students.filter((s) => s.status !== 'left' && !exclude.has(s.id) && matchesName(s.name, q)).slice(0, 12)
        : [],
    [roster.students, exclude, q],
  );
  return (
    <BottomSheet title="아이 추가" onClose={onClose}>
      <div className="space-y-2">
        <p className="text-sm text-stone-600">다른 반 아이가 보강으로 왔을 때 이 반 목록에 오늘만 넣어요.</p>
        <input className={inputClass} autoFocus placeholder="이름 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        {found.map((s) => (
          <Button key={s.id} className="w-full text-left" onClick={() => onPick(s.id)}>
            {s.name} <span className="text-sm text-stone-500">{studentGradeLabel(s, date)}</span>
          </Button>
        ))}
        {q.trim() && found.length === 0 && <p className="text-base text-stone-500">찾는 아이가 없어요.</p>}
      </div>
    </BottomSheet>
  );
}
