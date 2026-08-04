# ERP Database v1

## Sprint 8-9C Comment Count Aggregation

`get_shared_comment_counts(uuid[])`는 조회된 원본 ID 배열의 댓글 수를 한 번에 집계합니다. SECURITY INVOKER로 실행되어 기존 `shared_comments` RLS를 그대로 적용하며 사용자별 집계 행이나 별도 count 컬럼을 저장하지 않습니다. 운영 DB에는 `20260804160000_add_shared_comment_counts.sql`을 자동 적용하지 않았습니다.

## Sprint 8-9B Activity Timeline

기존 `activity_logs`에 UUID 원본을 식별하는 nullable `source_item_id`를 추가했습니다. 기존 bigint `target_id`와 프로젝트 Activity 구조는 유지합니다. 일정·공유·댓글 테이블 trigger가 같은 트랜잭션에서 활동을 기록하므로 Calendar 드래그와 view 참여자의 댓글도 동일하게 포함됩니다.

`source_item_id`가 없는 기존 Activity는 기존 승인 사용자 조회 정책을 유지합니다. Shared Workspace Activity는 원본 소유자 또는 현재 `shared_item_members` 참여자만 RLS를 통과하며 공유 해제 후에는 조회할 수 없습니다. 운영 DB에는 `20260804140000_add_shared_activity_timeline.sql`을 자동 적용하지 않았습니다.

## Sprint 8-9A Shared Comments Phase 1

`20260804120000_create_shared_comments.sql`은 `shared_items.id(uuid)`에 연결되는 `shared_comments`를 추가합니다. 댓글은 사용자별로 복제하지 않으며 원본 `personal_notes`와 기존 공유 관계를 그대로 사용합니다. 작성자는 승인된 `employees.id(bigint)`로 서버에서 결정되고 내용은 trim 후 1~2,000자로 제한됩니다.

소유자와 현재 `shared_item_members` 참여자는 view/edit 구분 없이 조회·작성할 수 있습니다. 수정은 작성자만, 삭제는 작성자 또는 원본 소유자만 허용하며 API와 RLS가 같은 조건을 재검증합니다. 공유되지 않은 개인 일정은 소유자가 첫 댓글을 작성할 때 `shared_items` 연결 행만 생성합니다. 원본 삭제 시 `personal_notes → shared_items → shared_comments` cascade로 댓글도 정리됩니다.

댓글 신규 알림은 별도 알림 복제 테이블 없이 접근 가능한 `shared_comments`를 기존 Notification Center가 계산합니다. 작성자는 제외되고, 공유 해제 사용자는 RLS로 더 이상 댓글과 알림을 조회하지 못합니다. 운영 DB에는 migration을 자동 적용하지 않았습니다.

## Sprint 8-8A Shared Workspace Phase 1

`20260803150000_create_shared_workspace.sql`은 기존 `personal_notes` 원본 행을 복제하지 않고 공유 메타데이터만 추가합니다. `shared_items.item_id`는 원본 `personal_notes.id`를 참조하며, `share_invitations`는 초대 이력과 상태를, `shared_item_members`는 수락한 참여자와 `view`/`edit` 권한을 저장합니다. 실제 `employees.id` bigint 타입과 `employees.auth_user_id = auth.uid()` 연결을 사용합니다.

RLS는 소유자와 수락한 참여자만 원본을 조회하도록 하며, 수정은 소유자와 `edit` 참여자만, 삭제는 소유자만 허용합니다. 초대 수락은 원본 복제가 아니라 참여 권한 추가입니다. 이 migration은 운영 DB에 자동 적용하지 않았으며 관리자가 검토 후 직접 실행해야 합니다.

## Sprint 7C LME 일별 자동 동기화

`20260731140000_add_lme_daily_sync.sql`은 기존 `lme_market_prices`의 월·회차 수기 이력을 보존하면서 일별 현물 행을 함께 저장하도록 호환 확장합니다. 자동 행은 `price_type=spot`, `currency=USD`, `unit=metric_ton`이며 `(reference_date, material_code, price_type) where price_type='spot'` 부분 unique index를 사용합니다. 협회 원천에 환율이 없으므로 환율과 국내환산가는 nullable이며 0이나 임의값을 저장하지 않습니다. 기존 수기 행의 월·회차 unique 제약과 불변 trigger는 유지됩니다.

