// 설정 탭. SPEC 8.3.
import { format } from 'date-fns';
import { useRef, useState } from 'react';
import { useAppData } from '../../app/AppDataContext.tsx';
import {
  addCustomHoliday,
  deleteClosure,
  deleteCustomHoliday,
  setHolidayIgnored,
  setTrackAnchor,
  updateSettings,
  upsertClosure,
} from '../../app/mutations.ts';
import { ClosureForm } from '../../components/ClosureForm.tsx';
import { BottomSheet, Button, Card, ConfirmDialog, Field, WeekdayPicker, inputClass } from '../../components/ui.tsx';
import { builtInHolidays } from '../../data/holidays/index.ts';
import { createSeedAppData } from '../../data/seedAppData.ts';
import { weekdayOf } from '../../engine/dates.ts';
import { WEEKDAY_NAMES } from '../../engine/label.ts';
import type { WeekNo, Weekday } from '../../engine/types.ts';
import { parseBackup, parseFullBackup, toFullBackupJson, type FullBackup } from '../../storage/backup.ts';
import { useRoster } from '../../app/RosterContext.tsx';
import { STORAGE_KEY } from '../../storage/localStorageRepository.ts';
import type { AppData, ClosureRow, TrackAnchorRow } from '../../storage/types.ts';
import { useAuth } from '../auth/AuthGate.tsx';
import { CurriculumSettingsSection } from '../curriculum/CurriculumSettingsSection.tsx';
import { HoursSection } from './HoursSection.tsx';
import { TaskRulesSection } from './TaskRulesSection.tsx';

/** 예전 백업에 없으면 지금 데이터를 남기는 항목 */
const KEEP_IF_MISSING = ['briefingTexts', 'tasks', 'taskStates'] as const;

const md = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
const withDay = (date: string) => `${date.slice(0, 4)}.${md(date)} (${WEEKDAY_NAMES[weekdayOf(date)]})`;

export function SettingsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">설정</h1>
      {/* PC: 카드들을 2단으로(위에서부터 채움) */}
      <div className="space-y-4 md:columns-2 md:gap-4 md:space-y-0 md:*:mb-4 md:*:break-inside-avoid">
      <AcademySection />
      <OperatingDaysSection />
      <HoursSection />
      <AnchorsSection />
      <HolidaysSection />
      <ClosuresSection />
      <NoticeSection />
      <ThresholdSection />
      <CurriculumSettingsSection />
      <TaskRulesSection />
      <DataSection />
      <AccountSection />
      </div>
    </div>
  );
}

function AcademySection() {
  const { data, commit } = useAppData();
  const [name, setName] = useState(data.settings.academyName);
  const [slogan, setSlogan] = useState(data.settings.slogan);
  const dirty = name !== data.settings.academyName || slogan !== data.settings.slogan;
  return (
    <Card title="공부방 정보">
      <div className="space-y-3">
        <Field label="공부방 이름">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="하단 슬로건">
          <input className={inputClass} value={slogan} onChange={(e) => setSlogan(e.target.value)} />
        </Field>
        <Button
          variant="primary"
          className="w-full"
          disabled={!dirty}
          onClick={() => commit(updateSettings(data, { academyName: name.trim(), slogan: slogan.trim() }))}
        >
          저장
        </Button>
      </div>
    </Card>
  );
}

function OperatingDaysSection() {
  const { data, commit } = useAppData();
  return (
    <Card title="운영 요일">
      <WeekdayPicker
        value={data.settings.operatingWeekdays}
        options={[1, 2, 3, 4, 5]}
        onChange={(v) => commit(updateSettings(data, { operatingWeekdays: v as Weekday[] }))}
      />
      <p className="mt-2 text-sm text-stone-500">끈 요일은 수업 날짜를 만들지 않습니다.</p>
    </Card>
  );
}

function AnchorsSection() {
  const { data } = useAppData();
  return (
    <Card title="요일반 시작점">
      <p className="mb-3 text-sm text-stone-500">
        요일마다 첫 수업 날짜와 그날의 진도(○월 진도 ○주)입니다. 여기서부터 수업을 이어서 계산합니다.
      </p>
      <div className="space-y-3">
        {data.trackAnchors.map((a) => (
          <AnchorRow key={a.weekday} anchor={a} />
        ))}
      </div>
    </Card>
  );
}

