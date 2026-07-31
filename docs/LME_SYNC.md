# LME Auto Sync

내부 서비스는 Market Data Engine의 Provider → Sync Orchestrator → Repository 구조를 사용합니다. 외부 LME API와 UI 계약은 유지됩니다. 현재 활성 Provider는 LME뿐이며 환율 Provider는 구현하지 않았습니다. 세부 확장 구조는 `docs/MARKET_DATA_ENGINE.md`를 확인합니다.

## 데이터 출처와 운영 전제

- 출처: 한국비철금속협회 공개 LME 시세 HTML (`https://www.nonferrous.or.kr/stats/?act=sub3`)
- 수집값: 알루미늄 현물 가격, USD/metric ton
- 공식 API가 아니므로 운영 적용 전에 협회의 자동 조회 및 내부 저장 허용 여부를 확인합니다.
- 기본 빈도는 하루 1회이며 순차 요청, 짧은 timeout, 1회 제한 재시도, 최대 페이지·실행시간 제한을 적용합니다. 차단이나 인증을 우회하지 않습니다.

## 실행 방법

- 최초 동기화: LME 화면의 관리자 전용 `최초 이력 동기화` 버튼. `2024-01-01` 이전 행을 만나면 중단합니다.
- 증분 동기화: 관리자 `지금 동기화` 버튼 또는 Vercel Cron. DB 최신일 이하를 만나면 중단합니다.
- API: `POST /api/statistics/lme/sync`, body는 `{ "mode": "incremental" }` 또는 `{ "mode": "initial", "startDate": "2024-01-01" }`입니다.
- Cron: `GET /api/cron/lme-sync`, `Authorization: Bearer <CRON_SECRET>`가 필요합니다.

## 저장·충돌·환율 정책

- 자동수집 키는 `reference_date + material_code + price_type('spot')`입니다.
- 같은 날짜의 기존 가격은 수정하지 않습니다. 동일 가격은 skip, 다른 가격은 sync log의 conflict로 남깁니다.
- 협회는 환율을 제공하지 않으므로 `exchange_rate_krw_per_usd`와 `domestic_lme_krw_per_kg`은 NULL입니다. 0이나 임의 환율을 저장하지 않습니다.
- 환율이 있는 기존 수기·CSV 행만 국내환산 분석에 사용합니다.
- 기존 CSV Preview/Commit은 장애 시 복구 수단으로 유지하며 기존 행을 덮어쓰지 않습니다.

## 환경 변수

- `LME_SYNC_ENABLED=true`
- `LME_SYNC_USER_AGENT=Company-Gongmu-ERP/1.0`
- `CRON_SECRET`
- Cron 서버 클라이언트용 기존 `SUPABASE_SERVICE_ROLE_KEY`

구조 검증 실패, 빈 표, 0 이하 가격, HTTP 오류가 발생하면 해당 페이지 이후 저장을 중단합니다. 원문 HTML 전체는 로그에 저장하지 않습니다.
