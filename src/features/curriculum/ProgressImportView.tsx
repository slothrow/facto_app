// 진도 일괄 입력 화면(SPEC_briefing 3.5). 주소: #/roster/progress-import
// 붙여넣기 → 미리보기 → 저장. [양식 내려받기]는 운영 중인 반 목록이 채워진 CSV.
import { useMemo, useState } from 'react';
import { useAppData } from '../../app/AppDataContext.tsx';
import { navigate } from '../../app/router.ts';
import { todayStr, useRoster } from '../../app/RosterContext.tsx';
import { ChevronLeft } from '../../components/icons.tsx';
import { Button, Card, inputClass } from '../../components/ui.tsx';
import { downloadBlob } from '../export/imageExport.ts';
import { WEEKDAY_NAMES, classGradeLabel } from '../roster/rosterModel.ts';
import { courseMonthFull, curriculumOf, currentSessionByWeekday } from './curriculumModel.ts';
import { buildProgressImport, progressImportChange, progressTemplateCsv, stageText } from './progressImport.ts';

export function ProgressImportView() {
  const { data } = useAppData();
  const { roster, mutate } = useRoster();
  const today = todayStr();
  const settings = curriculumOf(data);
  const [text, setText] = useState('');
  const rows = useMemo(() => buildProgressImport(text, roster, settings, today), [text, roster, settings, today]);
  const ok = rows.filter((r) => !r.error);
  const bad = rows.filter((r) => r.error);

  const downloadTemplate = () => {
    const current = currentSessionByWeekday(data, today);
    const csv = progressTemplateCsv(roster.classes, today, (c) => current.get(c.weekday)?.courseMonth ?? today.slice(0, 7));
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'class_progress_template.csv');
  };

  const save = async () => {
    if (ok.length === 0) return;
    if (await mutate(progressImportChange(rows), `기준점 ${ok.length}개를 저장했어요`)) setText('');
  };

  return (
    <div className="space-y-4">
      <button type="button" onClick={() => navigate('/roster/classes/list')} className="flex h-12 shrink-0 items-center gap-1 rounded-xl border border-stone-300 bg-white pr-4 pl-2 text-lg font-semibold text-stone-800 shadow-sm active:bg-stone-100">
        <ChevronLeft className="h-7 w-7" /> 반 목록
      </button>
      <h1 className="text-xl font-bold">진도 일괄 입력</h1>

      <Card>
        <ol className="list-decimal space-y-1 pl-5 text-base text-stone-700">
          <li>[양식 내려받기]로 반 목록 파일을 받아요.</li>
          <li>엑셀에서 단계(베이직·K·P·A·B·S)와 단원(1~12)을 채워요. 단원 중간에서 시작하면 "3-2"처럼 주차까지 써요. 수업월은 그 진도를 한 수업월이에요.</li>
          <li>표 전체를 복사해서 아래에 붙여넣고 [저장]을 눌러요.</li>
        </ol>
        <Button className="mt-3 w-full" onClick={downloadTemplate}>
          양식 내려받기 (CSV)
        </Button>
      </Card>

      <textarea
        className={`${inputClass} min-h-40 py-2 font-mono text-sm`}
        placeholder={'요일,시작시간,수업월,단계,단원\n화,16:30,2026-12,P,8'}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      {rows.length > 0 && (
        <Card title={`미리보기 · 저장 ${ok.length}줄${bad.length ? ` · 오류 ${bad.length}줄` : ''}`}>
          <ul className="divide-y divide-stone-100">
            {rows.map((r) => (
              <li key={r.line} className={`py-2 text-base ${r.error ? 'text-red-800' : ''}`}>
                <span className="mr-2 text-sm text-stone-400">{r.line}줄</span>
                {r.error ? (
                  <>
                    <span className="text-stone-500">{r.raw.join(', ')}</span> — <b>{r.error}</b>
                  </>
                ) : (
                  <>
                    <b>
                      {WEEKDAY_NAMES[r.cls!.weekday]} {r.cls!.startTime}
                    </b>{' '}
                    <span className="text-stone-600">{classGradeLabel(r.cls!, today)}</span> · {courseMonthFull(r.courseMonth!)} ={' '}
                    <b className="text-emerald-800">{stageText(r.stage!, r.unit, settings, r.unitWeek)}</b>
                    {r.existing && <span className="ml-1 text-sm text-amber-700">(있던 기준점 {stageText(r.existing.stage, r.existing.unit, settings, r.existing.unitWeek ?? 1)} 바꿈)</span>}
                    {r.note && <span className="ml-1 text-sm text-sky-700">({r.note})</span>}
                  </>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Button variant="primary" className="w-full" disabled={ok.length === 0} onClick={() => void save()}>
        {ok.length > 0 ? `${ok.length}개 저장` : '저장'}
      </Button>
    </div>
  );
}
