# Gongmu ERP - Project Context

## Sprint 9-3 Add to My Tasks

`reference_tasks`는 사용자별 작업 상태와 `comment_id`, `shared_item_id` 참조만 저장하며 댓글 내용이나 일정 제목을 복사하지 않는다. 조회 API가 현재 댓글·작성자·일정 원본을 매번 조인하므로 원본 수정이 그대로 표시된다. 원본 삭제 시 FK는 `SET NULL`로 변경되어 작업은 유지되고 “삭제된 원본”으로 표시된다.

같은 사용자의 같은 댓글은 partial unique index와 생성 RPC의 upsert로 한 번만 추가된다. 생성 시 현재 소유자 또는 공유 참여자인지 서버에서 재검증한다. `reference_tasks` Realtime은 해당 사용자의 My Workspace만 갱신하고, 댓글 Realtime은 참조 목록의 최신 원본 내용을 다시 조회한다.

## Sprint 9-2A Notification Auto Archive

Notification Bell은 Inbox와 Archive로 구분한다. 일반 알림은 읽는 즉시 기존 `notification_reads`의 `read_at`과 새 `archived_at`을 함께 기록해 Inbox에서 제거하며, 다시 미읽음 처리하면 두 값을 비워 Inbox로 복귀한다. Badge는 미읽음 Inbox와 처리 전 공유 요청만 계산한다.

공유 요청은 별도 알림 복사본을 만들지 않고 기존 `share_invitations.status`를 기준으로 분류한다. pending 요청은 읽기와 관계없이 Inbox에 유지하고 accepted, rejected, cancelled 요청은 Archive에 표시한다. `notification_reads`와 공유 테이블의 기존 Realtime 이벤트를 그대로 사용한다.

## Sprint 9-2 Mentions & Smart Notification

댓글 멘션은 `shared_comment_mentions`에 댓글 ID와 직원 ID만 저장한다. 댓글 작성 API는 선택된 직원 ID 배열을 RPC로 전달하며, RPC가 활성 직원인지와 해당 일정의 현재 소유자 또는 공유 참여자인지를 다시 검증한다. 같은 댓글의 같은 직원은 복합 기본키로 한 번만 기록된다.

댓글 입력창은 `@` 이후 이름·직책으로 참여자를 검색하고 키보드와 마우스 선택을 지원한다. 기존 Notification Center는 멘션 관계를 조회해 실시간 Bell 알림을 계산하며, 알림 링크는 Calendar의 기존 상세 모달과 해당 댓글 위치를 연다. 멘션 생성은 기존 `activity_logs` Timeline에 `shared_comment_mention` 활동으로 기록된다.

## Sprint 9-1B Hierarchical Delete Lock Check

Project and task deletion now run through security-definer RPCs that preserve the existing delete permissions and inspect the current `editing_locks` rows inside the delete transaction. The transaction briefly takes a share-row-exclusive lock on `editing_locks`, removes expired entries, checks the hierarchy, and then either returns current lock details or performs the existing delete sequence. This closes the gap where a child lock could be created between a separate client-side check and deletion.

Project hierarchy checks cover the project record, tasks with the project ID, and shipments with the project ID. Task hierarchy checks cover the task and shipments whose `task_id` references it. `personal_notes` is not included because the current schema does not contain a project, task, or shipment relationship.

## Sprint 9-1A Live Editing Completion

Short edits reuse the existing acquire and release endpoints without heartbeat. `withShortEditingLock` holds one record lock only for the mutation, while `withShortEditingLocks` sorts keys before acquiring multiple affected task records to avoid inconsistent acquisition order. Both always release acquired tokens in `finally`.

Calendar personal-note moves and Gantt task schedule changes optimistically update the UI and restore the previous state when acquisition or persistence fails. Task completion, status, assignee, personal-note completion/pin, partner active state, and maintenance-mode changes use the same short-lock path. Partner inline editing and Gantt task detail editing use the existing heartbeat hook.

## Sprint 9-1 Universal Live Editing Lock

Live editing uses one temporary `editing_locks` table. Its unique key is `(resource_type, resource_id)`, so unrelated projects, tasks, shipments, notes, employees, comments, and settings remain independently editable. The table never stores editable copies of source records.

