export type OnlineUser = {
  employeeId: number;
  name: string;
  position: string | null;
  onlineAt: string;
};

export type PresenceConnectionState = "connecting" | "connected" | "error";

type OnlinePresencePayload = OnlineUser & { [key: string]: string | number | null };
type OnlinePresenceState = Record<string, Array<OnlinePresencePayload & { presence_ref?: string }>>;

function isOnlinePresence(value: OnlinePresencePayload) {
  return Number.isSafeInteger(value.employeeId)
    && value.employeeId > 0
    && typeof value.name === "string"
    && value.name.trim().length > 0
    && (value.position === null || typeof value.position === "string")
    && typeof value.onlineAt === "string"
    && !Number.isNaN(Date.parse(value.onlineAt));
}

export function deduplicateOnlineUsers(state: OnlinePresenceState) {
  const users = new Map<number, OnlineUser>();
  for (const presences of Object.values(state)) {
    for (const presence of presences) {
      if (!isOnlinePresence(presence)) continue;
      const existing = users.get(presence.employeeId);
      if (!existing || presence.onlineAt < existing.onlineAt) {
        users.set(presence.employeeId, {
          employeeId: presence.employeeId,
          name: presence.name.trim(),
          position: presence.position?.trim() || null,
          onlineAt: presence.onlineAt,
        });
      }
    }
  }
  return [...users.values()].sort((a, b) => a.name.localeCompare(b.name, "ko-KR"));
}
