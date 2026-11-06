// 반·학생 탭. 상단 전환: [반] [학생] [대기자]
// 주소: #/roster/classes, #/roster/students, #/roster/waitlist, #/roster/class/<id>, #/roster/student/<id>
// (주소에는 id만 넣는다. 이름은 넣지 않는다)
import type { ReactNode } from 'react';
import { navigate } from '../../app/router.ts';
import { ClassDetail } from './classes/ClassDetail.tsx';
import { ClassListView } from './classes/ClassListView.tsx';
import { StudentCard } from './students/StudentCard.tsx';
import { StudentListView } from './students/StudentListView.tsx';
import { WaitlistView } from './waitlist/WaitlistView.tsx';
import { ProgressImportView } from '../curriculum/ProgressImportView.tsx';

const SECTIONS = [
  { id: 'classes', label: '시간표' },
  { id: 'students', label: '학생' },
  { id: 'waitlist', label: '대기자' },
] as const;

export function RosterPage({ params }: { params: string[] }) {
  const [view = 'classes', id, ...rest] = params;

  let section: (typeof SECTIONS)[number]['id'] = 'classes';
  let body: ReactNode;
  if (view === 'progress-import') {
    body = <ProgressImportView />;
  } else if (view === 'class' && id) {
    body = <ClassDetail classId={id} />;
  } else if (view === 'student' && id) {
    section = 'students';
    body = <StudentCard key={id} studentId={id} mode={rest[0]} />;
  } else if (view === 'students') {
    section = 'students';
    body = <StudentListView filterParam={id} />;
  } else if (view === 'waitlist') {
    section = 'waitlist';
    body = <WaitlistView itemId={id} mode={rest[0]} />;
  } else {
    body = <ClassListView mode={id} />;
  }

  return (
    <div className="space-y-4">
      <div role="tablist" className="grid grid-cols-3 gap-1 rounded-2xl bg-stone-200/70 p-1 md:max-w-md">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={section === s.id}
            onClick={() => navigate(`/roster/${s.id}`)}
            className={`h-11 rounded-xl text-base font-semibold ${
              section === s.id ? 'bg-white text-emerald-800 shadow-sm' : 'text-stone-600'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      {body}
    </div>
  );
}
