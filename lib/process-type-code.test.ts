import assert from "node:assert/strict";
import test from "node:test";

import { normalizeProcessTypeCode } from "./process-type-code.ts";

test("canonical process code와 unknown code는 trim 후 그대로 유지한다", () => {
  assert.equal(normalizeProcessTypeCode(" SH "), "SH");
  assert.equal(normalizeProcessTypeCode("본납-문틀"), "본납-문틀");
  assert.equal(normalizeProcessTypeCode("본납-도어"), "본납-도어");
  assert.equal(normalizeProcessTypeCode(" unknown "), "unknown");
  assert.equal(normalizeProcessTypeCode(""), "");
});

test("한글 legacy 표기만 active canonical code로 정규화한다", () => {
  assert.equal(normalizeProcessTypeCode("본납 문틀"), "본납-문틀");
  assert.equal(normalizeProcessTypeCode("본납_문틀"), "본납-문틀");
  assert.equal(normalizeProcessTypeCode("본납 도어"), "본납-도어");
  assert.equal(normalizeProcessTypeCode("본납_도어"), "본납-도어");
});

test("DOOR와 FRAME 및 대소문자는 Application에서 임의 변환하지 않는다", () => {
  assert.equal(normalizeProcessTypeCode("DOOR"), "DOOR");
  assert.equal(normalizeProcessTypeCode("FRAME"), "FRAME");
  assert.equal(normalizeProcessTypeCode("door"), "door");
  assert.equal(normalizeProcessTypeCode("frame"), "frame");
});
