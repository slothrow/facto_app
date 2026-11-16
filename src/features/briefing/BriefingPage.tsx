// 브리핑 탭(SPEC_briefing 5장). 주소: #/briefing(/<날짜>(/<반 id>(/personal))), #/briefing/texts(/<단계>(/personal))
import { BriefingHome } from './BriefingHome.tsx';
import { TextsPage } from './TextsPage.tsx';

export function BriefingPage({ params }: { params: string[] }) {
  const [first, second, third] = params;
  if (first === 'texts') return <TextsPage stage={second} target={third} />;
  return <BriefingHome dateParam={first} classParam={second} modeParam={third} />;
}
