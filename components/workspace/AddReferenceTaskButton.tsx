"use client";

import { useState } from "react";
import { addReferenceTask } from "@/lib/reference-tasks";
import { toast } from "@/lib/toast";

export function AddReferenceTaskButton({ commentId, added = false, onAdded }: { commentId: number; added?: boolean; onAdded?: (commentId: number) => void }) {
  const [isAdded, setIsAdded] = useState(added);
  const [saving, setSaving] = useState(false);
  async function add() {
    if (isAdded || saving) return;
    setSaving(true);
    try {
      const result = await addReferenceTask(commentId);
      setIsAdded(true); onAdded?.(commentId);
      toast.success(result.created ? "내 할 일에 추가했습니다." : "이미 내 할 일에 추가되어 있습니다.");
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "내 할 일에 추가하지 못했습니다."); }
    setSaving(false);
  }
  return <button type="button" disabled={isAdded || saving} onClick={(event) => { event.preventDefault(); event.stopPropagation(); void add(); }} className="rounded-lg border border-violet-200 bg-white px-2 py-1 text-[10px] font-semibold text-violet-700 disabled:border-slate-200 disabled:text-slate-400">{isAdded ? "이미 내 할 일에 추가됨" : saving ? "추가 중..." : "내 할 일에 추가"}</button>;
}
