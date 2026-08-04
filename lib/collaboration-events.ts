export const PERSONAL_NOTES_CHANGED_EVENT = "personal-notes:changed";
export const COMMENTS_CHANGED_EVENT = "collaboration:comments-changed";
export const TIMELINE_CHANGED_EVENT = "collaboration:timeline-changed";
export const SHARING_CHANGED_EVENT = "collaboration:sharing-changed";
export const NOTIFICATIONS_CHANGED_EVENT = "collaboration:notifications-changed";

export type CollaborationEventName =
  | typeof PERSONAL_NOTES_CHANGED_EVENT
  | typeof COMMENTS_CHANGED_EVENT
  | typeof TIMELINE_CHANGED_EVENT
  | typeof SHARING_CHANGED_EVENT
  | typeof NOTIFICATIONS_CHANGED_EVENT;

export const REALTIME_TABLE_EVENTS: Record<string, readonly CollaborationEventName[]> = {
  personal_notes: [PERSONAL_NOTES_CHANGED_EVENT, TIMELINE_CHANGED_EVENT, NOTIFICATIONS_CHANGED_EVENT],
  shared_item_members: [PERSONAL_NOTES_CHANGED_EVENT, SHARING_CHANGED_EVENT, TIMELINE_CHANGED_EVENT, NOTIFICATIONS_CHANGED_EVENT],
  share_invitations: [PERSONAL_NOTES_CHANGED_EVENT, SHARING_CHANGED_EVENT, TIMELINE_CHANGED_EVENT, NOTIFICATIONS_CHANGED_EVENT],
  shared_comments: [PERSONAL_NOTES_CHANGED_EVENT, COMMENTS_CHANGED_EVENT, TIMELINE_CHANGED_EVENT, NOTIFICATIONS_CHANGED_EVENT],
  activity_logs: [TIMELINE_CHANGED_EVENT, NOTIFICATIONS_CHANGED_EVENT],
  notification_reads: [NOTIFICATIONS_CHANGED_EVENT],
};

const pendingEvents = new Map<CollaborationEventName, number>();

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
