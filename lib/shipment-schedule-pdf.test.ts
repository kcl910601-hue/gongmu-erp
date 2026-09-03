import assert from "node:assert/strict";
import test from "node:test";
import { buildShipmentCalendarWeeksForRange, formatShipmentQuantity, getShipmentMonthRange, renderShipmentCalendar, renderShipmentCalendarRange, validateShipmentScheduleRange, type ShipmentScheduleItem } from "./shipment-schedule-pdf.ts";
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

test("월 범위는 local date 기준의 월 시작일과 말일을 만든다", () => {
  assert.deepEqual(getShipmentMonthRange("2026-02"), { start: "2026-02-01", end: "2026-02-28" });
  assert.deepEqual(getShipmentMonthRange("2024-02"), { start: "2024-02-01", end: "2024-02-29" });
});

test("같은 날짜와 같은 월 기간을 허용한다", () => {
  assert.equal(validateShipmentScheduleRange({ start: "2026-09-03", end: "2026-09-03" }), null);
  assert.equal(validateShipmentScheduleRange({ start: "2026-09-03", end: "2026-09-18" }), null);
});

test("월 경계와 연도 경계 기간을 연속된 주로 만든다", () => {
  const crossMonth = buildShipmentCalendarWeeksForRange({ start: "2026-09-25", end: "2026-10-10" }, []);
  const crossYear = buildShipmentCalendarWeeksForRange({ start: "2026-12-28", end: "2027-01-05" }, []);

  assert.equal(crossMonth.flat().filter((cell) => cell.day !== null).length, 16);
  assert.equal(crossYear.flat().filter((cell) => cell.day !== null).length, 9);
  assert.ok(crossMonth.every((week) => week.length === 7));
  assert.ok(crossYear.every((week) => week.length === 7));
});

test("기간 안의 일정만 해당 날짜 셀에 표시한다", () => {
  const weeks = buildShipmentCalendarWeeksForRange(
    { start: "2026-09-03", end: "2026-09-09" },
    [
      { ...item, id: 2, shipmentDate: "2026-09-02" },
      { ...item, id: 3, shipmentDate: "2026-09-03" },
      { ...item, id: 4, shipmentDate: "2026-09-09" },
      { ...item, id: 5, shipmentDate: "2026-09-10" },
    ],
  );
  const visibleIds = weeks.flat().flatMap((cell) => cell.items.map((entry) => entry.id));

  assert.deepEqual(visibleIds, [3, 4]);
});

test("기간 달력은 범위 밖 날짜를 빈 셀로 표시하고 월/일을 노출한다", () => {
  const calendar = renderShipmentCalendarRange({ start: "2026-09-03", end: "2026-09-03" }, [{ ...item, shipmentDate: "2026-09-03" }]);

  assert.match(calendar, />9\/3</);
  assert.match(calendar, /화성동탄3차/);
  assert.equal((calendar.match(/class="day empty"/g) ?? []).length, 6);
});

test("필수 날짜, 실제 날짜, 역전된 기간을 검증한다", () => {
  assert.equal(validateShipmentScheduleRange({ start: "", end: "2026-09-03" }), "시작일을 선택해 주세요.");
  assert.equal(validateShipmentScheduleRange({ start: "2026-09-03", end: "" }), "종료일을 선택해 주세요.");
  assert.equal(validateShipmentScheduleRange({ start: "2026-02-30", end: "2026-03-01" }), "올바른 출력 기간을 선택해 주세요.");
  assert.equal(validateShipmentScheduleRange({ start: "2026-09-04", end: "2026-09-03" }), "종료일은 시작일 이후로 선택해 주세요.");
});
