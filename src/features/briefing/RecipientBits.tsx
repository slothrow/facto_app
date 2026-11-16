// 아이 줄에 공통으로 쓰는 작은 표시(전체·개인브리핑 공용)
import { format } from 'date-fns';
import { CheckIcon } from '../../components/icons.tsx';
import type { BriefingRow } from '../../storage/rosterTypes.ts';
import type { Recipient } from './briefingModel.ts';

export function Badges({ r }: { r: Recipient }) {
  return (
    <>
      {r.sibling && <span className="ml-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800">형제</span>}
      {r.guest && <span className="ml-1 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">추가</span>}
    </>
  );
}

/** 보냄 표시(✓ 시각). 누르면 보냄 취소 확인 */
export function SentMark({ row, onCancel }: { row: BriefingRow; onCancel: () => void }) {
  return (
    <button type="button" onClick={onCancel} className="flex h-11 shrink-0 items-center gap-1 rounded-xl px-2 text-base font-semibold text-emerald-700 active:bg-emerald-50">
      <CheckIcon className="h-5 w-5" /> {format(new Date(row.sharedAt), 'H:mm')}
    </button>
  );
}
