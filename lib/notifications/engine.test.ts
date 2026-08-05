import assert from "node:assert/strict";
import test from "node:test";
import { applyNotificationPreferences, buildNotificationCounts, buildNotificationReadRows, countUnreadNotifications, deriveNotificationState, generateNotifications, matchesNotificationSearch, splitNotificationMailbox } from "./engine.ts";

const today = "2026-08-03";

test("generates project, task and shipment notifications with priorities", () => {
  const items = generateNotifications({ today, projects: [{ id: 1, project_name: "P", status: "in_progress", end_date: today }], tasks: [{ id: 2, project_id: 1, project_name: "P", task_name: "T", assignee: "A", status: "pending", due_date: "2026-08-04" }], shipments: [{ id: 3, project_id: 1, project_name: "P", site_name: "S", item_name: "I", status: "pending", shipment_date: today }] });
  assert.deepEqual(items.map((item) => [item.category, item.priority]), [["project", "critical"], ["shipment", "high"], ["task", "medium"]]);
});

test("generates Todo, Sticky and Memo without completed Todo", () => {
  const items = generateNotifications({ today, personal: [
    { id: "1", note_type: "todo", title: "todo", content: "", due_date: today, is_completed: false, is_pinned: false },
    { id: "2", note_type: "todo", title: "done", content: "", due_date: today, is_completed: true, is_pinned: false },
    { id: "3", note_type: "sticky", title: "sticky", content: "", due_date: null, is_completed: false, is_pinned: true },
    { id: "4", note_type: "memo", title: "memo", content: "", due_date: today, is_completed: false, is_pinned: false },
  ] });
  assert.deepEqual(items.map((item) => item.type), ["personal_todo_today", "personal_memo_today", "personal_sticky"]);
});

test("generates raw-material threshold and LME change notifications", () => {
  const items = generateNotifications({ today, contracts: [{ id: "c", contract_name: "AL", effective_end_date: "2026-08-10", contract_quantity_ton: 100, remaining_quantity_ton: 10, status: "active" }], weeklyLmeChangeRate: 6.2 });
  assert.equal(items.filter((item) => item.category === "raw_material").length, 2);
  assert.equal(items.find((item) => item.category === "lme")?.description, "+6.2%");
  assert.equal(items[0].priority, "critical");
});

test("priority sorting is critical, high, medium, low", () => {
  const items = generateNotifications({ today, personal: [{ id: "s", note_type: "sticky", title: "sticky", content: "", due_date: null, is_completed: false, is_pinned: true }], tasks: [{ id: 1, project_id: 1, project_name: "P", task_name: "late", assignee: null, status: null, due_date: "2026-08-01" }] });
  assert.deepEqual(items.map((item) => item.priority), ["critical", "low"]);
});

test("read, pin and hidden preferences are applied per notification", () => {
  const items = applyNotificationPreferences([{ id: "a" }, { id: "b" }, { id: "c" }], [
    { notification_id: "a", is_read: true, read_at: "2026-08-03T00:00:00Z", archived_at: "2026-08-03T00:00:00Z", is_pinned: false, is_hidden: false },
    { notification_id: "b", is_read: false, read_at: null, archived_at: null, is_pinned: true, is_hidden: false },
    { notification_id: "c", is_read: false, read_at: null, archived_at: null, is_pinned: false, is_hidden: true },
  ]);
  assert.deepEqual(items.map((item) => item.id), ["b", "a"]);
  assert.equal(items[1].isRead, true);
  assert.equal(items[1].isArchived, true);
});

test("hidden modes and unread count exclude hidden notifications", () => {
  const source = [{ id: "a" }, { id: "b" }];
  const preferences = [
    { notification_id: "a", is_read: false, read_at: null, archived_at: null, is_pinned: true, is_hidden: true },
    { notification_id: "b", is_read: false, read_at: null, archived_at: null, is_pinned: false, is_hidden: false },
  ];
  assert.deepEqual(applyNotificationPreferences(source, preferences).map((item) => item.id), ["b"]);
  assert.deepEqual(applyNotificationPreferences(source, preferences, { hiddenMode: "only" }).map((item) => item.id), ["a"]);
  const included = applyNotificationPreferences(source, preferences, { hiddenMode: "include" });
  assert.equal(countUnreadNotifications(included), 1);
  assert.equal(included.find((item) => item.id === "a")?.isPinned, true);
});

