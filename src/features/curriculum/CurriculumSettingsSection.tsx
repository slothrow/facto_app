// 설정 > 교육과정(SPEC_briefing 2장, 9장): 단계 순서(고정), 단계 코드 접두어, 단계별 기본 학년, [진도 일괄 입력].
import { useState } from 'react';
import { useAppData } from '../../app/AppDataContext.tsx';
import { updateSettings } from '../../app/mutations.ts';
import { navigate } from '../../app/router.ts';
import { Button, Card, inputClass } from '../../components/ui.tsx';
import { STAGES, STAGE_NAMES, UNIT_STAGES, type CurriculumSettings, type StageId } from '../../engine/curriculum.ts';
import { gradeOptions } from '../../engine/grade.ts';
import { curriculumOf } from './curriculumModel.ts';

export function CurriculumSettingsSection() {
  const { data, commit } = useAppData();
  const saved = curriculumOf(data);
  const [draft, setDraft] = useState<CurriculumSettings>(saved);
  const set = (s: StageId, patch: Partial<CurriculumSettings[StageId]>) => setDraft((d) => ({ ...d, [s]: { ...d[s], ...patch } }));

  const prefixes = UNIT_STAGES.map((s) => draft[s].prefix.trim().toUpperCase());
  const error = prefixes.some((p) => !p)
    ? 'K~S 단계 코드는 비울 수 없어요.'
    : new Set(prefixes).size !== prefixes.length
      ? '단계 코드가 서로 겹치면 안 돼요.'
      : prefixes.some((p) => /[\d-]/.test(p))
        ? '단계 코드에는 숫자나 -를 쓸 수 없어요.'
        : null;
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const save = () => {
    const clean = Object.fromEntries(STAGES.map((s) => [s, { prefix: draft[s].prefix.trim(), gradeCode: draft[s].gradeCode }])) as CurriculumSettings;
    void commit(updateSettings(data, { curriculum: clean }), '교육과정 설정을 저장했어요');
  };

  return (
    <Card title="교육과정">
      <p className="mb-2 text-sm text-stone-600">순서는 고정이에요: 베이직 → K → P → A → B → S. 한 달 진도(4번 수업) = 한 단원(12단원 다음은 다음 단계).</p>
      <div className="grid grid-cols-[4rem_1fr_1fr] items-center gap-2 text-base">
        <span className="text-sm font-semibold text-stone-500">단계</span>
        <span className="text-sm font-semibold text-stone-500">코드 앞 글자</span>
        <span className="text-sm font-semibold text-stone-500">기본 학년</span>
        {STAGES.map((s) => (
          <Row key={s} stage={s} value={draft[s]} onChange={(patch) => set(s, patch)} />
        ))}
      </div>
      <p className="mt-2 text-sm text-stone-500">베이직은 단원 없이 날짜별로 수업 내용을 적어요(브리핑 → 문구 관리 → 베이직).</p>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <Button variant="primary" className="mt-3 w-full" disabled={!dirty || !!error} onClick={save}>
        저장
      </Button>
      <Button className="mt-2 w-full" onClick={() => navigate('/roster/progress-import')}>
        반 진도 일괄 입력
      </Button>
    </Card>
  );
}

function Row({
  stage,
  value,
  onChange,
}: {
  stage: StageId;
  value: CurriculumSettings[StageId];
  onChange: (patch: Partial<CurriculumSettings[StageId]>) => void;
}) {
  return (
    <>
      <span className="font-semibold">{STAGE_NAMES[stage]}</span>
      {stage === 'basic' ? (
        <span className="text-sm text-stone-500">코드 없음</span>
      ) : (
        <input className={inputClass} value={value.prefix} maxLength={6} onChange={(e) => onChange({ prefix: e.target.value })} aria-label={`${stage} 단계 코드`} />
      )}
      <select
        className={inputClass}
        value={value.gradeCode ?? ''}
        onChange={(e) => onChange({ gradeCode: e.target.value === '' ? null : Number(e.target.value) })}
        aria-label={`${STAGE_NAMES[stage]} 기본 학년`}
      >
        <option value="">없음</option>
        {gradeOptions().map((g) => (
          <option key={g.code} value={g.code}>
            {g.label}
          </option>
        ))}
      </select>
    </>
  );
}
