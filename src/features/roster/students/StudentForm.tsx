// 학생 정보 전체 수정(SPEC 4.1). 이름만 필수.
import { useState, type ReactNode } from 'react';
import { todayStr, useRoster } from '../../../app/RosterContext.tsx';
import { BottomSheet, Button, Field, inputClass } from '../../../components/ui.tsx';
import { gradeCodeOn, gradeLabel, gradeOptions, gradeToStore } from '../../../engine/grade.ts';
import type { Weekday } from '../../../engine/types.ts';
import type { Availability, Guardian, GuardianRelation, SiblingRow, StudentRow } from '../../../storage/rosterTypes.ts';
import { CLASS_WEEKDAYS, WEEKDAY_NAMES } from '../rosterModel.ts';
import { RELATION_LABEL, digitsOnly, formatPhone, matchesName, siblingPair, siblingsOf } from './studentModel.ts';

interface PickedContact {
  name?: string[];
  tel?: string[];
}
interface ContactsApi {
  select: (props: string[], opts?: { multiple?: boolean }) => Promise<PickedContact[]>;
}
const contactsApi = (): ContactsApi | null => {
  const nav = navigator as Navigator & { contacts?: ContactsApi };
  return 'ContactsManager' in window && nav.contacts ? nav.contacts : null;
};

/** 폰 연락처에서 하나 고르기(SPEC 5.3). 지원하지 않는 브라우저에서는 버튼을 숨긴다 */
export function ContactPickButton({ onPick }: { onPick: (c: { name: string; phone: string }) => void }) {
  const api = contactsApi();
  if (!api) return null;
  return (
    <Button
      className="shrink-0"
      onClick={async () => {
        try {
          const [c] = await api.select(['name', 'tel'], { multiple: false });
          if (c) onPick({ name: c.name?.[0] ?? '', phone: digitsOnly(c.tel?.[0] ?? '') });
        } catch {
          /* 사용자가 취소함 */
        }
      }}
    >
      연락처에서 선택
    </Button>
  );
}

