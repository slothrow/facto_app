// 달력 만들기 탭. SPEC 8.2.
import { format } from 'date-fns';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAppData } from '../../app/AppDataContext.tsx';
import { scheduleFor } from '../../app/scheduleInput.ts';
import { AlertIcon } from '../../components/icons.tsx';
import { Button, Card, Field, inputClass } from '../../components/ui.tsx';
import { addMonthsYm, monthEnd, monthStart, monthsBetween } from '../../engine/dates.ts';
import { monthName } from '../../engine/label.ts';
import type { ExportHistoryRow } from '../../storage/types.ts';
import {
  DEFAULT_LAYOUT,
  DEFAULT_RATIO,
  POSTER_WIDTH,
  ratioForLayout,
  addExportHistory,
  defaultStartMonth,
  defaultTitle,
  draftMonthsIn,
  eventLabelsByDate,
  eventsInPeriod,
  fileNameFor,
  pairOf,
  posterHeight,
  type PosterLayout,
  type Ratio,
} from './exportModel.ts';
import { downloadBlob, renderPng, shareOrDownload } from './imageExport.ts';
import { Poster } from './Poster.tsx';

const md = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
const pairLabel = (ym: string) => {
  const [a, b] = pairOf(ym);
  return `${a.slice(0, 4)}년 ${monthName(a)} · ${b.slice(0, 4) !== a.slice(0, 4) ? `${b.slice(0, 4)}년 ` : ''}${monthName(b)}`;
};

