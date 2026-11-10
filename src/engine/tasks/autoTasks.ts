// 자동 할 일(SPEC_home 4.3). 앱 데이터에서 규칙으로 계산한다. 순수 함수.
// 화면 쪽에서 필요한 사실(오늘 반별 출석·브리핑 상태 등)을 미리 계산해 AutoTaskInput으로 넘긴다.
import { monthIndex, ymFromIndex } from '../label.ts';
import type { Task } from './types.ts';

export interface RuleDef {
  key: string;
  label: string;
  /** 언제 뜨는지 설명 */
  when: string;
  /** 바꿀 수 있는 기준값 */
  params: Record<string, { label: string; value: number; min: number; max: number }>;
}

export const AUTO_RULES: RuleDef[] = [
  { key: 'calendar_export', label: '다음 두 달 안내 달력 만들기', when: '매월 n일부터, 다음 달이 들어간 안내 달력을 아직 안 만들었으면', params: { day: { label: '시작일', value: 20, min: 1, max: 28 } } },
  { key: 'month_confirm', label: '다음 달 수업 달력 확정', when: '매월 n일부터, 다음 달이 미확정이면', params: { day: { label: '시작일', value: 15, min: 1, max: 28 } } },
  { key: 'progress_missing', label: '진도 미설정 반', when: '이번 달 진도를 계산할 수 없는 운영 중인 반이 있으면', params: {} },
  { key: 'attendance_today', label: '출석 확인 안 한 반', when: '오늘 수업이 끝난 반 중 출석 확인 기록이 없으면', params: {} },
  { key: 'briefing_today', label: '브리핑 안 보낸 반', when: '오늘 수업이 끝난 반 중 안 보낸 아이(결석 제외)가 있으면', params: {} },
  { key: 'trial_followup', label: '체험 후 연락', when: '체험 n일 뒤부터', params: { days: { label: '체험 후 며칠', value: 1, min: 0, max: 14 } } },
  { key: 'counseling_next', label: '상담 연락', when: '상담 기록의 다음 연락일부터(새 상담 기록이 생기면 사라짐)', params: {} },
  { key: 'waitlist_followup', label: '대기자 후속 연락', when: '"문의"·"체험 완료"인 채로 n일 변화 없으면', params: { days: { label: '변화 없는 날', value: 7, min: 1, max: 60 } } },
  { key: 'needs_review', label: '확인 필요 학생', when: '"확인 필요" 표시된 학생이 있으면', params: {} },
  { key: 'availability_missing', label: '가능 시간 미입력', when: '11~2월에만, 재원생 중 가능 시간 미입력이 있으면', params: {} },
  { key: 'leave_return', label: '휴원 학생 복귀', when: '복귀일 n일 전부터', params: { daysBefore: { label: '며칠 전', value: 3, min: 0, max: 30 } } },
  { key: 'backup', label: '백업 내보내기', when: '매월 n일부터, 이번 달 백업 기록이 없으면', params: { day: { label: '시작일', value: 1, min: 1, max: 28 } } },
  { key: 'grade_transition', label: '새 학년도 반 학년 확인', when: '3월 1일부터 n일 동안', params: { days: { label: '며칠 동안', value: 7, min: 1, max: 31 } } },
];

export type TaskRules = Partial<Record<string, { enabled?: boolean; params?: Record<string, number> }>>;

const ruleOn = (rules: TaskRules, key: string) => rules[key]?.enabled !== false;
const param = (rules: TaskRules, key: string, name: string) =>
  rules[key]?.params?.[name] ?? AUTO_RULES.find((r) => r.key === key)!.params[name].value;

export interface TodayClassFact {
  id: string;
  /** "화 4:30 초1반" */
  label: string;
  startTime: string;
  checked: boolean;
  /** 안 보낸 아이 수(결석 제외) */
  unsent: number;
}

export interface AutoTaskInput {
  /** 지금 시각(분). 오늘 수업이 끝났는지 판단 */
  nowMinutes: number;
  /** 안내 달력 내보내기 기록의 시작 달(두 달짜리) */
  exportStartMonths: string[];
  confirmedMonths: string[];
  progressMissing: number;
  todayClasses: TodayClassFact[];
  trials: { id: string; date: string; name: string }[];
  /** 학생별 가장 최근 상담 기록 */
  counseling: { id: string; studentId: string; name: string; nextContactOn: string | null }[];
  waitlist: { id: string; name: string; stage: string; since: string }[];
  needsReview: number;
  availabilityMissing: number;
  /** 휴원 중인 학생과 복귀일(휴원 종료 다음 날) */
  returning: { id: string; name: string; returnOn: string }[];
  lastBackupAt: string | null;
}

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const CLASS_MINUTES = 50;
const dayOf = (date: string) => Number(date.slice(8, 10));
const ymName = (ym: string) => `${Number(ym.slice(5, 7))}월`;

