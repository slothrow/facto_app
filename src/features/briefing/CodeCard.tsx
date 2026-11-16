// 브리핑 화면 위쪽 카드: 반·수업월·주차 + 오늘 코드. 문구 부분(children)은 전체/개인 화면이 채운다.
import { navigate } from '../../app/router.ts';
import { Button, Card } from '../../components/ui.tsx';
import { formatTimeKo } from '../../engine/classTime.ts';
import { STAGE_NAMES } from '../../engine/curriculum.ts';
import type { ClassRow } from '../../storage/rosterTypes.ts';
import { courseMonthLabel } from '../curriculum/curriculumModel.ts';
import { classGradeLabel } from '../roster/rosterModel.ts';
import type { ClassBriefing } from './briefingModel.ts';

export function CodeCard({ b, cls, date, children }: { b: ClassBriefing; cls: ClassRow; date: string; children: React.ReactNode }) {
  const session = b.result.kind !== 'noSession' ? b.result : null;
  return (
    <Card>
      <p className="text-base text-stone-600">
        {formatTimeKo(cls.startTime)} {classGradeLabel(cls, date)}
        {session && <> · {courseMonthLabel(session.courseMonth)} {session.weekNo}주</>}
      </p>
      {b.result.kind === 'unset' ? (
        <div className="mt-2 space-y-2 rounded-xl bg-amber-50 p-3 text-amber-900">
          <p className="text-base font-semibold">이 반의 진도를 먼저 설정하세요.</p>
          <Button className="w-full" onClick={() => navigate(`/roster/class/${cls.id}`)}>
            반 진도 설정하러 가기
          </Button>
        </div>
      ) : b.result.kind === 'done' ? (
        <p className="mt-2 rounded-xl bg-stone-100 p-3 text-base">이 반은 과정 완료예요(S12 다음). 반 진도에서 기준점을 확인하세요.</p>
      ) : (
        <>
          <p className="mt-1 text-4xl font-extrabold tracking-tight text-emerald-800">{b.result.kind === 'code' ? b.result.code : STAGE_NAMES.basic}</p>
          {b.result.kind === 'basic' && <p className="text-lg font-semibold">{b.plan?.title || '(제목 없음)'}</p>}
          {children}
        </>
      )}
    </Card>
  );
}
