import assert from "node:assert/strict";
import test from "node:test";
import { buildWeeklyLmeComparison, findNearestExchangeRate, getKoreanWeeklyRanges } from "./weekly-lme.ts";

test("한국 시간 월요일 기준으로 이번주와 지난주 범위를 계산한다", () => {
  assert.deepEqual(getKoreanWeeklyRanges(new Date("2026-08-03T00:30:00+09:00")), { currentWeekStart: "2026-08-03", currentWeekEnd: "2026-08-03", previousWeekStart: "2026-07-27", previousWeekEnd: "2026-08-02" });
  assert.deepEqual(getKoreanWeeklyRanges(new Date("2027-01-01T12:00:00+09:00")), { currentWeekStart: "2026-12-28", currentWeekEnd: "2027-01-01", previousWeekStart: "2026-12-21", previousWeekEnd: "2026-12-27" });
});

test("날짜별 환산가를 중복·null 없이 평균하고 상승률을 계산한다", () => {
  const ranges = getKoreanWeeklyRanges(new Date("2026-08-05T12:00:00+09:00"));
  const result = buildWeeklyLmeComparison([
    { reference_date: "2026-07-27", domestic_lme_krw_per_kg: 4000 },
    { reference_date: "2026-07-28", domestic_lme_krw_per_kg: 4200 },
    { reference_date: "2026-08-01", domestic_lme_krw_per_kg: null },
    { reference_date: "2026-08-03", domestic_lme_krw_per_kg: 4300 },
    { reference_date: "2026-08-03", domestic_lme_krw_per_kg: 9999 },
    { reference_date: "2026-08-04", domestic_lme_krw_per_kg: 4500 },
  ], ranges);
  assert.equal(result.previousWeekAverage, 4100); assert.equal(result.currentWeekAverage, 4400);
  assert.equal(result.differenceAmount, 300); assert.equal(result.differenceRate, 300 / 4100 * 100);
  assert.equal(result.previousWeekSampleCount, 2); assert.equal(result.currentWeekSampleCount, 2);
});

test("하락·동일·한 주 데이터 없음 상태를 계산한다", () => {
  const ranges = getKoreanWeeklyRanges(new Date("2026-08-03T12:00:00+09:00"));
  const down = buildWeeklyLmeComparison([{ reference_date: "2026-07-27", domestic_lme_krw_per_kg: 5000 }, { reference_date: "2026-08-03", domestic_lme_krw_per_kg: 4000 }], ranges);
  assert.equal(down.differenceAmount, -1000); assert.equal(down.currentWeekSampleCount, 1);
  const same = buildWeeklyLmeComparison([{ reference_date: "2026-07-27", domestic_lme_krw_per_kg: 4000 }, { reference_date: "2026-08-03", domestic_lme_krw_per_kg: 4000 }], ranges);
  assert.equal(same.differenceRate, 0);
  const missingPrevious = buildWeeklyLmeComparison([{ reference_date: "2026-08-03", domestic_lme_krw_per_kg: 4000 }], ranges);
  assert.equal(missingPrevious.previousWeekAverage, null); assert.equal(missingPrevious.differenceRate, null);
  const missingCurrent = buildWeeklyLmeComparison([{ reference_date: "2026-07-27", domestic_lme_krw_per_kg: 4000 }], ranges);
  assert.equal(missingCurrent.currentWeekAverage, null); assert.equal(missingCurrent.differenceAmount, null);
});

test("환율은 동일 날짜를 우선하고 없으면 가장 가까운 이전 날짜를 사용한다", () => {
  const rates = [{ reference_date: "2026-08-01", rate: 1300 }, { reference_date: "2026-08-04", rate: 1350 }];
  assert.equal(findNearestExchangeRate(rates, "2026-08-04")?.rate, 1350);
  assert.equal(findNearestExchangeRate(rates, "2026-08-03")?.rate, 1300);
  assert.equal(findNearestExchangeRate(rates, "2026-07-31"), undefined);
});
