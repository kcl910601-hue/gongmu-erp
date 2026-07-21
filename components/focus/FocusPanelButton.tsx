"use client";

import { useEffect, useState } from "react";
import { Target } from "lucide-react";

export function FocusPanelButton() {
  const [count, setCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    function handleState(event: Event) {
      const detail = (
        event as CustomEvent<{ count?: number; open?: boolean }>
      ).detail;
      if (typeof detail.count === "number") setCount(detail.count);
      if (typeof detail.open === "boolean") setIsOpen(detail.open);
    }
    window.addEventListener("focus-panel:state", handleState);
    return () => window.removeEventListener("focus-panel:state", handleState);
  }, []);

  return (
    <button
      type="button"
      aria-label={`집중 업무 패널 ${isOpen ? "닫기" : "열기"}`}
      aria-expanded={isOpen}
      onClick={() => window.dispatchEvent(new Event("focus-panel:toggle"))}
      className="flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-600 hover:bg-white"
    >
      <Target size={16} className="text-blue-600" />
      <span className="hidden lg:inline">집중 업무</span>
      <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
        {count}
      </span>
    </button>
  );
}
