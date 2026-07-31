import assert from "node:assert/strict";
import test from "node:test";
import { canManageMaintenanceMode, getDefaultMaintenanceModeSetting, parseMaintenanceModeSetting, shouldBlockForMaintenance } from "./maintenance-mode.ts";
import type { CurrentEmployee } from "./auth.ts";

function employee(role: string | null): CurrentEmployee {
  return { id: 1, name: "테스트", email: "test@example.com", position: null, role, active: true, approval_status: "approved", auth_user_id: "user-id" };
}

test("점검모드가 꺼지면 일반 사용자의 접근을 허용한다", () => {
  assert.equal(shouldBlockForMaintenance(employee("staff"), getDefaultMaintenanceModeSetting()), false);
});

test("점검모드에서 일반 사용자는 차단하고 admin은 허용한다", () => {
  const setting = parseMaintenanceModeSetting({ enabled: true, message: "점검 중" });
  assert.equal(shouldBlockForMaintenance(employee("staff"), setting), true);
  assert.equal(shouldBlockForMaintenance(employee("admin"), setting), false);
});

test("설정이 없거나 형식이 잘못되면 안전한 기본값을 사용한다", () => {
  assert.deepEqual(parseMaintenanceModeSetting(null), getDefaultMaintenanceModeSetting());
  assert.deepEqual(parseMaintenanceModeSetting({ enabled: "true", message: 123 }), getDefaultMaintenanceModeSetting());
});

test("설정 수정 판정은 admin만 허용한다", () => {
  assert.equal(canManageMaintenanceMode(employee("admin")), true);
  assert.equal(canManageMaintenanceMode(employee("manager")), false);
  assert.equal(canManageMaintenanceMode(employee("staff")), false);
  assert.equal(canManageMaintenanceMode(null), false);
});
