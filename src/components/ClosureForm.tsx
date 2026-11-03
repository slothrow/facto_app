// 휴원일·행사일 입력 폼. 회차 계획 탭(휴원 기간 추가)과 설정 탭에서 같이 쓴다.
import { useState } from 'react';
import type { ClosureRow } from '../storage/types.ts';
import { newId } from '../app/mutations.ts';
import { Button, Field, WeekdayPicker, inputClass } from './ui.tsx';

export function ClosureForm({
  initial,
  kindFixed,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<ClosureRow>;
  /** 지정하면 종류를 고를 수 없다 */
  kindFixed?: ClosureRow['kind'];
  submitLabel: string;
  onSubmit: (row: ClosureRow) => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<ClosureRow['kind']>(kindFixed ?? initial?.kind ?? 'closed');
  const [startDate, setStartDate] = useState(initial?.startDate ?? '');
  const [endDate, setEndDate] = useState(initial?.endDate ?? initial?.startDate ?? '');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [weekdays, setWeekdays] = useState<number[]>(initial?.weekdays ?? []);
  const [showOnCalendar, setShowOnCalendar] = useState(initial?.showOnCalendar ?? true);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!startDate) return setError('시작 날짜를 골라 주세요.');
    const end = endDate || startDate;
    if (end < startDate) return setError('끝 날짜가 시작 날짜보다 빠릅니다.');
    if (!label.trim()) return setError(kind === 'closed' ? '이름을 적어 주세요. 예: 겨울방학' : '행사 이름을 적어 주세요.');
    onSubmit({
      id: initial?.id ?? newId(),
      kind,
      startDate,
      endDate: end,
      weekdays: kind === 'closed' && weekdays.length > 0 ? weekdays : null,
      label: label.trim(),
      showOnCalendar,
    });
  };

  return (
    <div className="space-y-4">
      {!kindFixed && (
        <div className="flex gap-2">
          {(['closed', 'event'] as const).map((k) => (
            <Button
              key={k}
              variant={kind === k ? 'primary' : 'secondary'}
              onClick={() => setKind(k)}
              className="flex-1"
            >
              {k === 'closed' ? '휴원일' : '행사일'}
            </Button>
          ))}
        </div>
      )}
      <Field label="이름">
        <input
          className={inputClass}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={kind === 'closed' ? '예: 겨울방학' : '예: 보드게임 페스티벌'}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="시작">
          <input
            type="date"
            className={inputClass}
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              if (!endDate || endDate < e.target.value) setEndDate(e.target.value);
            }}
          />
        </Field>
        <Field label="끝">
          <input type="date" className={inputClass} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
      </div>
      {kind === 'closed' ? (
        <Field label="적용 요일" hint="아무것도 고르지 않으면 모든 요일에 적용됩니다.">
          <WeekdayPicker value={weekdays} onChange={setWeekdays} options={[1, 2, 3, 4, 5, 6]} />
        </Field>
      ) : (
        <label className="flex min-h-11 items-center gap-3 text-base">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={showOnCalendar}
            onChange={(e) => setShowOnCalendar(e.target.checked)}
          />
          안내 달력 이미지에 표시
        </label>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button onClick={onCancel} className="flex-1">
          취소
        </Button>
        <Button variant="primary" onClick={submit} className="flex-1">
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
