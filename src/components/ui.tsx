// 공통 UI: 버튼, 바텀시트, 확인 대화상자, 카드, 입력칸.
// 모바일 기준: 터치 영역 44px 이상(h-11), 기본 글씨 16px.
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-emerald-700 text-white active:bg-emerald-800 disabled:bg-stone-300',
  secondary: 'bg-white text-stone-800 border border-stone-300 active:bg-stone-100 disabled:text-stone-400',
  danger: 'bg-red-600 text-white active:bg-red-700 disabled:bg-stone-300',
  ghost: 'bg-transparent text-stone-700 active:bg-stone-100',
};

export function Button({
  variant = 'secondary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...props}
      className={`min-h-11 rounded-xl px-4 text-base font-medium transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
    />
  );
}

export function BottomSheet({
  title,
  onClose,
  children,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[88vh] w-full max-w-[480px] overflow-y-auto rounded-t-2xl bg-white px-4 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-stone-300" />
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold">{title}</h2>
          <Button variant="ghost" onClick={onClose} aria-label="닫기" className="px-3">
            닫기
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-2 text-lg font-bold">{title}</h2>
        <div className="mb-5 text-base leading-relaxed text-stone-700">{body}</div>
        <div className="flex justify-end gap-2">
          <Button onClick={onCancel}>취소</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function Card({ title, children, className = '' }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-stone-200 bg-white p-4 ${className}`}>
      {title && <h2 className="mb-3 text-base font-bold text-stone-800">{title}</h2>}
      {children}
    </section>
  );
}

export const inputClass =
  'min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-base focus:border-emerald-600 focus:outline-none';

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-stone-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-sm text-stone-500">{hint}</span>}
    </label>
  );
}

/** 요일 여러 개 고르기(토글 버튼) */
export function WeekdayPicker({
  value,
  onChange,
  options,
}: {
  value: number[];
  onChange: (v: number[]) => void;
  options: number[];
}) {
  const names = ['일', '월', '화', '수', '목', '금', '토'];
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((wd) => {
        const on = value.includes(wd);
        return (
          <button
            key={wd}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((v) => v !== wd) : [...value, wd].sort((a, b) => a - b))}
            className={`h-11 w-11 rounded-full border text-base font-medium ${
              on ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-stone-300 bg-white text-stone-700'
            }`}
          >
            {names[wd]}
          </button>
        );
      })}
    </div>
  );
}