The shared API acquires a 60-second lock, refreshes it every 20 seconds while a long edit UI remains open, and releases it on save, cancel, or unmount. Expired locks are reclaimed during acquisition and status checks. Database functions re-check the existing authorization rule for each resource type; Presence is not used to decide lock ownership.

## Sprint 9-0C-1 Presence Subscription Runtime Error Fix

The online Presence subscription creates a fresh channel only after the previous active channel has completed cleanup. It registers sync, join, and leave callbacks before subscribe, then tracks the authenticated employee only after SUBSCRIBED.

Module-level transition serialization, subscription ownership, and idempotent cleanup prevent Strict Mode and authentication changes from overlapping same-topic channels. Cleanup runs untrack before removeChannel, while Presence failures update only the online-status UI and do not interrupt the AppShell or other ERP features. No DB changes are required.

## Sprint 9-0C Online User Presence

인증된 AppShell은 기존 `shared-workspace-realtime` 데이터 변경 채널과 별도로 `erp-online-users` Presence 채널 하나를 생성합니다. 각 브라우저 연결은 고유 Presence key를 사용하고 `employeeId`, 이름, 직책, 접속 시각만 track합니다. DB에는 온라인 상태를 저장하지 않습니다.

Presence sync 결과는 employeeId 기준으로 합쳐 여러 탭과 여러 기기를 한 명으로 표시합니다. 마지막 연결이 untrack되거나 Realtime 연결이 끊기면 Supabase Presence에서 자동 제거됩니다. Sidebar 로그인 사용자 영역 위의 Popover에서 온라인 인원과 목록을 확인하며, 연결 오류는 Presence UI에만 표시하고 ERP 기능에는 영향을 주지 않습니다.

## Sprint 9-0B Unread Comments & Calendar Shared Tag

댓글 읽음 정보는 `shared_comment_reads`에 `shared_item_id`, `employee_id`, `last_read_comment_id` 한 행만 저장합니다. 댓글이나 일정 복사본은 만들지 않습니다. `get_shared_comment_count_stats(uuid[])`는 전체 댓글 수와 현재 사용자가 작성하지 않았으며 마지막 읽음 ID보다 큰 댓글 수를 일괄 반환합니다.

`CommentSection`이 댓글 API 응답을 화면에 표시한 뒤 응답에 포함된 마지막 댓글 ID까지만 `mark_shared_comments_read`로 기록합니다. 읽음 성공 시 현재 화면의 unread를 즉시 0으로 만들고, `shared_comment_reads` Realtime 변경으로 같은 사용자의 다른 화면도 count만 다시 조회합니다. Calendar 카드는 기존 날짜·작성자·댓글 정보를 유지하면서 소유자가 공유한 일정에는 `공유중`, 참여 일정에는 `공유받음` 태그를 표시합니다.

## Sprint 9-0A Realtime Comment Performance Optimization

댓글 작성·수정·삭제 성공 응답은 `CommentSection` 상태에 즉시 반영합니다. 생성·삭제 시에는 해당 원본 ID의 댓글 수 delta 이벤트를 debounce 없이 발생시켜 Calendar와 My Workspace의 Badge만 갱신하며 일정 목록 전체를 다시 조회하지 않습니다.

로컬 댓글 mutation ID는 5초 동안 등록되고 같은 ID의 `shared_comments` Realtime echo가 도착하면 소비됩니다. 다른 사용자의 변경만 150ms 후 댓글 API를 재조회하며, 댓글 수는 `/api/comments/counts`에서 현재 화면의 원본 ID를 한 번에 집계합니다. Realtime payload는 ID와 작업 종류를 중복 판정에만 사용하고 댓글 화면 데이터는 계속 기존 API에서 조회합니다. Timeline과 Notification은 `activity_logs` Realtime debounce를 유지합니다.

## Sprint 9-0 Realtime Collaboration Phase 1

인증된 화면은 AppShell에서 `shared-workspace-realtime` 채널 하나만 생성합니다. `personal_notes`, `shared_item_members`, `share_invitations`, `shared_comments`, `activity_logs`, `notification_reads` 변경을 수신하고 기존 API를 통해 필요한 데이터만 다시 조회합니다. Realtime payload를 화면 데이터로 직접 사용하지 않으므로 기존 API와 RLS가 조회 권한을 다시 검증합니다.

