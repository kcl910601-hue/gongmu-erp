# CHANGELOG

## Sprint 9-6A - Project Task Name Editing

- 프로젝트 상세 공정표에 업무명 인라인 편집, Enter 저장, Escape 취소 UI를 추가했습니다.
- 기존 Task update, 권한, short editing lock과 tasks Realtime 흐름을 재사용했습니다.
- 빈 이름을 차단하고 trim 후 동일한 이름은 저장 요청과 Activity Log 없이 종료합니다.
- 업무명 변경 시 optimistic update와 실패 rollback·재조회를 적용하고 변경 전후 Activity Log를 기록합니다.
- Task 원본 ID와 업무 유형·담당자·일정·상태·순서·메모 관계는 변경하지 않으며 DB migration은 없습니다.

## Sprint 9-5G-1 - Gantt Excel Export Task Type Column

- 현재 화면형과 현장별 공정표 Excel에 `업무 유형` 열을 추가했습니다.
- Gantt 화면의 업무 유형 표시명을 재사용하고 미지정 업무는 `미지정`으로 출력합니다.
- 추가된 열에 맞춰 날짜 시작 열, 고정 창, 헤더 병합과 Gantt 막대 위치를 이동했습니다.
- 보고용 요약, 필터·정렬, 파일명, 메모·확인일 출력은 기존 정책을 유지합니다.
- DB migration은 없습니다.

## Sprint 9-5F Staff Role Calendar-Only Access

- Classified only approved `role=staff` employees whose organization name is `기타` and position is `스태프` as Calendar-only users, preserving existing Staff permissions for every other organization/position.
- Redirected Calendar-only users to `/calendar` after login and blocked other page routes, non-Calendar APIs, global search, notifications, quick actions, recent workspace, and non-Calendar Sidebar entries.
- Kept Month, Timeline, Gantt, Realtime, Presence, detail viewing, filters, presentation, and Gantt Excel export available while disabling Calendar/Gantt/personal-note/comment mutations and editing-lock acquisition.
- Added a restrictive RLS migration for all existing RLS-enabled public tables so Calendar-only staff cannot insert, update, or delete through direct Supabase calls.
- Added permission tests covering staff classification, route/API whitelists, Calendar view/edit/export capabilities, and existing Staff regression.

## Sprint 9-5E Gantt Excel Export

- Added an `Excel 다운로드` dialog to the Calendar Gantt toolbar with current Gantt range, current month, and custom date range options.
- Exported the already filtered and sorted Gantt rows to a real `.xlsx` workbook without additional API or DB queries.
- Added Korean static columns, merged month/day timeline headers, weekend/today emphasis, status bars, project boundaries, frozen panes, and landscape print settings.
- Added workbook tests for 1/10/100 rows, multi-project and year-boundary schedules, completed/delayed/unassigned tasks, layout metadata, reopening, and sanitized filenames; no DB migration was added.

## Sprint 9-4E-3 Calendar Personal Card Clipping Fix

- Removed the parent-level 48px height and clipping rule that cut off the final personal schedule card.
- Standardized personal cards at 64px with a 4px inter-card gap and used the same constants in week-height calculation.
- Kept title, metadata, completed/comment/sharing indicators inside the card bounding box and constrained indicators to one compact row.
- Added slot-height and final bottom-padding tests; no DB migration was added.

## Sprint 9-4E-2 Calendar Personal Task Dynamic Layout

- Rendered accessible personal schedules in All Task as cards below the company lane area instead of count-only badges.
- Unified All Task, My Task, and Share Task row sizing around the maximum filtered personal-card count in each week.
- Changed final week height to sum date header, company lanes, section gap, personal cards, and bottom padding.
- Added 0/1/5/10 personal-card, combined company/personal, and filter-reduction layout tests; no DB migration was added.

## Sprint 9-4E-1 Calendar Dynamic Week Height

- Replaced the equal month-row height policy with per-week required-height calculation based on actual company lanes or visible personal cards.
- Restored all desktop schedule lanes and removed the overlay More button and clipping that could cover schedule titles.
- Kept company bars on explicit non-overlapping lanes and constrained personal cards to their reserved fixed-height area.
- Preserved filters, completed-item visibility, drag-and-drop, editing locks, and existing Realtime refresh behavior; no DB migration was added.

## Sprint 9-4E Calendar Month Row Height & Overflow

