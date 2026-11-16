// 부르는 이름 입력칸(SPEC_personal_briefing 3.3). 비어 있으면 자동값이 회색으로 보이고, 고치면 바로 저장한다.
import { useEffect, useState } from 'react';
import { useRoster } from '../../app/RosterContext.tsx';
import { inputClass } from '../../components/ui.tsx';
import { defaultCallName } from '../../engine/personalBriefing.ts';
import type { StudentRow } from '../../storage/rosterTypes.ts';
import { callNameChange } from './personalModel.ts';

export function CallNameInput({
  student,
  className = '',
  autoFocus,
  onSaved,
}: {
  student: StudentRow;
  className?: string;
  autoFocus?: boolean;
  onSaved?: () => void;
}) {
  const { mutate } = useRoster();
  const saved = student.callName?.trim() ?? '';
  const [value, setValue] = useState(saved);
  useEffect(() => setValue(saved), [saved]);
  const auto = defaultCallName(student.name);

  const commit = async () => {
    const v = value.trim();
    if (v === saved || (v === auto && !saved)) {
      setValue(v === auto ? '' : v);
      onSaved?.();
      return;
    }
    if (await mutate(callNameChange(student, v), '부르는 이름을 저장했어요')) {
      if (v === auto) setValue('');
      onSaved?.();
    }
  };

  return (
    <input
      className={`${inputClass} ${className}`}
      value={value}
      placeholder={auto}
      autoFocus={autoFocus}
      aria-label={`부르는 이름 (자동: ${auto})`}
      enterKeyHint="done"
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) (e.target as HTMLInputElement).blur();
      }}
    />
  );
}
