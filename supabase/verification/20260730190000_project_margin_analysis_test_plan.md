# Sprint 7B 조회 전용 분석 검증

- 신규 Migration 없이 기존 `projects`, 계약, 원자재 snapshot, 비용 및 분류 테이블을 조회한다.
- `node --experimental-strip-types --test lib/project-margin-analysis.test.mjs`로 계산·가중 비율·void 제외·동적 분류·unsafe 금액을 검증한다.
- 로컬 또는 기존 검증 데이터에서 증액·감액·void 계약, 다수 Material, 계약/시장 원가 혼합, 비활성 분류 이력을 확인한다.
- 목록 요청이 프로젝트 조회 후 계약·원자재·비용·분류를 각각 한 번만 일괄 조회하는지 서버 로그로 확인한다.
- 관리자와 승인 사용자는 GET 200, anon/미승인은 403, POST/PATCH/DELETE는 404 또는 405인지 확인한다.
- 모든 필터와 아홉 가지 정렬 조건을 확인한다. 운영 DB에 임의 분석 데이터를 INSERT하지 않는다.
