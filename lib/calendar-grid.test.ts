import assert from "node:assert/strict";
import test from "node:test";
import { getMonthWeekLayout, getRequiredMonthWeekHeight, getSundayFirstMonthDays, MONTH_WEEK_LAYOUT } from "./calendar-grid.ts";

test("일요일 시작 월은 첫 칸에 1일을 배치한다", () => {
  assert.equal(getSundayFirstMonthDays("2026-02")[0], "2026-02-01");
});

test("회사 일정 lane 수에 따라 월간 주 높이가 증가한다", () => {
  assert.equal(MONTH_WEEK_LAYOUT.companyLaneHeight, 44);
  const lane0 = getRequiredMonthWeekHeight({ companyLaneCount: 0, personalItemCount: 0, showCompany: true, showPersonalCards: false });
  const lane1 = getRequiredMonthWeekHeight({ companyLaneCount: 1, personalItemCount: 0, showCompany: true, showPersonalCards: false });
  const lane3 = getRequiredMonthWeekHeight({ companyLaneCount: 3, personalItemCount: 0, showCompany: true, showPersonalCards: false });
  const lane10 = getRequiredMonthWeekHeight({ companyLaneCount: 10, personalItemCount: 0, showCompany: true, showPersonalCards: false });
  assert.equal(lane0, lane1);
  assert.ok(lane3 > lane1);
  assert.ok(lane10 > lane3);
});

test("회사 Task Bar 높이와 간격을 포함한 44px lane pitch를 주 높이에 반영한다", () => {
  const lane3 = getMonthWeekLayout({ companyLaneCount: 3, personalItemCount: 0, showCompany: true, showPersonalCards: false });
  const lane10 = getMonthWeekLayout({ companyLaneCount: 10, personalItemCount: 0, showCompany: true, showPersonalCards: false });
  assert.equal(lane3.companyAreaHeight, 132);
  assert.equal(lane10.companyAreaHeight, 440);
  assert.equal(lane10.companyAreaHeight - lane3.companyAreaHeight, 7 * 44);
});

test("개인 일정과 필터 결과에 따라 필요한 높이를 다시 계산한다", () => {
  const personal2 = getRequiredMonthWeekHeight({ companyLaneCount: 8, personalItemCount: 2, showCompany: false, showPersonalCards: true });
  const personal5 = getRequiredMonthWeekHeight({ companyLaneCount: 8, personalItemCount: 5, showCompany: false, showPersonalCards: true });
  const filteredCompany = getRequiredMonthWeekHeight({ companyLaneCount: 2, personalItemCount: 0, showCompany: true, showPersonalCards: false });
  const allCompany = getRequiredMonthWeekHeight({ companyLaneCount: 8, personalItemCount: 0, showCompany: true, showPersonalCards: false });
  assert.ok(personal5 > personal2);
  assert.ok(allCompany > filteredCompany);
});

test("개인 일정 0, 1, 5, 10개의 높이를 모두 반영한다", () => {
  const heights = [0, 1, 5, 10].map((personalItemCount) => getRequiredMonthWeekHeight({ companyLaneCount: 0, personalItemCount, showCompany: false, showPersonalCards: true }));
  assert.equal(heights[0], 168);
  assert.ok(heights[1] >= heights[0]);
  assert.ok(heights[2] > heights[1]);
  assert.ok(heights[3] > heights[2]);
});

test("회사 lane과 개인 카드 영역을 순서대로 합산한다", () => {
  const companyOnly = getMonthWeekLayout({ companyLaneCount: 5, personalItemCount: 0, showCompany: true, showPersonalCards: false });
  const combined = getMonthWeekLayout({ companyLaneCount: 5, personalItemCount: 5, showCompany: true, showPersonalCards: true });
  assert.ok(combined.personalAreaTop > companyOnly.companyAreaHeight);
  assert.ok(combined.requiredWeekHeight > companyOnly.requiredWeekHeight);
});

test("개인 카드 slot은 카드 본체, 카드 사이 간격, 마지막 하단 여백을 모두 포함한다", () => {
  const one = getMonthWeekLayout({ companyLaneCount: 0, personalItemCount: 1, showCompany: false, showPersonalCards: true });
  const two = getMonthWeekLayout({ companyLaneCount: 0, personalItemCount: 2, showCompany: false, showPersonalCards: true });
  assert.equal(two.personalAreaHeight - one.personalAreaHeight, 68);
  assert.ok(two.requiredWeekHeight - two.personalAreaTop - two.personalAreaHeight >= 12);
});

test("수요일 시작 월은 네 번째 칸에 1일을 배치한다", () => {
  const days = getSundayFirstMonthDays("2026-07");
  assert.deepEqual(days.slice(0, 4), [null, null, null, "2026-07-01"]);
});

test("모든 주의 첫 열은 일요일이고 마지막 열은 토요일이다", () => {
  const days = getSundayFirstMonthDays("2026-08");
  assert.equal(days.length % 7, 0);
  days.forEach((date, index) => {
    if (!date) return;
    const [year, month, day] = date.split("-").map(Number);
    assert.equal(new Date(year, month - 1, day).getDay(), index % 7);
  });
});
