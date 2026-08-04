import assert from "node:assert/strict";
import test from "node:test";
import { getCalendarMonthRange, getNoteEditorDefaults, getPersonalNoteAccess, matchesCalendarSourceFilter, normalizeCalendarSourceFilter, PERSONAL_NOTE_COLORS, selectPersonalNotesForBrief, selectPersonalNotesForCalendar, sortPersonalNotes, type PersonalNote } from "./personal-notes.ts";

function note(id: string, values: Partial<PersonalNote>): PersonalNote {
  return {
    id, user_id: "user-1", note_type: "memo", title: id, content: "",
    is_completed: false, is_pinned: false, color: "default", due_date: null,
    sort_order: 0, created_at: `2026-07-31T00:00:0${id}Z`, updated_at: "2026-07-31T00:00:00Z", ...values,
  };
}

test("개인 메모는 고정, 미완료 Todo, Memo, 완료 Todo 순으로 정렬한다", () => {
  const result = sortPersonalNotes([
    note("4", { note_type: "todo", is_completed: true }),
    note("3", { note_type: "memo" }),
    note("2", { note_type: "todo" }),
    note("1", { note_type: "memo", is_pinned: true }),
  ]);
  assert.deepEqual(result.map((item) => item.id), ["1", "2", "3", "4"]);
});

test("공통 편집기는 Memo, Todo, Sticky 기본값과 blue 색상을 지원한다", () => {
  assert.deepEqual(getNoteEditorDefaults("memo"), { noteType: "memo", isCompleted: false, isPinned: false });
  assert.deepEqual(getNoteEditorDefaults("todo"), { noteType: "todo", isCompleted: false, isPinned: false });
  assert.deepEqual(getNoteEditorDefaults("sticky"), { noteType: "sticky", isCompleted: false, isPinned: true });
  assert.equal(PERSONAL_NOTE_COLORS.includes("blue"), true);
});

test("브리핑은 고정 우선으로 메모 3개와 미완료 Todo 5개만 표시한다", () => {
  const notes = [
    ...Array.from({ length: 4 }, (_, index) => note(`m${index}`, { note_type: "memo", is_pinned: index === 3 })),
    ...Array.from({ length: 6 }, (_, index) => note(`t${index}`, { note_type: "todo", is_completed: index === 5, is_pinned: index === 4 })),
  ];
  const brief = selectPersonalNotesForBrief(notes);
  assert.equal(brief.memos.length, 3);
  assert.equal(brief.memos[0].id, "m3");
  assert.equal(brief.todos.length, 5);
  assert.equal(brief.todos[0].id, "t4");
  assert.equal(brief.todos.some((item) => item.is_completed), false);
});

test("Calendar는 조회 월의 날짜 있는 Memo, Todo, Sticky만 표시하고 완료 Todo도 유지한다", () => {
  const range = getCalendarMonthRange("2026-08");
  assert.deepEqual(range, { start: "2026-08-01", end: "2026-08-31" });
  const result = selectPersonalNotesForCalendar([
    note("memo", { note_type: "memo", due_date: "2026-08-01" }),
    note("todo", { note_type: "todo", due_date: "2026-08-15", is_completed: true }),
    note("sticky", { note_type: "sticky", due_date: "2026-08-31" }),
    note("none", { note_type: "memo", due_date: null }),
    note("outside", { note_type: "memo", due_date: "2026-09-01" }),
    note("reminder", { note_type: "reminder", due_date: "2026-08-10" }),
  ], range.start, range.end);
  assert.deepEqual(result.map((item) => item.id), ["memo", "todo", "sticky"]);
  assert.equal(result[1].is_completed, true);
});

test("Calendar 일정 소스 필터는 전체를 기본값으로 하고 회사와 개인 선택을 유지한다", () => {
  assert.equal(normalizeCalendarSourceFilter(null), "all");
  assert.equal(normalizeCalendarSourceFilter("invalid"), "all");
  assert.equal(normalizeCalendarSourceFilter("company"), "company");
  assert.equal(normalizeCalendarSourceFilter("personal"), "my");
  assert.equal(normalizeCalendarSourceFilter("shared"), "shared_with_me");
  assert.equal(normalizeCalendarSourceFilter("my_own"), "my_own");
});

test("Calendar 내 일정과 내 일정만, 공유받은 일정을 소유권으로 구분한다", () => {
  const own = note("own", {});
  const sharedByMe = note("shared-by-me", { sharing: { sharedItemId: "s1", ownerName: "나", permission: "owner", memberCount: 2 } });
  const sharedWithMe = note("shared-with-me", { sharing: { sharedItemId: "s2", ownerName: "김철수", permission: "edit", memberCount: 2 } });
  assert.deepEqual([own, sharedByMe, sharedWithMe].filter((item) => matchesCalendarSourceFilter(item, "my")).map((item) => item.id), ["own", "shared-by-me", "shared-with-me"]);
  assert.deepEqual([own, sharedByMe, sharedWithMe].filter((item) => matchesCalendarSourceFilter(item, "my_own")).map((item) => item.id), ["own", "shared-by-me"]);
  assert.deepEqual([own, sharedByMe, sharedWithMe].filter((item) => matchesCalendarSourceFilter(item, "shared_with_me")).map((item) => item.id), ["shared-with-me"]);
});

test("개인 일정 액션 권한은 소유자, edit, view를 동일 기준으로 구분한다", () => {
  const owner = getPersonalNoteAccess(note("owner", {}));
  const editor = getPersonalNoteAccess(note("editor", { sharing: { sharedItemId: "shared", ownerName: "A", permission: "edit", memberCount: 1 } }));
  const viewer = getPersonalNoteAccess(note("viewer", { sharing: { sharedItemId: "shared", ownerName: "A", permission: "view", memberCount: 1 } }));
  assert.equal(owner.canEdit && owner.canShare && owner.canPin && owner.canDelete, true);
  assert.equal(editor.canEdit, true); assert.equal(editor.canShare || editor.canPin || editor.canDelete, false);
  assert.equal(viewer.canEdit || viewer.canShare || viewer.canPin || viewer.canDelete, false);
  assert.equal(editor.canComment && editor.canViewTimeline && viewer.canComment && viewer.canViewTimeline, true);
});
