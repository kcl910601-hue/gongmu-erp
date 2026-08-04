import { REALTIME_TABLE_EVENTS, scheduleCollaborationEvents, scheduleRemoteCommentChange } from "@/lib/collaboration-events";
import { supabase } from "@/lib/supabase";

export function subscribeToRealtimeCollaboration() {
  let channel = supabase.channel("shared-workspace-realtime");

  for (const [table, eventNames] of Object.entries(REALTIME_TABLE_EVENTS)) {
    if (table === "shared_comments") {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        (payload) => {
          const record = payload.eventType === "DELETE" ? payload.old : payload.new;
          const commentId = typeof record.id === "number" || typeof record.id === "string" ? String(record.id) : "unknown";
          scheduleRemoteCommentChange(commentId, payload.eventType);
        }
      );
      continue;
    }
    channel = channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table },
      () => scheduleCollaborationEvents(eventNames)
    );
  }

  channel.subscribe();
  return () => { void supabase.removeChannel(channel); };
}
