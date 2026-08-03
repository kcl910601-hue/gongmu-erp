import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSearchQuery, splitSearchHighlight } from "./search.ts";

test("search query trims surrounding spaces", () => {
  assert.equal(normalizeSearchQuery("  디에이치  "), "디에이치");
});

test("search highlight is case insensitive and preserves original text", () => {
  assert.deepEqual(splitSearchHighlight("LME 알루미늄 lme", "lMe"), [
    { text: "LME", match: true },
    { text: " 알루미늄 ", match: false },
    { text: "lme", match: true },
  ]);
});