`lme_sync_runs`는 최초/증분 모드, 실행 주체, 처리 건수, conflict와 실패 메시지를 기록합니다. `status='running'` 부분 unique index가 동시 실행을 차단합니다. 기존 확정 가격은 자동 UPDATE/DELETE하지 않습니다.

Market Data Engine 리팩토링은 Service Layer만 분리하며 migration이나 범용 market data 테이블을 추가하지 않습니다. Repository는 계속 기존 `lme_market_prices`와 `lme_sync_runs`를 사용합니다.

## Sprint 5-11D Core Table Grants

운영 확인 결과 `authenticated`에 남아 있던 `TRUNCATE`, `REFERENCES`, `TRIGGER`
권한을 `20260730110000_harden_core_table_grants.sql`로 회수했습니다.

| 테이블 | 유지하는 grants | 회수한 grants |
| --- | --- | --- |
| `projects` | SELECT, INSERT, UPDATE, DELETE | TRUNCATE, REFERENCES, TRIGGER |
| `tasks` | SELECT, INSERT, UPDATE, DELETE | TRUNCATE, REFERENCES, TRIGGER |
| `shipments` | SELECT, INSERT, UPDATE, DELETE | TRUNCATE, REFERENCES, TRIGGER |
| `activity_logs` | SELECT, INSERT | TRUNCATE, REFERENCES, TRIGGER |

CRUD table grant는 RLS 정책 실행에 필요한 기반 권한이며 실제 행 접근은 ERP 권한
함수가 결정합니다. `TRUNCATE`는 RLS가 적용되지 않으므로 authenticated에 부여하지
않습니다. rollback SQL은 이전 운영 상태 재현이 반드시 필요한 비상 상황에서만
사용합니다.

운영 적용 후 `pg_class`에서 네 테이블의 RLS enabled 상태를 재확인했고,
`has_table_privilege()` 기준 세 권한은 모두 false입니다. 기존 Core RLS 정책 14개도
변경 없이 유지됐습니다.

## Sprint 5-11B 권한 함수 및 Core RLS

공식 DB 권한 판정은 `employees.auth_user_id = auth.uid()`, `active = true`,
`approval_status = 'approved'`를 공통 전제조건으로 사용합니다.

| 함수 | 허용 대상 | 용도 |
| --- | --- | --- |
| `has_erp_role(text[])` | 전달된 역할 목록의 활성·승인 사용자 | 모든 DB 권한 함수의 공통 기반 |
| `is_approved_erp_user()` | Admin, Manager, Staff, Viewer | ERP 데이터 조회 |
| `can_manage_projects()` | Admin, Manager | 프로젝트 생성·수정 |
| `can_edit_tasks()` | Admin, Manager, Staff | 업무와 출고 생성·수정, 활동 로그 기록 |
| `can_manage_settings()` | Admin, Manager | 설정 데이터 등록·수정 |
| `is_approved_admin()` | Admin | 삭제 및 관리자 전용 작업 |

알 수 없는 역할, 비활성 사용자, 승인 대기 및 승인 거절 사용자는 위 함수에서
모두 권한이 없는 것으로 처리합니다.

### Core 테이블 RLS

모든 정책은 `authenticated` role 대상의 PERMISSIVE 정책이며, 실제 허용 여부는
ERP 권한 함수가 결정합니다.

| 테이블 | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| `projects` | 승인된 ERP 사용자 | Admin/Manager | Admin/Manager | Admin |
| `tasks` | 승인된 ERP 사용자 | Admin/Manager/Staff | Admin/Manager/Staff | Admin |
| `shipments` | 승인된 ERP 사용자 | Admin/Manager/Staff | Admin/Manager/Staff | Admin |
| `activity_logs` | 승인된 ERP 사용자 | Admin/Manager/Staff | 금지 | 금지 |

`20260730100000_unify_core_rls.sql`은 적용 직전 네 테이블의 `pg_policies`
내용을 `rls_policy_backups`에 `captured_for = 'sprint-5-11b'`로 보존한 후
정책을 교체합니다. 백업 테이블은 `anon`, `authenticated`에 공개하지 않습니다.

`delete_project_task()`는 SECURITY DEFINER 함수이므로 테이블 RLS와 별개로
함수 내부에서 `is_approved_admin()`을 검사합니다.

