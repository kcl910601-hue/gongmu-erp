export const SHARED_ITEM_TYPES = ["schedule", "todo", "memo"] as const;
export const SHARE_PERMISSIONS = ["view", "edit"] as const;
export const SHARE_INVITATION_STATUSES = ["pending", "accepted", "rejected", "cancelled"] as const;
export type SharedItemType = (typeof SHARED_ITEM_TYPES)[number];
export type SharePermission = (typeof SHARE_PERMISSIONS)[number];
export type ShareInvitationStatus = (typeof SHARE_INVITATION_STATUSES)[number];
export const SHARE_PERMISSION_LABELS: Record<SharePermission, string> = { view: "보기 가능", edit: "편집 가능" };
export const SHARE_INVITATION_STATUS_LABELS: Record<ShareInvitationStatus, string> = { pending: "수락 대기", accepted: "공유 중", rejected: "거절", cancelled: "요청 취소" };
export type ShareEmployee = { id: number; name: string; position: string | null };
export type ShareInvitation = { id: string; shared_item_id: string; inviter_id: number; invitee_id: number; permission: SharePermission; status: ShareInvitationStatus; responded_at: string | null; created_at: string; item_title?: string | null; shared_item?: { id: string; item_id: string; item_type: SharedItemType; owner_id: number } | null; inviter?: { id: number; name: string } | null; invitee?: { id: number; name: string } | null };
export type SharedItemMember = { id: string; shared_item_id: string; employee_id: number; permission: SharePermission; joined_at: string; employee?: { id: number; name: string } | null };
export type SharingOverview = { currentEmployeeId: number; employees: ShareEmployee[]; received: ShareInvitation[]; sent: ShareInvitation[]; members: SharedItemMember[] };
export function isSharePermission(value: unknown): value is SharePermission { return typeof value === "string" && SHARE_PERMISSIONS.includes(value as SharePermission); }
export function canEditSharedNote(noteUserId: string, currentUserId: string, permission?: SharePermission | null) { return noteUserId === currentUserId || permission === "edit"; }
export function selectPendingReceivedInvitations(overview: Pick<SharingOverview, "currentEmployeeId" | "received">) { return overview.received.filter((invitation) => invitation.invitee_id === overview.currentEmployeeId && invitation.status === "pending"); }
