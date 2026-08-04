import { REALTIME_TABLE_EVENTS, scheduleCollaborationEvents } from "@/lib/collaboration-events";
import { supabase } from "@/lib/supabase";

export function subscribeToRealtimeCollaboration() {
  let channel = supabase.channel("shared-workspace-realtime");

  for (const [table, eventNames] of Object.entries(REALTIME_TABLE_EVENTS)) {
    channel = channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table },
      () => scheduleCollaborationEvents(eventNames)
    );
  }

  channel.subscribe();
  return () => { void supabase.removeChannel(channel); };
}
