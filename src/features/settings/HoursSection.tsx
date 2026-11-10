// 설정: 요일별 운영 시간(편성·빈자리에서 씀)과 학년별 선호 시간대(SPEC_home 2.3 B).
import { useState } from 'react';
import { useAppData } from '../../app/AppDataContext.tsx';
import { updateSettings } from '../../app/mutations.ts';
import { Button, Card, inputClass } from '../../components/ui.tsx';
import { gradeLabel } from '../../engine/grade.ts';
import { WEEKDAY_NAMES } from '../../engine/label.ts';
import { SIM_WEEKDAYS, withHoursDefaults } from '../../engine/simulator/model.ts';
import type { Weekday } from '../../engine/types.ts';
import { DEFAULT_PREFERRED_AFTER } from '../../engine/vacancy.ts';

/** 빈자리에서 고르는 학년(5세~초3) */
export const VACANCY_GRADES = [4, 5, 6, 7, 8, 9];

export const preferredOf = (saved?: Partial<Record<number, string | null>>) => ({ ...DEFAULT_PREFERRED_AFTER, ...(saved ?? {}) });

export function HoursSection() {
  const { data, commit } = useAppData();
  const [hours, setHours] = useState(() => withHoursDefaults(data.settings.operatingHours));
  const [pref, setPref] = useState(() => preferredOf(data.settings.gradePreferredAfter));
  const dirty =
    JSON.stringify(hours) !== JSON.stringify(withHoursDefaults(data.settings.operatingHours)) ||
    JSON.stringify(pref) !== JSON.stringify(preferredOf(data.settings.gradePreferredAfter));
  const bad = SIM_WEEKDAYS.some((wd) => !hours[wd].start || !hours[wd].end || hours[wd].start >= hours[wd].end);

  const setDay = (wd: Weekday, key: 'start' | 'end', v: string) => setHours((h) => ({ ...h, [wd]: { ...h[wd], [key]: v } }));

  return (
    <Card title="운영 시간 · 선호 시간대">
      <p className="mb-2 text-sm text-stone-500">요일별 첫 수업 시작 ~ 마지막 수업 끝. 편성과 빈자리(새 반 개설 가능 시각)에서 씁니다.</p>
      <div className="space-y-2">
        {SIM_WEEKDAYS.map((wd) => (
          <div key={wd} className="flex items-center gap-2">
            <span className="w-6 shrink-0 text-base font-semibold">{WEEKDAY_NAMES[wd]}</span>
            <input type="time" step={600} aria-label={`${WEEKDAY_NAMES[wd]} 시작`} className={inputClass} value={hours[wd].start} onChange={(e) => setDay(wd, 'start', e.target.value)} />
            <span className="shrink-0">~</span>
            <input type="time" step={600} aria-label={`${WEEKDAY_NAMES[wd]} 끝`} className={inputClass} value={hours[wd].end} onChange={(e) => setDay(wd, 'end', e.target.value)} />
          </div>
        ))}
      </div>
      <p className="mt-4 mb-2 text-sm text-stone-500">학년별 선호 시간대: 이 시각 이후 새 반 시각을 위로 올리고 "선호"로 표시해요. 비우면 없음.</p>
      <div className="grid grid-cols-2 gap-2">
        {VACANCY_GRADES.map((g) => (
          <label key={g} className="flex items-center gap-2">
            <span className="w-9 shrink-0 text-base font-semibold">{gradeLabel(g)}</span>
            <input
              type="time"
              step={600}
              className={inputClass}
              value={pref[g] ?? ''}
              onChange={(e) => setPref((p) => ({ ...p, [g]: e.target.value || null }))}
            />
          </label>
        ))}
      </div>
      <Button
        variant="primary"
        className="mt-3 w-full"
        disabled={!dirty || bad}
        onClick={() => commit(updateSettings(data, { operatingHours: hours, gradePreferredAfter: pref }), '운영 시간을 저장했어요')}
      >
        저장
      </Button>
    </Card>
  );
}
