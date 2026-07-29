# Sprint 6-2 권한 UAT 체크리스트

결과 표기는 `PASS`, `FAIL`, `BLOCKED`, `N/A` 중 하나로 기록한다. API/RPC/RLS의 거부는 HTTP 401/403 또는 권한 오류처럼 데이터 변경 없이 명확히 실패해야 한다. 테스트 데이터는 `UAT-` 접두어를 사용한다.

가입 흐름 UAT 전 Supabase Confirm email이 OFF인지 관리자가 확인한다. 이메일 인증은 테스트 조건이 아니며, 가입 직후 세션 종료와 관리자 승인 후 로그인 가능 여부를 검증한다.

| 역할/상태 | UI | API | RPC | RLS |
| --- | --- | --- | --- | --- |
| Admin | 전체 조회, 프로젝트 생성·수정·삭제, 업무/출고 편집, 직원·설정 화면 접근 | 조회·생성·수정·삭제 및 직원 관리 요청 허용 | 관리자 전용 삭제 RPC와 설정 관리 RPC 허용 | Core 전체 CRUD 허용(활동 로그는 설계상 INSERT/SELECT만), 직원 관리 허용 |
| Manager | 전체 조회, 프로젝트 생성·수정, 업무/출고·설정 편집 허용; 삭제·직원 관리 차단 | 조회·생성·수정 허용; 삭제·직원 관리 요청 거부 | 프로젝트/업무 편집 RPC 허용; 관리자 전용 삭제 RPC 거부 | Core SELECT, 프로젝트 INSERT/UPDATE, 업무·출고 INSERT/UPDATE 허용; DELETE 거부 |
| Staff | 전체 조회, 업무·출고 편집 허용; 프로젝트 생성·수정·삭제, 설정·직원 관리 차단 | 조회와 업무·출고 생성/수정 허용; 관리/삭제 요청 거부 | 업무 편집 RPC 허용; 프로젝트·설정 관리 및 관리자 RPC 거부 | Core SELECT, 업무·출고 INSERT/UPDATE 허용; 프로젝트 쓰기와 DELETE 거부 |
| Viewer | 조회 화면만 표시되고 모든 쓰기/관리 동작 차단 | GET/조회 허용; 모든 쓰기 요청 거부 | 조회 목적 외 RPC 거부 | Core SELECT 허용; INSERT/UPDATE/DELETE 전부 거부 |
| Inactive | 로그인 후 비활성 사용자 안내 또는 접근 차단; 업무 데이터 미노출 | 인증 토큰이 있어도 ERP API 전부 거부 | 모든 권한 RPC가 false/거부 | 모든 ERP 데이터 SELECT/쓰기 0행 또는 거부 |
| Pending | 로그인 후 승인 대기 안내; 업무 데이터 미노출 | ERP API 전부 거부 | 모든 권한 RPC가 false/거부 | 모든 ERP 데이터 SELECT/쓰기 0행 또는 거부; 본인 신청 상태만 정책 범위에서 확인 |
| Rejected | 로그인 후 승인 거절 안내; 업무 데이터 미노출 | ERP API 전부 거부 | 모든 권한 RPC가 false/거부 | 모든 ERP 데이터 SELECT/쓰기 0행 또는 거부; 본인 상태만 정책 범위에서 확인 |

## 실행 기록

| 계정 | UI | API | RPC | RLS | 실행자/일시 | 증빙 또는 결함 |
| --- | --- | --- | --- | --- | --- | --- |
| TEST_ADMIN | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | 2026-07-29 | Admin API 전환 후 Seed 미실행 |
| TEST_MANAGER | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | 2026-07-29 | Admin API 전환 후 Seed 미실행 |
| TEST_STAFF | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | 2026-07-29 | Admin API 전환 후 Seed 미실행 |
| TEST_VIEWER | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | 2026-07-29 | Admin API 전환 후 Seed 미실행 |
| TEST_INACTIVE | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | 2026-07-29 | Admin API 전환 후 Seed 미실행 |
| TEST_PENDING | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | 2026-07-29 | Admin API 전환 후 Seed 미실행 |
| TEST_REJECTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | 2026-07-29 | Admin API 전환 후 Seed 미실행 |

## 공통 완료 조건

- 신규 가입은 승인 전 세션이 유지되지 않고, 승인 후 `approved + active + Auth 연결` 조건에서만 로그인된다.
- 승인 대기·거절·비활성·직원 정보 없음 계정은 상태 안내 후 세션이 제거된다.
- UI에서 숨긴 동작을 URL 직접 접근이나 요청 재전송으로 우회할 수 없다.
- 거부된 API/RPC/RLS 요청은 데이터를 변경하지 않는다.
- 역할 전환 전후 세션이 섞이지 않는다.
- 테스트 전후 Auth/employee 연결이 7건이며 orphan employee/auth가 없다.
- 발견한 실패는 재현 절차와 기대/실제 결과를 결함으로 남긴다.
