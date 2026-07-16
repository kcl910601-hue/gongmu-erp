# Gongmu ERP - Project Context

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
