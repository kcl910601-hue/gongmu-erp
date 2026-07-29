# Release Candidate 테스트 환경

Sprint 6-2의 Seed와 검증 SQL은 Development/Test 전용이다. 운영 Supabase 프로젝트에서는 실행하지 않는다.

## 내부 ERP 가입 정책

- 가입 절차는 `가입 요청 → 관리자 승인 → 로그인`이다.
- 이메일 인증은 사용하지 않는다. Supabase Authentication의 **Confirm email을 OFF**로 설정해야 한다.
- 가입 요청 성공 직후 브라우저 세션을 종료하며, `approved`이면서 `active=true`인 직원만 ERP에 접근할 수 있다.
- 승인 대기, 거절, 비활성 또는 직원 정보가 없는 Auth 사용자는 로그인 직후 세션을 종료하고 상태별 안내를 표시해야 한다.

## Production UAT 예외

배포 전 별도 테스트 프로젝트가 없는 경우에 한해 project ref `cropibqvvzpxlnqpkyto`에서 Production UAT가 승인되었다. 다음 값이 모두 일치해야 한다.

- `ALLOW_PRODUCTION_UAT=true`
- `UAT_PROJECT_REF=cropibqvvzpxlnqpkyto`
- `UAT_PASSWORD`: Git에서 제외된 로컬 비밀값
- `SUPABASE_URL`: 같은 project ref의 Supabase API URL
- `SUPABASE_SERVICE_ROLE_KEY`: 서버 전용 service role key

먼저 `npm run seed:uat -- --dry-run`으로 예약 계정 충돌을 확인하고, 실제 실행 전 Production 대상·기존 계정 미변경·Cleanup 필요 경고를 확인한다. UAT 계정은 `uat.*@example.com` 이메일과 `[UAT]` 이름으로만 생성한다.

## 1. 테스트 계정 생성

1. Git에서 제외되는 `.env.test.local` 등에 아래 필수 환경변수를 설정한다.
   - `UAT_ENVIRONMENT`: `development` 또는 `test`
   - `UAT_PASSWORD`: 12자 이상의 테스트 계정 비밀번호
   - `SUPABASE_PROJECT_REF`: 테스트 프로젝트 ref
   - `SUPABASE_PRODUCTION_PROJECT_REF`: 운영 프로젝트 ref
   - `SUPABASE_URL`: 대상 프로젝트 API URL
   - `SUPABASE_SERVICE_ROLE_KEY`: 서버 전용 service role key
2. `npm run seed:uat -- --dry-run`으로 Auth와 employees 이메일 충돌을 확인한다.
3. 실행 도구가 환경 구분, 승인 플래그, project ref와 API URL 일치를 확인한다. 하나라도 확인되지 않으면 Seed는 실행되지 않는다.
4. `supabase/verification/20260731100000_verify_uat_test_accounts.sql`을 테스트 환경에서 실행한다.
5. 계정 매트릭스 7행이 모두 `PASS`, 요약이 `7 / 7 / 7 / true`인지 확인한다.
6. orphan employee와 orphan auth 결과가 모두 0행인지 확인한다. 기존 비테스트 데이터의 orphan이 나오면 Seed와 구분하여 원인을 조사하고 임의 수정하지 않는다.

비밀번호는 `UAT_PASSWORD` 환경변수로만 `auth.admin.createUser()`에 전달하며 저장소와 실행 로그에 출력하지 않는다. service role key도 서버 실행 환경에서만 사용한다. Seed는 중복 계정이 하나라도 있으면 생성 전에 중단하며, 실행 도중 실패하면 해당 실행에서 생성한 계정을 보상 삭제한다.

| 계정 | 이메일 | 기대 상태 |
| --- | --- | --- |
| TEST_ADMIN | uat.admin@example.com | admin / active / approved |
| TEST_MANAGER | uat.manager@example.com | manager / active / approved |
| TEST_STAFF | uat.staff@example.com | staff / active / approved |
| TEST_VIEWER | uat.viewer@example.com | viewer / active / approved |
| TEST_INACTIVE | uat.inactive@example.com | staff / inactive / approved |
| TEST_PENDING | uat.pending@example.com | staff / active / pending |
| TEST_REJECTED | uat.rejected@example.com | staff / active / rejected |

## 2. 로그인

브라우저의 시크릿 창 또는 역할마다 분리된 프로필을 사용한다. 각 계정으로 로그인한 뒤 표시된 사용자와 테스트 계정이 일치하는지 확인한다. 역할을 바꿀 때는 반드시 로그아웃하고 세션 쿠키가 제거된 뒤 다음 계정으로 로그인한다.

실제 직원 가입 테스트 전 Supabase Dashboard에서 `Authentication → Sign In / Providers → Email`의 Confirm email이 OFF인지 관리자가 확인한다. 설정 변경은 코드나 Seed에서 수행하지 않는다.

Inactive, Pending, Rejected는 Auth 인증 성공 후 ERP 접근이 각각 비활성·승인 대기·승인 거절 흐름으로 차단되어야 한다. 로그인 자체의 성공과 ERP 권한 허용을 혼동하지 않는다.

## 3. 권한 테스트

`docs/UAT_CHECKLIST.md`를 역할별로 수행한다. 쓰기 테스트에는 UAT 전용 프로젝트/업무 데이터만 사용하고, 실제 업무 데이터는 수정하거나 삭제하지 않는다. 브라우저 UI뿐 아니라 DevTools 또는 API 클라이언트로 직접 API 요청도 확인하고, Supabase 클라이언트 세션으로 RPC와 RLS 허용/거부 결과를 기록한다.

## 4. 종료

1. 생성·수정한 UAT 전용 업무 데이터를 기록하고 필요한 경우 관리자 승인 아래 정리한다.
2. 모든 테스트 브라우저에서 로그아웃하고 세션을 제거한다.
3. Verification SQL을 다시 실행해 7개 계정 연결 상태와 orphan 0건을 확인한다.
4. UAT 체크리스트에 결과, 실행자, 일시, 증빙 링크, 결함 번호를 남긴다.
5. 테스트 환경을 계속 공유한다면 공통 초기 비밀번호를 그대로 방치하지 않는다.

Production UAT 완료 후에는 결과와 결함 증빙을 보존하고 사용자 승인 뒤에만 `npm run cleanup:uat`를 실행한다. 실제 Cleanup은 `ALLOW_PRODUCTION_UAT_CLEANUP=true`가 추가로 필요하며, 먼저 `npm run cleanup:uat -- --dry-run`으로 정확한 대상 ID와 건수를 확인한다.
