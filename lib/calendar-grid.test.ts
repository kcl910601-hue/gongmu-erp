import assert from "node:assert/strict";
import test from "node:test";
import { getSundayFirstMonthDays } from "./calendar-grid.ts";

test("일요일 시작 월은 첫 칸에 1일을 배치한다", () => {
  assert.equal(getSundayFirstMonthDays("2026-02")[0], "2026-02-01");
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