- Replaced event-count-driven month row heights with an even 4/5/6-week height calculation.
- Limited each day cell to three directly visible schedules and added an accessible `+N건 더보기` action that reuses the selected-date detail panel.
- Calculated overflow from the already filtered company or personal schedule collection while preserving completed-item visibility settings, drag-and-drop, and Realtime refresh behavior.
- Added calendar overflow-count tests; no DB migration was added.

## Sprint 9-4A Dashboard Card Responsive Layout Fix

- Exposed each saved card size through a stable `data-dashboard-size` variant
- Reflowed Small KPI, shipment, Morning Brief, workspace, and progress content into one or two columns
- Added compact typography, spacing, wrapping, and intrinsic-width safeguards for Small cards
- Replaced the recent-project minimum-width table with a Small-only vertical summary list
- Adapted recent activity to a two-line title and wrapping list layout without clipping content
- Kept Medium/Large rendering and Dashboard preference persistence unchanged; no DB migration was added

## Sprint 9-4 Dashboard Customization

- Added per-employee Dashboard card order, size, visibility, and collapsed preferences
- Added edit mode with native drag-and-drop, insertion feedback, keyboard reordering, size controls, and hiding
- Added hidden-card restoration and confirmed reset to the default layout
- Added normal-mode collapse controls that skip rendering collapsed card bodies
- Added `dashboard_preferences` migration, own-row RLS, API, validation helpers, and verification SQL without applying production DB changes

## Sprint 9-3B-1 Gantt Presentation Header Layout Fix

- Changed the fullscreen Gantt root to a `100dvh` column flex layout with measured flow heights
- Allowed the presentation toolbar to wrap and reserve its actual height without clipping controls
- Gave the synchronized top scrollbar its own fixed-height row and expanded that row while the filter Popover is open
- Replaced the Gantt viewport's hard-coded `100vh - 56px` height with `flex: 1` and `min-height: 0`
- Kept month/day headers sticky at `top: 0` inside the isolated Gantt viewport

## Sprint 9-3B Gantt Presentation Filter Overflow Fix

- Replaced the presentation filter's header-bound absolute menu with the shared Radix Popover
- Portaled fullscreen content into the Gantt presentation root so browser fullscreen and overflow clipping are both respected
- Added viewport collision padding, automatic side flipping, constrained sizing, and a z-index above presentation overlays
- Kept the Gantt scroll containers and existing filter state unchanged; no DB migration was added

## Sprint 9-1B Hierarchical Delete Lock Check

- Project deletion now atomically checks project, task, and shipment editing locks on the server
- Task deletion checks its own lock and locks on shipments linked by `task_id`
- Expired locks are removed before checking; active lock acquisition is paused for the delete transaction
- Blocked deletion reports up to five editor/resource pairs plus the remaining count
- Personal notes are excluded because the current schema has no project, task, or shipment relation
- Existing `editing_locks` is reused; no new lock table or API was added

## Sprint 9-1A Live Editing Completion

- Reused the common lock API for short acquire-mutate-release operations
- Added deterministic multi-record lock acquisition for task order and multi-task schedule changes
- Added rollback and lock-owner feedback to Calendar and Gantt schedule moves
- Protected task completion, status, assignee, personal-note pin/completion, and setting state changes
- Connected partner inline editing and the Gantt task detail editor to the existing long-form lock hook
- No new lock table, API, hook, or DB migration

## Sprint 9-1 Universal Live Editing Lock

- Added one `editing_locks` structure keyed by resource type and normalized resource ID
- Added shared acquire, heartbeat, release, and status APIs plus one reusable React hook and lock notice
- Enforced resource-specific authorization inside security-definer lock functions
- Applied long-form locks to project, task, personal note, shipment, employee, and comment editing
- Kept short mutations independent from long-running heartbeat locks
- Migration prepared only; production DB was not changed

## Sprint 9-0C-1 Presence Subscription Runtime Error Fix

- Register Presence sync, join, and leave handlers before calling subscribe
- Track the current user only after the channel reaches SUBSCRIBED
- Serialize active-channel cleanup and replacement to handle Strict Mode and auth changes safely
- Make cleanup idempotent and isolate Presence failures from the AppShell
- No DB or migration changes

## Sprint 9-0C Online User Presence

- 인증된 AppShell에서 별도 `erp-online-users` Supabase Presence 채널 구독
- 직원 ID·이름·직책·접속 시각만 Presence metadata로 등록
- 여러 탭·기기 연결을 employeeId 기준 한 명으로 중복 제거
- Sidebar 로그인 사용자 영역 위에 온라인 인원과 사용자 목록 Popover 추가
- 연결 실패 상태를 격리하여 기존 ERP와 Realtime Collaboration 기능 유지
- DB 및 migration 변경 없음

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
# Sprint 9-2 - Mentions & Smart Notification

