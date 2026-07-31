import { isMaterialAllocationType, isValidAllocationQuantity, type MaterialAllocationType, type MaterialContractAllocationStatus } from "./material-contract-allocations.ts";

export type MaterialContractAllocationInput = {
  allocationType: MaterialAllocationType;
  projectId: number | null;
  destinationName: string | null;
  quantityTons: number;
  allocationDate: string;
  status: Extract<MaterialContractAllocationStatus, "planned" | "confirmed">;
  purchaseOrderNo: string | null;
  memo: string | null;
};

export function parseMaterialContractAllocationInput(body: Record<string, unknown>) {
  const projectId = Number(body.projectId);
  const allocationType = isMaterialAllocationType(body.allocationType) ? body.allocationType : null;
  const destinationName = typeof body.destinationName === "string" ? body.destinationName.trim() : "";
  const quantityTons = Number(body.quantityTons);
  const allocationDate = typeof body.allocationDate === "string" ? body.allocationDate : "";
  const status = body.status === "planned" || body.status === "confirmed" ? body.status : null;
  const purchaseOrderNo = typeof body.purchaseOrderNo === "string" ? body.purchaseOrderNo.trim() : "";
  const memo = typeof body.memo === "string" ? body.memo.trim() : "";

  if (!allocationType) return { data: null, error: "사용 구분을 확인해주세요." };
  if (allocationType === "project" && (!Number.isSafeInteger(projectId) || projectId <= 0)) return { data: null, error: "현장을 선택해주세요." };
  if (allocationType !== "project" && body.projectId !== null && body.projectId !== undefined && body.projectId !== "") return { data: null, error: "비프로젝트 사용에는 프로젝트를 지정할 수 없습니다." };
  if (allocationType !== "project" && !destinationName) return { data: null, error: "사용처명을 입력해주세요." };
  if (destinationName.length > 200) return { data: null, error: "사용처명은 200자 이하여야 합니다." };
  if (!isValidAllocationQuantity(quantityTons)) return { data: null, error: "배정 톤수는 0보다 큰 소수점 4자리 이하 값이어야 합니다." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(allocationDate) || Number.isNaN(Date.parse(`${allocationDate}T00:00:00Z`))) return { data: null, error: "배정일을 확인해주세요." };
  if (!status) return { data: null, error: "배정 상태를 확인해주세요." };
  if (purchaseOrderNo.length > 100) return { data: null, error: "발주번호는 100자 이하여야 합니다." };
  if (memo.length > 2000) return { data: null, error: "메모는 2000자 이하여야 합니다." };

  return { data: { allocationType, projectId: allocationType === "project" ? projectId : null, destinationName: allocationType === "project" ? null : destinationName, quantityTons, allocationDate, status, purchaseOrderNo: purchaseOrderNo || null, memo: memo || null } satisfies MaterialContractAllocationInput, error: null };
}
