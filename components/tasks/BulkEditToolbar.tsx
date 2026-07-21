"use client";

import { useState } from "react";
import { CheckCircle2, Eye, List, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { BulkPreviewDialog } from "@/components/tasks/BulkPreviewDialog";
import {
  BulkSummary,
  type BulkSelectionSummary,
} from "@/components/tasks/BulkSummary";

export type BulkEditAction =
  | "assignee"
  | "status"
  | "start_date"
  | "due_date"
  | "complete"
  | "delete";

type PendingBulkAction = {
  action: BulkEditAction;
  value: string | null;
} | null;

export function BulkEditToolbar({
  selectedCount,
  summary,
  assignees,
  statuses,
  isWorking,
  showSelectedOnly,
  onToggleSelectedOnly,
  onApply,
  onCancel,
}: {
  selectedCount: number;
  summary: BulkSelectionSummary;
  assignees: string[];
  statuses: string[];
  isWorking: boolean;
  showSelectedOnly: boolean;
  onToggleSelectedOnly: () => void;
  onApply: (action: BulkEditAction, value: string | null) => void;
  onCancel: () => void;
}) {
  const [action, setAction] = useState<BulkEditAction>("assignee");
  const [value, setValue] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingBulkAction>(null);

  function requestApply(nextAction: BulkEditAction, nextValue: string | null) {
    setPendingAction({ action: nextAction, value: nextValue });
  }

  function getDefaultValue(nextAction: BulkEditAction) {
    if (nextAction === "assignee") return assignees[0] || "";
    if (nextAction === "status") return statuses[0] || "";
    return "";
  }

  return (
    <>
      <div className="fixed inset-x-3 bottom-3 z-[70] rounded-2xl border border-blue-200 bg-white p-3 shadow-xl md:sticky md:inset-auto md:top-[73px] md:mb-3 md:rounded-xl">
        <BulkSummary selectedCount={selectedCount} summary={summary} />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            value={action}
            disabled={isWorking}
            onChange={(event) => {
              const nextAction = event.target.value as BulkEditAction;
              setAction(nextAction);
              setValue(getDefaultValue(nextAction));
            }}
            aria-label="일괄 수정 항목"
            className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm"
          >
            <option value="assignee">담당자 변경</option>
            <option value="status">상태 변경</option>
            <option value="start_date">시작일 변경</option>
            <option value="due_date">마감일 변경</option>
          </select>

          {action === "assignee" && (
            <select value={value} disabled={isWorking} onChange={(event) => setValue(event.target.value)} aria-label="변경할 담당자" className="h-9 min-w-32 rounded-xl border border-slate-200 bg-white px-3 text-sm">
              <option value="">담당자 선택</option>
              {assignees.map((assignee) => <option key={assignee} value={assignee}>{assignee}</option>)}
            </select>
          )}
          {action === "status" && (
            <select value={value} disabled={isWorking} onChange={(event) => setValue(event.target.value)} aria-label="변경할 상태" className="h-9 min-w-28 rounded-xl border border-slate-200 bg-white px-3 text-sm">
              <option value="">상태 선택</option>
              {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          )}
          {(action === "start_date" || action === "due_date") && (
            <input type="date" value={value} disabled={isWorking} onChange={(event) => setValue(event.target.value)} aria-label={action === "start_date" ? "변경할 시작일" : "변경할 마감일"} className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm" />
          )}

          <Button size="sm" variant="primary" disabled={isWorking || !value} onClick={() => requestApply(action, value)}>적용</Button>
          <Button size="sm" variant="outline" disabled={isWorking} onClick={() => requestApply("complete", null)}><CheckCircle2 size={14} />완료처리</Button>
          <Button size="sm" variant="danger" disabled={isWorking} onClick={() => requestApply("delete", null)}><Trash2 size={14} />삭제</Button>
          <Button size="sm" variant="outline" disabled={isWorking} onClick={onToggleSelectedOnly}>
            {showSelectedOnly ? <List size={14} /> : <Eye size={14} />}
            {showSelectedOnly ? "전체 보기" : "선택만 보기"}
          </Button>
          <Button size="sm" variant="ghost" disabled={isWorking} onClick={onCancel} aria-label="업무 선택 취소"><X size={14} />취소</Button>
        </div>
      </div>

      {pendingAction && (
        <BulkPreviewDialog
          open
          count={selectedCount}
          action={pendingAction.action}
          value={pendingAction.value}
          onCancel={() => setPendingAction(null)}
          onConfirm={() => {
            onApply(pendingAction.action, pendingAction.value);
            setPendingAction(null);
          }}
        />
      )}
    </>
  );
}
