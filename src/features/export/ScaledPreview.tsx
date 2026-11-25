import { useEffect, useRef, useState, type ReactNode } from 'react';

/** 큰 이미지(1080px 등)를 화면 폭에 맞게 줄여서 보여준다(안내 달력, 하린이 시간표) */
export function ScaledPreview({ width, height, children }: { width: number; height: number; children: ReactNode }) {
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
