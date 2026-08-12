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

test("기본 Dashboard는 핵심 카드를 전체 폭으로, 최근 정보는 병렬 배치한다", () => {
  const defaults = getDefaultDashboardPreferences();
  assert.deepEqual(defaults.slice(0, 3).map((card) => card.cardId), ["today_tasks", "kpi", "workspace"]);
  assert.equal(defaults.find((card) => card.cardId === "workspace")?.size, "large");
  assert.equal(defaults.find((card) => card.cardId === "recent_projects")?.size, "medium");
  assert.equal(defaults.find((card) => card.cardId === "recent_activity")?.size, "medium");
  const existing = normalizeDashboardPreferences([{ cardId: "recent_activity", order: 0, size: "small", hidden: false, collapsed: false }]);
  assert.equal(existing.find((card) => card.cardId === "recent_activity")?.size, "small");
});

test("기존 사용자 Dashboard 순서와 크기는 기본 순서 변경 후에도 유지한다", () => {
  const existing = normalizeDashboardPreferences([
    { cardId: "workspace", order: 0, size: "medium", hidden: false, collapsed: false },
    { cardId: "today_tasks", order: 1, size: "small", hidden: false, collapsed: true },
  ]);
  assert.deepEqual(existing.slice(0, 2).map((card) => card.cardId), ["workspace", "today_tasks"]);
  assert.equal(existing[0].size, "medium");
  assert.equal(existing[1].collapsed, true);
});
