# LME Market History CSV 작성 안내

`lme_market_prices_import_template.csv`를 Excel에서 열어 실제 확인한 과거 단가를 입력합니다. 예시 가격은 실제 가격으로 오인될 수 있어 템플릿에 포함하지 않습니다.

- `reference_date`: 실제 기준일, `YYYY-MM-DD`
- `reference_month`: 기준월, `YYYY-MM`
- `round`: `1` = First Week, `2` = Last Week
- `material_code`: 현재 지원 코드 `AL`
- `lme_al_usd_per_ton`: LME 알루미늄 가격, USD/ton, 0보다 큰 숫자
- `exchange_rate_krw_per_usd`: 원/달러 환율, KRW/USD, 0보다 큰 숫자
- `source_url`: 가격 또는 환율을 확인한 `http`/`https` URL
- `memo`: 선택 메모

국내 환산 LME 가격은 입력하지 않습니다. 서비스와 DB가 `LME USD/ton × KRW/USD ÷ 1000`으로 KRW/kg 가격을 자동 계산합니다.

작성 후 Excel에서 CSV UTF-8 형식으로 저장하고, LME Market History의 CSV 가져오기에서 미리보기를 먼저 실행합니다. `reference_month + round + material_code`가 같은 기존 행은 덮어쓰지 않고 건너뜁니다.
