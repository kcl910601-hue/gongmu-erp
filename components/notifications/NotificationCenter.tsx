"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bell,
  Calendar,
  Clock,
  Check,
  CheckCheck,
  FolderKanban,
  RefreshCw,
  Truck,
  User,
  StickyNote,
  TrendingUp,
  Package,
  Pin,
  EyeOff,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { ErrorState } from "@/components/ui/ErrorState";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  loadNotificationSummary,
  markNotificationsRead,
  toggleNotificationRead,
  NOTIFICATION_READ_EVENT,
  NOTIFICATION_PREFERENCE_EVENT,
  notifyNotificationReadStateChanged,
  notifyNotificationPreferenceChanged,
  updateNotificationPreference,
  type NotificationCategory,
  type NotificationItem,
  type NotificationSummary,
} from "@/lib/notifications";
import { formatActivityTime } from "@/lib/activity";
import { useAppShellUser } from "@/contexts/AppShellUserContext";
import { toast } from "@/lib/toast";
import { deriveNotificationState, matchesNotificationSearch, splitNotificationMailbox } from "@/lib/notifications/engine";
import { NOTIFICATIONS_CHANGED_EVENT, REFERENCE_TASKS_CHANGED_EVENT, SHARING_CHANGED_EVENT } from "@/lib/collaboration-events";
import { SHARE_PERMISSION_LABELS, type ShareInvitation, type SharingOverview } from "@/lib/sharing";
import { dispatchPersonalNotesChanged } from "@/lib/personal-notes";
import { AddReferenceTaskButton } from "@/components/workspace/AddReferenceTaskButton";
import type { ReferenceTask } from "@/lib/reference-tasks";

type NotificationFilter = "all" | "task" | "project" | "raw_material" | "personal" | "system";
type NotificationMailbox = "inbox" | "archive";

const filters: { value: NotificationFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "task", label: "업무" },
  { value: "project", label: "프로젝트" },
  { value: "raw_material", label: "원자재" },
  { value: "personal", label: "개인" },
  { value: "system", label: "시스템" },
];

function matchesFilter(category: NotificationCategory, filter: NotificationFilter) {
  if (filter === "all") return true;
  if (filter === "task") return category === "task" || category === "shipment";
  if (filter === "system") return category === "system" || category === "employee" || category === "lme";
  return category === filter;
}

function getBadgeLabel(count: number) {
  if (count <= 0) return "";
  return count > 99 ? "99+" : String(count);
}

function getSeverityVariant(severity: NotificationItem["severity"]): BadgeVariant {
  if (severity === "danger") return "danger";
  if (severity === "warning") return "warning";
  return "info";
}

function formatDisplayDate(date: string | null) {
  if (!date) return "-";
  return date.slice(0, 10);
}

function getEmptyMessage(filter: NotificationFilter) {
  if (filter === "task") return "업무 알림이 없습니다.";
  if (filter === "project") return "최근 프로젝트 알림이 없습니다.";
  if (filter === "raw_material") return "원자재 알림이 없습니다.";
  if (filter === "personal") return "개인 알림이 없습니다.";
  if (filter === "system") return "시스템 알림이 없습니다.";
  return "현재 확인해야 할 알림이 없습니다.";
}

function NotificationIcon({ item }: { item: NotificationItem }) {
  const className = `mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${
    item.severity === "danger"
      ? "bg-red-50 text-red-600"
      : item.severity === "warning"
        ? "bg-amber-50 text-amber-600"
        : "bg-blue-50 text-blue-600"
  }`;

  if (item.category === "shipment") {
    return (
      <div className={className}>
        <Truck size={17} />
      </div>
    );
  }

  if (item.category === "project") {
    return (
      <div className={className}>
        <FolderKanban size={17} />
      </div>
    );
  }

  if (item.category === "personal") return <div className={className}><StickyNote size={17} /></div>;
  if (item.category === "raw_material") return <div className={className}><Package size={17} /></div>;
  if (item.category === "lme") return <div className={className}><TrendingUp size={17} /></div>;

  if (item.category === "employee") {
    return (
      <div className={className}>
        <User size={17} />
      </div>
    );
  }

  return (
    <div className={className}>
      {item.severity === "danger" ? (
        <AlertTriangle size={17} />
      ) : item.severity === "warning" ? (
        <Calendar size={17} />
      ) : (
        <Clock size={17} />
      )}
    </div>
  );
}

