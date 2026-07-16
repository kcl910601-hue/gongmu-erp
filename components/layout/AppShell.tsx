"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Header from "./Header";
import Sidebar from "./Sidebar";
import GlobalSearch from "@/components/search/GlobalSearch";

function getSidebarSnapshot() {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("sidebar-collapsed") === "true";
}

function subscribeSidebarChange(onStoreChange: () => void) {
  window.addEventListener("sidebar-change", onStoreChange);

  return () => {
    window.removeEventListener("sidebar-change", onStoreChange);
  };
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === "/login";
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const isCollapsed = useSyncExternalStore(
    subscribeSidebarChange,
    getSidebarSnapshot,
    () => false
  );

  useEffect(() => {
    if (isLoginPage) return;

    async function checkAuth() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push("/login");
      }
    }

    void checkAuth();
  }, [isLoginPage, router]);

  const openSearch = useCallback(() => {
    if (isLoginPage) return;
    setIsSearchOpen(true);
  }, [isLoginPage]);

  const closeSearch = useCallback(() => {
    setIsSearchOpen(false);
  }, []);

  useEffect(() => {
    if (isLoginPage) return;

    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsSearchOpen(true);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isLoginPage]);

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <main
        className={`min-h-screen flex-1 bg-slate-50 transition-all duration-300 ${
          isCollapsed ? "ml-16" : "ml-64"
        }`}
      >
        <Header onSearchClick={openSearch} />
        {children}
      </main>
      <GlobalSearch isOpen={isSearchOpen} onClose={closeSearch} />
    </div>
  );
}
