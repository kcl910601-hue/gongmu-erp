# Gongmu ERP Architecture

## Purpose

공무팀 ERP는 프로젝트, 업무, 출고, 직원, 파일, 활동 이력을 한 곳에서 관리하는 Next.js/Supabase 기반 업무 시스템입니다. 이 문서는 현재 코드 구조와 실제 DB 구조 기준의 아키텍처를 요약합니다.

## Application Layers

### Presentation Layer

- `app/`: Next.js App Router 화면
  - Dashboard: `app/page.tsx`
  - Projects: `app/projects/page.tsx`
  - Project Detail: `app/projects/[id]/page.tsx`
  - Calendar/Gantt: `app/calendar/page.tsx`, `components/gantt/IntegratedProjectGantt.tsx`
  - Shipments, Employees, Settings, Notices
- `components/`: 재사용 UI와 기능 컴포넌트
  - `components/ui`: `Badge`, `Button`, `EmptyState`, `ProgressBar`
  - `components/files`: 프로젝트 파일 UI
  - `components/search`: Global Search
  - `components/notifications`: Notification Center

### Business Layer

- `lib/supabase.ts`: Supabase client
- `lib/auth.ts`: 현재 로그인 직원 조회와 role helper
- `lib/projects.ts`: 프로젝트 목록 조회와 프로젝트 관련 helper
- `lib/status.ts`: 프로젝트/업무 status normalize, label, 판정 함수
- `lib/files.ts`: project_files metadata와 Storage signed URL 처리
- `lib/activity.ts`: activity_logs 기록
- `lib/notifications.ts`: 기존 업무/파일 기반 알림 계산

### Data Layer

실제 CSV 기준 테이블:

- `projects`
- `tasks`
- `employees`
- `project_files`
- `shipments`
- `task_templates`
- `activity_logs`

CSV 기준 실제 FK는 `project_files.project_id -> projects.id`만 확인됩니다. 그 외 프로젝트-업무, 프로젝트-출고, 업무-출고, 프로젝트-활동로그 관계는 코드의 논리 관계로 사용합니다.

## Core Domains

### Projects

`projects`는 프로젝트 기준 정보의 중심 테이블입니다. 프로젝트 생성 후 `task_templates`를 읽어 `tasks.project_id`에 새 프로젝트 id를 저장합니다. 프로젝트 삭제 코드는 현재 출고와 업무를 먼저 삭제한 뒤 프로젝트를 삭제합니다.

### Tasks

`tasks`는 프로젝트별 업무 목록입니다. `project_id`는 코드상 프로젝트 연결 값이며, 상세 화면, Dashboard, Calendar, Gantt, Notification에서 핵심 join key처럼 사용됩니다. 실제 DB FK는 아직 없습니다.

### Shipments

`shipments`는 출고 정보입니다. 출고 업무 완료 시 프로젝트 상세에서 `project_id`와 `task_id`를 저장해 자동 생성합니다. 출고 화면의 수동 등록은 현재 `project_id: null`, `task_id: null`을 저장하려 하므로, CSV의 `shipments.project_id` NOT NULL과 충돌 가능성이 있습니다.

### Activity Logs

`activity_logs`는 프로젝트 생성, 업무 완료 등 이벤트 기록입니다. `project_id`는 nullable이며 최근 활동 표시용으로 사용됩니다. 로그 보존 성격이 강해 프로젝트 삭제 시 자동 삭제보다 `SET NULL`이 더 안전합니다.

### Employees/Auth

`employees.email`은 Supabase Auth session email과 매칭합니다. `employees.role`은 admin/member 등 권한 판단에 사용합니다. 현재 업무 담당자는 FK가 아니라 `tasks.assignee` 문자열입니다.

### Project Files

`project_files`는 실제 FK가 확인된 파일 메타데이터 테이블입니다. 파일 본문은 private Storage bucket `project-files`에 저장하고 signed URL로 열기/다운로드합니다. 프로젝트 삭제 시 Storage object 정리 정책은 아직 별도 정리가 필요합니다.

### Notices

실제 DB에는 `notices` 테이블이 확인되지 않았습니다. 현재 `/notices`는 정적 placeholder 화면입니다.

## Relationship Model

Actual FK from CSV:

```text
Projects
└── ProjectFiles
```

Logical relationships used by code:

```text
Projects
├── Tasks
│   └── Shipments
├── Shipments
├── ProjectFiles
└── ActivityLogs
```

DB-2 recommended FK draft:

- `tasks.project_id -> projects.id`: `ON DELETE RESTRICT`
- `shipments.project_id -> projects.id`: `ON DELETE RESTRICT`
- `shipments.task_id -> tasks.id`: `ON DELETE SET NULL`
- `activity_logs.project_id -> projects.id`: `ON DELETE SET NULL`
- `project_files.project_id -> projects.id`: existing FK 유지, delete policy는 Storage 정리와 함께 별도 검토

## Delete Policy

현재 앱은 프로젝트 삭제 시 연관 출고와 업무를 명시 삭제합니다. 따라서 DB FK는 무조건 cascade보다 `RESTRICT` 중심이 안전합니다. 업무/출고/파일/활동로그가 남아 있을 때 프로젝트 삭제가 자동으로 퍼지는 것보다, 애플리케이션에서 의도적으로 정리한 뒤 삭제하는 흐름이 기존 코드와 맞습니다.

단, 로그와 출고의 원천 업무 연결은 이력 성격이 있으므로 부모 삭제 시 기록 자체를 지우기보다 nullable FK를 `SET NULL`로 끊는 정책이 더 적합합니다.

## Status Policy

Status 값은 DB check constraint가 CSV에 표시되지 않으므로 코드 변환 정책을 기준으로 처리합니다.

Project status helper:

- `normalizeProjectStatus()`
- `getProjectStatusLabel()`
- `isProjectCompleted()`
- `isProjectInProgress()`

Task status helper:

- `normalizeTaskStatus()`
- `getTaskStatusLabel()`
- `isTaskCompleted()`
- `isTaskInProgress()`
- `isTaskPending()`

## Date Policy

- 프로젝트 종료일 표시 기준은 `end_date || completion_due_date`입니다.
- 신규 프로젝트 저장/수정은 `end_date`를 사용합니다.
- 업무 일정/Gantt 기준은 `tasks.start_date`, `tasks.due_date`입니다.
- 지연 업무는 미완료 업무 중 `due_date < today`로 계산합니다.

## RLS and Storage

제공된 CSV에는 RLS 정보가 없습니다. 저장소 migration 기준으로 `project_files`와 `project-files` Storage bucket은 authenticated 사용자 조회/등록, admin 삭제 정책을 의도합니다.

## Known Schema Risks

- `employees.department`는 DB-1에서 migration 준비 상태이며 원격 DB 적용 전에는 CSV에 없습니다.
- `employees.is_active`, `employees.phone`, `employees.memo`는 직원관리 코드에서 사용하지만 CSV에 없습니다.
- `notices` 테이블은 실제 CSV에 없습니다.
- `tasks.project_id`, `shipments.project_id`, `shipments.task_id`, `activity_logs.project_id`는 코드 관계로 사용하지만 CSV FK에는 없습니다.
- `shipments.project_id`는 CSV에서 NOT NULL이지만 수동 출고 등록 코드는 null insert를 시도합니다.

자세한 실제 컬럼, 관계 감사, FK 초안은 `docs/DATABASE.md`를 기준 문서로 봅니다.
