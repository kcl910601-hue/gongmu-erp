import test from "node:test";
import assert from "node:assert/strict";
import { canEditSharedNote, isSharePermission } from "./sharing.ts";
test("share permission accepts only view and edit", () => { assert.equal(isSharePermission("view"), true); assert.equal(isSharePermission("edit"), true); assert.equal(isSharePermission("owner"), false); });
test("owner and edit member can edit the single original note", () => { assert.equal(canEditSharedNote("owner", "owner", null), true); assert.equal(canEditSharedNote("owner", "member", "edit"), true); assert.equal(canEditSharedNote("owner", "member", "view"), false); });