운영 적용 후에는
`supabase/verification/20260730101000_verify_core_rls.sql`을 실행해 정책 이름,
USING, WITH CHECK, 대상 role, permissive 여부, table grants 및 백업 내용을 확인합니다.

Sprint 5-11C/5-11D 운영 확인에서 실제 `pg_policies`, table grants와 RLS 상태를
조회했습니다. Core 정책 14개와 권한 함수가 운영 DB에 적용되어 있으며, 정책 교체
전 상태는 `rls_policy_backups`와 운영 검증 결과를 기준으로 추적합니다.

이 문서는 프로젝트 루트의 `db_schema_columns.csv`, `db_foreign_keys.csv`, migration과 운영 검증 결과를 기준으로 작성합니다. 존재하지 않는 테이블이나 컬럼은 임의로 추가해 문서화하지 않습니다.

## 1. Database Overview

CSV 기준 실제 테이블은 다음 7개입니다.

- `activity_logs`
- `employees`
- `project_files`
- `projects`
- `shipments`
- `task_templates`
- `tasks`

CSV 기준 확인된 FK는 `project_files.project_id -> projects.id` 1개입니다. 코드에서는 `tasks.project_id`, `shipments.project_id`, `shipments.task_id`, `activity_logs.project_id`를 논리 관계로 사용하지만, CSV 기준 실제 FK 목록에는 없습니다.

Sprint DB-1에서 `employees.department`는 직원관리 화면과 전역검색에서 실제 입력/저장/검색/표시에 사용 중이므로 로컬 migration으로 추가 준비했습니다. `employees.updated_at`은 화면 표시, 검색, 정렬에 사용되지 않아 코드 저장 payload에서 제거했습니다.

Sprint DB-2에서는 실제 FK를 생성하지 않고 관계 사용처와 안전한 FK 정책을 감사했습니다. 초안은 `supabase/migrations/20260716140000_draft_project_relationship_foreign_keys.sql`에 주석 처리된 SQL로만 기록했습니다.

## 2. Table Summary

| Table | Role | PK | Confirmed FK |
| --- | --- | --- | --- |
| `projects` | 프로젝트 기본 정보, 상태, 일정 관리 | `id` bigint | 없음 |
| `tasks` | 프로젝트별 업무, 담당자, 상태, 마감일 관리 | `id` bigint | 없음 |
| `employees` | 직원, 로그인 사용자 매핑, 권한 role 관리 | `id` bigint | 없음 |
| `project_files` | 프로젝트 파일 메타데이터 관리 | `id` uuid | `project_id -> projects.id` |
| `shipments` | 출고 정보 관리 | `id` bigint | 없음 |
| `task_templates` | 공정별 기본 업무 템플릿 | `id` bigint | 없음 |
| `activity_logs` | 사용자 주요 활동 이력 | `id` bigint | 없음 |

## 3. projects

역할: 프로젝트 기준 정보, 발주처, 조립처, 일정, 진행 상태를 관리합니다.

PK: `id` bigint, not null

| Column | Type | Nullable | Default | Code Usage |
| --- | --- | --- | --- | --- |
| `id` | bigint | NO | null | 프로젝트 상세 경로, 업무/출고/파일/활동 로그 연결 기준 |
| `project_name` | text | NO | null | 목록, 상세, 검색, Gantt 표시 |
| `process_type` | text | NO | null | 프로젝트 등록, 필터, 템플릿 조회 |
| `salesperson` | text | YES | null | 영업 담당 표시 |
| `task_manager` | text | YES | null | 업무 담당자 표시, 기본 업무 assignee |
| `status` | text | YES | null | 프로젝트 상태 표시/계산 |
| `start_date` | date | YES | null | 프로젝트 시작일 표시 |
| `completion_due_date` | date | YES | null | 기존 데이터 호환용 준공 예정일 |
| `created_at` | timestamp with time zone | YES | now() | 목록 정렬/등록일 표시 |
| `project_code` | text | YES | null | 프로젝트 코드, 검색 |
| `client_name` | text | YES | null | 발주처 |
| `site_address` | text | YES | null | 현장 주소 |
| `manager_id` | uuid | YES | null | 현재 주요 코드에서는 직접 사용하지 않음 |
| `end_date` | date | YES | null | 종료일 우선 표시 |
| `memo` | text | YES | null | 프로젝트 메모 |
| `updated_at` | timestamp with time zone | YES | now() | 프로젝트 수정 시각 |
| `assembly_vendor` | text | YES | null | 조립처 |

