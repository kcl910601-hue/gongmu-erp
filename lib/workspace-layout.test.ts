import assert from "node:assert/strict";
import test from "node:test";
import { shouldUseReferenceTaskSidebar } from "./workspace-layout.ts";

test("미완료 Reference Task가 있을 때만 Workspace 보조 열을 사용한다", () => {
  assert.equal(shouldUseReferenceTaskSidebar(0), false);
  assert.equal(shouldUseReferenceTaskSidebar(1), true);
  assert.equal(shouldUseReferenceTaskSidebar(5), true);
});
