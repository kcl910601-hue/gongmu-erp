import assert from "node:assert/strict";
import test from "node:test";
import { getAvailableRatioStage, getExpiryStage, mapMaterialContractEvent } from "./material-contract-notifications.ts";

test("classifies available-ratio thresholds", () => { assert.equal(getAvailableRatioStage(0.21), null); assert.equal(getAvailableRatioStage(0.2), "20"); assert.equal(getAvailableRatioStage(0.1), "10"); assert.equal(getAvailableRatioStage(0.05), "5"); });
test("classifies expiry stages", () => { assert.equal(getExpiryStage(31), null); assert.equal(getExpiryStage(30), "30d"); assert.equal(getExpiryStage(7), "7d"); assert.equal(getExpiryStage(0), "today"); assert.equal(getExpiryStage(-1), "expired"); });
test("maps events to the existing notification model", () => { const item = mapMaterialContractEvent({ notification_id: "n", contract_id: "c", contract_name: "AL", alert_kind: "available_ratio", stage: "5", available_tons: 4, available_ratio: 0.04, effective_end_date: "2026-09-01", created_at: "2026-08-11T00:00:00Z" }); assert.equal(item.priority, "critical"); assert.match(item.action.href, /contract=c/); });