export function NotificationRow({
  item,
  onSelect,
  onToggleRead,
  isMarkingRead = false,
  onTogglePin,
  onHide,
  navigateOnSelect = true,
}: {
  item: NotificationItem;
  onSelect: () => void | Promise<void>;
  onToggleRead?: () => void | Promise<void>;
  isMarkingRead?: boolean;
  onTogglePin?: () => void | Promise<void>;
  onHide?: () => void | Promise<void>;
  navigateOnSelect?: boolean;
}) {
  const router = useRouter();
  return (
    <div className={`relative rounded-2xl border transition-colors hover:border-blue-200 hover:bg-blue-50 ${
      item.isRead ? "border-slate-200 bg-slate-50" : "border-blue-100 bg-blue-50/40"
    }`}>
      <Link
        href={item.href}
        onClick={async (event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          await onSelect();
          if (navigateOnSelect) router.push(item.href);
        }}
        className="block p-3.5 pr-28 text-left focus:outline-none focus:ring-2 focus:ring-blue-100"
      >
      <div className="flex items-start gap-3">
        <NotificationIcon item={item} />

        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center gap-2">
            <Badge
              variant={getSeverityVariant(item.severity)}
              className="shrink-0 px-2.5 py-0.5 font-semibold"
            >
              {item.title}
            </Badge>
            <Badge variant="default" className="px-2 py-0.5 text-[10px] uppercase">
              {item.category}
            </Badge>
            {!item.isRead && <span className="h-2 w-2 rounded-full bg-blue-600" />}
            {item.isHidden ? <Badge variant="warning" className="px-2 py-0.5 text-[10px]">숨김</Badge> : null}
          </div>
          <p className={`truncate text-sm text-slate-900 ${item.isRead ? "font-medium" : "font-bold"}`}>
            {item.description}
          </p>
          <p className="mt-1 truncate text-sm text-slate-700">
            {item.projectName}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span>{item.actor || "담당자 없음"}</span>
            <span>
              {item.date?.includes("T")
                ? formatActivityTime(item.date)
                : formatDisplayDate(item.date)}
            </span>
            {item.statusLabel ? <span>{item.statusLabel}</span> : null}
            {item.isRead && item.readAt ? <span>읽음 {formatActivityTime(item.readAt)}</span> : null}
          </div>
        </div>
      </div>
      </Link>
      {onToggleRead ? (
        <button
          type="button"
          onClick={(event) => { event.preventDefault(); event.stopPropagation(); void onToggleRead(); }}
          disabled={isMarkingRead}
          aria-label={`${item.description} ${item.isRead ? "미확인으로 표시" : "읽음 처리"}`}
          title={item.isRead ? "미확인으로 표시" : "읽음 처리"}
          className={`absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-xl border disabled:opacity-50 ${item.isRead ? "border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100" : "border-blue-100 bg-white text-blue-600 hover:bg-blue-50"}`}
        >
          <Check size={15} />
        </button>
      ) : null}
      {onTogglePin ? <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); void onTogglePin(); }} aria-label={item.isPinned ? "고정 해제" : "고정"} title={item.isPinned ? "고정 해제" : "고정"} className={`absolute right-12 top-3 flex h-8 w-8 items-center justify-center rounded-xl border bg-white ${item.isPinned ? "border-blue-200 text-blue-600" : "border-slate-200 text-slate-400"}`}><Pin size={14} className={item.isPinned ? "fill-current" : ""} /></button> : null}
      {onHide ? <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); void onHide(); }} aria-label={item.isHidden ? "알림 복원" : "알림 숨기기"} title={item.isHidden ? "복원" : "숨기기"} className="absolute right-3 bottom-3 flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 hover:text-red-600">{item.isHidden ? <RotateCcw size={14} /> : <EyeOff size={14} />}</button> : null}
    </div>
  );
}

