-- 8단계: 반 학년을 비워 둘 수 있게(초기 명단에 학년 메모가 없는 반이 있음, SPEC_students 12장).
-- 비어 있으면 화면에 "학년 미정"으로 표시하고 원장이 반 수정에서 채운다.
alter table public.classes alter column grade_code drop not null;
alter table public.classes alter column grade_basis_year drop not null;
