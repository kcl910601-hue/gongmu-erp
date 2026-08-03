export const PERSONAL_NOTE_TYPES = ["memo", "todo", "sticky", "reminder"] as const;
export const PERSONAL_NOTE_COLORS = ["default", "yellow", "green", "red", "blue"] as const;

export type PersonalNoteType = (typeof PERSONAL_NOTE_TYPES)[number];
export type PersonalNoteColor = (typeof PERSONAL_NOTE_COLORS)[number];

export type PersonalNote = {
  id: string;
  user_id: string;
  note_type: PersonalNoteType;
  title: string;
  content: string;
  is_completed: boolean;
  is_pinned: boolean;
  color: PersonalNoteColor;
  due_date: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  sharing?: { sharedItemId: string; ownerName: string; permission: "owner" | "view" | "edit"; memberCount: number } | null;
};

export const PERSONAL_NOTES_CHANGED_EVENT = "personal-notes:changed";
export const NOTE_EDITOR_OPEN_EVENT = "note-editor:open";

export type NoteEditorPreset = "memo" | "todo" | "sticky";
export type NoteEditorOpenOptions = { noteType?: NoteEditorPreset; dueDate?: string | null };
export type CalendarSourceFilter = "all" | "company" | "my" | "my_own" | "shared_with_me";

export function normalizeCalendarSourceFilter(value: string | null): CalendarSourceFilter {
  if (value === "company" || value === "my" || value === "my_own" || value === "shared_with_me") return value;
  if (value === "personal") return "my";
  if (value === "shared") return "shared_with_me";
  return "all";
}

export function matchesCalendarSourceFilter(note: PersonalNote, filter: CalendarSourceFilter) {
  const isOwnedByMe = !note.sharing || note.sharing.permission === "owner";
  const isSharedWithMe = Boolean(note.sharing && note.sharing.permission !== "owner");
  if (filter === "company") return false;
  if (filter === "my_own") return isOwnedByMe;
  if (filter === "shared_with_me") return isSharedWithMe;
  return true;
}

export function openNoteEditor(input: NoteEditorPreset | NoteEditorOpenOptions = "memo") {
  const detail = typeof input === "string" ? { preset: input } : { preset: input.noteType ?? "memo", dueDate: input.dueDate ?? null };
  window.dispatchEvent(new CustomEvent(NOTE_EDITOR_OPEN_EVENT, { detail }));
}

export function getNoteEditorDefaults(preset: NoteEditorPreset) {
  return { noteType: preset, isCompleted: false, isPinned: preset === "sticky" } as const;
}

export function personalNoteRank(note: PersonalNote) {
  if (note.is_pinned) return 0;
  if (note.note_type === "todo" && !note.is_completed) return 1;
  if (note.note_type === "memo") return 2;
  return 3;
}

export function sortPersonalNotes(notes: PersonalNote[]) {
  return [...notes].sort((a, b) =>
    personalNoteRank(a) - personalNoteRank(b) ||
    a.sort_order - b.sort_order ||
    b.created_at.localeCompare(a.created_at)
  );
}

export function selectPersonalNotesForBrief(notes: PersonalNote[]) {
  const sorted = sortPersonalNotes(notes);
  return {
    memos: sorted.filter((note) => note.note_type === "memo").slice(0, 3),
    todos: sorted.filter((note) => note.note_type === "todo" && !note.is_completed).slice(0, 5),
  };
}

export function getCalendarMonthRange(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("월 형식이 올바르지 않습니다.");
  const [year, monthValue] = month.split("-").map(Number);
  const lastDay = new Date(year, monthValue, 0).getDate();
  return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, "0")}` };
}

export function selectPersonalNotesForCalendar(notes: PersonalNote[], start: string, end: string) {
  return notes.filter((note) => note.due_date !== null && note.due_date >= start && note.due_date <= end && (note.note_type === "memo" || note.note_type === "todo" || note.note_type === "sticky"));
}

export function dispatchPersonalNotesChanged() {
  window.dispatchEvent(new CustomEvent(PERSONAL_NOTES_CHANGED_EVENT));
}
