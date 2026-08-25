import assert from "node:assert/strict";
import test from "node:test";
import { fetchJson } from "./fetch-json.ts";

test("supplemental API의 401과 500은 throw 없이 오류 결과로 반환한다", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  for (const status of [401, 500]) {
    globalThis.fetch = async () => Response.json({ error: "EXPECTED_FAILURE" }, { status });
    const result = await fetchJson("https://example.test/api/supplemental");
    assert.equal(result.data, null);
    assert.equal(result.response?.status, status);
    assert.match(result.error?.message ?? "", new RegExp(`HTTP ${status}`));
  }
});

test("redirect 뒤 HTML 200 응답도 JSON parse crash 없이 차단한다", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => new Response("<html>login</html>", {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });

  const result = await fetchJson("https://example.test/api/supplemental");
  assert.equal(result.data, null);
  assert.match(result.error?.message ?? "", /JSON이 아닌 응답/);
});
