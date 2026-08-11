"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getEmployeeByAuth, type CurrentEmployee } from "@/lib/auth";
import { canEmployeeAccessRoute, getEmployeeAuthorizationStatus, hasPermission, isAuthorizedEmployee, isCalendarOnlyStaff } from "@/lib/permissions";
import { AppShellUserProvider } from "@/contexts/AppShellUserContext";
import Header from "./Header";
import Sidebar from "./Sidebar";
import GlobalSearch from "@/components/search/GlobalSearch";
import QuickActionsFab from "@/components/quick-actions/QuickActionsFab";
import { ToastViewport } from "@/components/ui/ToastViewport";
import { FocusPanel } from "@/components/focus/FocusPanel";
import { TaskDetailDialog } from "@/components/tasks/TaskDetailDialog";
import NoteEditorModal from "@/components/workspace/NoteEditorModal";
import { MaintenanceScreen } from "@/components/maintenance/MaintenanceScreen";
import { getDefaultMaintenanceModeSetting, getMaintenanceModeSetting, MAINTENANCE_MODE_UPDATED_EVENT, shouldBlockForMaintenance, type MaintenanceModeSetting } from "@/lib/maintenance-mode";
import { subscribeToRealtimeCollaboration } from "@/lib/realtime-collaboration";
import { subscribeToOnlinePresence } from "@/lib/presence-subscription";
import type { OnlineUser, PresenceConnectionState } from "@/lib/online-presence";

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
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [presenceConnection, setPresenceConnection] = useState<PresenceConnectionState>("connecting");
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [isUserLoading, setIsUserLoading] = useState(!isPublicPage);
  const [maintenanceSetting, setMaintenanceSetting] = useState<MaintenanceModeSetting>(getDefaultMaintenanceModeSetting);
  const lastMaintenancePathRef = useRef<string | null>(null);
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
        setMaintenanceSetting(getDefaultMaintenanceModeSetting());
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
      const nextMaintenanceSetting = await getMaintenanceModeSetting(supabase);
      if (!isMounted) return;
      setMaintenanceSetting(nextMaintenanceSetting);
      lastMaintenancePathRef.current = window.location.pathname;
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

  useEffect(() => {
    if (isPublicPage || !employee || lastMaintenancePathRef.current === pathname) return;
    let active = true;
    lastMaintenancePathRef.current = pathname;
    void getMaintenanceModeSetting(supabase).then((setting) => {
      if (active) setMaintenanceSetting(setting);
    });
    return () => { active = false; };
  }, [employee, isPublicPage, pathname]);

  useEffect(() => {
    if (isPublicPage || !employee || canEmployeeAccessRoute(employee, pathname)) return;
    router.replace(isCalendarOnlyStaff(employee) ? "/calendar" : "/forbidden");
  }, [employee, isPublicPage, pathname, router]);

  useEffect(() => {
    if (isPublicPage || !employee) return;
    return subscribeToRealtimeCollaboration();
  }, [employee, isPublicPage]);

  useEffect(() => {
    if (isPublicPage || !employee) return;
    return subscribeToOnlinePresence(employee, setOnlineUsers, setPresenceConnection);
  }, [employee, isPublicPage]);

  useEffect(() => {
    function handleMaintenanceUpdated(event: Event) {
      setMaintenanceSetting((event as CustomEvent<MaintenanceModeSetting>).detail);
    }
    window.addEventListener(MAINTENANCE_MODE_UPDATED_EVENT, handleMaintenanceUpdated);
    return () => window.removeEventListener(MAINTENANCE_MODE_UPDATED_EVENT, handleMaintenanceUpdated);
  }, []);

  const userContextValue = useMemo(
    () => ({ employee, authUserId, authEmail, isLoading: isUserLoading, onlineUsers, presenceConnection }),
    [authEmail, authUserId, employee, isUserLoading, onlineUsers, presenceConnection]
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

  if (isUserLoading || !employee) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-100"><div className="text-center"><div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" /><p className="mt-3 text-sm text-slate-500">사용자 정보를 확인하고 있습니다.</p></div></main>;
  }

  if (shouldBlockForMaintenance(employee, maintenanceSetting)) {
    return <MaintenanceScreen employee={employee} setting={maintenanceSetting} />;
  }

  if (!canEmployeeAccessRoute(employee, pathname)) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-100"><div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" /></main>;
  }

  const calendarOnly = isCalendarOnlyStaff(employee);

  return (
    <AppShellUserProvider value={userContextValue}>
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <main
        className={`min-h-screen min-w-0 flex-1 bg-slate-50 transition-all duration-300 ${
          isCollapsed ? "ml-14" : "ml-52"
        }`}
      >
        <Header onSearchClick={openSearch} readOnly={calendarOnly} />
        {children}
      </main>
      {!calendarOnly && <GlobalSearch isOpen={isSearchOpen} onClose={closeSearch} />}
      {!calendarOnly && hasPermission(employee?.role, "create") && <QuickActionsFab />}
      <ToastViewport />
      {!calendarOnly && <FocusPanel />}
      {!calendarOnly && <TaskDetailDialog canEdit={hasPermission(employee?.role, "update")} />}
      {!calendarOnly && <NoteEditorModal />}
    </div>
    </AppShellUserProvider>
  );
}
