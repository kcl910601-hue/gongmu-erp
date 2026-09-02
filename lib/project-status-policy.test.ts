import assert from "node:assert/strict";
import test from "node:test";
import {
  PROJECT_STATUS_OPTIONS,
  getProjectStatusSelectValue,
  isCanonicalProjectStatus,
} from "./project-status-policy.ts";

test("프로젝트 명시적 상태는 canonical 4개 값만 제공한다", () => {
  assert.deepEqual(PROJECT_STATUS_OPTIONS.map((option) => option.value), ["pending", "in_progress", "hold", "completed"]);
  assert.equal(isCanonicalProjectStatus("hold"), true);
  assert.equal(isCanonicalProjectStatus("보류"), false);
});

test("기존 한글 상태는 Select에서 canonical 값으로 정규화한다", () => {
  assert.equal(getProjectStatusSelectValue("대기"), "pending");
  assert.equal(getProjectStatusSelectValue("진행중"), "in_progress");
  assert.equal(getProjectStatusSelectValue("보류"), "hold");
  assert.equal(getProjectStatusSelectValue("완료"), "completed");
});

test("null과 알 수 없는 legacy 값은 빈 Select 값을 사용한다", () => {
  assert.equal(getProjectStatusSelectValue(null), "");
  assert.equal(getProjectStatusSelectValue("legacy"), "");
});