테이블 변경은 개인 일정·댓글·Timeline·공유·Notification 도메인 이벤트로 변환됩니다. 공통 스케줄러가 같은 도메인 이벤트를 150ms 동안 합쳐 DB trigger와 사용자 mutation에서 발생하는 연속 변경의 중복 재조회를 줄입니다. 별도 `notifications` 테이블은 존재하지 않아 구독하지 않으며, Notification Bell은 관련 원본과 `notification_reads` 변경에서 갱신합니다.

`20260804180000_enable_shared_workspace_realtime.sql`은 Realtime publication만 확장하며 테이블이나 원본 복사본을 만들지 않습니다. 운영 DB 적용과 다중 사용자 UAT는 별도 수행해야 합니다.

## Sprint 8-9D Calendar UX Improvements

월간 Calendar의 주 Row 높이는 각 주에서 개인 일정이 가장 많은 날짜의 카드 수와 회사 일정 lane 수를 함께 계산해 주별로 독립 확장합니다. 개인 일정 카드는 더 이상 일부만 자르지 않으며, 제목·날짜·작성자·공유 상태·댓글 수만 표시합니다.

월간 카드와 선택 날짜 카드 모두 `PersonalNoteDetailModal`을 열고, 상세 모달은 기존 `PersonalNoteActions`, `CommentSection`, `TimelineSection`을 재사용합니다. 회사 일정은 기존 `GanttTaskDetailModal` 경로를 유지하므로 개인 일정 API와 연결되지 않습니다.

Calendar 우측 선택 날짜 카드에서는 `PersonalNoteActions`를 직접 제공하며 소유자·edit·view 권한에 따라 Dashboard와 동일하게 액션을 제한합니다. 월간 날짜 칸 내부 카드는 액션 없이 요약 정보만 표시합니다. Dashboard 카드는 모든 개인 일정에 소유자와 현재 공유 인원을 표시합니다.

## Sprint 8-9C Comment Badge & Calendar Action Parity

`/api/personal-notes`는 조회된 shared item 전체의 댓글을 한 번에 집계해 `comment_count`를 반환합니다. My Workspace와 Calendar는 `PersonalNoteActions`와 공통 권한 판정을 사용하며, 소유자는 수정·공유·고정·삭제, edit 참여자는 수정, view 참여자는 원본 조회만 허용합니다. 댓글과 Timeline은 세 권한 모두 사용할 수 있습니다.

댓글 변경은 기존 `PERSONAL_NOTES_CHANGED_EVENT`를 발생시켜 목록과 Badge를 재조회합니다. 댓글 수 저장 컬럼, 사용자별 집계 복사본, Calendar 전용 일정 원본은 만들지 않습니다.

## Sprint 8-9B Activity Timeline

Shared Workspace Timeline은 별도 로그 시스템을 만들지 않고 기존 `activity_logs`를 사용합니다. UUID인 `personal_notes.id`는 `source_item_id`로 연결하며 일정·공유·댓글 mutation을 DB trigger에서 기록합니다. My Workspace와 Calendar는 동일한 Timeline API와 컴포넌트를 사용합니다.

기존 프로젝트 Activity 조회 정책은 유지되고, `source_item_id`가 있는 활동만 원본 소유자와 현재 공유 참여자로 제한됩니다. 공유 해제 사용자는 과거 협업 Activity를 더 이상 조회할 수 없습니다. 운영 migration과 실제 다중 사용자 UAT는 별도 적용이 필요합니다.

## Sprint 8-9A Shared Comments

Shared Workspace의 일정·TODO·메모는 계속 `personal_notes` 원본 1개를 사용하며, 댓글은 `shared_comments → shared_items → personal_notes`로 연결됩니다. 소유자와 수락된 view/edit 참여자는 댓글을 조회·작성할 수 있고 작성자는 본인 댓글만 수정하며 작성자 또는 소유자만 삭제할 수 있습니다. 공유되지 않은 원본은 첫 댓글 작성 시 공유 연결 메타데이터만 생성합니다.

