# CHANGELOG

## Sprint DB-2 Foreign Key Audit & Integrity

-   실제 CSV 기준 FK가 `project_files.project_id -> projects.id` 1개뿐임을 재확인
-   `tasks.project_id`, `shipments.project_id`, `shipments.task_id`, `activity_logs.project_id` 코드 관계를 조회/생성/수정/삭제 기준으로 문서화
-   FK 추가 시 권장 정책을 `RESTRICT`와 `SET NULL` 중심으로 정리
-   orphan 데이터 점검용 preflight query와 주석 처리된 FK migration 초안 추가
-   원격 Supabase에는 FK를 생성하지 않음

## Sprint DB-1 Employees Schema Alignment

-   `employees.department` 사용처를 확인하고 실제 입력/저장/검색/표시에 사용 중인 컬럼으로 판단
-   `supabase/migrations/20260716130000_add_department_to_employees.sql` 추가
-   직원 수정/활성 상태 변경 payload에서 불필요한 `updated_at` 저장 제거
-   `employees.updated_at`은 화면 표시, 검색, 정렬에 사용되지 않아 migration 대상에서 제외
-   `docs/DATABASE.md`, `docs/PROJECT_CONTEXT.md`에 employees 정합성 판단 반영

## Sprint F-2 Project Files Foundation

-   `supabase/migrations/20260714162000_create_project_files.sql` 추가
-   `project_files` 메타데이터 테이블 구조 추가
-   `project-files` private Storage bucket 생성 기준 추가
-   로그인 사용자 조회/업로드, admin 삭제 RLS 정책 추가
-   signed URL 기반 열기/다운로드 정책 문서화

## Sprint DOC-FIX Dashboard Policy

-   TO DO LIST 계산 기준을 로그인 사용자 본인 업무로 고정
-   admin 계정에서도 TO DO LIST는 본인 업무만 표시
-   Dashboard 한글 UI 문자열 깨짐 복구

## Sprint 7-2B Dashboard Cleanup

-   오늘 할 일 섹션 제거
-   오늘 할 일 상세 영역 제거
-   큰 전체 진행률 영역 제거
-   전체 진행률 KPI 카드 추가
-   Dashboard 섹션 순서 정리

## Sprint 7-FIX-1 Team Workspace

-   TEAM WORKSPACE 대표 업무 key 중복 경고 수정
-   representativeTasks에 task id 포함
-   대표 업무 렌더링 key 기준을 task.id로 안정화

## Sprint 6.5 Technical Debt

-   lib/status.ts 신규 생성
-   Project status 유틸 이동
-   Task status 유틸 이동
-   app/page.tsx, app/projects/[id]/page.tsx, app/projects/page.tsx import 전환

## Sprint 6 My Work

-   app/page.tsx에 My Work 계산값 추가
-   Dashboard에 My Work UI 영역 추가
-   업무 항목 클릭 시 프로젝트 상세 이동 링크 추가
-   app/page.tsx의 My Work 제목을 TO DO LIST로 변경
-   myTodayStartTasks, myInProgressTasks 제거
-   TO DO LIST 표시 항목 3개로 축소
-   lg:grid-cols-3 적용
-   TO DO LIST 지연 업무 정렬 기준 추가
-   TO DO LIST 이번 주 마감 정렬 기준 추가
-   최대 3개 표시 로직 유지

## Sprint 5.5 Task UX

-   업무 목록 compact UI 조정
-   종료일 셀에 D-Day/지연 badge 추가
-   완료 업무 badge 미표시 처리

## Sprint 5 Project Workspace

-   Project Overview 계산값 추가
-   Project Overview UI 추가
-   Overview compact UI 조정
-   프로젝트 정보 영역 접기/펼치기 적용
-   기본 상태 접힘으로 설정

## Sprint 4-2

-   makeTodayTodoSummary()의 오늘 할 일 포함 조건 변경
-   start_date === 오늘 또는 due_date === 오늘 기준 적용
-   due_date < 오늘, start_date <= 오늘, 단순 진행중 조건 제외
-   makeTodayTodoSummary() 내부에서 오늘 할 일 상세 목록과 담당자별 전체 업무 현황 집계 기준 분리
-   직원별 진행중/완료/지연/오늘 업무 현황 복구

## Sprint 3-1

-   task status normalize/label/판단 유틸 추가
-   완료일, Activity Log, 출고 자동 생성, 진행률 계산을 유틸 기반으로 변경
-   신규 업무/복제/상태 변경 저장값을 pending / in_progress / completed로 전환

## Sprint 2-4

-   프로젝트 등록 insert에서 completion_due_date 동시 저장 제거
-   프로젝트 상세 수정 update에서 completion_due_date 동시 저장 제거
-   end_date 저장 기준 유지
-   end_date || completion_due_date 표시 fallback 유지

## Sprint 2-3

-   lib/projects.ts에 end_date 조회 추가
-   /projects 목록 종료일 표시를 end_date 우선 기준으로 변경
-   상세 화면 날짜 라벨을 종료일로 통일

## Sprint 2-2

-   lib/projects.ts에 client_name 조회 추가
-   /projects 목록 발주처 표시를 client_name으로 변경
-   프로젝트 등록 insert 기준을 DB 표준 스키마에 맞게 수정
-   상세/수정 화면에서 client_name, salesperson, site_address, end_date 반영
-   status 영문 표준값 저장 기준 적용
-   completion_due_date fallback/호환 유지

## v0.9

-   로그인 구현
-   권한(admin/member)
-   프로젝트 관리
-   업무관리
-   출고관리
-   직원관리
-   업무 템플릿
-   Activity Log 추가

## Sprint 7.5 Design System

-   components/ui/ProgressBar.tsx 추가
-   components/ui/EmptyState.tsx 추가
-   components/ui/Badge.tsx 추가
-   components/ui/Button.tsx 추가
-   Dashboard 및 Project Detail 일부 UI 컴포넌트 전환
-   Project Detail 한글 문자열 복구
