// 문구 관리(SPEC_briefing 4장). 주소: #/briefing/texts/<단계>
// 단계별 탭 → 단원 12 × 주차 4 격자(채워진/빈 칸), 단계별 진행률. 칸을 누르면 보기·수정.
// 베이직 탭: 베이직 반의 앞으로 수업 날짜 목록 → 날짜마다 제목·문구(SPEC 2.1).
// [일괄 가져오기]: 코드, 문구 붙여넣기.
import { useMemo, useState } from 'react';
import { useAppData } from '../../app/AppDataContext.tsx';
import { navigate } from '../../app/router.ts';
import { todayStr, useRoster } from '../../app/RosterContext.tsx';
import { ChevronLeft } from '../../components/icons.tsx';
import { BottomSheet, Button, Card, Field, inputClass } from '../../components/ui.tsx';
import { formatTimeKo } from '../../engine/classTime.ts';
import { STAGES, STAGE_NAMES, UNIT_STAGES, type StageId } from '../../engine/curriculum.ts';
import { addDays, weekdayOf } from '../../engine/dates.ts';
import { scheduleFor } from '../../app/scheduleInput.ts';
import type { BasicLessonRow, ClassRow } from '../../storage/rosterTypes.ts';
import { courseMonthLabel, curriculumOf } from '../curriculum/curriculumModel.ts';
import { WEEKDAY_NAMES, classGradeLabel } from '../roster/rosterModel.ts';
import { basicSessions, planFilled, savePlanChange } from './basicModel.ts';
import { buildTextImport, saveTextChange, stageFilledCount, stageGrid, textImportChange, textMap } from './textsModel.ts';

