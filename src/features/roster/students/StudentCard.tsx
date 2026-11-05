import { Card } from '../../../components/ui.tsx';

export function StudentCard(_props: { studentId: string }) {
  return (
    <Card>
      <p className="text-base text-stone-600">학생 카드는 다음 단계에서 만들어요.</p>
    </Card>
  );
}