My Workspace와 Calendar는 같은 `CommentSection`과 댓글 API를 사용합니다. 신규 댓글 알림은 별도 알림 복제 없이 기존 Notification Center가 접근 가능한 댓글에서 계산합니다. Realtime과 댓글 Activity Timeline은 Sprint 8-9B 범위이며, `20260804120000_create_shared_comments.sql`은 운영 DB에 자동 적용하지 않았습니다.

## Sprint 7C LME Auto Sync

한국비철금속협회 공개 HTML에서 Al 현물 USD/ton을 서버가 저빈도로 수집하는 구조를 추가했습니다. 최초 동기화는 2024-01-01까지 순차 탐색하고, 증분 동기화는 DB 최신일에서 중단합니다. 기존 가격은 덮어쓰지 않으며 가격 차이는 conflict로 기록합니다. 협회가 환율을 제공하지 않으므로 자동수집 행에는 환율·국내환산가를 만들지 않습니다. 자세한 운영 조건은 `docs/LME_SYNC.md`를 기준으로 합니다.

내부 LME Sync는 Market Data Provider, 공통 Sync Orchestrator, LME Repository로 분리했습니다. 현재 활성 Provider는 LME만이며 환율은 타입과 계산 결과 체계만 준비되어 있습니다. 기존 API·UI·DB 경로는 유지됩니다.

## Sprint 6-2 UAT 상태

테스트 계정 Seed의 평문 비밀번호를 제거하고 `scripts/seed-uat-accounts.mjs`에서 필수 환경변수로만 주입하도록 변경했습니다. 2026-07-29 연결된 Supabase project ref `cropibqvvzpxlnqpkyto`는 Production으로 확인되어 최초 Seed와 실제 UAT는 실행하지 않았습니다.

Sprint 6-3에서 해당 Production 프로젝트에 대한 제한적 UAT가 명시적으로 승인되었습니다. Seed는 이중 승인 플래그와 정확한 project ref, Supabase URL, service role key, 로컬 비밀번호가 모두 있을 때만 허용됩니다.

Sprint 6-4에서 Seed/Cleanup을 Supabase JavaScript Admin API 방식으로 전환했습니다. DB URL과 `auth.users` 직접 SQL 의존성은 제거했습니다. service role 기반 `auth.admin.createUser()` / `deleteUser()`와 PostgREST employees/UAT 데이터 처리만 사용하며, 기존 권한 함수·RLS·Migration은 변경하지 않았습니다.

## 운영 보안 상태

Sprint 5-11D부터 Core 테이블의 authenticated 권한은 RLS 기반 CRUD에 필요한
권한만 유지합니다. `TRUNCATE`, `REFERENCES`, `TRIGGER`는 ERP 사용자에게 부여하지
않으며, 특히 RLS를 거치지 않는 `TRUNCATE`는 금지합니다.

## 공식 권한 체계

권한 정책은 다음 순서를 단일 기준으로 사용합니다.

```text
lib/permissions.ts
        ↓
API / Proxy / AppShell
        ↓
RPC 권한 함수
        ↓
RLS
```

UI의 버튼 노출만으로 권한을 보장하지 않으며 API, RPC, RLS에서 동일한 역할과
활성·승인 조건을 다시 검사합니다.

| 역할 | 공식 권한 |
| --- | --- |
| Admin | 전체 조회·생성·수정·삭제, 직원 관리, 설정 관리 |
| Manager | 조회, 프로젝트 생성·수정, 업무·출고 편집, 설정 등록·수정. 삭제 불가 |
| Staff | 조회, 업무·출고 생성·수정. 프로젝트 생성 및 삭제 불가 |
| Viewer | 조회 전용 |

모든 역할은 `employees.active = true`와 `approval_status = 'approved'`를 동시에
충족해야 합니다. 알 수 없는 role은 클라이언트에서 Viewer로 축소하며 DB에서는
허용하지 않습니다. Login, Authorization API, Proxy, AppShell 세션 변경 및 RLS가
동일한 기준을 사용합니다.

Core RLS 대상은 `projects`, `tasks`, `shipments`, `activity_logs`이며 상세 정책은
`docs/DATABASE.md`를 기준으로 합니다.

## 프로젝트 개요

