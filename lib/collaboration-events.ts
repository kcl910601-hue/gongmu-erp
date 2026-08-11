export const PERSONAL_NOTES_CHANGED_EVENT = "personal-notes:changed";
export const COMMENTS_CHANGED_EVENT = "collaboration:comments-changed";
export const TIMELINE_CHANGED_EVENT = "collaboration:timeline-changed";
export const SHARING_CHANGED_EVENT = "collaboration:sharing-changed";
export const NOTIFICATIONS_CHANGED_EVENT = "collaboration:notifications-changed";
export const COMMENT_COUNT_DELTA_EVENT = "collaboration:comment-count-delta";
export const COMMENT_COUNTS_INVALIDATED_EVENT = "collaboration:comment-counts-invalidated";
export const COMMENT_UNREAD_CLEARED_EVENT = "collaboration:comment-unread-cleared";
export const REFERENCE_TASKS_CHANGED_EVENT = "reference-tasks:changed";

export type CollaborationEventName =
  | typeof PERSONAL_NOTES_CHANGED_EVENT
  | typeof COMMENTS_CHANGED_EVENT
  | typeof TIMELINE_CHANGED_EVENT
  | typeof SHARING_CHANGED_EVENT
  | typeof NOTIFICATIONS_CHANGED_EVENT
  | typeof COMMENT_COUNTS_INVALIDATED_EVENT
  | typeof REFERENCE_TASKS_CHANGED_EVENT;

export const REALTIME_TABLE_EVENTS: Record<string, readonly CollaborationEventName[]> = {
  personal_notes: [PERSONAL_NOTES_CHANGED_EVENT, TIMELINE_CHANGED_EVENT, NOTIFICATIONS_CHANGED_EVENT],
  shared_item_members: [PERSONAL_NOTES_CHANGED_EVENT, SHARING_CHANGED_EVENT, TIMELINE_CHANGED_EVENT, NOTIFICATIONS_CHANGED_EVENT],
  share_invitations: [PERSONAL_NOTES_CHANGED_EVENT, SHARING_CHANGED_EVENT, TIMELINE_CHANGED_EVENT, NOTIFICATIONS_CHANGED_EVENT],
  shared_comments: [COMMENTS_CHANGED_EVENT],
  shared_comment_mentions: [NOTIFICATIONS_CHANGED_EVENT, TIMELINE_CHANGED_EVENT],
  activity_logs: [TIMELINE_CHANGED_EVENT, NOTIFICATIONS_CHANGED_EVENT],
  notification_reads: [NOTIFICATIONS_CHANGED_EVENT],
  material_contract_notification_events: [NOTIFICATIONS_CHANGED_EVENT],
  shared_comment_reads: [COMMENT_COUNTS_INVALIDATED_EVENT],
  reference_tasks: [REFERENCE_TASKS_CHANGED_EVENT],
};

const pendingEvents = new Map<CollaborationEventName, number>();
const localCommentMutations = new Map<string, number>();
const pendingCommentChanges = new Map<string, "INSERT" | "UPDATE" | "DELETE">();
let pendingCommentTimer: number | null = null;

export function scheduleCollaborationEvents(eventNames: readonly CollaborationEventName[], delay = 150) {
  if (typeof window === "undefined") return;
  for (const eventName of eventNames) {
    const pending = pendingEvents.get(eventName);
    if (pending) window.clearTimeout(pending);
    pendingEvents.set(eventName, window.setTimeout(() => {
      pendingEvents.delete(eventName);
      window.dispatchEvent(new CustomEvent(eventName));
    }, delay));
  }
}

export function markLocalCommentMutation(commentId: number) {
  if (typeof window === "undefined") return;
  const key = String(commentId);
  const previous = localCommentMutations.get(key);
  if (previous) window.clearTimeout(previous);
  localCommentMutations.set(key, window.setTimeout(() => localCommentMutations.delete(key), 5000));
}

export function clearLocalCommentMutation(commentId: number) {
  if (typeof window === "undefined") return;
  const key = String(commentId);
  const timer = localCommentMutations.get(key);
  if (timer) window.clearTimeout(timer);
  localCommentMutations.delete(key);
}

function consumeLocalCommentMutation(commentId: string) {
  const timer = localCommentMutations.get(commentId);
  if (!timer) return false;
  window.clearTimeout(timer);
  localCommentMutations.delete(commentId);
  return true;
}

export function scheduleRemoteCommentChange(commentId: string, eventType: "INSERT" | "UPDATE" | "DELETE") {
  if (typeof window === "undefined") return;
  pendingCommentChanges.set(commentId, eventType);
  if (pendingCommentTimer) window.clearTimeout(pendingCommentTimer);
  pendingCommentTimer = window.setTimeout(() => {
    pendingCommentTimer = null;
    let hasRemoteChange = false;
    let countChanged = false;
    for (const [id, type] of pendingCommentChanges) {
      if (consumeLocalCommentMutation(id)) continue;
      hasRemoteChange = true;
      if (type === "INSERT" || type === "DELETE") countChanged = true;
    }
    pendingCommentChanges.clear();
    if (hasRemoteChange) window.dispatchEvent(new CustomEvent(COMMENTS_CHANGED_EVENT));
    if (countChanged) window.dispatchEvent(new CustomEvent(COMMENT_COUNTS_INVALIDATED_EVENT));
  }, 150);
}

export function dispatchCommentCountDelta(itemId: string, delta: number) {
  if (typeof window === "undefined" || delta === 0) return;
  window.dispatchEvent(new CustomEvent(COMMENT_COUNT_DELTA_EVENT, { detail: { itemId, delta } }));
}

export function dispatchCommentUnreadCleared(itemId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(COMMENT_UNREAD_CLEARED_EVENT, { detail: { itemId } }));
}
