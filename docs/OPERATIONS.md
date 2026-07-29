# ERP 운영 절차

## 내부 직원 가입·승인 정책

- 운영 흐름은 `가입 요청 → 관리자 승인 → 로그인`이며 이메일 인증은 사용하지 않는다.
- Supabase Authentication의 Confirm email은 운영 관리자가 수동으로 OFF 상태를 유지한다.
- 승인은 Auth 사용자 존재, 이메일 일치, `auth_user_id` 연결, `pending` 또는 `rejected` 상태를 확인한 뒤 `approval_status=approved`, `active=true`로 변경한다.
- Auth만 있거나 employees만 있는 불완전 계정은 일반 재가입으로 복구하지 않고 관리자 화면에서 확인한다.
- 완전 삭제는 서버 전용 API에서 관련 데이터/FK 영향 확인 후 employees와 Auth를 삭제하고 잔존 여부를 검증한다. service role key는 브라우저에 노출하지 않는다.

## Sprint 6-2 UAT Seed 안전 절차

- `npm run seed:uat`는 `UAT_ENVIRONMENT`, project ref, Supabase URL, service role key, `UAT_PASSWORD`가 모두 있어야 실행된다.
- 대상 project ref와 Supabase URL이 일치하지 않으면 즉시 중단한다.
- 비밀번호는 Git에서 제외된 로컬 환경 파일에만 저장하고 출력 로그에 남기지 않는다.
- Seed 완료 후 Verification SQL이 모두 통과하기 전에는 역할별 UAT를 시작하지 않는다.
- 2026-07-29 확인된 `cropibqvvzpxlnqpkyto`는 `main · Production`이므로 Seed와 UAT를 실행하지 않았다.

### Sprint 6-3 Production UAT 예외

- `ALLOW_PRODUCTION_UAT=true`와 정확한 `UAT_PROJECT_REF`가 동시에 있을 때만 Seed 예외를 허용한다.
- Seed 전 `--dry-run`, Seed 후 Verification, 역할별 실제 사용자 JWT 검증 순서를 지킨다.
- 테스트 데이터는 `[UAT]` prefix와 실행 중 기록한 ID로만 식별한다.
- Cleanup 도구는 준비만 하며 UAT 결과 기록 후 별도 사용자 승인을 받아 실행한다.
- 실제 Cleanup에는 `ALLOW_PRODUCTION_UAT_CLEANUP=true`가 필요하다.
- 배포 전 UAT 계정과 `[UAT]` 데이터를 제거하고 Verification을 다시 실행한다.

### Sprint 6-4 Admin API 전환

- Auth 생성과 삭제는 서버 전용 `createClient()`의 `auth.admin.createUser()` / `auth.admin.deleteUser()`만 사용한다.
- `auth.users` 직접 SQL, DB URL, `psql`, Seed/Cleanup SQL은 사용하지 않는다.
- Auth 생성 트리거가 employees 행을 만들면 UAT 상태로 갱신하고, 트리거 행이 없을 때만 employees를 insert한다.
- Seed 실패 시 이번 실행에서 생성된 employees와 Auth 사용자를 역순으로 보상 삭제한다.
- Cleanup은 `[UAT]` 데이터, employees, Auth 순서이며 완료 후 Admin API와 employees 조회로 잔존 여부를 검증한다.
- 기존 Verification SQL은 읽기 전용 최종 확인에 계속 사용한다.

## Core RLS 및 Table Grants 배포

1. Backup
   - 현재 `pg_policies`, `pg_class`, `information_schema.role_table_grants`를 조회합니다.
   - Core 정책 교체 전에는 `rls_policy_backups` 백업 행을 확인합니다.
2. Policy 확인
   - `projects`, `tasks`, `shipments`, `activity_logs`의 정책명, USING, WITH CHECK,
     role, permissive 여부를 repository와 비교합니다.
3. Migration 적용
   - 기존 migration은 수정하지 않고 timestamp 순서대로 새 migration만 적용합니다.
   - Security Grant Hardening은 정상 CRUD grants를 유지하고 `TRUNCATE`,
     `REFERENCES`, `TRIGGER`만 회수합니다.
4. Verification
   - `supabase/verification/20260730111000_verify_security_grants.sql`을 실행합니다.
   - 네 테이블의 RLS가 enabled이고 세 권한이 모두 false인지 확인합니다.
   - Core `pg_policies`가 변경되지 않았는지 확인합니다.
5. CRUD Test
   - Admin, Manager, Staff, Viewer 및 비활성·승인대기·거절 계정으로 허용/차단을
     확인합니다. 테스트 데이터는 전용 레코드만 사용하고 완료 후 안전하게 정리합니다.
6. Rollback 확인
   - `supabase/rollback/20260730110000_harden_core_table_grants_rollback.sql`은
     이전 grants 복원이 필요한 비상 상황에서만 실행합니다.
   - rollback은 보안상 불필요한 권한을 다시 부여하므로 실행 전에 승인이 필요합니다.
7. Release 완료
   - Verification과 역할별 CRUD 결과를 기록한 후 배포 완료로 표시합니다.

## Sprint 5-11D 운영 확인 기준

| 테이블 | SELECT | INSERT | UPDATE | DELETE | TRUNCATE | REFERENCES | TRIGGER |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| projects | O | O | O | O | X | X | X |
| tasks | O | O | O | O | X | X | X |
| shipments | O | O | O | O | X | X | X |
| activity_logs | O | O | X | X | X | X | X |

표의 CRUD grants는 authenticated 역할의 table-level 권한입니다. 실제 행 접근은
Core RLS와 ERP 권한 함수가 제한합니다.

### 적용 결과

- Forward migration 운영 적용: 완료
- Core 테이블 RLS enabled 확인: 완료
- `TRUNCATE`, `REFERENCES`, `TRIGGER` false 확인: 완료
- 기존 Core RLS 정책 14개 유지 확인: 완료
- Rollback SQL 작성 및 미실행 상태 확인: 완료
- 역할별 실제 계정 CRUD 테스트: 별도 운영 테스트 필요