export function ExportPage() {
  const { data, commit, showToast } = useAppData();
  const todayYm = format(new Date(), 'yyyy-MM');

  const [startMonth, setStartMonth] = useState(() => defaultStartMonth(data, todayYm));
  const [title, setTitle] = useState(() => defaultTitle(startMonth));
  const [titleEdited, setTitleEdited] = useState(false);
  const [highlight, setHighlight] = useState('');
  const [notice, setNotice] = useState(data.settings.noticeTemplate);
  const [ratio, setRatio] = useState<Ratio>(DEFAULT_RATIO);
  const [layout, setLayout] = useState<PosterLayout>(DEFAULT_LAYOUT);
  const chooseLayout = (l: PosterLayout) => {
    setLayout(l);
    setRatio((r) => ratioForLayout(l, r));
  };
  const [overflow, setOverflow] = useState(false);
  const [busy, setBusy] = useState<null | 'save' | 'share'>(null);

  const periodEvents = useMemo(() => eventsInPeriod(data, startMonth), [data, startMonth]);
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set());
  // 기간이 바뀌면 "이미지에 표시"로 저장된 행사를 기본 선택
  useEffect(() => {
    setSelectedEvents(new Set(periodEvents.filter((e) => e.showOnCalendar).map((e) => e.id)));
  }, [periodEvents]);

  const changeStart = (ym: string) => {
    setStartMonth(ym);
    if (!titleEdited) setTitle(defaultTitle(ym));
  };

  const [m1, m2] = pairOf(startMonth);
  const output = useMemo(() => scheduleFor(data, { from: monthStart(m1), to: monthEnd(m2) }), [data, m1, m2]);
  const eventMap = useMemo(() => eventLabelsByDate(periodEvents, selectedEvents), [periodEvents, selectedEvents]);
  const drafts = draftMonthsIn(data, startMonth);

  const posterRef = useRef<HTMLDivElement | null>(null);
  const H = posterHeight(ratio);

  const record = () =>
    commit(
      addExportHistory(
        data,
        { startMonth, title, highlightText: highlight, noticeText: notice, ratio, layout },
        new Date().toISOString(),
      ),
      '내보낸 기록을 저장했어요',
    );

  const run = async (kind: 'save' | 'share') => {
    if (!posterRef.current) return;
    setBusy(kind);
    try {
      const blob = await renderPng(posterRef.current, POSTER_WIDTH, H);
      const name = fileNameFor(startMonth);
      if (kind === 'save') {
        downloadBlob(blob, name);
        await record();
      } else {
        const result = await shareOrDownload(blob, name, title);
        if (result === 'cancelled') return;
        if (result === 'downloaded') showToast('이 브라우저는 바로 공유가 안 돼서 이미지로 저장했어요');
        await record();
      }
    } catch (e) {
      showToast(`이미지를 만들지 못했어요: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const loadHistory = (h: ExportHistoryRow) => {
    setStartMonth(h.startMonth);
    setTitle(h.title);
    setTitleEdited(true);
    setHighlight(h.highlightText);
    setNotice(h.noticeText);
    setRatio(h.ratio);
    setLayout(h.layout ?? DEFAULT_LAYOUT);
    showToast('지난 문구를 불러왔어요');
  };

  const monthOptions = monthsBetween(addMonthsYm(todayYm, -3), addMonthsYm(todayYm, 12));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">달력 만들기</h1>

      {/* 폰: 한 줄(order로 순서 지정) / PC: 왼쪽 미리보기, 오른쪽 기간·문구·기록 */}
      <div className="flex flex-col gap-4 md:grid md:grid-cols-[minmax(0,1fr)_380px] md:items-start md:gap-6">
      <div className="contents md:col-start-2 md:row-start-1 md:flex md:flex-col md:gap-4">
      <Card className="order-1 md:order-none">
        <Field label="기간(두 달)">
          <select className={inputClass} value={startMonth} onChange={(e) => changeStart(e.target.value)}>
            {monthOptions.map((ym) => (
              <option key={ym} value={ym}>
                {pairLabel(ym)}
              </option>
            ))}
          </select>
        </Field>
        {drafts.length > 0 && (
          <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-amber-50 p-3 text-base text-amber-900">
            <AlertIcon className="mt-0.5 h-5 w-5 shrink-0" />
            아직 확정되지 않은 달이 있습니다: {drafts.map(monthName).join(', ')}
          </p>
        )}
      </Card>

      <div className="order-2 grid grid-cols-2 gap-2 md:order-none">
        <Button
          variant={layout === 'side' ? 'primary' : 'secondary'}
          onClick={() => chooseLayout('side')}
          aria-pressed={layout === 'side'}
        >
          나란히 (기본)
        </Button>
        <Button
          variant={layout === 'stack' ? 'primary' : 'secondary'}
          onClick={() => chooseLayout('stack')}
          aria-pressed={layout === 'stack'}
        >
          위아래 (4:5)
        </Button>
        <Button variant={ratio === '1:1' ? 'primary' : 'secondary'} onClick={() => setRatio('1:1')} aria-pressed={ratio === '1:1'}>
          정사각형 1:1
        </Button>
        <Button variant={ratio === '4:5' ? 'primary' : 'secondary'} onClick={() => setRatio('4:5')} aria-pressed={ratio === '4:5'}>
          세로형 4:5
        </Button>
      </div>


      <Card title="문구" className="order-4 md:order-none">
        <div className="space-y-3">
          <Field label="제목">
            <input
              className={inputClass}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleEdited(true);
              }}
            />
          </Field>
          <Field label="강조 안내 (이번 회차 공지)" hint="행사, 시간표 조정 등. 비워 두면 표시하지 않습니다.">
            <textarea
              className={`${inputClass} min-h-24 py-2 leading-relaxed`}
              value={highlight}
              onChange={(e) => setHighlight(e.target.value)}
              placeholder="예: 1월 4일~8일은 겨울방학입니다."
            />
          </Field>
          <Field label="기본 안내 문구 (이번만 수정)">
            <textarea
              className={`${inputClass} min-h-40 py-2 text-sm leading-relaxed`}
              value={notice}
              onChange={(e) => setNotice(e.target.value)}
            />
          </Field>
          {notice !== data.settings.noticeTemplate && (
            <Button className="w-full" onClick={() => setNotice(data.settings.noticeTemplate)}>
              설정의 기본 문구로 되돌리기
            </Button>
          )}
        </div>
      </Card>

      <Card title="행사 표시" className="order-5 md:order-none">
        {periodEvents.length === 0 ? (
          <p className="text-stone-500">이 기간에 등록된 행사가 없습니다.</p>
        ) : (
          <ul className="space-y-1">
            {periodEvents.map((e) => (
              <li key={e.id}>
                <label className="flex min-h-11 items-center gap-3 text-base">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={selectedEvents.has(e.id)}
                    onChange={(ev) => {
                      const next = new Set(selectedEvents);
                      if (ev.target.checked) next.add(e.id);
                      else next.delete(e.id);
                      setSelectedEvents(next);
                    }}
                  />
                  <span>
                    <span className="text-stone-500">{md(e.startDate)}</span> {e.label}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="내보낸 기록" className="order-6 md:order-none">
        {data.exportHistory.length === 0 ? (
          <p className="text-stone-500">아직 없습니다. 이미지를 저장하거나 공유하면 여기에 남습니다.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {data.exportHistory.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{h.title}</span>
                  <span className="text-sm text-stone-500">
                    {pairLabel(h.startMonth)} · {format(new Date(h.createdAt), 'yyyy.M.d HH:mm')}
                  </span>
                </span>
                <Button className="shrink-0" onClick={() => loadHistory(h)}>
                  불러오기
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      </div>

      <div className="order-3 space-y-4 md:order-none md:col-start-1 md:row-start-1">
      <ScaledPreview width={POSTER_WIDTH} height={H}>
        <Poster
          ref={posterRef}
          academyName={data.settings.academyName}
          slogan={data.settings.slogan}
          title={title}
          highlight={highlight}
          notice={notice}
          startMonth={startMonth}
          days={output.days}
          events={eventMap}
          ratio={ratio}
          layout={layout}
          onOverflow={setOverflow}
        />
      </ScaledPreview>

      {overflow && (
        <p className="flex items-start gap-1.5 rounded-xl bg-red-50 p-3 text-base text-red-800">
          <AlertIcon className="mt-0.5 h-5 w-5 shrink-0" />
          내용이 이미지 밖으로 넘칩니다. 안내 문구를 줄이거나 세로형 4:5를 써 보세요.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => run('save')} disabled={busy !== null}>
          {busy === 'save' ? '만드는 중…' : '이미지 저장'}
        </Button>
        <Button variant="primary" onClick={() => run('share')} disabled={busy !== null}>
          {busy === 'share' ? '만드는 중…' : '공유하기'}
        </Button>
      </div>
      </div>
      </div>
    </div>
  );
}

/** 1080px 달력을 화면 폭에 맞게 줄여서 보여준다 */
function ScaledPreview({ width, height, children }: { width: number; height: number; children: ReactNode }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.33);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / width);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  return (
    <div
      ref={boxRef}
      className="relative w-full overflow-hidden rounded-xl shadow-md ring-1 ring-stone-200"
      style={{ height: height * scale }}
    >
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width, height }}>{children}</div>
    </div>
  );
}
