// 브리핑 탭(SPEC_briefing 5장). 주소: #/briefing(/<날짜>(/<반 id>)), #/briefing/texts(/<단계>)
import { BriefingHome } from './BriefingHome.tsx';
import { TextsPage } from './TextsPage.tsx';

export function BriefingPage({ params }: { params: string[] }) {
  const [first, second] = params;
  if (first === 'texts') return <TextsPage stage={second} />;
  return <BriefingHome dateParam={first} classParam={second} />;
}
