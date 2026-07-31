# Market Data Engine

현재 활성 Provider는 한국비철금속협회 알루미늄 현물 가격을 처리하는 `lme` 하나입니다. 환율, 금속 프리미엄, 기타 원자재 타입은 확장 가능한 타입만 정의하며 외부 요청이나 임의 데이터를 생성하지 않습니다.

## 구조

```text
기존 LME API / Cron
  -> lme-sync-server 호환 어댑터
  -> LME Provider
  -> syncMarketData Orchestrator
  -> LmeMarketDataRepository
  -> lme_market_prices / lme_sync_runs
```

- Provider Interface: 원천 코드, 데이터 타입, 페이지 요청, parsing, record validation, unique key와 비교값을 정의합니다.
- LME Provider: 협회 URL, HTTP timeout/retry, HTML parser, Al 현물 record validation과 source metadata를 담당하며 Supabase에 접근하지 않습니다.
- Sync Orchestrator: 최초/증분 mode, 순차 페이지, 실행 제한, 신규·중복·conflict 분류와 결과 요약을 담당합니다.
- Repository: 기존 LME 테이블의 최신일·기존값 조회, INSERT, 잠금과 sync log를 담당합니다.

## 환율 확장과 계산

`ExchangeRateRecord`는 USD/KRW 환율 Provider가 나중에 제공해야 할 타입입니다. 현재 Provider 구현과 endpoint는 없습니다. `calculateDomesticLmeValue()`는 두 입력이 모두 유효할 때만 `LME USD/ton × KRW/USD ÷ 1000`을 계산합니다. 입력 누락은 `missing_lme_price` 또는 `missing_exchange_rate`, 0·음수·비정상 값은 `invalid_value`를 반환합니다.

## 호환성과 충돌 정책

외부 API, UI 경로, `lme_market_prices`, `lme_sync_runs`와 응답 필드는 변경하지 않습니다. 동일 unique key와 가격은 skip하고, 가격이 다르면 conflict로 기록하며 기존 값을 UPDATE하지 않습니다. 새 Provider는 별도 Provider와 Repository를 구현한 뒤 registry에 명시적으로 등록해야 합니다.
