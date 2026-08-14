import assert from "node:assert/strict";
import test from "node:test";
import { auditProcessTypeConsistency } from "./process-type-audit.ts";

const masters = [
  { code: "본납-도어", name: "본납-도어", is_active: true },
  { code: "DOOR", name: "본납 도어", is_active: true },
  { code: "AS", name: "AS", is_active: true },
  { code: "OLD", name: "Old", is_active: false },
];

test("master used, unused, missing, inactive-used를 분류한다", () => {
  const rows = auditProcessTypeConsistency(masters, [{ process_type: "본납-도어" }, { process_type: "MISSING" }, { process_type: "OLD" }], [{ process_type: "AS" }]);
  assert.equal(rows.find((row) => row.code === "본납-도어")?.status, "NORMAL");
  assert.equal(rows.find((row) => row.code === "DOOR")?.status, "UNUSED_MASTER");
  assert.equal(rows.find((row) => row.code === "MISSING")?.status, "MISSING_MASTER");
  assert.equal(rows.find((row) => row.code === "OLD")?.status, "INACTIVE_BUT_USED");
  assert.equal(rows.find((row) => row.code === "AS")?.status, "NORMAL");
});

test("정규화된 name이 다른 master code와 같으면 중복 의미 후보로 표시한다", () => {
  const rows = auditProcessTypeConsistency(masters, [], []);
  assert.equal(rows.find((row) => row.code === "DOOR")?.potentialAliasOf, "본납-도어");
});

test("빈 process_type은 unknown code로 추가하지 않는다", () => {
  const rows = auditProcessTypeConsistency(masters, [{ process_type: null }, { process_type: " " }], []);
  assert.equal(rows.some((row) => row.code === ""), false);
});
