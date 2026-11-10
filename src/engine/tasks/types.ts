// 할 일 공통 타입(SPEC_home 4장).
import type { TaskCategory } from '../../storage/rosterTypes.ts';

export type TaskKind = 'auto' | 'tpl' | 'manual';

export interface Task {
  /** 고유 키: auto:calendar_export:2027-01, tpl:<id>:2027-02-10, manual:<id> */
  key: string;
  kind: TaskKind;
  title: string;
  /** 기한 'YYYY-MM-DD' */
  due: string;
  /** 이 날부터 보인다(반복 할 일의 미리 표시). 없으면 기한 14일 전부터(다가오는 일) */
  visibleFrom?: string;
  /** 짧은 설명(예: 반 이름 목록) */
  detail?: string;
  /** 누르면 갈 화면 */
  link?: string;
  category?: TaskCategory | null;
  /** 자동 할 일 규칙 키 */
  rule?: string;
  /** 조건이 풀리면 저절로 사라지는 자동 할 일(완료 버튼 대신 숨기기·미루기만 필요) */
  autoResolve?: boolean;
  /** 반복 할 일: 지난번 메모(매년이면 작년 메모) */
  lastMemo?: string | null;
}