공무팀 ERP는 공무팀의 실제 업무에서 사용하는 프로젝트, 업무, 출고, 파일 관리 시스템입니다. 현재는 공무팀 운영 안정성을 우선하며, 향후 다른 부서로 확장 가능한 구조를 목표로 합니다.

## 기술 스택

- Next.js 16 App Router
- TypeScript strict
- TailwindCSS
- Supabase
- Vercel
- GitHub

## 현재 주요 기능

- 로그인/로그아웃 및 Supabase session 기반 접근
- 직원 정보와 role 기반 권한 판단
- 프로젝트 등록, 목록, 상세, 수정, 삭제
- 프로젝트 생성 시 `task_templates` 기반 업무 자동 생성
- 프로젝트별 업무 목록, 담당자, 마감일, status 수정
- Dashboard KPI, TO DO LIST, TEAM WORKSPACE, 최근 활동
- Calendar 및 통합 Gantt
- 출고 관리
- 프로젝트 파일 메타데이터와 private Storage signed URL 기반 열기/다운로드
- Global Search
- Notification Center
- Activity Log 기록

## 실제 DB 기준

프로젝트 루트의 `db_schema_columns.csv`, `db_foreign_keys.csv` 기준 실제 테이블은 다음과 같습니다.

- `projects`
- `tasks`
- `employees`
- `project_files`
- `shipments`
- `task_templates`
- `activity_logs`

실제 FK로 확인된 관계는 `project_files.project_id -> projects.id`입니다. 코드에서는 `tasks.project_id`, `shipments.project_id`, `shipments.task_id`, `activity_logs.project_id`를 관계처럼 사용하지만 CSV FK 목록에는 없습니다.

`notices` 테이블은 현재 실제 DB 구조에서 확인되지 않았습니다. `/notices` 화면은 정적 placeholder입니다.

## 핵심 테이블 역할

### projects

프로젝트 기준 정보입니다. 주요 컬럼은 `id`, `project_code`, `project_name`, `client_name`, `assembly_vendor`, `process_type`, `salesperson`, `task_manager`, `status`, `start_date`, `end_date`, `completion_due_date`, `site_address`, `memo`, `created_at`, `updated_at`입니다.

### tasks

프로젝트별 업무입니다. 주요 컬럼은 `id`, `project_id`, `task_order`, `task_type`, `task_name`, `assignee`, `status`, `start_date`, `due_date`, `completed_date`, `created_at`입니다.

DB-2 판단:

- `tasks.project_id`는 코드 전반에서 프로젝트 연결의 핵심 값입니다.
- FK를 추가한다면 `projects.id` 참조와 `ON DELETE RESTRICT`가 적합합니다.
- 기존 데이터의 orphan task 여부를 먼저 확인해야 합니다.

### shipments

출고 정보입니다. 주요 컬럼은 `id`, `project_id`, `task_id`, `site_name`, `item_name`, `quantity`, `shipment_date`, `vehicle_number`, `driver_name`, `driver_phone`, `destination`, `receiver`, `status`, `memo`, `created_at`입니다.

DB-2 판단:

- `shipments.project_id`는 프로젝트 삭제 전 수동 정리 대상이며 `ON DELETE RESTRICT`가 적합합니다.
- `shipments.task_id`는 업무 완료로 자동 생성된 출고의 원천 업무 추적용입니다. nullable이므로 업무 삭제 시 `ON DELETE SET NULL`이 적합합니다.
- 수동 출고 등록 코드는 `project_id: null`을 저장하려 하지만 CSV는 `shipments.project_id`를 NOT NULL로 표시합니다. FK 적용 전 수동 출고 정책을 정리해야 합니다.

### activity_logs

사용자 활동 이력입니다. 주요 컬럼은 `id`, `created_at`, `employee_name`, `employee_email`, `action_type`, `target_type`, `target_id`, `project_id`, `title`, `description`입니다.

DB-2 판단:

- `activity_logs.project_id`는 최근 활동 표시용 nullable 연결입니다.
- 로그는 감사 이력 성격이 있으므로 프로젝트 삭제 시 `ON DELETE SET NULL`이 적합합니다.

### employees

직원 및 권한 정보입니다. CSV 기준 원격 DB 컬럼은 `id`, `name`, `position`, `active`, `created_at`, `email`, `auth_user_id`, `role`입니다.