export function buildAutoTasks(today: string, input: AutoTaskInput, rules: TaskRules = {}): Task[] {
  const out: Task[] = [];
  const ym = today.slice(0, 7);
  const next = ymFromIndex(monthIndex(ym) + 1);
  const monthDay = (d: number) => `${ym}-${String(d).padStart(2, '0')}`;
  const add = (rule: string, t: Omit<Task, 'kind' | 'rule'>) => {
    if (ruleOn(rules, rule)) out.push({ ...t, kind: 'auto', rule });
  };

  // 안내 달력: 다음 달이 들어간(시작 달이 다음 달 또는 이번 달) 내보내기 기록이 없으면
  const exportDay = param(rules, 'calendar_export', 'day');
  const hasExport = input.exportStartMonths.some((m) => m === next || ymFromIndex(monthIndex(m) + 1) === next);
  if (dayOf(today) >= exportDay && !hasExport) {
    add('calendar_export', { key: `auto:calendar_export:${next}`, title: `${ymName(next)}이 들어간 안내 달력 만들기`, due: monthDay(exportDay), link: '/export', autoResolve: true });
  }

  const confirmDay = param(rules, 'month_confirm', 'day');
  if (dayOf(today) >= confirmDay && !input.confirmedMonths.includes(next)) {
    add('month_confirm', { key: `auto:month_confirm:${next}`, title: `${ymName(next)} 수업 달력 확정`, due: monthDay(confirmDay), link: `/plan/${next}`, autoResolve: true });
  }

  if (input.progressMissing > 0) {
    add('progress_missing', { key: `auto:progress_missing:${ym}`, title: `진도 미설정 반 ${input.progressMissing}개`, due: today, link: '/roster/classes', autoResolve: true });
  }

  const ended = input.todayClasses.filter((c) => toMin(c.startTime) + CLASS_MINUTES <= input.nowMinutes);
  const notChecked = ended.filter((c) => !c.checked);
  if (notChecked.length > 0) {
    add('attendance_today', {
      key: `auto:attendance_today:${today}`,
      title: `출석 확인 안 한 반 ${notChecked.length}개`,
      detail: notChecked.map((c) => c.label).join(', '),
      due: today,
      link: `/attend/${today}`,
      autoResolve: true,
    });
  }
  const unsent = ended.filter((c) => c.unsent > 0);
  if (unsent.length > 0) {
    add('briefing_today', {
      key: `auto:briefing_today:${today}`,
      title: `브리핑 안 보낸 반 ${unsent.length}개`,
      detail: unsent.map((c) => `${c.label} ${c.unsent}명`).join(', '),
      due: today,
      link: `/briefing/${today}`,
      autoResolve: true,
    });
  }

  const trialDays = param(rules, 'trial_followup', 'days');
  for (const t of input.trials) {
    const from = addDays(t.date, trialDays);
    if (from <= today && t.date >= addDays(today, -60)) {
      add('trial_followup', { key: `auto:trial_followup:${t.id}`, title: `체험 후 연락: ${t.name}`, due: from, link: '/roster/waitlist' });
    }
  }

  for (const c of input.counseling) {
    if (c.nextContactOn && c.nextContactOn <= today) {
      add('counseling_next', { key: `auto:counseling_next:${c.id}`, title: `상담 연락: ${c.name}`, due: c.nextContactOn, link: `/roster/student/${c.studentId}` });
    }
  }

  const waitDays = param(rules, 'waitlist_followup', 'days');
  for (const w of input.waitlist) {
    if ((w.stage === 'inquiry' || w.stage === 'trial_done') && addDays(w.since, waitDays) <= today) {
      // 단계가 바뀌면 since가 바뀌어 키도 바뀐다(이전 건은 저절로 사라짐)
      add('waitlist_followup', { key: `auto:waitlist_followup:${w.id}:${w.stage}:${w.since}`, title: `대기자 후속 연락: ${w.name}`, due: addDays(w.since, waitDays), link: `/roster/waitlist/${w.id}` });
    }
  }

  if (input.needsReview > 0) {
    add('needs_review', { key: `auto:needs_review:${ym}`, title: `확인 필요 학생 ${input.needsReview}명`, due: today, link: '/roster/students', autoResolve: true });
  }

  const month = Number(ym.slice(5, 7));
  if ((month >= 11 || month <= 2) && input.availabilityMissing > 0) {
    add('availability_missing', { key: `auto:availability_missing:${ym}`, title: `가능 시간 미입력 ${input.availabilityMissing}명`, due: today, link: '/roster/students', autoResolve: true });
  }

  const before = param(rules, 'leave_return', 'daysBefore');
  for (const r of input.returning) {
    const from = addDays(r.returnOn, -before);
    if (from <= today && r.returnOn >= addDays(today, -14)) {
      add('leave_return', { key: `auto:leave_return:${r.id}:${r.returnOn}`, title: `휴원 학생 복귀: ${r.name}`, due: r.returnOn, visibleFrom: from, link: `/roster/student/${r.id}` });
    }
  }

  const backupDay = param(rules, 'backup', 'day');
  if (dayOf(today) >= backupDay && !(input.lastBackupAt && input.lastBackupAt.slice(0, 7) >= ym)) {
    add('backup', { key: `auto:backup:${ym}`, title: '백업 내보내기', due: monthDay(backupDay), link: '/settings', autoResolve: true });
  }

  const gtDays = param(rules, 'grade_transition', 'days');
  const march1 = `${today.slice(0, 4)}-03-01`;
  if (today >= march1 && today < addDays(march1, gtDays)) {
    add('grade_transition', { key: `auto:grade_transition:${today.slice(0, 4)}`, title: '새 학년도 반 학년 확인', due: march1, link: '/roster/classes' });
  }

  return out;
}
