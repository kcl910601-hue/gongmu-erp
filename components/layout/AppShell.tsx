"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getEmployeeByAuth, type CurrentEmployee } from "@/lib/auth";
import { getEmployeeAuthorizationStatus, hasPermission, isAuthorizedEmployee } from "@/lib/permissions";
import { AppShellUserProvider } from "@/contexts/AppShellUserContext";
import Header from "./Header";
import Sidebar from "./Sidebar";
import GlobalSearch from "@/components/search/GlobalSearch";
import QuickActionsFab from "@/components/quick-actions/QuickActionsFab";
import { ToastViewport } from "@/components/ui/ToastViewport";
import { FocusPanel } from "@/components/focus/FocusPanel";
import { TaskDetailDialog } from "@/components/tasks/TaskDetailDialog";
import NoteEditorModal from "@/components/workspace/NoteEditorModal";

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
  const isPublicPage = pathname === "/login" || pathname === "/signup";
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [employee, setEmployee] = useState<CurrentEmployee | null>(null);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [isUserLoading, setIsUserLoading] = useState(!isPublicPage);
  const isCollapsed = useSyncExternalStore(
    subscribeSidebarChange,
    getSidebarSnapshot,
    () => false
  );

  useEffect(() => {
    if (isPublicPage) return;

    let isMounted = true;

    async function applySession(
      session: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"]
    ) {
      if (!isMounted) return;
      if (!session?.user) {
        setEmployee(null);
        setAuthUserId(null);
        setAuthEmail(null);
        setIsUserLoading(false);
        router.push("/login");
        return;
      }

      setAuthUserId(session.user.id);
      setAuthEmail(session.user.email ?? null);
      const result = await getEmployeeByAuth(supabase, session.user);
      if (!isMounted) return;
      if (result.error || !isAuthorizedEmployee(result.employee)) {
        const authorizationStatus = result.error ? "authorization_error" : getEmployeeAuthorizationStatus(result.employee);
        setEmployee(null);
        setAuthUserId(null);
        setAuthEmail(null);
        setIsUserLoading(false);
        await supabase.auth.signOut();
        if (isMounted) router.replace(`/login?status=${authorizationStatus}`);
        return;
      }
      setEmployee(result.employee);
      setIsUserLoading(false);
    }

    async function checkAuth() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      await applySession(session);
    }

    void checkAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void applySession(session);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [isPublicPage, router]);

  const userContextValue = useMemo(
    () => ({ employee, authUserId, authEmail, isLoading: isUserLoading }),
    [authEmail, authUserId, employee, isUserLoading]
  );

  const openSearch = useCallback(() => {
    if (isPublicPage) return;
    setIsSearchOpen(true);
  }, [isPublicPage]);

  const closeSearch = useCallback(() => {
    setIsSearchOpen(false);
  }, []);

  useEffect(() => {
    if (isPublicPage) return;

    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsSearchOpen(true);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPublicPage]);

  if (isPublicPage) {
    return <>{children}</>;
  }

  return (
    <AppShellUserProvider value={userContextValue}>
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <main
        className={`min-h-screen flex-1 bg-slate-50 transition-all duration-300 ${
          isCollapsed ? "ml-14" : "ml-52"
        }`}
      >
        <Header onSearchClick={openSearch} />
        {children}
      </main>
      <GlobalSearch isOpen={isSearchOpen} onClose={closeSearch} />
      {hasPermission(employee?.role, "create") && <QuickActionsFab />}
      <ToastViewport />
      <FocusPanel />
      <TaskDetailDialog canEdit={hasPermission(employee?.role, "update")} />
      <NoteEditorModal />
    </div>
    </AppShellUserProvider>
  );
}
