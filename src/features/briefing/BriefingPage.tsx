// 브리핑 탭(SPEC_briefing 5장). 주소: #/briefing(/<날짜>(/<반 id>)), #/briefing/texts(/<단계>)
import { navigate } from '../../app/router.ts';
import { Button, Card } from '../../components/ui.tsx';
import { TextsPage } from './TextsPage.tsx';

export function BriefingPage({ params }: { params: string[] }) {
  const [first, second] = params;
  if (first === 'texts') return <TextsPage stage={second} />;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="flex-1 text-xl font-bold">수업 후 브리핑</h1>
        <Button onClick={() => navigate('/briefing/texts')}>문구 관리</Button>
      </div>
      <Card>
        <p className="text-base text-stone-600">브리핑 화면은 준비 중이에요.</p>
      </Card>
    </div>
  );
}
