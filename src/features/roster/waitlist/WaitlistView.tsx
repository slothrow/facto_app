import { Card } from '../../../components/ui.tsx';

export function WaitlistView(_props: { itemId?: string; mode?: string }) {
  return (
    <Card>
      <p className="text-base text-stone-600">대기자 화면은 다음 단계에서 만들어요.</p>
    </Card>
  );
}
