// 학부모 배포용 두 달 안내 달력. SPEC 9장.
// 실제 크기(가로 1080px)로 그리고, 미리보기에서는 축소해서 보여준다. PNG는 이 DOM을 2배 해상도로 찍는다.
import { useLayoutEffect, useRef, type CSSProperties, type Ref } from 'react';
import { monthOf, monthStart, weekdayOf } from '../../engine/dates.ts';
import { formatCellLabel } from '../../engine/label.ts';
import type { DayCell } from '../../engine/types.ts';
import { MAKEUP_COLOR, WEEK_COLORS } from '../../components/weekColors.ts';
import { POSTER_WIDTH, pairOf, posterHeight, type PosterLayout, type Ratio } from './exportModel.ts';

const C = {
  bg: '#FFFDF7',
  ink: '#2B2724',
  sub: '#6B635B',
  line: '#ECE5D8',
  blank: '#F7F3EA',
  accent: '#2F7A57',
  red: '#D9443B',
  blue: '#2F6FD0',
  event: '#B45309',
  highlight: '#FFF1BF',
};

// side: 칸이 좁아(약 66px) 다른 수업월 라벨("12월 4주")과 "보강수업"은 두 줄로 쓴다.
const SIZES = {
  side: { month: 38, weekday: 22, date: 23, label: 27, labelCross: 17, note: 13, band: 36, rowMin: 62, twoLine: true },
  stack: { month: 36, weekday: 20, date: 26, label: 25, labelCross: 21, note: 15, band: 36, rowMin: 44, twoLine: false },
};

export interface PosterProps {
  academyName: string;
  slogan: string;
  title: string;
  highlight: string;
  notice: string;
  startMonth: string;
  days: DayCell[];
  /** 날짜별로 보여줄 행사 이름 */
  events: Map<string, string[]>;
  ratio: Ratio;
  layout: PosterLayout;
  /** 내용이 칸을 넘치면 true */
  onOverflow?: (overflow: boolean) => void;
  ref?: Ref<HTMLDivElement>;
}

export function Poster(props: PosterProps) {
  const { academyName, slogan, title, highlight, notice, startMonth, days, events, ratio, layout, onOverflow, ref } =
    props;
  const H = posterHeight(ratio);
  const months = pairOf(startMonth);
  const S = SIZES[layout];
  const rootRef = useRef<HTMLDivElement | null>(null);

  // 넘침 검사: 이미지 전체나 달 블록 안에서 내용이 자리보다 크면 알려 준다
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el || !onOverflow) return;
    const boxes = [el, ...el.querySelectorAll<HTMLElement>('[data-fit]')];
    onOverflow(boxes.some((b) => b.scrollHeight > b.clientHeight + 1));
  });

  const setRefs = (el: HTMLDivElement | null) => {
    rootRef.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) (ref as { current: HTMLDivElement | null }).current = el;
  };

  const weeksOf = (ym: string) => Math.ceil((weekdayOf(monthStart(ym)) + days.filter((d) => monthOf(d.date) === ym).length) / 7);
  const sharedRows = Math.max(...months.map(weeksOf));

  return (
    <div
      ref={setRefs}
      style={{
        width: POSTER_WIDTH,
        height: H,
        background: C.bg,
        color: C.ink,
        fontFamily: "'Pretendard', sans-serif",
        padding: '46px 52px 38px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        overflow: 'hidden',
        letterSpacing: '-0.01em',
      }}
    >
      {/* 1. 공부방 이름 + 제목 */}
      <header>
        <div style={{ fontSize: 26, fontWeight: 700, color: C.accent }}>{academyName}</div>
        <div style={{ fontSize: 58, fontWeight: 800, lineHeight: 1.12, marginTop: 2 }}>{title}</div>
      </header>

      {/* 2. 두 달 달력 */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: layout === 'side' ? 'row' : 'column',
          gap: layout === 'side' ? 28 : 18,
        }}
      >
        {months.map((ym) => (
          <MonthGrid
            key={ym}
            ym={ym}
            days={days}
            events={events}
            layout={layout}
            rows={layout === 'side' ? sharedRows : weeksOf(ym)}
            S={S}
          />
        ))}
      </div>

      {/* 3. 범례 */}
      <Legend />

      {/* 4. 강조 안내 */}
      {highlight.trim() && (
        <div
          style={{
            background: C.highlight,
            borderRadius: 18,
            padding: '16px 22px',
            fontSize: 25,
            fontWeight: 700,
            lineHeight: 1.45,
            whiteSpace: 'pre-wrap',
          }}
        >
          {highlight.trim()}
        </div>
      )}

      {/* 5. 기본 안내 문구 */}
      {notice.trim() && (
        <div style={{ fontSize: 16, lineHeight: 1.45, color: C.sub, whiteSpace: 'pre-wrap' }}>{notice.trim()}</div>
      )}

      {/* 6. 슬로건 */}
      {slogan.trim() && (
        <div style={{ textAlign: 'center', fontSize: 22, fontWeight: 700, color: C.accent }}>{slogan.trim()}</div>
      )}
    </div>
  );
}

type Sizes = (typeof SIZES)['side'];

