# Sprint 6 프로젝트 손익 분석 검증

운영 DB에 데이터를 추가하거나 변경하지 않고 기존 검증 데이터 또는 로컬 Supabase에서 수행한다.

## 자동 검증

```powershell
node --experimental-strip-types --test lib/project-profit-analysis.test.mjs
```

- 최초 계약만 있는 계산
- 원가가 공급가액보다 큰 loss
- 계약 없음
- 원가 없음
- 최종 공급가액 0원
- 여러 프로젝트 가중 원가율

## API 및 데이터 검증

- confirmed 최초 계약과 증액·감액만 최종 공급가액에 반영되고 void 이력은 제외되는지 확인한다.
- 여러 Material 및 계약/시장 기준 원가가 `project_material_usages.expected_cost_krw` snapshot 그대로 합산되는지 확인한다.
- 목록 요청 한 번에 프로젝트, 계약 이력, 원자재 원가가 각각 일괄 조회되어 프로젝트별 N+1 요청이 없는지 서버 로그로 확인한다.
- 모든 필터와 일곱 가지 정렬 조건을 확인한다.
- 관리자와 일반 승인 사용자는 GET 두 API가 200인지 확인한다.
- anon 및 미승인 사용자는 GET 두 API가 403인지 확인한다.
- POST, PATCH, DELETE route가 존재하지 않아 404 또는 405인지 확인한다.
- `Number.MAX_SAFE_INTEGER` 범위를 벗어난 합산은 `unsafe_amount`와 null 계산값을 반환하는지 로컬 환경에서 확인한다.
