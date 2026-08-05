import type { CurrentEmployee } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { deduplicateOnlineUsers, type OnlineUser, type PresenceConnectionState } from "@/lib/online-presence";

type OnlinePresencePayload = OnlineUser & { [key: string]: string | number | null };
type PresenceChannel = ReturnType<typeof supabase.channel>;
type ActivePresenceSubscription = { owner: symbol; cleanup: () => Promise<void> };

let activePresenceSubscription: ActivePresenceSubscription | null = null;
let presenceTransition = Promise.resolve();

function enqueuePresenceTransition(task: () => Promise<void>) {
  const run = presenceTransition.then(task, task);
  presenceTransition = run.then(() => undefined, () => undefined);
  return run;
}

function createChannelCleanup(channel: PresenceChannel) {
  let cleaned = false;
  return async () => {
    if (cleaned) return;
    cleaned = true;
    try {
      await channel.untrack();
    } catch {
      // 구독 완료 전 cleanup 또는 연결 종료 상태에서도 removeChannel은 계속 수행합니다.
    } finally {
      await supabase.removeChannel(channel);
    }
  };
}

export function subscribeToOnlinePresence(
  employee: CurrentEmployee,
  onUsersChanged: (users: OnlineUser[]) => void,
  onConnectionChanged: (state: PresenceConnectionState) => void
) {
  const owner = Symbol(`presence-${employee.id}`);
  let disposed = false;
  onConnectionChanged("connecting");

  void enqueuePresenceTransition(async () => {
    if (activePresenceSubscription) {
      await activePresenceSubscription.cleanup();
      activePresenceSubscription = null;
    }
    if (disposed) return;

    const connectionId = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase.channel("erp-online-users", { config: { presence: { key: `${employee.id}:${connectionId}` } } });
    const cleanup = createChannelCleanup(channel);
    activePresenceSubscription = { owner, cleanup };

    const handleSync = () => {
      if (!disposed) onUsersChanged(deduplicateOnlineUsers(channel.presenceState<OnlinePresencePayload>()));
    };

    try {
      channel
        .on("presence", { event: "sync" }, handleSync)
        .on("presence", { event: "join" }, handleSync)
        .on("presence", { event: "leave" }, handleSync)
        .subscribe(async (status) => {
          if (disposed) return;
          if (status === "SUBSCRIBED") {
            try {
              const trackResult = await channel.track({ employeeId: employee.id, name: employee.name, position: employee.position, onlineAt: new Date().toISOString() });
              if (!disposed) onConnectionChanged(trackResult === "ok" ? "connected" : "error");
            } catch {
              if (!disposed) onConnectionChanged("error");
            }
            return;
          }
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") onConnectionChanged("error");
          else onConnectionChanged("connecting");
        });
    } catch {
      onConnectionChanged("error");
      await cleanup();
      if (activePresenceSubscription?.owner === owner) activePresenceSubscription = null;
    }
  }).catch(() => {
    if (!disposed) onConnectionChanged("error");
  });

  return () => {
    if (disposed) return;
    disposed = true;
    onUsersChanged([]);
    void enqueuePresenceTransition(async () => {
      if (activePresenceSubscription?.owner !== owner) return;
      const current = activePresenceSubscription;
      activePresenceSubscription = null;
      await current.cleanup();
    });
  };
}
