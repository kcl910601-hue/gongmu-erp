# CHANGELOG

## Sprint 9-0B Unread Comments & Calendar Shared Tag

- `shared_item + employee`별 마지막 확인 댓글 ID만 저장하는 최소 읽음 구조 추가
- 전체 댓글 수와 본인 작성분을 제외한 미읽음 댓글 수를 한 번에 집계하는 RPC 및 API 확장
- 댓글 영역 확인 후 읽음 처리와 Badge 즉시 갱신, 다른 화면 Realtime 동기화 추가
- Calendar 카드에 소유자 공유 일정 `공유중`, 참여 일정 `공유받음` 태그 추가
- 운영 DB에는 migration을 자동 적용하지 않음

## Sprint 9-0A Realtime Comment Performance Optimization

- 댓글 POST 성공 응답을 목록과 댓글 수 Badge에 debounce 없이 즉시 반영
- 로컬 댓글 mutation ID를 등록하여 동일 ID의 Realtime echo 재조회 방지
- 원격 댓글 변경은 댓글 목록과 일괄 댓글 개수만 재조회하고 Calendar·My Workspace 전체 재조회 제거
- Realtime 댓글 갱신 중 기존 댓글과 입력 영역을 유지하고 등록 버튼만 Loading 처리
- Timeline과 Notification은 기존 Activity 이벤트의 150ms debounce 유지

## Sprint 9-0 Realtime Collaboration Phase 1

- 인증된 AppShell에서 Shared Workspace용 Supabase Realtime 채널을 한 번만 구독
- 일정·공유·댓글·Timeline·Notification 변경을 기존 화면별 재조회 이벤트와 통합
- 연속 DB 변경과 로컬 변경 이벤트를 150ms debounce하여 중복 재조회 방지
- 실제 존재하는 `notification_reads`를 포함한 6개 테이블의 Realtime publication migration과 검증 SQL 준비
- 운영 DB에는 migration을 자동 적용하지 않음

## Sprint 8-9D Calendar UX Improvements

- 월간 캘린더의 각 주 높이를 해당 주에서 일정이 가장 많은 날짜 기준으로 자동 확장
- 개인 일정 카드의 표시 정보를 제목·날짜·작성자·공유 상태·댓글 수로 간소화
- Calendar 우측 선택 날짜 카드에서 권한별 수정·공유·고정·삭제·댓글·Timeline 액션을 바로 제공하고 월간 날짜 칸 내부 카드는 요약 정보만 표시
- Dashboard 개인 일정 카드의 소유자와 공유 인원 표시를 복원
- 월간 카드와 선택 날짜 카드 클릭 시 공통 개인 일정 상세 모달을 표시
- 상세 모달에서 기존 수정·공유·고정·삭제·댓글·Timeline 컴포넌트와 권한 로직을 재사용

## Sprint 8-9C Comment Badge & Calendar Action Parity

- 개인 일정 조회 시 `shared_comments`를 shared item 기준 한 번에 집계해 댓글 수 반환
- My Workspace와 Calendar의 수정·공유·고정·삭제·댓글·Timeline 액션을 공통 컴포넌트로 통합
- Calendar 소유자 관리 액션과 유형·날짜·색상·완료·고정·소유자·권한·참여자 상세 정보 추가
- 댓글 변경 후 기존 personal notes 변경 이벤트로 두 화면의 Badge와 목록 재조회
- 사용자별 댓글 개수 컬럼이나 Calendar 전용 원본은 추가하지 않음

## Sprint 8-9B Activity Timeline

- 기존 `activity_logs`에 개인 일정 UUID 연결용 `source_item_id` 최소 확장
- 일정 생성·수정·날짜 변경·삭제, 공유 요청/응답/권한/해제, 댓글 작성/수정/삭제 trigger 기록 추가
- 원본 소유자와 현재 공유 참여자만 조회하는 RLS 및 Timeline API 추가
- My Workspace와 Calendar에서 재사용하는 공통 Activity Timeline UI 추가
- 사용자별 Activity 복사본 없이 원본 ID 기준 단일 이력 유지
- 운영 DB에는 migration을 자동 적용하지 않음

## Sprint 8-9A Shared Comments Phase 1

- 원본 `personal_notes`를 복제하지 않고 `shared_items`에 연결되는 댓글 migration과 검증 SQL 추가
- 소유자·edit·view 참여자의 댓글 조회/작성, 작성자 수정·삭제, 소유자 관리 삭제 구현
- My Workspace와 Calendar에서 재사용하는 공통 댓글 UI 및 댓글 개수 표시 추가
- 신규 댓글을 기존 Notification Center의 동적 알림 계산에 포함하고 작성자·공유 해제 사용자를 제외
- Realtime과 댓글 Activity Timeline은 포함하지 않았으며 Sprint 8-9B 후속 범위로 유지
- 운영 DB에는 migration을 자동 적용하지 않음

## Sprint 8-8A Shared Workspace & Smart Calendar Phase 1

- `personal_notes` 원본을 복제하지 않는 공유 메타데이터, 초대, 참여자 migration 추가
- 소유자·편집자·보기 참여자별 RLS와 서버 RPC 권한 검증 추가
- My Workspace 공유 Dialog 및 받은/보낸 요청 처리 UI 추가
- Notification Bell에서 pending 공유 요청 수락·거절 지원
- Calendar 공유 필터, 공유 Badge, edit 권한 드래그 이동과 실패 rollback 추가
- 운영 DB에는 migration을 자동 적용하지 않음

