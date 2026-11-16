// [보내기] 흐름(SPEC_briefing 5.2): 카톡 검색어 복사 → 공유 창 → 공유 완료면 기록, 닫으면 기록 안 함.
// 전체브리핑·개인브리핑이 똑같이 쓴다. PC처럼 공유 창이 없으면 문구를 복사하고 "보냄으로 기록할까요?"를 묻는다.
import { useState, type ReactNode } from 'react';
import { useAppData } from '../../app/AppDataContext.tsx';
import { ConfirmDialog } from '../../components/ui.tsx';
import type { StudentRow } from '../../storage/rosterTypes.ts';
import { kakaoSearchOf } from './briefingModel.ts';
import { canShare, copyText, loadTwoStep, saveTwoStep, shareText } from './share.ts';

export const KAKAO_TIP = '카톡에서 검색창을 누르고 키보드의 붙여넣기 추천을 탭하세요';

type OnShared = () => Promise<void>;

export interface SendFlow {
  twoStep: boolean;
  toggleTwoStep: () => void;
  /** 한 번의 탭: 검색어 복사 + 공유 */
  sendOneTap: (s: StudentRow, text: string, onShared: OnShared) => Promise<void>;
  /** 두 버튼 모드의 [이름 복사] */
  copyName: (s: StudentRow) => Promise<void>;
  /** 두 버튼 모드의 [공유] */
  share: (text: string, onShared: OnShared) => Promise<void>;
  /** PC 기록 확인창(화면에 넣어 둔다) */
  dialog: ReactNode;
}

export function useSendFlow(): SendFlow {
  const { showToast } = useAppData();
  const [twoStep, setTwoStep] = useState(loadTwoStep);
  const [pending, setPending] = useState<OnShared | null>(null);

  const share = async (text: string, onShared: OnShared) => {
    if (!canShare()) {
      const ok = await copyText(text);
      showToast(ok ? '문구를 복사했어요. 카톡에 붙여넣어 보내세요' : '복사하지 못했어요. 문구를 길게 눌러 복사하세요');
      if (ok) setPending(() => onShared);
      return;
    }
    showToast(KAKAO_TIP);
    const outcome = await shareText(text);
    if (outcome === 'shared') await onShared();
    else if (outcome === 'blocked') {
      // 복사 뒤 공유가 한 번의 탭으로 안 되는 기기 → 두 버튼으로 바꾼다
      setTwoStep(true);
      saveTwoStep(true);
      showToast('이 폰에서는 한 번에 안 돼요. 이름이 복사됐으니 [공유]를 눌러 주세요');
    }
  };

  return {
    twoStep,
    toggleTwoStep: () => {
      setTwoStep(!twoStep);
      saveTwoStep(!twoStep);
    },
    sendOneTap: async (s, text, onShared) => {
      await copyText(kakaoSearchOf(s));
      await share(text, onShared);
    },
    copyName: async (s) => {
      showToast((await copyText(kakaoSearchOf(s))) ? '카톡 검색어를 복사했어요. 이제 [공유]를 누르세요' : '복사하지 못했어요');
    },
    share,
    dialog: pending && (
      <ConfirmDialog
        title="보냄으로 기록할까요?"
        body="문구를 복사했어요. 카톡에 붙여넣어 보낸 뒤 [기록]을 눌러 주세요."
        confirmLabel="기록"
        onCancel={() => setPending(null)}
        onConfirm={async () => {
          const fn = pending;
          setPending(null);
          await fn();
        }}
      />
    ),
  };
}

/** 두 버튼 모드 전환 링크(공유 창이 있는 기기에서만) */
export function TwoStepToggle({ flow }: { flow: SendFlow }) {
  if (!canShare()) return null;
  return (
    <button type="button" className="mt-2 min-h-11 w-full text-sm text-stone-500 underline" onClick={flow.toggleTwoStep}>
      {flow.twoStep ? '한 번에 보내기 버튼으로 돌아가기' : '[보내기]가 잘 안 되면: 이름 복사·공유 두 버튼으로 나누기'}
    </button>
  );
}
