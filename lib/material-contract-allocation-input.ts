import { isMaterialAllocationType, isValidAllocationQuantity, type MaterialAllocationType, type MaterialContractAllocationStatus } from "./material-contract-allocations.ts";
import { normalizeOptionalMaterialUsageText } from "./material-usage-requests.ts";

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
  const purchaseOrderNo = normalizeOptionalMaterialUsageText(body.purchaseOrderNo);
  const memo = normalizeOptionalMaterialUsageText(body.memo);

  if (!allocationType) return { data: null, error: "사용 대상을 선택해 주세요." };
  if (allocationType === "project" && (!Number.isSafeInteger(projectId) || projectId <= 0)) return { data: null, error: "프로젝트를 선택해 주세요." };
  if (allocationType !== "project" && body.projectId !== null && body.projectId !== undefined && body.projectId !== "") return { data: null, error: "비프로젝트 사용에는 프로젝트를 지정할 수 없습니다." };
  if (allocationType !== "project" && allocationType !== "factory" && !destinationName) return { data: null, error: "사용처명을 입력해 주세요." };
  if (destinationName.length > 200) return { data: null, error: "사용처명은 200자 이하여야 합니다." };
  if (body.quantityTons === null || body.quantityTons === undefined || body.quantityTons === "") return { data: null, error: "사용량을 입력해 주세요." };
  if (!Number.isFinite(quantityTons)) return { data: null, error: "사용량은 숫자로 입력해 주세요." };
  if (quantityTons <= 0) return { data: null, error: "사용량은 0보다 커야 합니다." };
  if (!isValidAllocationQuantity(quantityTons)) return { data: null, error: "사용량은 소수점 4자리까지 입력할 수 있습니다." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(allocationDate) || Number.isNaN(Date.parse(`${allocationDate}T00:00:00Z`))) return { data: null, error: "배정일을 확인해주세요." };
  if (!status) return { data: null, error: "배정 상태를 확인해주세요." };
  if ((purchaseOrderNo?.length ?? 0) > 100) return { data: null, error: "발주번호는 100자 이하여야 합니다." };
  if ((memo?.length ?? 0) > 2000) return { data: null, error: "메모는 2000자 이하여야 합니다." };

  return { data: { allocationType, projectId: allocationType === "project" ? projectId : null, destinationName: allocationType === "project" || allocationType === "factory" ? null : destinationName, quantityTons, allocationDate, status, purchaseOrderNo, memo } satisfies MaterialContractAllocationInput, error: null };
}
