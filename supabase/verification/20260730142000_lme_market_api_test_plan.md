# LME Market API 권한 테스트 절차

운영 DB에는 테스트 가격을 입력하지 않는다. 아래 절차는 로컬 Supabase 또는 별도 테스트 프로젝트에서 관리자·일반 승인 사용자·비로그인 세션으로 각각 수행한다.

## 관리자

1. `GET /api/statistics/lme/market` → 200
2. `GET /api/statistics/lme/market/latest?material=AL` → 200
3. 검증용 CSV `POST /api/statistics/lme/market/import` preview → 200, DB와 로그 변화 없음
4. 검증용 CSV commit → 200, 응답 건수와 `lme_import_logs` 건수 일치
5. 수동 `POST /api/statistics/lme/market` → 201
6. Supabase REST로 동일 행 UPDATE/DELETE → 403 또는 immutable trigger 오류

## 일반 승인 사용자

1. Market 및 latest GET → 200
2. 수동 POST 및 Import preview/commit → 403
3. Supabase REST INSERT/UPDATE/DELETE → RLS 또는 권한 오류

## 비로그인·anon

1. Market 및 latest GET → 403
2. 수동 POST 및 Import → 403
3. Supabase anon client 직접 SELECT/INSERT/UPDATE/DELETE 및 Import RPC → 권한 오류

## 원자성·동시성

1. 같은 CSV를 두 관리자 세션에서 동시에 commit한다.
2. UNIQUE 충돌은 `ON CONFLICT DO NOTHING`으로 skipped 처리되는지 확인한다.
3. 두 응답과 각 Import 로그의 inserted/skipped 합계가 해당 요청 total과 일치하는지 확인한다.
4. 유효하지 않은 Material 등 예상치 못한 DB 오류를 포함한 별도 테스트 RPC는 전체 rollback되고 Import 로그도 생성되지 않는지 확인한다.

## Cache 경계·역순 INSERT

안전한 transaction 안에서 최신 자료를 먼저 넣고 과거 자료를 나중에 넣는다. 각 INSERT 후 아래를 확인하고 transaction을 rollback한다.

- `latest_reference_date = max(reference_date)`
- 기간 조건은 `reference_date >= latest - interval 'N months' and reference_date <= latest`
- 1·3·6개월 평균과 표본 수가 원본 집계와 일치
- 다른 Material cache 행의 `updated_at`이 변경되지 않음
