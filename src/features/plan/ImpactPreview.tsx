// 적용 전 영향 미리보기 + [적용]/[취소]
import { Button } from '../../components/ui.tsx';

export function ImpactPreview({
  title,
  lines,
  note,
  onApply,
  onCancel,
}: {
  title: string;
  lines: string[];
  note?: string;
  onApply: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
        <p className="mb-2 font-bold text-amber-900">{title}</p>
        <ul className="space-y-1 text-base text-stone-800">
          {lines.map((l) => (
            <li key={l} className={l.startsWith('새 경고') ? 'text-red-700' : ''}>
              · {l}
            </li>
          ))}
        </ul>
        {note && <p className="mt-2 text-sm text-stone-500">{note}</p>}
      </div>
      <div className="flex gap-2">
        <Button onClick={onCancel} className="flex-1">
          취소
        </Button>
        <Button variant="primary" onClick={onApply} className="flex-1">
          적용
        </Button>
      </div>
    </div>
  );
}
