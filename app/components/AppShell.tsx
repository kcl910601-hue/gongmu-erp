"use client";

import { useEffect, useState } from "react";
import Sidebar from "./Sidebar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed");

    setIsCollapsed(saved === "true");
    setIsMounted(true);

    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<boolean>;
      setIsCollapsed(customEvent.detail);
    };

    window.addEventListener("sidebar-change", handler);

    return () => {
      window.removeEventListener("sidebar-change", handler);
    };
  }, []);

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <main
        className={`min-h-screen flex-1 bg-slate-100 transition-all duration-300 ${
          isMounted && isCollapsed ? "ml-20" : "ml-72"
        }`}
      >
        {children}
      </main>
    </div>
  );
}