test("summary counts use the same visible collection", () => {
  const counts = buildNotificationCounts([
    { category: "task", isRead: false, isPinned: true, isHidden: false },
    { category: "task", isRead: true, isPinned: false, isHidden: false },
    { category: "project", isRead: false, isPinned: false, isHidden: true },
  ]);
  assert.deepEqual(counts, { totalCount: 2, unreadCount: 1, pinnedCount: 1, hiddenCount: 1, byCategory: { task: { total: 2, unread: 1 } } });
});

test("batch read rows preserve pin and hidden preferences", () => {
  const rows = buildNotificationReadRows(["a", "b"], "user", [{ notification_id: "a", is_pinned: true, is_hidden: true }], "now");
  assert.deepEqual(rows, [
    { auth_user_id: "user", notification_id: "a", is_read: true, read_at: "now", archived_at: "now", is_pinned: true, is_hidden: true },
    { auth_user_id: "user", notification_id: "b", is_read: true, read_at: "now", archived_at: "now", is_pinned: false, is_hidden: false },
  ]);
});

test("batch unread rows preserve pin and hidden preferences", () => {
  const rows = buildNotificationReadRows(["a", "b"], "user", [{ notification_id: "a", is_pinned: true, is_hidden: true }], null);
  assert.deepEqual(rows, [
    { auth_user_id: "user", notification_id: "a", is_read: false, read_at: null, archived_at: null, is_pinned: true, is_hidden: true },
    { auth_user_id: "user", notification_id: "b", is_read: false, read_at: null, archived_at: null, is_pinned: false, is_hidden: false },
  ]);
});

test("read state is derived only from read_at", () => {
  const items = applyNotificationPreferences([{ id: "missing" }, { id: "null" }, { id: "read" }], [
    { notification_id: "null", is_read: true, read_at: null, archived_at: null, is_pinned: false, is_hidden: false },
    { notification_id: "read", is_read: false, read_at: "2026-08-03T00:00:00Z", archived_at: "2026-08-03T00:00:00Z", is_pinned: false, is_hidden: false },
  ], { hiddenMode: "include" });
  assert.deepEqual(items.map((item) => [item.id, item.isRead, item.isUnread]), [["missing", false, true], ["null", false, true], ["read", true, false]]);
  const state = deriveNotificationState(items.map((item) => ({ ...item, category: "task" })));
  assert.equal(state.unreadCount, 2);
  assert.equal(state.readItems.length, 1);
});

test("읽은 알림은 Archive로 이동하고 다시 미읽음 처리하면 Inbox로 복귀한다", () => {
  const first = splitNotificationMailbox([
    { id: "new", isRead: false, isArchived: false, archivedAt: null },
    { id: "old", isRead: true, isArchived: true, archivedAt: "2026-08-05T10:00:00Z" },
  ]);
  assert.deepEqual(first.inbox.map((item) => item.id), ["new"]);
  assert.deepEqual(first.archive.map((item) => item.id), ["old"]);
  const restored = splitNotificationMailbox([{ id: "old", isRead: false, isArchived: false, archivedAt: null }]);
  assert.deepEqual(restored.inbox.map((item) => item.id), ["old"]);
});

test("notification search matches title, content, project, category and priority", () => {
  const item = { title: "D-DAY", description: "오늘 종료", projectName: "테스트 프로젝트", category: "project", priority: "critical" };
  for (const query of ["d-day", "오늘", "테스트", "project", "critical", ""]) assert.equal(matchesNotificationSearch(item, query), true);
  assert.equal(matchesNotificationSearch(item, "shipment"), false);
});
