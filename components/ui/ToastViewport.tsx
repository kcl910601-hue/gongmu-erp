"use client";

import { useEffect, useState } from "react";
import type { ToastMessage } from "@/lib/toast";

const toneClass = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  info: "border-blue-200 bg-blue-50 text-blue-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  error: "border-red-200 bg-red-50 text-red-800",
} as const;

export function ToastViewport() {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  useEffect(() => {
    function handleToast(event: Event) {
      const message = (event as CustomEvent<ToastMessage>).detail;
      setMessages((current) => [...current, message].slice(-4));
      window.setTimeout(() => {
        setMessages((current) =>
          current.filter((item) => item.id !== message.id)
        );
      }, message.duration ?? 3500);
    }

    window.addEventListener("erp-toast", handleToast);
    return () => window.removeEventListener("erp-toast", handleToast);
  }, []);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-5 top-20 z-[120] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2"
    >
      {messages.map((message) => (
        <div
          key={message.id}
          role={message.tone === "error" ? "alert" : "status"}
          className={`pointer-events-auto flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-medium shadow-md transition-all duration-200 ${toneClass[message.tone]}`}
        >
          <span>{message.message}</span>
          {message.actionLabel && message.onAction && (
            <button
              type="button"
              className="shrink-0 rounded-lg border border-current/20 px-2.5 py-1 text-xs font-semibold hover:bg-white/50"
              onClick={() => {
                message.onAction?.();
                setMessages((current) =>
                  current.filter((item) => item.id !== message.id)
                );
              }}
            >
              {message.actionLabel}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