function MonthGrid({
  ym,
  days,
  events,
  layout,
  rows,
  S,
}: {
  ym: string;
  days: DayCell[];
  events: Map<string, string[]>;
  layout: PosterLayout;
  rows: number;
  S: Sizes;
}) {
  const monthDays = days.filter((d) => monthOf(d.date) === ym);
  const lead = weekdayOf(monthStart(ym));
  const cells: (DayCell | null)[] = [...Array(lead).fill(null), ...monthDays];
  while (cells.length < rows * 7) cells.push(null);

  const headerColor = (i: number) => (i === 0 ? C.red : i === 6 ? C.blue : C.sub);

  return (
    <div data-fit style={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
        <span style={{ fontSize: S.month, fontWeight: 800 }}>{Number(ym.slice(5))}월</span>
        <span style={{ fontSize: 20, fontWeight: 600, color: C.sub }}>{ym.slice(0, 4)}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
        {['일', '월', '화', '수', '목', '금', '토'].map((h, i) => (
          <div key={h} style={{ textAlign: 'center', fontSize: S.weekday, fontWeight: 700, color: headerColor(i) }}>
            {h}
          </div>
        ))}
      </div>
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gridTemplateRows: `repeat(${rows}, minmax(${S.rowMin}px, 1fr))`,
          gap: 4,
        }}
      >
        {cells.map((c, i) =>
          c ? (
            <PosterCell key={c.date} cell={c} ym={ym} events={events.get(c.date) ?? []} layout={layout} S={S} />
          ) : (
            <div key={`b${i}`} style={{ background: C.blank, borderRadius: 10 }} />
          ),
        )}
      </div>
    </div>
  );
}

function PosterCell({
  cell,
  ym,
  events,
  layout,
  S,
}: {
  cell: DayCell;
  ym: string;
  events: string[];
  layout: PosterLayout;
  S: Sizes;
}) {
  const red = cell.weekday === 0 || cell.status === 'holiday' || !!cell.holidayName;
  const dateColor = red ? C.red : cell.weekday === 6 ? C.blue : C.ink;

  const band = (() => {
    if (cell.status === 'session' && cell.session) {
      const cross = cell.session.courseMonth !== ym;
      const bg = WEEK_COLORS[cell.session.weekNo];
      if (cross && S.twoLine) {
        return (
          <TwoLineBand bg={bg} fg={C.ink} size={S.labelCross} lines={[`${Number(cell.session.courseMonth.slice(5))}월`, `${cell.session.weekNo}주`]} />
        );
      }
      return (
        <div style={bandStyle(bg, C.ink, S.band, cross ? S.labelCross : S.label)}>
          {formatCellLabel(cell.session, ym)}
        </div>
      );
    }
    if (cell.status === 'makeup') {
      return S.twoLine ? (
        <TwoLineBand bg={MAKEUP_COLOR} fg="#fff" size={S.labelCross} lines={['보강', '수업']} />
      ) : (
        <div style={bandStyle(MAKEUP_COLOR, '#fff', S.band, S.labelCross)}>보강수업</div>
      );
    }
    return null;
  })();

  const note = cell.holidayName ? (
    <div style={noteStyle(C.red, S.note)}>{cell.holidayName}</div>
  ) : cell.closureLabel ? (
    <div style={noteStyle(C.sub, S.note)}>{cell.closureLabel}</div>
  ) : null;

  const eventNote = events.length ? <div style={noteStyle(C.event, S.note - 1)}>● {events.join(', ')}</div> : null;

  const box: CSSProperties = {
    background: '#fff',
    border: `1.5px solid ${C.line}`,
    borderRadius: 10,
    padding: 4,
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
    boxSizing: 'border-box',
  };

  if (layout === 'side') {
    return (
      <div style={{ ...box, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ fontSize: S.date, fontWeight: 700, lineHeight: 1, color: dateColor }}>{Number(cell.date.slice(8))}</div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {note}
          {eventNote}
        </div>
        {band}
      </div>
    );
  }

  // 위아래 배치: 칸이 가로로 넓고 낮으므로 날짜를 왼쪽, 띠를 오른쪽에 둔다
  return (
    <div style={{ ...box, display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 34, fontSize: S.date, fontWeight: 700, color: dateColor, textAlign: 'center' }}>
        {Number(cell.date.slice(8))}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, justifyContent: 'center' }}>
        {eventNote}
        {band ?? note}
      </div>
    </div>
  );
}

const bandStyle = (bg: string, fg: string, height: number, fontSize: number): CSSProperties => ({
  background: bg,
  color: fg,
  height,
  borderRadius: 7,
  fontSize,
  fontWeight: 800,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  letterSpacing: '-0.03em',
});

function TwoLineBand({ bg, fg, size, lines }: { bg: string; fg: string; size: number; lines: [string, string] }) {
  return (
    <div
      style={{
        background: bg,
        color: fg,
        borderRadius: 7,
        padding: '2px 0',
        fontSize: size,
        fontWeight: 800,
        lineHeight: 1.05,
        textAlign: 'center',
        letterSpacing: '-0.03em',
      }}
    >
      <div>{lines[0]}</div>
      <div>{lines[1]}</div>
    </div>
  );
}

// 좁은 칸의 공휴일·휴원·행사 이름: 글자 단위로 줄바꿈해서 최대 3줄
const noteStyle = (color: string, fontSize: number): CSSProperties => ({
  color,
  fontSize,
  fontWeight: 700,
  lineHeight: 1.15,
  overflow: 'hidden',
  display: '-webkit-box',
  WebkitLineClamp: 3,
  WebkitBoxOrient: 'vertical',
  wordBreak: 'break-all',
});

function Legend() {
  const items: [string, string, string][] = [
    ['1주', WEEK_COLORS[1], C.ink],
    ['2주', WEEK_COLORS[2], C.ink],
    ['3주', WEEK_COLORS[3], C.ink],
    ['4주', WEEK_COLORS[4], C.ink],
    ['보강수업', MAKEUP_COLOR, '#fff'],
  ];
  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
      {items.map(([label, bg, fg]) => (
        <span
          key={label}
          style={{ background: bg, color: fg, fontSize: 20, fontWeight: 800, padding: '6px 16px', borderRadius: 8 }}
        >
          {label}
        </span>
      ))}
    </div>
  );
}
