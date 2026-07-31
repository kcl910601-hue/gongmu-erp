import assert from "node:assert/strict";
import test from "node:test";
import { formatShipmentQuantity, renderShipmentCalendar, type ShipmentScheduleItem } from "./shipment-schedule-pdf.ts";
import { resolveTaskDisplayQuantity } from "./task-form-rules.ts";

const item: ShipmentScheduleItem = {
  id: 1,
  shipmentDate: "2026-08-01",
  projectName: "화성동탄3차",
  taskName: "2차 문틀",
  quantity: null,
  quantityUnit: "EA",
  memo: null,
};

test("월간 출고 달력은 현장명과 작업명만 표시한다", () => {
  const calendar = renderShipmentCalendar("2026-08", [{ ...item, quantity: 1537 }]);

  assert.match(calendar, /화성동탄3차/);
  assert.match(calendar, /2차 문틀/);
  assert.doesNotMatch(calendar, /1537/);
  assert.doesNotMatch(calendar, /EA/);
});

test("상세목록의 수량 표시는 null을 하이픈으로 표시한다", () => {
  assert.equal(formatShipmentQuantity(item), "-");
  assert.equal(formatShipmentQuantity({ ...item, taskName: "압출", quantity: 120 }), "120EA");
});

test("일반 업무는 상세목록에 수량을 유지하고 달력에서는 제외한다", () => {
  const extrusionItem = {
    ...item,
    taskName: "압출",
    quantity: resolveTaskDisplayQuantity("압출", 120, 1537),
  };
  const calendar = renderShipmentCalendar("2026-08", [extrusionItem]);

  assert.match(calendar, /화성동탄3차/);
  assert.match(calendar, /압출/);
  assert.doesNotMatch(calendar, /120/);
  assert.doesNotMatch(calendar, /EA/);
  assert.equal(formatShipmentQuantity(extrusionItem), "120EA");
});

test("문틀 업무는 기존 수량과 프로젝트 fallback을 모두 상세목록에서 차단한다", () => {
  for (const [taskName, taskQuantity] of [["본납 문틀", null], ["2차 문틀", null], ["AS문틀", 100]] as const) {
    const scheduleItem = {
      ...item,
      taskName,
      quantity: resolveTaskDisplayQuantity(taskName, taskQuantity, 1537),
    };

    assert.equal(formatShipmentQuantity(scheduleItem), "-");
  }
});
