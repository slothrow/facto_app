// [이미지]: 비율 고르기 → 미리보기 → 저장 / 공유(카톡). 안내 달력 만들기의 변환·공유 코드를 쓴다.
import { useRef, useState } from 'react';
import { useAppData } from '../../app/AppDataContext.tsx';
import { BottomSheet, Button } from '../../components/ui.tsx';
import { downloadBlob, renderPng, shareOrDownload } from '../export/imageExport.ts';
import { ScaledPreview } from '../export/ScaledPreview.tsx';
import { HarinPoster, POSTER_SIZE, type PosterHomework, type PosterRatio } from './HarinPoster.tsx';

type PosterProps = Omit<React.ComponentProps<typeof HarinPoster>, 'ratio' | 'ref' | 'homework'>;

/** Jua 글꼴이 다 불러와졌는지 기다린다(이미지에 글꼴이 빠지지 않게) */
async function waitForJua(sample: string) {
  try {
    await document.fonts.load('24px "Jua"', sample || '하린이 시간표');
  } catch {
    /* 못 불러와도 Pretendard로 그린다 */
  }
}

export function ImageSheet({ poster, homework, onClose }: { poster: PosterProps; homework: PosterHomework; onClose: () => void }) {
  const { showToast } = useAppData();
  const [ratio, setRatio] = useState<PosterRatio>('portrait');
  const [withHomework, setWithHomework] = useState(false);
  const [busy, setBusy] = useState<'save' | 'share' | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const size = POSTER_SIZE[ratio];
  const fileName = `하린이시간표_${poster.name.replace(/[\\/:*?"<>|\s]+/g, '_')}.png`;

  const run = async (kind: 'save' | 'share') => {
    if (!ref.current) return;
    setBusy(kind);
    try {
      await waitForJua(ref.current.innerText);
      const blob = await renderPng(ref.current, size.width, size.height);
      if (kind === 'save') {
        downloadBlob(blob, fileName);
        showToast('이미지를 저장했어요');
      } else {
        const r = await shareOrDownload(blob, fileName, `하린이 시간표 · ${poster.name}`);
        if (r === 'downloaded') showToast('이 브라우저는 바로 공유가 안 돼서 이미지로 저장했어요');
      }
    } catch (e) {
      showToast(`이미지를 만들지 못했어요: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <BottomSheet title="이미지로 저장·공유" onClose={onClose}>
      <div className="space-y-3">
        <div className="flex gap-1 rounded-full bg-rose-50 p-1" role="tablist">
          {(
            [
              ['portrait', '폰 화면(세로)'],
              ['landscape', '출력용(가로)'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={ratio === id}
              onClick={() => setRatio(id)}
              className={`h-11 flex-1 rounded-full text-base font-semibold ${ratio === id ? 'bg-rose-400 text-white' : 'text-stone-600'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex min-h-11 items-center gap-3 rounded-xl bg-sky-50 px-3 font-sans">
          <input type="checkbox" className="h-6 w-6 accent-rose-500" checked={withHomework} onChange={(e) => setWithHomework(e.target.checked)} />
          <span className="text-base">
            {homework.label} 포함 <span className="text-sm text-stone-500">({homework.items.length}개)</span>
          </span>
        </label>
        <div className={ratio === 'portrait' ? 'mx-auto w-3/5' : 'w-full'}>
          <ScaledPreview width={size.width} height={size.height}>
            <HarinPoster ref={ref} ratio={ratio} {...poster} homework={withHomework ? homework : null} />
          </ScaledPreview>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => void run('save')} disabled={busy !== null}>
            {busy === 'save' ? '만드는 중…' : '이미지 저장'}
          </Button>
          <Button variant="primary" className="!bg-rose-500" onClick={() => void run('share')} disabled={busy !== null}>
            {busy === 'share' ? '만드는 중…' : '공유(카톡)'}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
