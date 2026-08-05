import assert from "node:assert/strict";
import test from "node:test";
import { deduplicateOnlineUsers } from "./online-presence.ts";

test("여러 탭과 기기의 Presence를 employeeId 기준 한 명으로 합친다", () => {
  const users = deduplicateOnlineUsers({
    "1:a": [{ employeeId: 1, name: "김철수", position: "과장", onlineAt: "2026-08-05T01:00:00.000Z" }],
    "1:b": [{ employeeId: 1, name: "김철수", position: "과장", onlineAt: "2026-08-05T02:00:00.000Z" }],
    "2:a": [{ employeeId: 2, name: "이영희", position: null, onlineAt: "2026-08-05T03:00:00.000Z" }],
  });
  assert.equal(users.length, 2);
  assert.equal(users.find((user) => user.employeeId === 1)?.onlineAt, "2026-08-05T01:00:00.000Z");
});

test("형식이 잘못된 Presence 데이터는 목록에서 제외한다", () => {
  const users = deduplicateOnlineUsers({ invalid: [
    { employeeId: 0, name: "", position: null, onlineAt: "invalid" },
  ] });
  assert.deepEqual(users, []);
});
