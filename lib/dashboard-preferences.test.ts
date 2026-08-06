import assert from "node:assert/strict";
import test from "node:test";
import { getDefaultDashboardPreferences, moveDashboardCard, normalizeDashboardPreferences } from "./dashboard-preferences.ts";

test("잘못된 Dashboard 설정은 기본 카드 전체로 보정한다", () => {
  const normalized = normalizeDashboardPreferences([{ cardId: "kpi", order: 9, size: "small", hidden: true, collapsed: true }]);
  assert.equal(normalized.length, getDefaultDashboardPreferences().length);
  assert.equal(normalized.find((card) => card.cardId === "kpi")?.hidden, true);
  assert.deepEqual(normalized.map((card) => card.order), normalized.map((_, index) => index));
});

test("카드는 대상 위치로 이동하고 순서를 다시 정규화한다", () => {
  const moved = moveDashboardCard(getDefaultDashboardPreferences(), "recent_activity", "today_tasks");
  assert.equal(moved[0].cardId, "recent_activity");
  assert.deepEqual(moved.map((card) => card.order), moved.map((_, index) => index));
});

test("기본 Dashboard는 My Workspace와 최근 활동을 전체 폭으로 배치한다", () => {
  const defaults = getDefaultDashboardPreferences();
  assert.equal(defaults.find((card) => card.cardId === "workspace")?.size, "large");
  assert.equal(defaults.find((card) => card.cardId === "recent_activity")?.size, "large");
  const existing = normalizeDashboardPreferences([{ cardId: "recent_activity", order: 0, size: "small", hidden: false, collapsed: false }]);
  assert.equal(existing.find((card) => card.cardId === "recent_activity")?.size, "small");
});