function AnchorRow({ anchor }: { anchor: TrackAnchorRow }) {
  const { data, commit } = useAppData();
  const [date, setDate] = useState(anchor.startDate);
  const [courseMonth, setCourseMonth] = useState(anchor.courseMonth);
  const [weekNo, setWeekNo] = useState<WeekNo>(anchor.weekNo);
  const [error, setError] = useState<string | null>(null);
  const dirty = date !== anchor.startDate || courseMonth !== anchor.courseMonth || weekNo !== anchor.weekNo;
  const name = WEEKDAY_NAMES[anchor.weekday];

  const save = () => {
    if (!date || !courseMonth) return setError('날짜와 진도 월을 모두 골라 주세요.');
    if (weekdayOf(date) !== anchor.weekday) return setError(`${date}은(는) ${name}요일이 아닙니다.`);
    setError(null);
    commit(setTrackAnchor(data, { weekday: anchor.weekday, startDate: date, courseMonth, weekNo }));
  };

  return (
    <div className="rounded-xl border border-stone-200 p-3">
      <p className="mb-2 font-bold">{name}요일</p>
      <input
        type="date"
        aria-label={`${name}요일 시작 날짜`}
        className={`${inputClass} mb-2`}
        value={date}
        onChange={(e) => setDate(e.target.value)}
      />
      <div className="grid grid-cols-[1fr_6rem] gap-2">
        <input type="month" aria-label={`${name}요일 진도 월`} className={inputClass} value={courseMonth} onChange={(e) => setCourseMonth(e.target.value)} />
        <select
          aria-label={`${name}요일 주`}
          className={inputClass}
          value={weekNo}
          onChange={(e) => setWeekNo(Number(e.target.value) as WeekNo)}
        >
          {[1, 2, 3, 4].map((w) => (
            <option key={w} value={w}>
              {w}주
            </option>
          ))}
        </select>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {dirty && (
        <Button variant="primary" className="mt-2 w-full" onClick={save}>
          {name}요일 시작점 저장
        </Button>
      )}
    </div>
  );
}