관계 사용:

- 조회: 프로젝트 목록, 상세, Dashboard, Calendar, Gantt, Global Search에서 조회합니다.
- 생성: 프로젝트 등록 시 `projects`를 먼저 insert하고, 반환된 `projectData.id`로 `tasks.project_id`를 채워 기본 업무를 생성합니다.
- 수정: 프로젝트 상세와 Calendar에서 프로젝트 정보, 상태, 일정 값을 update합니다.
- 삭제: 프로젝트 목록에서 admin이 `shipments` 삭제, `tasks` 삭제, `projects` 삭제 순서로 수동 삭제합니다. `project_files`, `activity_logs`는 현재 프로젝트 삭제 흐름에서 함께 정리되지 않습니다.

## 4. tasks

역할: 프로젝트별 업무, 업무 유형, 담당자, 상태, 마감일, 완료일을 관리합니다.

PK: `id` bigint, not null

CSV 기준 FK: 없음

코드상 관계: `tasks.project_id`를 `projects.id`에 연결되는 값으로 사용합니다.

| Column | Type | Nullable | Default | Code Usage |
| --- | --- | --- | --- | --- |
| `id` | bigint | NO | null | 업무 식별자 |
| `project_id` | bigint | NO | null | 프로젝트 연결 |
| `task_type` | text | YES | null | 업무 유형, Gantt 색상/필터 |
| `task_name` | text | YES | null | 업무명 |
| `assignee` | text | YES | null | 담당자 이름 문자열 |
| `status` | text | YES | null | 업무 상태 |
| `due_date` | date | YES | null | 마감일, 지연/오늘/이번 주 계산 |
| `completed_date` | date | YES | null | 완료일 |
| `created_at` | timestamp with time zone | YES | now() | 일부 조회 가능 컬럼 |
| `task_order` | integer | YES | null | 업무 순서 |
| `start_date` | date | YES | null | Gantt 시작일 |

관계 사용:

- 조회: 프로젝트 상세는 `project_id`로 업무를 조회합니다. Dashboard, Tasks, Calendar, Notification은 전체 업무를 읽고 코드에서 프로젝트와 매칭합니다.
- 생성: 프로젝트 생성 시 템플릿 기반 업무를 bulk insert하고, 프로젝트 상세에서 업무 추가/복제를 insert합니다.
- 수정: 프로젝트 상세, Tasks, Calendar/Gantt에서 상태, 일정, 담당자, 순서를 update합니다.
- 삭제: 프로젝트 상세에서 단일 업무 삭제, 프로젝트 목록에서 프로젝트 삭제 전 `project_id` 기준 전체 업무 삭제가 있습니다.

주의:

- `tasks.project_id`는 코드상 핵심 관계지만 CSV FK에는 없습니다.
- `assignee`는 직원 FK가 아니라 이름 문자열입니다.
- `assigned_at`, `updated_at`은 실제 컬럼에 없습니다.

## 5. employees

역할: 직원 정보, 로그인 이메일 매핑, role 기반 권한 판단에 사용합니다.

PK: `id` bigint, not null

CSV 기준 현재 원격 DB 컬럼:

| Column | Type | Nullable | Default | Code Usage |
| --- | --- | --- | --- | --- |
| `id` | bigint | NO | null | 직원 식별자 |
| `name` | text | NO | null | 담당자 이름, 사용자 이름 |
| `position` | text | YES | null | 직급/직책 표시 |
| `active` | boolean | YES | true | 활성 직원 여부 |
| `created_at` | timestamp with time zone | YES | now() | 직원 목록 정렬 가능 컬럼 |
| `email` | text | YES | null | Supabase Auth session email 매칭 |
| `auth_user_id` | uuid | YES | null | Auth user 연결 후보 |
| `role` | text | YES | null | admin/member 등 권한 판단 |

Sprint DB-1 로컬 migration 적용 후 추가 예정 컬럼:

| Column | Type | Nullable | Default | 판단 |
| --- | --- | --- | --- | --- |
| `department` | text | YES | null | 직원관리 입력/저장/목록/검색과 Global Search에서 실제 사용 중이므로 유지 |

