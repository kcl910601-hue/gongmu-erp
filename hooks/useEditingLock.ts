"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EDITING_LOCK_HEARTBEAT_MS, normalizeEditingLockResourceId, requestEditingLock, type EditingLockInfo, type EditingLockResourceType, type EditingLockState } from "@/lib/editing-locks";

export function useEditingLock(resourceType: EditingLockResourceType, resourceId: string | number | null, enabled = true) {
  const [state, setState] = useState<EditingLockState>("idle");
  const [lock, setLock] = useState<EditingLockInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);

  const release = useCallback(async () => {
    const token = tokenRef.current;
    tokenRef.current = null;
    if (!token) return;
    try { await requestEditingLock("release", { token }); } catch { /* expiry also releases the lock */ }
  }, []);

  useEffect(() => {
    if (!enabled || resourceId === null) return;
    let disposed = false;
    const normalizedId = normalizeEditingLockResourceId(resourceId);
    const timer = window.setTimeout(() => {
      setState("acquiring"); setError(null); setLock(null);
      void requestEditingLock("acquire", { resourceType, resourceId: normalizedId }).then((result) => {
        if (disposed) { if (result.token) void requestEditingLock("release", { token: result.token }); return; }
        if (result.acquired && result.token) { tokenRef.current = result.token; setLock(result.lock ?? null); setState("acquired"); }
        else { setLock(result.lock ?? null); setState("locked"); }
      }).catch((cause: unknown) => { if (!disposed) { setError(cause instanceof Error ? cause.message : "편집 상태를 확인하지 못했습니다."); setState("error"); } });
    }, 0);
    return () => { disposed = true; window.clearTimeout(timer); void release(); };
  }, [enabled, release, resourceId, resourceType]);

  useEffect(() => {
    if (state !== "acquired") return;
    const timer = window.setInterval(() => {
      const token = tokenRef.current;
      if (!token) return;
      void requestEditingLock("heartbeat", { token }).then((result) => setLock(result.lock ?? null)).catch(() => { tokenRef.current = null; setError("편집 잠금이 만료되었습니다."); setState("error"); });
    }, EDITING_LOCK_HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [state]);

  return { state, lock, error, canEdit: state === "acquired", release };
}