export function StudentForm({ student, onClose }: { student: StudentRow; onClose: () => void }) {
  const { roster, mutate } = useRoster();
  const today = todayStr();
  const [s, setS] = useState<StudentRow>(student);
  const [gradePick, setGradePick] = useState<number | ''>(gradeCodeOn({ ...student, birthday: null }, today) ?? '');
  const [siblings, setSiblings] = useState<string[]>(siblingsOf(roster, student.id));
  const [sibQuery, setSibQuery] = useState('');
  const set = <K extends keyof StudentRow>(k: K, v: StudentRow[K]) => setS((p) => ({ ...p, [k]: v }));
  const txt = (v: string) => (v.trim() ? v : null);

  const guardians: Guardian[] = s.guardians.length ? s.guardians : [];
  const setGuardian = (i: number, g: Partial<Guardian>) => {
    let list = guardians.map((x, j) => (j === i ? { ...x, ...g } : x));
    if (g.isPrimary) list = list.map((x, j) => ({ ...x, isPrimary: j === i }));
    set('guardians', list);
  };

  // 생일 기준 학년과 입력한 학년이 다르면 알려 준다(SPEC 2.2)
  const byBirthday = s.birthday ? gradeCodeOn(s, today) : null;
  const byInput = gradeCodeOn({ ...s, birthday: null }, today);
  const differs = byBirthday !== null && byInput !== null && byBirthday !== byInput;

  const save = async () => {
    const next: StudentRow = { ...s, name: s.name.trim() };
    if (gradePick !== '') {
      const keep = gradeCodeOn({ ...student, birthday: null }, today) === gradePick;
      if (!keep) Object.assign(next, gradeToStore(gradePick, today));
    } else Object.assign(next, { gradeCode: null, gradeBasisYear: null });
    next.guardians = guardians.filter((g) => g.name || g.phone).map((g) => ({ ...g, phone: digitsOnly(g.phone) }));
    if (next.guardians.length && !next.guardians.some((g) => g.isPrimary)) next.guardians[0].isPrimary = true;
    next.studentPhone = next.studentPhone ? digitsOnly(next.studentPhone) || null : null;

    const before = new Set(siblingsOf(roster, student.id));
    const after = new Set(siblings);
    const addPairs: SiblingRow[] = [...after].filter((x) => !before.has(x)).map((x) => siblingPair(student.id, x));
    const removePairs: SiblingRow[] = [...before].filter((x) => !after.has(x)).map((x) => siblingPair(student.id, x));
    const ok = await mutate({ upsert: { students: [next], siblings: addPairs }, remove: { siblings: removePairs } }, '학생 정보를 저장했어요');
    if (ok) onClose();
  };

  const toggleDay = (wd: Weekday) => {
    const a: Availability = { ...s.availability };
    if (wd in a) delete a[wd];
    else a[wd] = null;
    set('availability', a);
  };

  const sibCandidates = sibQuery
    ? roster.students.filter((x) => x.id !== student.id && !siblings.includes(x.id) && matchesName(x.name, sibQuery)).slice(0, 6)
    : [];

  return (
    <BottomSheet title="학생 정보 수정" onClose={onClose}>
      <div className="space-y-5">
        <Section title="기본">
          <Field label="이름 *">
            <input className={inputClass} value={s.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="성별">
              <select className={inputClass} value={s.gender ?? ''} onChange={(e) => set('gender', (e.target.value || null) as StudentRow['gender'])}>
                <option value="">-</option>
                <option value="M">남</option>
                <option value="F">여</option>
              </select>
            </Field>
            <Field label="생일">
              <input type="date" className={inputClass} value={s.birthday ?? ''} onChange={(e) => set('birthday', e.target.value || null)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={s.birthday ? '학년(생일로 계산)' : '학년'}>
              {s.birthday ? (
                <div className="flex min-h-11 items-center px-1 text-base font-semibold">{gradeLabel(byBirthday)}</div>
              ) : (
                <select className={inputClass} value={gradePick} onChange={(e) => setGradePick(e.target.value === '' ? '' : Number(e.target.value))}>
                  <option value="">미정</option>
                  {gradeOptions().map((g) => (
                    <option key={g.code} value={g.code}>
                      {g.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="학년 보정">
              <select className={inputClass} value={s.gradeAdjust} onChange={(e) => set('gradeAdjust', Number(e.target.value))}>
                <option value={0}>없음</option>
                <option value={1}>조기입학 +1</option>
                <option value={-1}>유예 -1</option>
              </select>
            </Field>
          </div>
          {differs && (
            <p className="rounded-xl bg-amber-50 p-3 text-base text-amber-900">
              생일 기준 학년({gradeLabel(byBirthday)})이 전에 입력한 학년({gradeLabel(byInput)})과 달라요. 앞으로는 생일 기준으로 계산해요.
            </p>
          )}
          <Field label="다니는 학교·유치원">
            <input className={inputClass} value={s.school ?? ''} onChange={(e) => set('school', txt(e.target.value))} />
          </Field>
          <Field label="카톡 검색어" hint="카톡 대화방을 찾을 때 쓰는 말(예: 홍길동 7세). 비우면 이름으로 찾아요.">
            <input className={inputClass} value={s.kakaoSearch ?? ''} placeholder={s.name || '이름'} onChange={(e) => set('kakaoSearch', txt(e.target.value))} />
          </Field>
        </Section>

        <Section title="연락처">
          {[0, 1].map((i) => {
            const g = guardians[i];
            if (!g && i > guardians.length) return null;
            if (!g)
              return (
                <Button
                  key={i}
                  className="w-full"
                  onClick={() => set('guardians', [...guardians, { name: '', relation: i === 0 ? 'mom' : 'dad', phone: '', isPrimary: guardians.length === 0 }])}
                >
                  + 학부모 연락처 추가
                </Button>
              );
            return (
              <div key={i} className="space-y-2 rounded-xl border border-stone-200 p-3">
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-sm font-semibold text-stone-600">학부모 {i + 1}</span>
                  <ContactPickButton onPick={(c) => setGuardian(i, { name: c.name, phone: c.phone })} />
                </div>
                <div className="grid grid-cols-[1fr_6rem] gap-2">
                  <input className={inputClass} placeholder="이름" value={g.name} onChange={(e) => setGuardian(i, { name: e.target.value })} />
                  <select className={inputClass} value={g.relation} onChange={(e) => setGuardian(i, { relation: e.target.value as GuardianRelation })}>
                    {(Object.keys(RELATION_LABEL) as GuardianRelation[]).map((r) => (
                      <option key={r} value={r}>
                        {RELATION_LABEL[r]}
                      </option>
                    ))}
                  </select>
                </div>
                <input
                  className={inputClass}
                  inputMode="tel"
                  placeholder="010-0000-0000"
                  value={formatPhone(g.phone)}
                  onChange={(e) => setGuardian(i, { phone: digitsOnly(e.target.value) })}
                />
                <div className="flex items-center justify-between">
                  <label className="flex min-h-11 items-center gap-2 text-base">
                    <input type="radio" checked={g.isPrimary} onChange={() => setGuardian(i, { isPrimary: true })} className="h-5 w-5" />
                    대표 연락처
                  </label>
                  <Button variant="ghost" className="text-red-700" onClick={() => set('guardians', guardians.filter((_, j) => j !== i))}>
                    삭제
                  </Button>
                </div>
              </div>
            );
          })}
          <Field label="학생 본인 연락처">
            <input
              className={inputClass}
              inputMode="tel"
              value={formatPhone(s.studentPhone)}
              onChange={(e) => set('studentPhone', digitsOnly(e.target.value) || null)}
            />
          </Field>
          <Field label="주소">
            <input className={inputClass} value={s.address ?? ''} onChange={(e) => set('address', txt(e.target.value))} />
          </Field>
        </Section>

        <Section title="일정·상태">
          <div className="grid grid-cols-2 gap-3">
            <Field label="등록일">
              <input type="date" className={inputClass} value={s.registeredOn ?? ''} onChange={(e) => set('registeredOn', e.target.value || null)} />
            </Field>
            <Field label="첫 수업일">
              <input type="date" className={inputClass} value={s.firstClassOn ?? ''} onChange={(e) => set('firstClassOn', e.target.value || null)} />
            </Field>
          </div>
          <Field label="상태">
            <select
              className={inputClass}
              value={s.status}
              onChange={(e) => setS((p) => ({ ...p, status: e.target.value as StudentRow['status'], statusFrom: p.statusFrom ?? today }))}
            >
              <option value="active">재원</option>
              <option value="paused">휴원</option>
              <option value="left">퇴원</option>
            </select>
          </Field>
          {s.status === 'paused' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="휴원 시작">
                <input type="date" className={inputClass} value={s.statusFrom ?? ''} onChange={(e) => set('statusFrom', e.target.value || null)} />
              </Field>
              <Field label="휴원 종료">
                <input type="date" className={inputClass} value={s.statusTo ?? ''} onChange={(e) => set('statusTo', e.target.value || null)} />
              </Field>
            </div>
          )}
          {s.status === 'left' && (
            <>
              <Field label="퇴원일">
                <input type="date" className={inputClass} value={s.statusFrom ?? ''} onChange={(e) => set('statusFrom', e.target.value || null)} />
              </Field>
              <Field label="퇴원 사유">
                <input className={inputClass} value={s.leaveReason ?? ''} onChange={(e) => set('leaveReason', txt(e.target.value))} />
              </Field>
            </>
          )}
          <div>
            <span className="mb-1 block text-sm font-medium text-stone-600">가능 시간</span>
            <div className="space-y-2">
              {CLASS_WEEKDAYS.map((wd) => {
                const on = wd in s.availability;
                return (
                  <div key={wd} className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleDay(wd)}
                      className={`h-11 w-11 shrink-0 rounded-full border text-base ${on ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-stone-300 bg-white'}`}
                    >
                      {WEEKDAY_NAMES[wd]}
                    </button>
                    {on && (
                      <input
                        type="time"
                        step={600}
                        className={inputClass}
                        value={s.availability[wd] ?? ''}
                        onChange={(e) => set('availability', { ...s.availability, [wd]: e.target.value || null })}
                        aria-label={`${WEEKDAY_NAMES[wd]}요일 몇 시 이후`}
                      />
                    )}
                    {on && <span className="shrink-0 text-sm text-stone-500">이후</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </Section>

        <Section title="형제자매">
          <div className="flex flex-wrap gap-2">
            {siblings.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setSiblings(siblings.filter((x) => x !== id))}
                className="min-h-11 rounded-full bg-stone-100 px-3 text-base"
              >
                {roster.students.find((x) => x.id === id)?.name ?? '?'} ✕
              </button>
            ))}
          </div>
          <input className={inputClass} placeholder="이름으로 찾아서 연결" value={sibQuery} onChange={(e) => setSibQuery(e.target.value)} />
          {sibCandidates.map((x) => (
            <Button
              key={x.id}
              className="w-full text-left"
              onClick={() => {
                setSiblings([...siblings, x.id]);
                setSibQuery('');
              }}
            >
              {x.name} 연결
            </Button>
          ))}
        </Section>

        <Section title="특이사항">
          <textarea
            className={`${inputClass} min-h-24 py-2`}
            placeholder="학생 카드 맨 위에 항상 보여요"
            value={s.notice ?? ''}
            onChange={(e) => set('notice', txt(e.target.value))}
          />
          <label className="flex min-h-11 items-center gap-2 text-base">
            <input type="checkbox" className="h-5 w-5" checked={s.needsReview} onChange={(e) => set('needsReview', e.target.checked)} />
            확인 필요 표시
          </label>
        </Section>

        <Button variant="primary" className="w-full" disabled={!s.name.trim()} onClick={save}>
          저장
        </Button>
      </div>
    </BottomSheet>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="border-b border-stone-200 pb-1 text-base font-bold text-stone-800">{title}</h3>
      {children}
    </section>
  );
}
