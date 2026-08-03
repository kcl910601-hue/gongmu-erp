import assert from "node:assert/strict";
import test from "node:test";
import { getDday } from "./dday.ts";

const TODAY = "2026-08-03";

test("D-Day labels use calendar days", () => {
  assert.equal(getDday(TODAY, TODAY)?.label, "D-DAY");
  assert.equal(getDday("2026-08-04", TODAY)?.label, "D-1");
  assert.equal(getDday("2026-08-05", TODAY)?.label, "D-2");
  assert.equal(getDday("2026-08-02", TODAY)?.label, "D+1");
  assert.equal(getDday("2026-08-10", TODAY)?.label, "D-7");
});

test("time values are normalized to the local calendar day", () => {
  assert.equal(getDday("2026-08-03T23:59:59", "2026-08-03T00:00:01")?.label, "D-DAY");
});

test("UTC instants are compared after local calendar normalization", () => {
  assert.equal(getDday(new Date("2026-08-03T15:30:00.000Z"), new Date("2026-08-03T16:00:00.000Z"))?.label, "D-DAY");
});

test("leap-year and month-end boundaries use calendar days", () => {
  assert.equal(getDday("2028-02-29", "2028-02-28")?.label, "D-1");
  assert.equal(getDday("2026-09-01", "2026-08-31")?.label, "D-1");
});

test("color rules are consistent", () => {
  assert.equal(getDday("2026-08-10", TODAY)?.color, "blue");
  assert.equal(getDday("2026-08-07", TODAY)?.color, "green");
  assert.equal(getDday("2026-08-05", TODAY)?.color, "orange");
  assert.equal(getDday(TODAY, TODAY)?.color, "red");
  assert.equal(getDday("2026-08-02", TODAY)?.color, "darkRed");
});