Sprint DB-1 정리 대상:

- `updated_at`은 직원관리 화면에서 표시, 검색, 정렬에 사용되지 않고 저장 payload에만 남아 있어 migration을 만들지 않았습니다.
- 직원 수정/활성 상태 변경 payload에서 `updated_at` 저장을 제거했습니다.

추가 주의:

- 현재 CSV에는 `phone`, `memo`, `is_active` 컬럼도 없습니다. 직원관리 화면은 해당 필드를 사용 중이므로 별도 Sprint에서 `active` 매핑과 부가 필드 필요성을 검토해야 합니다.

## 6. notices

CSV 기준 실제 `notices` 테이블은 확인되지 않았습니다.

현재 코드 상태:

- `app/notices/page.tsx`는 DB 조회 없이 정적 placeholder 공지를 표시합니다.
- `components/search/GlobalSearch.tsx`는 정적 `noticeRows`를 검색 결과에 포함합니다.
- 공지 CRUD, 공지 상세, 공지 DB 컬럼은 현재 실제 DB 구조로 문서화할 수 없습니다.

## 7. project_files

역할: 프로젝트 파일 메타데이터를 저장합니다. 실제 파일 본문은 Supabase Storage `project-files` bucket을 사용하는 구조입니다.

PK: `id` uuid, not null, default `gen_random_uuid()`

FK: `project_id -> projects.id`

| Column | Type | Nullable | Default | Code Usage |
| --- | --- | --- | --- | --- |
| `id` | uuid | NO | gen_random_uuid() | 파일 메타데이터 식별자 |
| `project_id` | bigint | NO | null | 프로젝트 연결 |
| `file_name` | text | NO | null | 원본 파일명 |
| `file_type` | text | NO | null | 파일 분류 |
| `storage_path` | text | NO | null | Storage object 경로 |
| `file_size` | bigint | YES | null | 파일 크기 |
| `mime_type` | text | YES | null | MIME type |
| `description` | text | YES | null | 파일 설명 |
| `uploaded_by` | text | YES | null | 등록자 이름 |
| `uploaded_by_email` | text | YES | null | 등록자 이메일 |
| `created_at` | timestamp with time zone | NO | now() | 등록일 |

관계 사용:

- 조회: 프로젝트 상세의 파일 영역에서 `project_id`로 조회합니다.
- 생성: 파일 업로드 시 Storage 업로드 후 `project_files.project_id`로 메타데이터를 insert합니다.
- 삭제: 파일 단건 삭제 시 Storage object 삭제 후 `project_files.id` 기준 메타데이터를 delete합니다.
- 프로젝트 삭제 흐름에서는 현재 파일 메타데이터와 Storage object를 함께 삭제하지 않습니다.

## Additional Actual Tables

### shipments

역할: 출고 정보를 관리합니다.

PK: `id` bigint, not null

CSV 기준 FK: 없음

주요 컬럼: `project_id`, `task_id`, `shipment_round`, `planned_date`, `actual_date`, `destination`, `receiver`, `driver_phone`, `site_name`, `item_name`, `quantity`, `shipment_date`, `vehicle_number`, `driver_name`, `status`, `memo`, `created_at`

관계 사용:

- 조회: 출고 화면과 Calendar는 전체 출고를 조회합니다. 프로젝트 상세는 출고 업무 완료 시 `task_id` 중복 여부를 확인합니다.
- 생성: 프로젝트 상세에서 출고 유형 업무가 완료되면 `project_id`, `task_id`를 함께 저장해 자동 생성합니다. 출고 화면의 수동 등록은 현재 `project_id: null`, `task_id: null`을 넣습니다.
- 수정: 출고 화면과 Calendar에서 출고 상태, 출고일, 상세 정보를 update합니다.
- 삭제: 프로젝트 삭제 시 `project_id` 기준 출고를 먼저 delete합니다. 출고 화면에는 단건 삭제가 없습니다.

주의:

- CSV에서 `shipments.project_id`는 nullable NO로 확인되지만, 코드의 수동 출고 등록은 `project_id: null`을 insert합니다. 실제 DB가 CSV와 같다면 수동 출고 등록이 실패할 수 있습니다.
- `shipments.task_id`는 nullable 관계로 사용됩니다. 모든 출고가 업무에서 파생되는 구조는 아닙니다.

