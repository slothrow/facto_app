// 달력 DOM → PNG, 저장·공유.

/** 캡처 전에 Pretendard 네 굵기가 모두 불러와졌는지 기다린다(글자 깨짐 방지) */
export async function waitForFonts() {
  await Promise.all(
    [400, 600, 700, 800].map((w) => document.fonts.load(`${w} 24px "Pretendard"`, '가나다라 1234')),
  );
  await document.fonts.ready;
}

/** 내보내기는 2배 해상도(1080 → 2160px) */
export async function renderPng(node: HTMLElement, width: number, height: number): Promise<Blob> {
  await waitForFonts();
  // 이미지 변환 도구는 안내 달력을 만들 때만 불러온다(첫 화면 로딩을 가볍게)
  const { toBlob } = await import('html-to-image');
  const blob = await toBlob(node, { width, height, pixelRatio: 2, cacheBust: false });
  if (!blob) throw new Error('이미지를 만들지 못했습니다.');
  return blob;
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * 파일 공유(카카오톡 등). 이 기기·브라우저가 파일 공유를 못 하면 다운로드로 대신한다.
 * 참고: 파일 공유는 https 주소(배포 후)나 localhost에서만 된다. 같은 Wi-Fi의 http 주소로는 다운로드로 대체된다.
 */
export async function shareOrDownload(
  blob: Blob,
  fileName: string,
  title: string,
): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], fileName, { type: 'image/png' });
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
      throw e;
    }
  }
  downloadBlob(blob, fileName);
  return 'downloaded';
}