## Sprint 5-11D Security Grant Hardening

- 운영 DB에서 Core 테이블의 `authenticated` 역할에 `TRUNCATE`, `REFERENCES`, `TRIGGER` 권한이 남아 있음을 실제 확인
- Core RLS와 정상 CRUD grants는 유지하면서 불필요한 세 table-level 권한을 운영 DB에서 회수
- 긴급 복원용 rollback SQL과 `pg_class`, table grants, `pg_policies` 검증 SQL 추가
- 적용 후 네 테이블에서 세 권한이 모두 false이고 기존 14개 Core 정책이 유지됨을 검증
- 운영 적용 및 검증 결과를 `DATABASE.md`, `OPERATIONS.md`와 동기화

## Sprint 5-11B Core RLS 통합 및 문서 동기화

- `projects`, `tasks`, `shipments`, `activity_logs`의 기존 운영 정책을 migration 적용 시 백업한 뒤 ERP 역할 기반 정책으로 통합
- Core RLS를 `is_approved_erp_user()`, `can_manage_projects()`, `can_edit_tasks()`, `is_approved_admin()` 기준으로 통일
- Viewer 조회 전용, Staff 업무·출고 편집, Manager 프로젝트 관리, Admin 삭제 권한으로 정리
- SECURITY DEFINER `delete_project_task()`의 삭제 권한을 Admin 전용으로 강화
- 운영 적용 후 정책과 grants를 확인할 수 있는 검증 SQL 추가
- `DATABASE.md`, `PROJECT_CONTEXT.md`, `ROADMAP.md`를 최신 권한 정책과 동기화
- 운영 `pg_policies` 직접 조회는 DB 연결 정보 부재로 수행하지 못했으며, 적용 시 백업 및 검증 SQL로 실제 차이를 확인하도록 구성

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
# Sprint 6-2

- UAT Seed의 평문 비밀번호 제거 및 환경변수 주입 방식 적용
- 운영 project ref 일치와 환경정보 누락 시 Seed를 차단하는 `scripts/seed-uat-accounts.mjs` 추가
- Pending/Rejected 계정을 active 상태로 맞추고 승인 상태에서 차단되도록 Seed/Verification 기준 정정
- 연결된 Supabase가 Production으로 확인되어 Seed 및 실제 역할별 UAT는 BLOCKED로 기록

# Sprint 6-3

- 정확한 Production project ref와 명시적 승인 플래그가 있을 때만 동작하는 Seed 예외 추가
- Seed `--dry-run` preflight와 `[UAT]` 계정 식별 규칙 추가
- 별도 승인 플래그 및 dry-run을 요구하는 UAT Cleanup 도구 추가
- DB URL과 UAT 비밀번호가 없어 실제 Seed/Verification/UAT는 BLOCKED로 기록

# Sprint 6-4

- UAT Seed/Cleanup의 DB URL, `psql`, `auth.users` 직접 SQL 의존성 제거
- Supabase JavaScript Admin API `createUser()` / `deleteUser()` 방식으로 전환
- Seed 전체 사전 중복 검사, 실패 시 생성 계정 보상 삭제, 실행 후 Verification 추가
- Cleanup dry-run과 `[UAT]` 데이터 → employees → Auth 삭제 및 잔존 계정 검증 유지
- Seed/Cleanup SQL 제거, 읽기 전용 Verification SQL 유지

# Sprint 6-5

- 내부 ERP 가입 흐름을 `가입 요청 → 관리자 승인 → 로그인`으로 단순화하고 이메일 인증 의존성 제거
- 가입 전 Auth/employees 조합과 승인·활성 상태를 구분하는 상태 API 및 사용자 안내 추가
- 가입 성공 직후 세션 종료와 로그인/AppShell의 승인 대기·거절·비활성·직원 정보 없음 차단 보강
- 관리자 승인 시 Auth 존재·이메일·연결 상태를 검증하고 불완전 계정을 가입 요청 목록에 표시
- 직원 비활성화와 서버 전용 Admin API 기반 완전 삭제를 분리하고 삭제 전후 잔존 상태 검증 추가
# Sprint 7C - LME Auto Sync Engine

- 한국비철금속협회 HTML의 일자·Al·현물 US$/톤 구조를 검증하는 parser와 fixture unit test를 추가했습니다.
- 2024-01-01 최초 이력 및 최신일 이후 증분 동기화, 중복 skip, 가격 conflict 보존, 동시 실행 차단을 추가했습니다.
- 관리자 동기화 API·상태 UI와 하루 1회 Vercel Cron 진입점을 추가했습니다.
- 계약 기준일 이하에서 가장 가까운 실제 저장 거래일을 조회하는 reference API를 추가했습니다.
- 기존 수기·CSV 기능과 확정 가격 불변 정책을 유지하며 환율은 임의 생성하지 않습니다.
- LME 전용 동기화 내부를 Market Data Provider, Sync Orchestrator, Repository로 분리했습니다.
- 향후 환율 Provider용 타입과 누락·유효성 상태를 구분하는 국내환산 계산 서비스를 추가했습니다. 환율 수집은 포함하지 않습니다.
