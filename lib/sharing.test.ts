import test from "node:test";
import assert from "node:assert/strict";
import { canEditSharedNote, getBulkShareAcceptMessage, isSharePermission, selectPendingReceivedInvitations, type ShareInvitation } from "./sharing.ts";
test("share permission accepts only view and edit", () => { assert.equal(isSharePermission("view"), true); assert.equal(isSharePermission("edit"), true); assert.equal(isSharePermission("owner"), false); });
test("owner and edit member can edit the single original note", () => { assert.equal(canEditSharedNote("owner", "owner", null), true); assert.equal(canEditSharedNote("owner", "member", "edit"), true); assert.equal(canEditSharedNote("owner", "member", "view"), false); });
test("workspace selects only the current employee's pending invitations", () => {
  const invitation = (id: string, inviteeId: number, status: ShareInvitation["status"]): ShareInvitation => ({ id, shared_item_id: `shared-${id}`, inviter_id: 1, invitee_id: inviteeId, permission: "view", status, responded_at: null, created_at: "2026-08-13T00:00:00.000Z" });
  const selected = selectPendingReceivedInvitations({ currentEmployeeId: 2, received: [invitation("pending", 2, "pending"), invitation("other", 3, "pending"), invitation("accepted", 2, "accepted"), invitation("rejected", 2, "rejected"), invitation("cancelled", 2, "cancelled")] });
  assert.deepEqual(selected.map((item) => item.id), ["pending"]);
});
test("bulk accept 결과는 수락, 이미 처리, 실패 건수를 구분한다", () => {
  assert.equal(getBulkShareAcceptMessage({ requested: 5, accepted: 3, skipped: 1, failed: 1 }), "공유 요청 3건을 수락했습니다.\n1건은 이미 처리된 요청입니다.\n1건은 처리하지 못했습니다.");
  assert.equal(getBulkShareAcceptMessage({ requested: 5, accepted: 5, skipped: 0, failed: 0 }), "공유 요청 5건을 수락했습니다.");
});
