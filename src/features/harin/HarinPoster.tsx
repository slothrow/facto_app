// 하린이 시간표 이미지(SPEC_harin 9장). 5일 전체, 보이는 범위. 위: "하린이 시간표 · 버전 이름", 아래: 범례.
// 폰 세로(1080×1920)와 출력용 가로(1600×1130) 두 가지. 글자 크기는 1분당 높이에 맞춰 정한다.
import { forwardRef } from 'react';
import { fromMinutes, shortTime, toMinutes } from '../../engine/classTime.ts';
import { KID_WEEKDAYS, isShortBlock, type TravelBlock } from '../../engine/harin/index.ts';
import type { GridBlock } from './HarinGrid.tsx';
import { TRAVEL_STYLE } from './HarinGrid.tsx';
import { WEEKDAY_LABEL } from './harinModel.ts';

export type PosterRatio = 'portrait' | 'landscape';
export const POSTER_SIZE: Record<PosterRatio, { width: number; height: number }> = {
  portrait: { width: 1080, height: 1920 },
  landscape: { width: 1600, height: 1130 },
};

export interface LegendItem {
  emoji: string;
  name: string;
  color: string | null;
}

export const HarinPoster = forwardRef<
  HTMLDivElement,
  {
    ratio: PosterRatio;
    name: string;
    memo: string | null;
    range: { start: number; end: number };
    blocks: GridBlock[];
    travel: TravelBlock[];
    travelEmoji: string;
    legend: LegendItem[];
  }
>(function HarinPoster({ ratio, name, memo, range, blocks, travel, travelEmoji, legend }, ref) {
  const { width, height } = POSTER_SIZE[ratio];
  const portrait = ratio === 'portrait';
  const pad = portrait ? 40 : 44;
  const headH = portrait ? 150 : 104;
  const legendH = portrait ? 190 : 96;
  const dayHeadH = portrait ? 56 : 44;
  const labelW = portrait ? 64 : 70;
  const gridH = height - pad * 2 - headH - legendH - dayHeadH;
  const u = gridH / (range.end - range.start); // 1분당 px
  const f = Math.max(14, Math.min(26, u * 9)); // 블록 글자 크기
  const slots: number[] = [];
  for (let m = Math.ceil(range.start / 30) * 30; m <= range.end; m += 30) slots.push(m);

  return (
    <div
      ref={ref}
      style={{ width, height, padding: pad, fontFamily: "'Jua', 'Pretendard', sans-serif", background: 'linear-gradient(180deg, #fff1f5 0%, #fff7f2 40%, #f5fbff 100%)' }}
      className="relative overflow-hidden text-stone-800"
    >
      <div style={{ height: headH }} className="flex flex-col items-center justify-center text-center">
        <div style={{ fontSize: portrait ? 64 : 52 }} className="leading-tight text-rose-500">
          🌷 하린이 시간표 <span className="text-stone-500">· {name}</span>
        </div>
        {memo && (
          <div style={{ fontSize: portrait ? 30 : 24 }} className="text-stone-500">
            {memo}
          </div>
        )}
      </div>

      <div className="flex" style={{ height: dayHeadH }}>
        <div style={{ width: labelW }} />
        {KID_WEEKDAYS.map((wd) => (
          <div key={wd} className="flex-1 text-center text-rose-500" style={{ fontSize: portrait ? 40 : 32 }}>
            {WEEKDAY_LABEL[wd]}
          </div>
        ))}
      </div>

      <div className="flex" style={{ height: gridH }}>
        <div className="relative" style={{ width: labelW }}>
          {slots.map((m) => (
            <span
              key={m}
              className={`absolute right-2 -translate-y-1/2 leading-none ${m % 60 === 0 ? 'text-stone-600' : 'text-stone-400'}`}
              style={{ top: (m - range.start) * u, fontSize: m % 60 === 0 ? (portrait ? 26 : 22) : portrait ? 18 : 16 }}
            >
              {shortTime(fromMinutes(m))}
            </span>
          ))}
        </div>
        {KID_WEEKDAYS.map((wd) => (
          <div key={wd} className="relative mx-1 flex-1 rounded-[20px] bg-white/80" style={{ boxShadow: 'inset 0 0 0 2px #fde4ec' }}>
            {slots.map((m) => (
              <div key={m} className={`absolute inset-x-0 ${m % 60 === 0 ? 'border-t-2 border-rose-100' : 'border-t border-dashed border-rose-50'}`} style={{ top: (m - range.start) * u }} />
            ))}
            {travel
              .filter((t) => t.weekday === wd)
              .map((t) => {
                const s = Math.max(range.start, toMinutes(t.startTime));
                const e = Math.min(range.end, toMinutes(t.endTime));
                if (e <= s) return null;
                return (
                  <div
                    key={`${t.ownerId}-${t.side}`}
                    className="absolute inset-x-3 flex items-center justify-center overflow-hidden rounded-xl text-stone-500"
                    style={{ ...TRAVEL_STYLE, top: (s - range.start) * u, height: (e - s) * u, fontSize: Math.min(f * 0.8, (e - s) * u * 0.7) }}
                  >
                    <span className="rounded-full bg-white/85 px-2 leading-none">
                      {travelEmoji} {t.minutes}분
                    </span>
                  </div>
                );
              })}
            {blocks
              .filter((g) => g.block.weekday === wd)
              .map(({ block: b, look }) => {
                const s = toMinutes(b.startTime);
                const mins = toMinutes(b.endTime) - s;
                const short = isShortBlock(mins);
                return (
                  <div
                    key={b.id}
                    className={`absolute inset-x-1.5 flex flex-col overflow-hidden rounded-[18px] border-[3px] border-white px-2 ${short ? 'justify-center' : 'justify-start pt-1'}`}
                    style={{ top: (s - range.start) * u, height: mins * u, backgroundColor: look.color, boxShadow: '0 3px 8px rgba(120,80,100,0.18)' }}
                  >
                    {short ? (
                      <div className="truncate leading-tight" style={{ fontSize: Math.min(f, mins * u * 0.6) }}>
                        {look.emoji} {look.name} <span className="text-stone-600">{shortTime(b.startTime)}</span>
                      </div>
                    ) : (
                      <>
                        <div className="truncate leading-tight" style={{ fontSize: f * 1.1 }}>
                          {look.emoji} {look.name}
                        </div>
                        <div className="truncate leading-tight text-stone-600" style={{ fontSize: f * 0.8 }}>
                          {shortTime(b.startTime)}~{shortTime(b.endTime)}
                        </div>
                        {look.place && mins * u > f * 3.4 && (
                          <div className="truncate leading-tight text-stone-500" style={{ fontSize: f * 0.75 }}>
                            📍{look.place}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
          </div>
        ))}
      </div>

      <div style={{ height: legendH }} className="flex flex-wrap content-center items-center justify-center gap-x-3 gap-y-2 px-2">
        {legend.map((l) => (
          <span key={`${l.emoji}${l.name}`} className="flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 shadow-sm" style={{ fontSize: portrait ? 26 : 20 }}>
            <span className="inline-block rounded-full" style={{ width: portrait ? 22 : 18, height: portrait ? 22 : 18, ...(l.color ? { backgroundColor: l.color } : TRAVEL_STYLE) }} />
            {l.emoji} {l.name}
          </span>
        ))}
      </div>
    </div>
  );
});
