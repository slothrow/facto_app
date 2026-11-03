// 달력 만들기 탭. 3단계에서 구현한다.
import { Card } from '../../components/ui.tsx';

export function ExportPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">달력 만들기</h1>
      <Card>
        <p className="text-base text-stone-600">학부모 안내용 두 달 달력 이미지를 만드는 화면입니다. 다음 단계에서 만들어요.</p>
      </Card>
    </div>
  );
}
