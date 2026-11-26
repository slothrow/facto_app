// 하린이 관리 화면 공용 입력칸: 이모지 고르기, 색 고르기.
import { Field, inputClass } from '../../components/ui.tsx';
import { KID_PALETTE } from '../../engine/harin/index.ts';

const EMOJI_SUGGEST = ['🎹', '🎻', '🏊', '⚽', '🩰', '🎨', '📚', '🧮', '💻', '🔤', '🥋', '🎤', '🍙', '🍚', '🧸', '✏️', '⭐', '🛁', '📺', '😴'];

export function EmojiField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field label="이모지">
      <div className="space-y-2">
        <input className={`${inputClass} text-2xl`} value={value} maxLength={8} onChange={(e) => onChange(e.target.value)} aria-label="이모지 직접 입력" />
        <div className="flex flex-wrap gap-1">
          {EMOJI_SUGGEST.map((e) => (
            <button key={e} type="button" onClick={() => onChange(e)} className={`h-11 w-11 rounded-xl text-2xl ${value === e ? 'bg-rose-100 ring-2 ring-rose-400' : 'bg-stone-50'}`}>
              {e}
            </button>
          ))}
        </div>
      </div>
    </Field>
  );
}

export function ColorField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-stone-600">색</span>
      <div className="flex flex-wrap gap-2">
        {KID_PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`색 ${c}`}
            aria-pressed={value === c}
            onClick={() => onChange(c)}
            className={`h-11 w-11 rounded-full border-2 border-white shadow ${value === c ? 'ring-4 ring-rose-400' : ''}`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
    </div>
  );
}
