// 하린이 관리 화면 공용 입력칸: 이모지 고르기, 색 고르기.
import { Field, inputClass } from '../../components/ui.tsx';
import { KID_PALETTE } from '../../engine/harin/index.ts';
import { EMOJI_GROUPS } from './emojiGroups.ts';

export function EmojiField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field label="이모지">
      <div className="space-y-2">
        <input className={`${inputClass} text-2xl`} value={value} maxLength={8} onChange={(e) => onChange(e.target.value)} aria-label="이모지 직접 입력" placeholder="직접 입력도 돼요" />
        <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl bg-stone-50 p-2">
          {EMOJI_GROUPS.map((g) => (
            <div key={g.id}>
              <p className="mb-0.5 px-1 text-xs font-semibold text-stone-500">{g.label}</p>
              <div className="flex flex-wrap gap-1">
                {g.emojis.map((e) => (
                  <button
                    key={e}
                    type="button"
                    aria-label={`${g.label} ${e}`}
                    aria-pressed={value === e}
                    onClick={() => onChange(e)}
                    className={`h-11 w-11 rounded-xl text-2xl ${value === e ? 'bg-rose-100 ring-2 ring-rose-400' : 'bg-white'}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
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