export default function NotificationCenter() {
  const { employee } = useAppShellUser();
  const [isOpen, setIsOpen] = useState(false);
  const [summary, setSummary] = useState<NotificationSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [activeFilter, setActiveFilter] = useState<NotificationFilter>("all");
  const [mailbox, setMailbox] = useState<NotificationMailbox>("inbox");
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [markingIds, setMarkingIds] = useState<Set<string>>(() => new Set());
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [shareInvitations, setShareInvitations] = useState<ShareInvitation[]>([]);
  const [referenceCommentIds, setReferenceCommentIds] = useState<Set<number>>(() => new Set());
  const [selectedNotification, setSelectedNotification] = useState<NotificationItem | null>(null);
  const requestInFlightRef = useRef(false);
  const hasLoadedRef = useRef(false);

  const loadNotifications = useCallback(async () => {
    if (!employee || requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    setIsLoading(true);
    setErrorMessage("");

    const [notificationResult, sharingResponse, referenceResponse] = await Promise.all([loadNotificationSummary(100, employee), fetch("/api/sharing", { cache: "no-store" }).catch(() => null), fetch("/api/reference-tasks", { cache: "no-store" }).catch(() => null)]);
    const { data, error } = notificationResult;
    if (sharingResponse?.ok) {
      const sharing = await sharingResponse.json() as SharingOverview;
      const invitations = [...sharing.received, ...sharing.sent.filter((invitation) => invitation.status !== "pending")];
      setShareInvitations([...new Map(invitations.map((invitation) => [invitation.id, invitation])).values()].slice(0, 100));
    }
    if (referenceResponse?.ok) {
      const references = await referenceResponse.json() as { tasks?: ReferenceTask[] };
      setReferenceCommentIds(new Set((references.tasks ?? []).flatMap((task) => task.commentId === null ? [] : [task.commentId])));
    }

    if (error) {
      setSummary(null);
      setErrorMessage(error.message);
      setIsLoading(false);
      requestInFlightRef.current = false;
      return;
    }

    setSummary(data);
    hasLoadedRef.current = true;
    setIsLoading(false);
    requestInFlightRef.current = false;
  }, [employee]);

  useEffect(() => {
    if (!employee) return;
    const timer = window.setTimeout(() => void loadNotifications(), 0);
    return () => window.clearTimeout(timer);
  }, [employee, loadNotifications]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadNotifications();
    }, 5 * 60 * 1000);

    return () => window.clearInterval(interval);
  }, [loadNotifications]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (searchQuery) setSearchQuery("");
        else setIsOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, searchQuery]);

  const applyReadState = useCallback((notificationIds: string[], readAt: string | null) => {
    const idSet = new Set(notificationIds);
    setSummary((current) => {
      if (!current) return current;
      const items = current.items.map((item) => idSet.has(item.id) ? { ...item, isRead: readAt !== null, isUnread: readAt === null, readAt, isArchived: readAt !== null, archivedAt: readAt } : item);
      return { ...current, items, unreadCount: deriveNotificationState(items).unreadCount };
    });
  }, []);

  useEffect(() => {
    function handleReadState(event: Event) {
      const detail = (event as CustomEvent<{ notificationIds: string[]; readAt: string | null }>).detail;
      if (detail) applyReadState(detail.notificationIds, detail.readAt);
    }
    window.addEventListener(NOTIFICATION_READ_EVENT, handleReadState);
    return () => window.removeEventListener(NOTIFICATION_READ_EVENT, handleReadState);
  }, [applyReadState]);

  useEffect(() => {
    function handlePreferenceChange() { void loadNotifications(); }
    window.addEventListener(NOTIFICATION_PREFERENCE_EVENT, handlePreferenceChange);
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, handlePreferenceChange);
    return () => {
      window.removeEventListener(NOTIFICATION_PREFERENCE_EVENT, handlePreferenceChange);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, handlePreferenceChange);
    };
  }, [loadNotifications]);

  useEffect(() => {
    async function refreshReferenceTasks() {
      const response = await fetch("/api/reference-tasks", { cache: "no-store" });
      if (!response.ok) return;
      const result = await response.json() as { tasks?: ReferenceTask[] };
      setReferenceCommentIds(new Set((result.tasks ?? []).flatMap((task) => task.commentId === null ? [] : [task.commentId])));
    }
    window.addEventListener(REFERENCE_TASKS_CHANGED_EVENT, refreshReferenceTasks);
    return () => window.removeEventListener(REFERENCE_TASKS_CHANGED_EVENT, refreshReferenceTasks);
  }, []);

  const markRead = useCallback(async (notificationIds: string[]) => {
    if (!employee || notificationIds.length === 0) return false;
    const previousSummary = summary;
    const optimisticReadAt = new Date().toISOString();
    applyReadState(notificationIds, optimisticReadAt);
    const { error, readAt } = await markNotificationsRead(notificationIds, employee);
    if (error || !readAt) {
      setSummary(previousSummary);
      toast.error("알림 읽음 처리에 실패했습니다.");
      return false;
    }
    notifyNotificationReadStateChanged(notificationIds, readAt);
    return true;
  }, [applyReadState, employee, summary]);

  async function toggleOneRead(item: NotificationItem) {
    if (!employee || markingIds.has(item.id)) return;
    setMarkingIds((current) => new Set(current).add(item.id));
    const previousReadAt = item.readAt;
    const optimisticReadAt = previousReadAt ? null : new Date().toISOString();
    applyReadState([item.id], optimisticReadAt);
    const { error, readAt } = await toggleNotificationRead(item.id, previousReadAt, employee);
    if (error) {
      applyReadState([item.id], previousReadAt);
      toast.error("알림 읽음 상태를 변경하지 못했습니다.");
    } else {
      applyReadState([item.id], readAt);
      notifyNotificationReadStateChanged([item.id], readAt);
    }
    setMarkingIds((current) => {
      const next = new Set(current);
      next.delete(item.id);
      return next;
    });
  }

  async function markAllRead() {
    if (!summary || isMarkingAll) return;
    const unreadIds = summary.items.filter((item) => !item.isRead).map((item) => item.id);
    if (unreadIds.length === 0) return;
    setIsMarkingAll(true);
    const succeeded = await markRead(unreadIds);
    if (succeeded) toast.success("모든 알림을 읽음 처리했습니다.");
    setIsMarkingAll(false);
  }

  async function setPreference(item: NotificationItem, values: { isPinned?: boolean; isHidden?: boolean }) {
    if (!employee) return;
    const { error } = await updateNotificationPreference(item.id, employee, { ...values, isRead: item.isRead, readAt: item.readAt });
    if (error) { toast.error("알림 설정을 저장하지 못했습니다."); return; }
    setSummary((current) => current ? { ...current, items: current.items.map((currentItem) => currentItem.id === item.id ? { ...currentItem, isPinned: values.isPinned ?? currentItem.isPinned, isHidden: values.isHidden ?? currentItem.isHidden } : currentItem).filter((currentItem) => !currentItem.isHidden).sort((left, right) => Number(right.isPinned) - Number(left.isPinned)) } : current);
    notifyNotificationPreferenceChanged();
  }

  const filteredItems = useMemo(() => {
    if (!summary) return [];
    const mailboxes = splitNotificationMailbox(summary.items);
    const mailboxItems = mailbox === "archive" ? mailboxes.archive : mailboxes.inbox;
    const categoryItems = mailboxItems.filter((item) => matchesFilter(item.category, activeFilter));
    const unreadItems = showUnreadOnly && mailbox === "inbox" ? categoryItems.filter((item) => !item.isRead) : categoryItems;
    const searchedItems = mailbox === "archive" ? unreadItems : unreadItems.filter((item) => matchesNotificationSearch(item, debouncedSearchQuery));
    return [...searchedItems].sort((left, right) => mailbox === "archive" ? (right.archivedAt ?? "").localeCompare(left.archivedAt ?? "") : 0);
  }, [activeFilter, debouncedSearchQuery, mailbox, showUnreadOnly, summary]);

  const notificationState = useMemo(() => deriveNotificationState(summary?.items ?? []), [summary]);
  const unreadCount = notificationState.unreadCount;
  const pendingShareCount = shareInvitations.filter((invitation) => invitation.status === "pending").length;
  const archivedItemsCount = (summary?.items.filter((item) => item.isArchived).length ?? 0) + shareInvitations.filter((invitation) => invitation.status !== "pending").length;
  const visibleShareInvitations = shareInvitations.filter((invitation) => mailbox === "inbox" ? invitation.status === "pending" : invitation.status !== "pending");
  const mailboxNotificationItems = summary ? (mailbox === "inbox" ? splitNotificationMailbox(summary.items).inbox : splitNotificationMailbox(summary.items).archive) : [];
  const badgeLabel = getBadgeLabel(unreadCount + pendingShareCount);
  async function respondToShare(invitation: ShareInvitation, action: "accept" | "reject") {
    const response = await fetch("/api/sharing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, invitationId: invitation.id }) });
    if (!response.ok) { toast.error("공유 요청을 처리하지 못했습니다."); return; }
    await loadNotifications();
    window.dispatchEvent(new CustomEvent(SHARING_CHANGED_EVENT));
    dispatchPersonalNotesChanged();
    toast.success(action === "accept" ? "공유 요청을 수락했습니다." : "공유 요청을 거절했습니다.");
  }

  return (
    <>
      <button
        type="button"
        aria-label="알림 열기"
        onClick={() => {
          setIsOpen(true);
          if (!hasLoadedRef.current) void loadNotifications();
        }}
        className="relative flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 transition-colors hover:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
      >
        <Bell size={17} />
        {badgeLabel ? (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1.5 py-0.5 text-center text-[10px] font-bold leading-none text-white">
            {badgeLabel}
          </span>
        ) : null}
      </button>

      {isOpen
        ? createPortal(
            <div className="fixed inset-0 z-[100]">
          <button
            type="button"
            aria-label="알림 닫기"
            onClick={() => setIsOpen(false)}
            className="absolute inset-0 h-full w-full bg-slate-950/20"
          />

          <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-slate-50 shadow-xl sm:right-4 sm:top-20 sm:h-[560px] sm:w-[400px] sm:max-w-[calc(100vw-2rem)] sm:rounded-2xl sm:border">
            <div className="border-b border-slate-200 bg-white px-5 py-4 sm:rounded-t-2xl">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-slate-950">{mailbox === "inbox" ? "Inbox" : "Archive"}</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    확인 필요 항목 {unreadCount}건
                    {summary ? ` · 전체 ${notificationState.totalCount}건` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void loadNotifications()}
                    disabled={isLoading}
                    className="flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 transition-colors hover:bg-white disabled:opacity-60"
                    aria-label="알림 새로고침"
                  >
                    <RefreshCw
                      size={16}
                      className={isLoading ? "animate-spin" : ""}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 transition-colors hover:bg-white"
                    aria-label="알림 닫기"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {mailbox === "inbox" && <label className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <Search size={15} className="text-slate-400" />
                <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="제목, 내용, 프로젝트, 카테고리, 우선순위 검색" aria-label="알림 검색" className="min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400" />
                {searchQuery ? <button type="button" onClick={() => setSearchQuery("")} aria-label="알림 검색 초기화" title="검색 초기화" className="text-slate-400 hover:text-slate-700"><X size={14} /></button> : null}
              </label>}

              <div className="mt-4 grid grid-cols-3 gap-1 rounded-2xl bg-slate-100 p-1 sm:grid-cols-6">
                {filters.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => setActiveFilter(filter.value)}
                    className={`rounded-xl px-2 py-1.5 text-xs font-semibold transition-colors ${
                      activeFilter === filter.value
                        ? "bg-white text-blue-700 shadow-sm"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    {filter.label} ({mailboxNotificationItems.filter((item) => !item.isHidden && matchesFilter(item.category, filter.value)).length})
                  </button>
                ))}
              </div>
              {mailbox === "inbox" && <div className="mt-3 flex items-center justify-between gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600">
                  <input
                    type="checkbox"
                    checked={showUnreadOnly}
                    onChange={(event) => setShowUnreadOnly(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600"
                  />
                  읽지 않은 알림만
                </label>
                <button
                  type="button"
                  onClick={() => void markAllRead()}
                  disabled={unreadCount === 0 || isMarkingAll}
                  className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 disabled:text-slate-300 disabled:hover:bg-transparent"
                >
                  <CheckCheck size={14} />
                  {isMarkingAll ? "처리 중..." : "모두 읽음"}
                </button>
              </div>}
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {isLoading ? (
                <TableSkeleton rows={6} columns={1} />
              ) : errorMessage ? (
                <ErrorState
                  message={errorMessage}
                  onRetry={() => void loadNotifications()}
                />
              ) : filteredItems.length > 0 || ((activeFilter === "all" || activeFilter === "personal") && visibleShareInvitations.length > 0) ? (
                <div className="space-y-3">
                  {(activeFilter === "all" || activeFilter === "personal") && visibleShareInvitations.map((invitation) => <article key={invitation.id} className="rounded-2xl border border-blue-200 bg-blue-50 p-4"><div className="flex items-center justify-between gap-2"><span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white">{invitation.status === "pending" ? "공유 요청" : "공유 응답"}</span><span className="text-xs text-blue-600">{SHARE_PERMISSION_LABELS[invitation.permission]}</span></div><p className="mt-2 text-sm font-semibold text-slate-900">{invitation.status === "pending" ? `${invitation.inviter?.name ?? "직원"}님이 항목을 공유했습니다.` : `${invitation.invitee?.name ?? "직원"}님이 공유 요청을 ${invitation.status === "accepted" ? "수락" : invitation.status === "rejected" ? "거절" : "취소"}했습니다.`}</p><p className="mt-1 text-xs text-slate-500">{invitation.shared_item?.item_type.toUpperCase() ?? "공유 항목"}</p>{invitation.status === "pending" && <div className="mt-3 flex gap-2"><button type="button" onClick={() => void respondToShare(invitation, "accept")} className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white">수락</button><button type="button" onClick={() => void respondToShare(invitation, "reject")} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">거절</button></div>}</article>)}
                  {filteredItems.map((item) => (
                    <NotificationRow
                      key={item.id}
                      item={item}
                      isMarkingRead={markingIds.has(item.id)}
                      onToggleRead={() => toggleOneRead(item)}
                      onTogglePin={() => setPreference(item, { isPinned: !item.isPinned })}
                      onHide={() => setPreference(item, { isHidden: true })}
                      navigateOnSelect={false}
                      onSelect={async () => {
                        if (!item.isRead) await toggleOneRead(item);
                        setSelectedNotification(item);
                      }}
                    />
                  ))}
                  {activeFilter === "all" && summary && summary.hiddenCount > 0 ? (
                    <div className="px-2 py-1 text-center text-xs text-slate-400">
                      외 {summary.hiddenCount}건 더 있음
                    </div>
                  ) : null}
                </div>
              ) : (
                <EmptyState
                  title={showUnreadOnly ? "읽지 않은 알림이 없습니다." : getEmptyMessage(activeFilter)}
                  className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500"
                />
              )}
            </div>
            <div className="border-t border-slate-200 bg-white p-3 text-center sm:rounded-b-2xl">
              <button
                type="button"
                onClick={() => { setMailbox((current) => current === "inbox" ? "archive" : "inbox"); setSearchQuery(""); setShowUnreadOnly(false); }}
                className="mr-4 text-sm font-semibold text-slate-600 hover:text-blue-700"
              >
                {mailbox === "inbox" ? `Archive (${archivedItemsCount})` : `Inbox (${unreadCount + pendingShareCount})`}
              </button>
              <Link
                href="/notifications"
                onClick={() => setIsOpen(false)}
                className="text-sm font-semibold text-blue-600 hover:text-blue-700"
              >
                모든 알림 보기
              </Link>
            </div>
          </aside>
          {selectedNotification && <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedNotification(null); }}><section role="dialog" aria-modal="true" aria-label="알림 상세" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold text-blue-600">{selectedNotification.type}</p><h2 className="mt-1 text-lg font-bold text-slate-900">알림 상세</h2></div><button type="button" onClick={() => setSelectedNotification(null)} className="rounded-lg p-1 text-slate-400"><X size={18}/></button></div><dl className="mt-4 space-y-3 text-sm"><div><dt className="text-xs text-slate-400">작성자</dt><dd className="mt-0.5 font-medium text-slate-700">{selectedNotification.actor ?? "시스템"}</dd></div><div><dt className="text-xs text-slate-400">원본</dt><dd className="mt-0.5 font-medium text-slate-700">{selectedNotification.projectName}</dd></div><div><dt className="text-xs text-slate-400">알림 내용</dt><dd className="mt-0.5 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-slate-700">{selectedNotification.description}</dd></div><div><dt className="text-xs text-slate-400">발생 시간</dt><dd className="mt-0.5 text-slate-600">{selectedNotification.date?.includes("T") ? formatActivityTime(selectedNotification.date) : formatDisplayDate(selectedNotification.date)}</dd></div></dl><div className="mt-5 flex flex-wrap justify-end gap-2">{selectedNotification.referenceCommentId && <AddReferenceTaskButton key={`${selectedNotification.referenceCommentId}-${referenceCommentIds.has(selectedNotification.referenceCommentId)}`} commentId={selectedNotification.referenceCommentId} defaultTitle={selectedNotification.description} added={referenceCommentIds.has(selectedNotification.referenceCommentId)} onAdded={(commentId) => setReferenceCommentIds((current) => new Set(current).add(commentId))}/>}<Link href={selectedNotification.href} onClick={() => { setSelectedNotification(null); setIsOpen(false); }} className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white">원본 열기</Link></div></section></div>}
            </div>,
            document.body
          )
        : null}
    </>
  );
}