### task_templates

역할: 프로젝트 생성 시 공정별 기본 업무를 자동 생성하기 위한 템플릿입니다.

PK: `id` bigint, not null

주요 컬럼: `process_type`, `task_order`, `task_name`, `task_type`, `created_at`

### activity_logs

역할: 프로젝트 생성, 업무 완료 등 주요 사용자 활동 이력을 저장합니다.

PK: `id` bigint, not null

CSV 기준 FK: 없음

주요 컬럼: `created_at`, `employee_name`, `employee_email`, `action_type`, `target_type`, `target_id`, `project_id`, `title`, `description`

관계 사용:

- 조회: Dashboard에서 최근 활동 8개를 조회하고 `project_id`를 표시합니다.
- 생성: `lib/activity.ts`에서 프로젝트 생성, 업무 완료 등 이벤트를 insert합니다.
- 수정/삭제: 현재 주요 코드에서 activity log update/delete는 확인되지 않았습니다.
- 프로젝트 삭제 흐름에서는 activity log를 삭제하지 않습니다.

## 8. 관계도

CSV 기준 실제 FK:

```text
Projects
└── ProjectFiles (project_files.project_id -> projects.id)
```

코드에서 논리적으로 사용하는 관계:

```text
Projects
├── Tasks (tasks.project_id, FK 없음)
│   └── Shipments (shipments.task_id, FK 없음, nullable)
├── Shipments (shipments.project_id, FK 없음)
├── ProjectFiles (project_files.project_id, 실제 FK 있음)
└── ActivityLogs (activity_logs.project_id, FK 없음, nullable)
```

권장 FK 초안:

```text
Projects
├── Tasks: on delete restrict
├── Shipments: on delete restrict
├── ProjectFiles: 기존 FK 유지, 삭제 정책은 현 Storage 정리 방식 확인 후 결정
└── ActivityLogs: on delete set null

Tasks
└── Shipments: on delete set null
```

## 9. RLS/Storage 정책 요약

`db_schema_columns.csv`와 `db_foreign_keys.csv`에는 RLS 정책 정보가 포함되어 있지 않습니다.

현재 저장소의 `supabase/migrations/20260714162000_create_project_files.sql` 기준으로는 다음 정책 의도가 확인됩니다.

- `project_files` select: authenticated 사용자
- `project_files` insert: authenticated 사용자
- `project_files` delete: admin 직원만
- Storage bucket: `project-files`, private
- Storage object select/insert: authenticated 사용자
- Storage object delete: admin 직원만

다른 테이블의 RLS 적용 여부는 제공된 CSV만으로 확인할 수 없습니다.

## 10. Migration 운영 규칙

- 원격 Supabase DB를 직접 변경하지 않고 migration 파일로 준비한 뒤 검토 후 적용합니다.
- `DROP TABLE`, 기존 데이터 삭제, 기존 컬럼 삭제는 금지합니다.
- 새 컬럼은 기존 데이터가 정상 동작하도록 nullable 또는 안전한 default를 우선 검토합니다.
- 실제 DB 구조는 `db_schema_columns.csv`, `db_foreign_keys.csv`로 재확인한 뒤 문서와 코드를 맞춥니다.
- FK 추가는 기존 데이터 정합성을 먼저 평가한 후 별도 migration으로 처리합니다.
- FK 초안은 먼저 `NOT VALID`로 작성하고, orphan 정리 후 `VALIDATE CONSTRAINT`를 검토합니다.
- Storage/RLS 변경은 테이블 migration과 분리하고 영향 범위를 명확히 기록합니다.

## 11. 코드-DB 불일치 목록

현재 확인된 불일치:

