# ERP Database v1

이 문서는 프로젝트 루트의 `db_schema_columns.csv`, `db_foreign_keys.csv`와 로컬 migration 파일을 기준으로 작성합니다. 원격 Supabase DB는 직접 변경하지 않았으며, 존재하지 않는 테이블이나 컬럼은 임의로 추가해 문서화하지 않습니다.

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
