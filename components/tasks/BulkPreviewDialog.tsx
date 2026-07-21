"use client";

import { Button } from "@/components/ui/Button";
import type { BulkEditAction } from "@/components/tasks/BulkEditToolbar";

export function BulkPreviewDialog({
  open,
  count,
  action,
  value,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  count: number;
  action: BulkEditAction;
  value: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  const actionLabel =
    action === "assignee"
      ? `담당자를 '${value}'(으)로 변경`
      : action === "status"
        ? `상태를 '${value}'(으)로 변경`
        : action === "start_date"
          ? `시작일을 ${value}(으)로 변경`
          : action === "due_date"
            ? `마감일을 ${value}(으)로 변경`
            : action === "complete"
              ? "완료 처리"
              : "삭제";

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/40 p-4">
      <section role="dialog" aria-modal="true" aria-label="일괄 작업 미리보기" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <p className="text-xs font-semibold uppercase text-blue-600">Bulk Preview</p>
        <h2 className="mt-2 text-lg font-bold text-slate-950">
          {count}개의 업무를 {actionLabel}합니다.
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          변경 대상과 값을 확인한 뒤 적용해 주세요.
          {action === "delete" && " 삭제한 업무는 복구할 수 없습니다."}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>취소</Button>
          <Button variant={action === "delete" ? "danger" : "primary"} onClick={onConfirm}>
            적용
          </Button>
        </div>
      </section>
    </div>
  );
}