| Area | Code Reference | Actual DB | Sprint 판단 |
| --- | --- | --- | --- |
| 직원 부서 | `employees.department` | CSV 원격 DB 컬럼 없음 | DB-1에서 실제 입력/저장/검색/표시에 사용 중이므로 migration 준비 |
| 직원 수정시각 | `employees.updated_at` | CSV 원격 DB 컬럼 없음 | DB-1에서 표시/검색/정렬에 사용되지 않아 코드 payload에서 제거 |
| 직원 활성 상태 | `employees.is_active` | CSV에는 `active`만 있음 | 이번 Sprint 범위 밖, 별도 정합성 작업 필요 |
| 직원 부가 정보 | `employees.phone`, `employees.memo` | 컬럼 없음 | 이번 Sprint 범위 밖, 별도 필요성 판단 필요 |
| 공지 DB | `/notices`, `noticeRows` | `notices` 테이블 없음 | 현재 정적 UI만 가능 |
| 업무 FK | `tasks.project_id` | FK 없음 | DB-2에서 `projects.id` RESTRICT 초안 권장 |
| 출고-프로젝트 FK | `shipments.project_id` | FK 없음 | DB-2에서 `projects.id` RESTRICT 초안 권장, null insert 코드 위험 있음 |
| 출고-업무 FK | `shipments.task_id` | FK 없음 | DB-2에서 `tasks.id` SET NULL 초안 권장 |
| 활동 로그 FK | `activity_logs.project_id` | FK 없음 | DB-2에서 `projects.id` SET NULL 초안 권장 |

## 12. FK 추가 검토

| Relationship | Code Usage | Recommended Policy | Reason |
| --- | --- | --- | --- |
| `tasks.project_id -> projects.id` | 프로젝트 생성 후 기본 업무 생성, 프로젝트 상세/대시보드/알림의 핵심 연결 | `ON DELETE RESTRICT`, `ON UPDATE CASCADE` | 업무가 남아 있는 프로젝트 삭제를 DB가 막아야 하며, 현재 코드는 삭제 전 업무를 명시 삭제합니다. |
| `shipments.project_id -> projects.id` | 프로젝트 삭제 전 출고 삭제, 출고 업무 완료 시 자동 생성 | `ON DELETE RESTRICT`, `ON UPDATE CASCADE` | 출고는 업무 기록 성격이 있어 프로젝트 자동 삭제 전 명시적 검토가 안전합니다. |
| `shipments.task_id -> tasks.id` | 출고 업무 완료 시 중복 생성 방지와 원천 업무 추적 | `ON DELETE SET NULL`, `ON UPDATE CASCADE` | 출고 기록은 업무 삭제 후에도 남길 수 있어야 하며 `task_id`는 nullable입니다. |
| `activity_logs.project_id -> projects.id` | 최근 활동에서 프로젝트 번호 표시, 이벤트 기록 | `ON DELETE SET NULL`, `ON UPDATE CASCADE` | 활동 이력은 프로젝트 삭제 후에도 감사 로그로 보존하되 끊어진 참조는 null 처리하는 편이 안전합니다. |
| `project_files.project_id -> projects.id` | 프로젝트 상세 파일 목록 | 기존 FK 유지, 삭제 정책 별도 확인 | Storage object 정리와 함께 설계해야 하므로 이번 Sprint에서 변경하지 않습니다. |

잠재적 데이터 문제:

- `tasks.project_id`가 존재하지 않는 `projects.id`를 참조하면 FK 추가 실패.
- `shipments.project_id`가 존재하지 않는 프로젝트를 참조하면 FK 추가 실패.
- `shipments.task_id`가 삭제된 업무를 참조하면 FK 추가 실패.
- `activity_logs.project_id`가 삭제된 프로젝트를 참조하면 FK 추가 실패.
- 수동 출고 등록 코드가 `project_id: null`을 insert하지만 CSV는 `shipments.project_id`를 NOT NULL로 표시합니다. FK 이전에 컬럼 nullability/수동 출고 정책을 먼저 정리해야 합니다.
- 프로젝트 삭제 흐름이 `project_files`와 Storage object를 정리하지 않으므로, 프로젝트 삭제 시 기존 `project_files` FK 정책에 따라 삭제가 실패하거나 파일 메타데이터가 남을 수 있습니다.

향후 권장 수정:

- FK 적용 전 초안 파일의 preflight query로 orphan 데이터를 확인합니다.
- 수동 출고 등록이 프로젝트 없이 허용되는지 결정하고 `shipments.project_id` 정책을 정리합니다.
- 프로젝트 삭제 정책을 `RESTRICT` 중심으로 유지할지, 애플리케이션에서 연관 데이터 정리를 더 엄격히 할지 결정합니다.
- `project_files` 삭제 정책은 Storage object 정리 방식과 함께 별도 Sprint에서 검토합니다.
