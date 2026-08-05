import type { EditingLockInfo, EditingLockState } from "@/lib/editing-locks";

export function EditingLockNotice({ state, lock, error }: { state: EditingLockState; lock: EditingLockInfo | null; error?: string | null }) {
  if (state === "idle" || state === "acquired") return null;
  const message = state === "locked" && lock ? `${lock.employeeName}님이 현재 수정 중입니다.` : state === "error" ? (error ?? "편집 잠금을 확인하지 못했습니다.") : "편집 상태를 확인하는 중입니다.";
  return <div role="status" className={`mb-3 rounded-xl border px-3 py-2 text-sm ${state === "locked" ? "border-amber-200 bg-amber-50 text-amber-800" : state === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}>{message}</div>;
}
