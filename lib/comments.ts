export const COMMENT_MAX_LENGTH = 2000;
export const COMMENT_MENTION_MAX_COUNT = 20;

export type CommentMention = {
  employeeId: number;
  name: string;
  position: string | null;
};

export type MentionableEmployee = {
  id: number;
  name: string;
  position: string | null;
};

export type SharedComment = {
  id: number;
  shared_item_id: string;
  author_id: number;
  content: string;
  created_at: string;
  updated_at: string;
  author: { id: number; name: string; position: string | null } | null;
  mentions: CommentMention[];
  canEdit: boolean;
  canDelete: boolean;
};

export function normalizeCommentMentionIds(value: unknown) {
  if (value === undefined) return { mentionIds: [] as number[], error: null } as const;
  if (!Array.isArray(value)) return { mentionIds: null, error: "멘션 대상 형식이 올바르지 않습니다." } as const;
  const mentionIds = [...new Set(value.map(Number))];
  if (mentionIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) return { mentionIds: null, error: "멘션 대상 형식이 올바르지 않습니다." } as const;
  if (mentionIds.length > COMMENT_MENTION_MAX_COUNT) return { mentionIds: null, error: `멘션은 최대 ${COMMENT_MENTION_MAX_COUNT}명까지 선택할 수 있습니다.` } as const;
  return { mentionIds, error: null } as const;
}

export function normalizeCommentContent(value: unknown) {
  if (typeof value !== "string") return { content: null, error: "댓글 내용을 입력해주세요." } as const;
  const content = value.trim();
  if (!content) return { content: null, error: "댓글 내용을 입력해주세요." } as const;
  if (content.length > COMMENT_MAX_LENGTH) return { content: null, error: `댓글은 ${COMMENT_MAX_LENGTH.toLocaleString("ko-KR")}자 이하로 입력해주세요.` } as const;
  return { content, error: null } as const;
}

export function getCommentPermissions(currentEmployeeId: number, ownerId: number, authorId: number) {
  return { canEdit: currentEmployeeId === authorId, canDelete: currentEmployeeId === authorId || currentEmployeeId === ownerId };
}

export function canAccessComments(currentEmployeeId: number, ownerId: number, member?: { employeeId: number; permission: "view" | "edit" } | null) {
  return currentEmployeeId === ownerId || member?.employeeId === currentEmployeeId;
}

export function getCommentNotificationRecipientIds(ownerId: number, memberIds: number[], authorId: number) {
  return [...new Set([ownerId, ...memberIds])].filter((employeeId) => employeeId !== authorId);
}
