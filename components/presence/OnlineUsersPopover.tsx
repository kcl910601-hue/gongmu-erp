"use client";

import { useEffect, useRef, useState } from "react";
import { Users, WifiOff } from "lucide-react";
import { useAppShellUser } from "@/contexts/AppShellUserContext";

export function OnlineUsersPopover({ collapsed = false }: { collapsed?: boolean }) {
  const { employee, onlineUsers, presenceConnection } = useAppShellUser();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const connected = presenceConnection === "connected";

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const label = presenceConnection === "error"
    ? "온라인 확인 불가"
    : presenceConnection === "connecting"
      ? "온라인 연결 중"
      : `온라인 ${onlineUsers.length}명`;

  return <div ref={containerRef} className="relative">
    <button
      type="button"
      onClick={() => setOpen((current) => !current)}
      aria-expanded={open}
      aria-haspopup="dialog"
      title={collapsed ? label : undefined}
      className={`flex w-full items-center rounded-xl text-xs font-semibold transition-colors hover:bg-emerald-50 ${collapsed ? "justify-center p-2" : "gap-2 px-2 py-1.5"} ${connected ? "text-emerald-700" : "text-slate-400"}`}
    >
      {presenceConnection === "error" ? <WifiOff size={14}/> : <span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-500" : "animate-pulse bg-slate-300"}`}/>} 
      {!collapsed && <span>{label}</span>}
    </button>

    {open && <div role="dialog" aria-label="현재 접속 중인 사용자" className={`absolute bottom-full z-50 mb-2 w-64 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-xl ${collapsed ? "left-10" : "left-0"}`}>
      <div className="flex items-center gap-2 border-b border-slate-100 pb-2"><Users size={15} className="text-emerald-600"/><h3 className="text-xs font-bold text-slate-800">현재 접속 중</h3>{connected && <span className="ml-auto text-[10px] text-slate-400">{onlineUsers.length}명</span>}</div>
      {!connected ? <p className="py-4 text-center text-xs text-slate-400">{presenceConnection === "error" ? "온라인 상태를 확인할 수 없습니다." : "Presence에 연결하고 있습니다."}</p>
        : onlineUsers.length === 0 ? <p className="py-4 text-center text-xs text-slate-400">온라인 사용자가 없습니다.</p>
          : <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto">{onlineUsers.map((user) => <li key={user.employeeId} className="flex items-center gap-2 rounded-xl px-2 py-2 text-xs hover:bg-slate-50"><span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500"/><span className="min-w-0 flex-1 truncate font-semibold text-slate-700">{user.name}{user.employeeId === employee?.id && <span className="ml-1 font-medium text-emerald-600">(나)</span>}</span><span className="shrink-0 text-slate-400">{user.position ?? "직책 없음"}</span></li>)}</ul>}
    </div>}
  </div>;
}