Sprint DB-1 판단:

- `department`는 직원관리 화면에서 입력, 저장, 목록 표시, 검색에 사용되고 Global Search에서도 검색/표시에 사용되므로 유지합니다.
- `department`는 `supabase/migrations/20260716130000_add_department_to_employees.sql`로 추가 준비했습니다.
- `updated_at`은 직원 수정 이력 표시, 정렬, 검색에 사용되지 않고 저장 payload에만 남아 있었으므로 코드에서 제거했습니다.
- 원격 Supabase DB에는 아직 `department`가 없으므로 migration 적용 전에는 관련 select/save가 실패할 수 있습니다.

추가로 CSV 기준 `phone`, `memo`, `is_active` 컬럼도 없습니다. 현재 직원관리 화면은 해당 필드를 사용 중이며, `active` 컬럼과의 정합성은 별도 Sprint에서 판단해야 합니다.

### project_files

프로젝트 파일 메타데이터입니다. `project_id`는 실제 FK로 `projects.id`를 참조합니다. 파일 본문은 Supabase Storage `project-files` bucket을 사용합니다.

DB-2 판단:

- 이미 실제 FK가 존재하므로 이번 Sprint에서 변경하지 않습니다.
- 프로젝트 삭제 시 파일 메타데이터와 Storage object 정리 흐름이 현재 프로젝트 삭제 코드에 없으므로 삭제 정책은 별도 검토가 필요합니다.

## 개발 원칙

- 기존 기능을 삭제하지 않습니다.
- 실제 DB 구조를 추측하지 않습니다.
- DB 변경은 직접 실행하지 않고 migration 파일로만 준비합니다.
- 기존 데이터 삭제, `DROP TABLE`, 파괴적 변경은 금지합니다.
- 공통 로직은 필요할 때만 `lib`로 분리합니다.
- TypeScript strict를 유지하고 `any`를 사용하지 않습니다.
- 문서와 실제 코드/DB가 충돌하면 실제 코드/DB 기준으로 보고합니다.

## 최근 구조 메모

- Sprint 6-5부터 내부 직원 가입 정책은 `가입 요청 → 관리자 승인 → 로그인`이며 이메일 인증을 사용하지 않습니다. Supabase Confirm email은 관리자가 수동으로 OFF 상태를 유지합니다.
- 가입 상태 API는 `linked`, `auth_only_incomplete`, `employee_only_missing_auth`, `not_found`를 구분하며, 승인·활성 상태와 AppShell 가드가 실제 ERP 접근을 결정합니다.
- 직원 완전 삭제는 서버 전용 Admin API에서만 수행하며 비활성화, 가입 거절과 별도 동작입니다.
- `project_files` 테이블과 `project-files` private Storage bucket 기반 파일 기능이 추가되었습니다.
- `assembly_vendor`는 실제 `projects` 컬럼으로 확인되며 프로젝트 등록/수정/목록/상세/Gantt/Search에서 사용합니다.
- Notification Center는 별도 notifications 테이블 없이 기존 `tasks`, `projects`, `project_files` 기반으로 계산합니다.
- Sprint DB-1에서 `employees.department` migration을 준비하고, 불필요한 `employees.updated_at` 저장 payload를 제거했습니다.
- Sprint DB-2에서 프로젝트-업무-출고-활동로그 관계의 FK 정책을 감사하고 주석 처리된 FK 초안을 작성했습니다. 원격 DB 변경은 하지 않았습니다.

## 다음 작업 시 주의사항

- FK 적용 전 `tasks`, `shipments`, `activity_logs` orphan 데이터를 확인해야 합니다.
- 수동 출고 등록이 프로젝트 없이 허용되는지 먼저 결정해야 합니다.
- 프로젝트 삭제 시 `project_files`와 Storage object 정리 정책을 별도 검토해야 합니다.
- 직원 부서 기능을 유지하려면 `employees.department` migration을 원격 Supabase에 적용해야 합니다.
- 직원관리 화면의 `active`/`is_active`, `phone`, `memo` 불일치를 별도 작업으로 정리해야 합니다.
- 공지 기능을 DB 기반으로 확장하려면 `notices` 테이블 설계와 migration이 먼저 필요합니다.
