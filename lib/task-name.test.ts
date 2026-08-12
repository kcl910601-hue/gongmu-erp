import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTaskName, validateTaskName } from "./task-name.ts";

test("업무명은 한글과 긴 문자열을 보존하고 앞뒤 공백만 제거한다", () => {
  assert.equal(normalizeTaskName("  1층 창호 설치  "), "1층 창호 설치");
  const longName = "가".repeat(300);
  assert.equal(normalizeTaskName(longName), longName);
});

test("빈 문자열과 공백만 있는 업무명은 거부한다", () => {
  assert.deepEqual(validateTaskName(""), { valid: false, value: "" });
  assert.deepEqual(validateTaskName("   "), { valid: false, value: "" });
});

test("동일 이름 비교는 trim된 값으로 판단하고 중복 이름 자체는 허용한다", () => {
  assert.equal(normalizeTaskName(" 창호 설치 "), normalizeTaskName("창호 설치"));
  assert.deepEqual(validateTaskName("창호 설치"), { valid: true, value: "창호 설치" });
});