const isStage = (s?: string): s is StageId => !!s && (STAGES as string[]).includes(s);
export const dateLabel = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}(${WEEKDAY_NAMES[weekdayOf(d)]})`;

export function TextsPage({ stage: stageParam }: { stage?: string }) {
  const { data } = useAppData();
  const { roster } = useRoster();
  const settings = curriculumOf(data);
  const stage: StageId = isStage(stageParam) ? stageParam : 'P';
  const texts = useMemo(() => textMap(roster), [roster]);
  const [importing, setImporting] = useState(false);

  return (
    <div className="space-y-4">
      <button type="button" onClick={() => navigate('/briefing')} className="flex h-11 items-center gap-1 text-base text-stone-600">
        <ChevronLeft className="h-5 w-5" /> 브리핑
      </button>
      <div className="flex items-center gap-2">
        <h1 className="flex-1 text-xl font-bold">문구 관리</h1>
        <Button onClick={() => setImporting(true)}>일괄 가져오기</Button>
      </div>

      <div role="tablist" className="grid grid-cols-6 gap-1 rounded-2xl bg-stone-200/70 p-1 md:max-w-2xl">
        {STAGES.map((s) => {
          const filled = s === 'basic' ? null : stageFilledCount(stageGrid(s, settings, texts));
          return (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={stage === s}
              onClick={() => navigate(`/briefing/texts/${s}`)}
              className={`flex h-14 flex-col items-center justify-center rounded-xl leading-tight ${stage === s ? 'bg-white text-emerald-800 shadow-sm' : 'text-stone-600'}`}
            >
              <span className={`font-bold ${s === 'basic' ? 'text-sm' : 'text-base'}`}>{s === 'basic' ? STAGE_NAMES.basic : settings[s].prefix}</span>
              {filled !== null && <span className="text-[11px]">{filled}/48</span>}
            </button>
          );
        })}
      </div>

      {stage === 'basic' ? <BasicPlans /> : <StageGrid stage={stage} />}

      {importing && <ImportSheet onClose={() => setImporting(false)} />}
    </div>
  );
}

function StageGrid({ stage }: { stage: StageId }) {
  const { data } = useAppData();
  const { roster } = useRoster();
  const settings = curriculumOf(data);
  const texts = useMemo(() => textMap(roster), [roster]);
  const grid = stageGrid(stage, settings, texts);
  const [open, setOpen] = useState<string | null>(null);

  return (
    <Card title={`${settings[stage].prefix} 단계 · ${stageFilledCount(grid)}/48`}>
      <div className="grid grid-cols-[2.5rem_repeat(4,minmax(0,1fr))] gap-1 text-center md:max-w-xl">
        <span />
        {[1, 2, 3, 4].map((w) => (
          <span key={w} className="text-sm font-semibold text-stone-500">
            {w}주
          </span>
        ))}
        {grid.map((row) => [
          <span key={`u${row[0].unit}`} className="self-center text-sm font-bold text-stone-600">
            {settings[stage].prefix}
            {row[0].unit}
          </span>,
          ...row.map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => setOpen(c.code)}
              aria-label={`${c.code} ${c.filled ? '문구 있음' : '비어 있음'}`}
              className={`h-10 rounded-lg text-sm font-semibold ${c.filled ? 'bg-emerald-600 text-white' : 'border border-dashed border-stone-300 bg-white text-stone-400'}`}
            >
              {c.filled ? '✓' : c.code}
            </button>
          )),
        ])}
      </div>
      <p className="mt-2 text-sm text-stone-500">초록 칸 = 문구 있음. 칸을 누르면 보고 고칠 수 있어요.</p>
      {open && <TextSheet code={open} onClose={() => setOpen(null)} />}
    </Card>
  );
}

/** 코드 문구 보기·수정(브리핑 화면에서도 쓴다) */
export function TextSheet({ code, onClose, onSaved }: { code: string; onClose: () => void; onSaved?: (text: string) => void }) {
  const { roster, mutate } = useRoster();
  const current = roster.briefingTexts.find((t) => t.code === code)?.text ?? '';
  const [text, setText] = useState(current);
  const save = async () => {
    if (await mutate(saveTextChange(code, text), text.trim() ? `${code} 문구를 저장했어요` : `${code} 문구를 지웠어요`)) {
      onSaved?.(text);
      onClose();
    }
  };
  return (
    <BottomSheet title={`${code} 문구`} onClose={onClose}>
      <div className="space-y-3">
        <textarea
          className={`${inputClass} min-h-64 py-2 leading-relaxed`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="학부모님께 보낼 브리핑 문구(아이 이름은 넣지 않아요)"
        />
        <p className="text-sm text-stone-500">이 코드를 쓰는 모든 반에 같은 문구가 쓰여요. 비우고 저장하면 지워져요.</p>
        <Button variant="primary" className="w-full" disabled={text === current} onClick={() => void save()}>
          저장
        </Button>
      </div>
    </BottomSheet>
  );
}

function BasicPlans() {
  const { data } = useAppData();
  const { roster } = useRoster();
  const today = todayStr();
  const settings = curriculumOf(data);
  const cells = useMemo(() => scheduleFor(data, { from: addDays(today, -7), to: addDays(today, 42) }).days, [data, today]);
  const list = basicSessions(roster, cells, settings);
  const [open, setOpen] = useState<{ cls: ClassRow; date: string; plan: BasicLessonRow | null } | null>(null);

  return (
    <Card title="베이직 날짜별 수업 내용">
      <p className="mb-2 text-sm text-stone-600">베이직은 그때그때 수업 내용이 달라요. 2주쯤 전에 날짜마다 제목과 브리핑 문구를 적어 두면 브리핑 화면에 바로 떠요.</p>
      {list.length === 0 ? (
        <p className="text-base text-stone-500">앞으로 6주 안에 베이직 진도인 반이 없어요. 반 상세 → 진도에서 기준점을 "베이직"으로 넣어 주세요.</p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {list.map((s) => (
            <li key={`${s.cls.id}-${s.date}`}>
              <button
                type="button"
                onClick={() => setOpen({ cls: s.cls, date: s.date, plan: s.plan })}
                className={`flex min-h-14 w-full items-center gap-3 text-left active:bg-stone-50 ${s.date < today ? 'opacity-60' : ''}`}
              >
                <span className="w-20 shrink-0">
                  <span className="block font-semibold">{dateLabel(s.date)}</span>
                  <span className="block text-sm text-stone-500">{formatTimeKo(s.cls.startTime)}</span>
                </span>
                <span className="min-w-0 flex-1">
                  {planFilled(s.plan) ? (
                    <>
                      <span className="block truncate font-semibold text-emerald-800">{s.plan!.title || '(제목 없음)'}</span>
                      <span className="block truncate text-sm text-stone-500">{s.plan!.text}</span>
                    </>
                  ) : (
                    <span className="text-stone-400">비어 있음 · 눌러서 적기</span>
                  )}
                </span>
                <span className="shrink-0 text-xs text-stone-400">{courseMonthLabel(s.session.courseMonth)} {s.session.weekNo}주</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && <PlanSheet {...open} onClose={() => setOpen(null)} />}
    </Card>
  );
}

/** 베이직 (반, 날짜) 수업 내용 적기(브리핑 화면에서도 쓴다) */
export function PlanSheet({ cls, date, plan, onClose }: { cls: ClassRow; date: string; plan: BasicLessonRow | null; onClose: () => void }) {
  const { roster, mutate } = useRoster();
  const latest = roster.basicLessons.find((p) => p.classId === cls.id && p.date === date) ?? plan;
  const [title, setTitle] = useState(latest?.title ?? '');
  const [text, setText] = useState(latest?.text ?? '');
  const save = async () => {
    if (await mutate(savePlanChange(latest, cls.id, date, title, text), '베이직 수업 내용을 저장했어요')) onClose();
  };
  return (
    <BottomSheet title={`베이직 ${dateLabel(date)} ${formatTimeKo(cls.startTime)} ${classGradeLabel(cls, date)}`} onClose={onClose}>
      <div className="space-y-3">
        <Field label="수업 제목">
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 동물 친구 모양 맞추기" />
        </Field>
        <Field label="브리핑 문구">
          <textarea className={`${inputClass} min-h-56 py-2 leading-relaxed`} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <Button variant="primary" className="w-full" onClick={() => void save()}>
          저장
        </Button>
      </div>
    </BottomSheet>
  );
}

function ImportSheet({ onClose }: { onClose: () => void }) {
  const { data } = useAppData();
  const { roster, mutate } = useRoster();
  const settings = curriculumOf(data);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'overwrite' | 'skip'>('skip');
  const rows = useMemo(() => buildTextImport(input, roster, settings), [input, roster, settings]);
  const valid = rows.filter((r) => !r.error);
  const existing = valid.filter((r) => r.exists).length;
  const toSave = mode === 'overwrite' ? valid.length : valid.length - existing;
  const bad = rows.filter((r) => r.error);

  const save = async () => {
    if (await mutate(textImportChange(rows, mode), `문구 ${toSave}개를 저장했어요`)) onClose();
  };

  return (
    <BottomSheet title="문구 일괄 가져오기" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-base text-stone-700">
          엑셀에서 <b>코드 | 문구</b> 두 열을 복사해 붙여넣으세요. 문구 안의 줄바꿈은 그대로 저장돼요. 단계 코드: {UNIT_STAGES.map((s) => settings[s].prefix).join(', ')}
        </p>
        <textarea
          className={`${inputClass} min-h-40 py-2 text-sm`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={'코드\t문구\nP1-1\t오늘은 …'}
        />
        {rows.length > 0 && (
          <div className="space-y-2">
            <p className="text-base">
              읽은 줄 <b>{valid.length}</b>개{existing > 0 && <> · 이미 있는 코드 <b>{existing}</b>개</>}
              {bad.length > 0 && <> · <b className="text-red-700">오류 {bad.length}줄</b></>}
            </p>
            {existing > 0 && (
              <div className="grid grid-cols-2 gap-2">
                <Button variant={mode === 'skip' ? 'primary' : 'secondary'} aria-pressed={mode === 'skip'} onClick={() => setMode('skip')}>
                  있던 문구 두기
                </Button>
                <Button variant={mode === 'overwrite' ? 'primary' : 'secondary'} aria-pressed={mode === 'overwrite'} onClick={() => setMode('overwrite')}>
                  덮어쓰기
                </Button>
              </div>
            )}
            {bad.length > 0 && (
              <ul className="max-h-40 overflow-y-auto rounded-xl bg-red-50 p-3 text-sm text-red-900">
                {bad.map((r) => (
                  <li key={r.line}>
                    {r.line}줄 {r.raw ? `"${r.raw}"` : ''} — {r.error}
                  </li>
                ))}
              </ul>
            )}
            <ul className="max-h-60 divide-y divide-stone-100 overflow-y-auto rounded-xl border border-stone-200 text-sm">
              {valid.map((r) => (
                <li key={r.line} className="p-2">
                  <b>{r.code}</b>
                  {r.exists && <span className="ml-1 text-amber-700">(있음 · {mode === 'overwrite' ? '덮어씀' : '건너뜀'})</span>}
                  <p className="whitespace-pre-wrap text-stone-600">{r.text}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
        <Button variant="primary" className="w-full" disabled={toSave === 0} onClick={() => void save()}>
          {toSave > 0 ? `${toSave}개 저장` : '저장'}
        </Button>
      </div>
    </BottomSheet>
  );
}