- 댓글 입력의 `@` 참여자 검색, 키보드/마우스 선택, 복수 멘션 Chip을 추가했다.
- 멘션 직원 ID를 관계 테이블에 저장하고 참여 권한을 서버에서 재검증한다.
- 멘션 Bell 알림, Realtime 갱신, Calendar 댓글 딥링크와 Timeline 기록을 추가했다.
# Sprint 9-2A - Notification Auto Archive

- Bell을 미처리 알림 중심 Inbox로 변경하고 Archive 전환 버튼을 추가했다.
- 일반 알림은 읽는 즉시 자동 보관되며 Archive에서 다시 미읽음 처리할 수 있다.
- pending 공유 요청은 Inbox에 유지하고 처리된 공유 요청은 Archive로 이동한다.
# Sprint 9-3 - Add to My Tasks

- 댓글과 댓글·멘션 Notification에 `내 할 일에 추가` 기능을 추가했다.
- My Workspace에 원본 댓글을 참조하는 `요청받은 작업` 영역을 추가했다.
- 참조 작업 완료·삭제, 중복 방지, 삭제된 원본 안내와 Realtime 갱신을 지원한다.
# Sprint 9-3A - Notification Popup & Reference Task Options

- Notification 상세 Dialog와 원본 열기 액션을 추가했다.
- 내 할 일 추가 시 제목, 마감일, 우선순위를 설정하는 공통 Dialog를 추가했다.
- My Workspace Reference Task 카드에 마감 상태와 우선순위를 표시하고 개인 설정 수정을 지원한다.
## 2026-08-12 - Sprint 9-5F-1 Calendar-only staff detection fix

- `staff` role 판정에 대소문자와 앞뒤 공백 정규화를 적용했습니다.
- 현재 직원 조회에서 연결 조직의 `id`, `name`을 명시적으로 가져오도록 보강했습니다.
- 실제 후보 계정은 조직 관계가 정상이나 `position = 'dd'`여서 `스태프` 조건을 충족하지 않는다는 원인을 확인했습니다.
- 다른 직급, 조직 관계 누락, 일반 경로와 mutation API 차단 회귀 테스트를 추가했습니다.
## 2026-08-12 - Sprint 9-5G Gantt Excel Export Templates

- Gantt Excel Dialog에 현재 화면형, 현장별 공정표, 보고용 요약 Template 선택을 추가했습니다.
- 공통 표시 업무 데이터에서 세 workbook을 생성해 추가 조회 없이 현재 필터와 정렬을 유지합니다.
- 프로젝트별 Sheet 이름 정규화·중복 처리, KPI 집계, 프로젝트 기간 막대, 인쇄·고정 창 설정을 추가했습니다.
- Calendar-only Staff도 기존 `canExportCalendar` 권한으로 세 양식을 사용할 수 있습니다.
## 2026-08-12 - Sprint 9-5H Project Task Memo Visibility

- 기존 `task_notes` 원본 메모에 일반/중요 구분을 추가했습니다.
- 프로젝트 상세, 업무 목록·상세, Calendar, Gantt에서 최신 원본 메모를 Preview로 표시합니다.
- 기존 공통 Realtime 흐름에 `task_notes` 변경 이벤트를 연결했습니다.
- 현장별 공정표 Excel에 메모 열과 `[중요]` 표시를 추가했습니다.
## 2026-08-12 - Sprint 9-5I Task Memo Check Date

- 업무 메모에 선택적 확인일과 오늘·내일·미지정 Quick Action을 추가했습니다.
- Calendar 가상 확인사항, Morning Brief 오늘/지연 확인사항, Notification Engine 날짜 알림을 연결했습니다.
- Task 목록·상세와 현장별 공정표 Excel에 확인일을 표시했습니다.
- note id와 확인일 기반의 안정적 알림 ID 및 확인일 partial index를 추가했습니다.
## 2026-08-12 - Sprint 9-5J Active Important Note Reminder

- 오늘 진행 중인 미완료 Task의 최신 중요 메모를 Calendar `⚠ 진행 메모` 가상 일정으로 표시합니다.
- 같은 메모의 확인일이 오늘이면 active reminder를 생략해 `⚠ 확인`과의 중복을 제거합니다.
- Task와 task_notes 변경을 기존 공통 Realtime 흐름으로 재계산합니다.
- Morning Brief와 Notification은 기존 check_date 전용 정책을 유지합니다.