function HolidaysSection() {
  const { data, commit } = useAppData();
  const years = [...new Set(builtInHolidays.map((h) => h.date.slice(0, 4)))];
  const thisYear = format(new Date(), 'yyyy');
  const [year, setYear] = useState(years.includes(thisYear) ? thisYear : years[0]);
  const [newDate, setNewDate] = useState('');
  const [newName, setNewName] = useState('');

  const ignored = new Set(data.customHolidays.filter((h) => h.type === 'ignore').map((h) => h.date));
  const added = data.customHolidays.filter((h) => h.type === 'add');

  const add = async () => {
    if (!newDate || !newName.trim()) return;
    if (await commit(addCustomHoliday(data, newDate, newName.trim()), '공휴일을 추가했어요')) {
      setNewDate('');
      setNewName('');
    }
  };

  return (
    <Card title="공휴일">
      <div className="mb-3 flex gap-2">
        {years.map((y) => (
          <Button key={y} variant={y === year ? 'primary' : 'secondary'} onClick={() => setYear(y)}>
            {y}년
          </Button>
        ))}
      </div>
      <p className="mb-2 text-sm text-stone-500">"무시"를 켜면 그 공휴일에도 수업합니다.</p>
      <ul className="mb-4 divide-y divide-stone-100">
        {builtInHolidays
          .filter((h) => h.date.startsWith(year))
          .map((h) => (
            <li key={h.date} className="flex min-h-11 items-center justify-between gap-2 py-1">
              <span className="min-w-0">
                <span className="text-stone-500">{withDay(h.date)}</span>{' '}
                <span className={ignored.has(h.date) ? 'text-stone-400 line-through' : 'text-red-700'}>{h.name}</span>
              </span>
              <label className="flex shrink-0 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={ignored.has(h.date)}
                  onChange={(e) => commit(setHolidayIgnored(data, h.date, h.name, e.target.checked))}
                />
                무시
              </label>
            </li>
          ))}
      </ul>

      <p className="mb-2 font-bold">임시공휴일 추가</p>
      {added.length > 0 && (
        <ul className="mb-3 divide-y divide-stone-100">
          {added.map((h) => (
            <li key={h.date} className="flex min-h-11 items-center justify-between gap-2">
              <span>
                <span className="text-stone-500">{withDay(h.date)}</span> <span className="text-red-700">{h.name}</span>
              </span>
              <Button variant="ghost" className="text-red-600" onClick={() => commit(deleteCustomHoliday(data, h.date), '지웠어요')}>
                삭제
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-2 gap-2">
        <input type="date" aria-label="임시공휴일 날짜" className={inputClass} value={newDate} onChange={(e) => setNewDate(e.target.value)} />
        <input className={inputClass} placeholder="이름" value={newName} onChange={(e) => setNewName(e.target.value)} />
      </div>
      <Button className="mt-2 w-full" disabled={!newDate || !newName.trim()} onClick={add}>
        추가
      </Button>
    </Card>
  );
}

function ClosuresSection() {
  const { data, commit } = useAppData();
  const [editing, setEditing] = useState<Partial<ClosureRow> | null>(null);
  const [deleting, setDeleting] = useState<ClosureRow | null>(null);
  const sorted = [...data.closures].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const weekdayText = (c: ClosureRow) =>
    c.weekdays && c.weekdays.length ? ` · ${c.weekdays.map((w) => WEEKDAY_NAMES[w]).join('·')}만` : '';

  return (
    <Card title="휴원일·행사일">
      {sorted.length === 0 && <p className="mb-3 text-stone-500">등록된 항목이 없습니다.</p>}
      <ul className="mb-3 space-y-2">
        {sorted.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-2 rounded-xl border border-stone-200 p-3">
            <span className="min-w-0">
              <span
                className={`mr-1.5 rounded-md px-1.5 py-0.5 text-xs font-medium ${
                  c.kind === 'closed' ? 'bg-stone-200 text-stone-700' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {c.kind === 'closed' ? '휴원' : '행사'}
              </span>
              <span className="font-medium">{c.label}</span>
              <span className="block text-sm text-stone-500">
                {withDay(c.startDate)}
                {c.endDate !== c.startDate && ` ~ ${withDay(c.endDate)}`}
                {weekdayText(c)}
              </span>
            </span>
            <span className="flex shrink-0 gap-1">
              <Button variant="ghost" onClick={() => setEditing(c)}>
                수정
              </Button>
              <Button variant="ghost" className="text-red-600" onClick={() => setDeleting(c)}>
                삭제
              </Button>
            </span>
          </li>
        ))}
      </ul>
      <Button className="w-full" onClick={() => setEditing({})}>
        추가
      </Button>

      {editing && (
        <BottomSheet title={editing.id ? '수정' : '휴원일·행사일 추가'} onClose={() => setEditing(null)}>
          <ClosureForm
            initial={editing}
            submitLabel="저장"
            onCancel={() => setEditing(null)}
            onSubmit={async (row) => {
              if (await commit(upsertClosure(data, row))) setEditing(null);
            }}
          />
        </BottomSheet>
      )}
      {deleting && (
        <ConfirmDialog
          title="삭제할까요?"
          body={`"${deleting.label}"을(를) 지웁니다. 휴원일이면 이후 수업 날짜가 다시 계산됩니다.`}
          confirmLabel="삭제"
          danger
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            await commit(deleteClosure(data, deleting.id), '지웠어요');
            setDeleting(null);
          }}
        />
      )}
    </Card>
  );
}

function NoticeSection() {
  const { data, commit } = useAppData();
  const [text, setText] = useState(data.settings.noticeTemplate);
  return (
    <Card title="기본 안내 문구">
      <textarea
        className={`${inputClass} min-h-48 py-2 leading-relaxed`}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <Button
        variant="primary"
        className="mt-2 w-full"
        disabled={text === data.settings.noticeTemplate}
        onClick={() => commit(updateSettings(data, { noticeTemplate: text }))}
      >
        저장
      </Button>
    </Card>
  );
}

function ThresholdSection() {
  const { data, commit } = useAppData();
  const [value, setValue] = useState(String(data.settings.offsetWarningThreshold));
  const n = Number(value);
  const valid = Number.isInteger(n) && n >= 1 && n <= 8;
  return (
    <Card title="경고 기준">
      <Field label="앞섬/밀림이 몇 회 이상이면 경고할까요?">
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={8}
          className={inputClass}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </Field>
      {!valid && <p className="mt-1 text-sm text-red-600">1~8 사이 숫자를 넣어 주세요.</p>}
      <Button
        variant="primary"
        className="mt-2 w-full"
        disabled={!valid || n === data.settings.offsetWarningThreshold}
        onClick={() => commit(updateSettings(data, { offsetWarningThreshold: n }))}
      >
        저장
      </Button>
    </Card>
  );
}

function DataSection() {
  const { data, replaceAll, showToast, commit } = useAppData();
  const fileRef = useRef<HTMLInputElement>(null);
  const { roster, replaceRoster } = useRoster();
  const [pendingRestore, setPendingRestore] = useState<FullBackup | null>(null);
  const [seedOpen, setSeedOpen] = useState(false);
  const auth = useAuth();
  // 3단계까지 이 기기(localStorage)에 저장했던 데이터. 온라인으로 옮길 때 쓴다.
  const [localBackup] = useState(readLocalBackup);

  const exportJson = () => {
    const blob = new Blob([toFullBackupJson(data, roster)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `facto-backup-${format(new Date(), 'yyyyMMdd-HHmm')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    // 홈의 "백업 내보내기" 할 일이 이번 달엔 사라지게 마지막 백업 시각을 남긴다
    void commit(updateSettings(data, { lastBackupAt: new Date().toISOString() }), '백업 파일을 저장했어요');
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      setPendingRestore(parseFullBackup(await file.text()));
    } catch (e) {
      showToast(`복원할 수 없어요: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <Card title="데이터">
      <div className="space-y-2">
        <Button className="w-full" onClick={exportJson}>
          백업 파일 내보내기 (JSON)
        </Button>
        <Button className="w-full" onClick={() => fileRef.current?.click()}>
          백업 파일로 복원하기
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        <Button variant="danger" className="w-full" onClick={() => setSeedOpen(true)}>
          초기 데이터 불러오기
        </Button>
        {auth && localBackup && (
          <Button className="w-full" onClick={() => setPendingRestore({ app: localBackup, roster: null, rosterMissing: [] })}>
            이 기기의 예전 데이터 가져오기
          </Button>
        )}
        <p className="text-sm text-stone-500">
          {auth
            ? '온라인(Supabase)에 저장되어 로그인한 모든 기기에서 같은 데이터가 보입니다. 백업 파일에는 학생·반 데이터도 들어 있어요. 무료 플랜은 서버 백업이 약하니 한 달에 한 번은 꼭 내보내 두세요.'
            : '지금은 이 기기(브라우저)에만 저장됩니다. 바꾸기 전에 백업 파일을 내보내 두면 안전합니다.'}
        </p>
      </div>

      {pendingRestore && (
        <ConfirmDialog
          title="백업으로 복원할까요?"
          body={
            pendingRestore.roster
              ? '수업 달력과 학생·반 데이터가 모두 백업 파일 내용으로 바뀝니다. 되돌릴 수 없습니다.'
              : '수업 달력 데이터가 백업 파일 내용으로 바뀝니다(이 파일에는 학생 데이터가 없어서 학생·반은 그대로). 되돌릴 수 없습니다.'
          }
          confirmLabel="복원"
          danger
          onCancel={() => setPendingRestore(null)}
          onConfirm={async () => {
            const p = pendingRestore;
            setPendingRestore(null);
            const ok = await replaceAll(p.app, '백업으로 복원했어요');
            if (ok && p.roster) {
              try {
                // 예전 백업에 없던 자료(반·학생과 무관한 브리핑 문구, 할 일)는 지금 것을 그대로 둔다
                const restored = { ...p.roster };
                for (const k of KEEP_IF_MISSING) if (p.rosterMissing.includes(k)) (restored as Record<string, unknown>)[k] = roster[k];
                await replaceRoster(restored);
              } catch (e) {
                showToast(`학생 데이터를 복원하지 못했어요: ${e instanceof Error ? e.message : String(e)}`);
              }
            }
          }}
        />
      )}
      {seedOpen && (
        <ConfirmDialog
          title="초기 데이터로 되돌릴까요?"
          body="수업 달력에서 바꾼 내용이 모두 지워지고 처음 상태(2026년 11·12월 확정)로 돌아갑니다. 학생·반 데이터는 그대로예요. 되돌릴 수 없습니다."
          confirmLabel="되돌리기"
          danger
          onCancel={() => setSeedOpen(false)}
          onConfirm={async () => {
            await replaceAll(createSeedAppData(), '초기 데이터로 되돌렸어요');
            setSeedOpen(false);
          }}
        />
      )}
    </Card>
  );
}

function readLocalBackup(): AppData | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? parseBackup(raw) : null;
  } catch {
    return null;
  }
}

function AccountSection() {
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  if (!auth) return null;
  return (
    <Card title="계정">
      <p className="mb-3 text-base text-stone-700">{auth.email} 로 로그인됨</p>
      <Button
        className="w-full"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await auth.signOut();
        }}
      >
        로그아웃
      </Button>
    </Card>
  );
}
