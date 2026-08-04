import test from "node:test";
import assert from "node:assert/strict";
import { getTimelineDescription } from "./timeline.ts";

test("Timeline은 명시 설명을 우선한다", () => {
  assert.equal(getTimelineDescription({ description: "보기 → 편집", metadata: { before: "view", after: "edit" } }), "보기 → 편집");
});

test("이전 값과 변경 값을 Timeline 설명으로 만든다", () => {
  assert.equal(getTimelineDescription({ description: null, metadata: { before: "2026-08-04", after: "2026-08-05" } }), "2026-08-04 → 2026-08-05");
});
