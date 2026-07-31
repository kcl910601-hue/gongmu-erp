import assert from "node:assert/strict";
import test from "node:test";
import { getTaskFormRule, resolveTaskDisplayQuantity } from "./task-form-rules.ts";

test("본납 문틀과 본납 도어는 수량을 숨긴다", () => {
  assert.equal(getTaskFormRule("본납 문틀").showQuantity, false);
  assert.equal(getTaskFormRule("본납 도어").showQuantity, false);
});

test("공백을 정규화해 규칙을 적용한다", () => {
  assert.equal(getTaskFormRule("  본납   문틀  ").showQuantity, false);
});

test("차수·용도가 붙은 문틀·도어 작업도 수량을 숨긴다", () => {
  assert.equal(getTaskFormRule("2차 문틀").showQuantity, false);
  assert.equal(getTaskFormRule("AS문틀").showQuantity, false);
  assert.equal(getTaskFormRule("1차 도어").showQuantity, false);
});

test("압출과 제작 등 기타 업무는 수량을 표시한다", () => {
  assert.equal(getTaskFormRule("압출").showQuantity, true);
  assert.equal(getTaskFormRule("제작").showQuantity, true);
  assert.equal(getTaskFormRule(null).showQuantity, true);
});

test("showQuantity=false인 업무는 Task와 프로젝트 수량을 모두 표시하지 않는다", () => {
  assert.equal(resolveTaskDisplayQuantity("본납 문틀", null, 120), null);
  assert.equal(resolveTaskDisplayQuantity("본납 문틀", 80, 120), null);
  assert.equal(resolveTaskDisplayQuantity("본납 도어", null, 120), null);
  assert.equal(resolveTaskDisplayQuantity("2차 문틀", null, 1537), null);
  assert.equal(resolveTaskDisplayQuantity("AS문틀", 100, 1537), null);
  assert.equal(resolveTaskDisplayQuantity("  본납   문틀  ", 80, 120), null);
});

test("showQuantity=true인 업무는 유효한 Task 수량을 우선하고 필요하면 프로젝트 수량을 사용한다", () => {
  assert.equal(resolveTaskDisplayQuantity("압출", 80, 120), 80);
  assert.equal(resolveTaskDisplayQuantity("압출", null, 120), 120);
  assert.equal(resolveTaskDisplayQuantity("제작", 50, null), 50);
  assert.equal(resolveTaskDisplayQuantity("정의 없는 업무", 0, 120), 120);
  assert.equal(resolveTaskDisplayQuantity(null, undefined, 0), null);
});
