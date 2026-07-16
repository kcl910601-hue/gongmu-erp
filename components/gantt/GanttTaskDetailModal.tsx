"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { supabase } from "@/lib/supabase";
import {
  getTaskStatusLabel,
  isTaskCompleted,
  normalizeTaskStatus,
} from "@/lib/status";
import type {
  GanttTaskDetail,
  IntegratedTask,
} from "@/components/gantt/IntegratedProjectGantt";

type GanttTaskDetailModalProps = {
  task: GanttTaskDetail;
  today: string;
  onClose: () => void;
  onTaskUpdated: (task: IntegratedTask) => void;
};

const statusOptions = ["pending", "in_progress", "completed"];

function isValidDateValue(value: string) {
  if (value === "") return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime());
}

function getScheduleVariant(task: GanttTaskDetail, today: string): BadgeVariant {
  if (isTaskCompleted(task.status)) return "success";
  if (task.delayedDays !== null) return "danger";
  if (task.dueDate === today) return "warning";
  return "info";
}

function getScheduleLabel(task: GanttTaskDetail, today: string) {
  if (isTaskCompleted(task.status)) return "완료";
  if (task.delayedDays !== null) return `지연 ${task.delayedDays}일`;
  if (task.dueDate === today) return "오늘 마감";

  const dueDate = new Date(`${task.dueDate}T00:00:00`);
  const todayDate = new Date(`${today}T00:00:00`);
  const diffDays = Math.ceil(
    (dueDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  return diffDays > 0 ? `D-${diffDays}` : "-";
}

export function GanttTaskDetailModal({
  task,
  today,
  onClose,
  onTaskUpdated,
}: GanttTaskDetailModalProps) {
  const [editStartDate, setEditStartDate] = useState(task.startDate || "");
  const [editDueDate, setEditDueDate] = useState(task.dueDate || "");
  const [editStatus, setEditStatus] = useState(
    normalizeTaskStatus(task.status) || "pending"
  );
  const [editCompletedDate, setEditCompletedDate] = useState(
    task.completedDate || ""
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const isDirty =
    editStartDate !== (task.startDate || "") ||
    editDueDate !== (task.dueDate || "") ||
    editStatus !== (normalizeTaskStatus(task.status) || "pending") ||
    editCompletedDate !== (task.completedDate || "");

  const previewTask = useMemo<GanttTaskDetail>(
    () => ({
      ...task,
      startDate: editStartDate,
      dueDate: editDueDate,
      status: editStatus,
      completedDate: editCompletedDate || null,
      delayedDays:
        isTaskCompleted(editStatus) || !editDueDate || editDueDate >= today
          ? null
          : Math.ceil(
              (new Date(`${today}T00:00:00`).getTime() -
                new Date(`${editDueDate}T00:00:00`).getTime()) /
                (1000 * 60 * 60 * 24)
            ),
    }),
    [editCompletedDate, editDueDate, editStartDate, editStatus, task, today]
  );

  function requestClose() {
    if (isSaving) return;

    if (
      isDirty &&
      !window.confirm("저장하지 않은 변경사항이 있습니다. 닫으시겠습니까?")
    ) {
      return;
    }

    onClose();
  }

  async function saveTask() {
    setErrorMessage("");

    if (!isValidDateValue(editStartDate)) {
      setErrorMessage("시작일 형식이 올바르지 않습니다.");
      return;
    }

    if (!isValidDateValue(editDueDate)) {
      setErrorMessage("종료일 형식이 올바르지 않습니다.");
      return;
    }

    if (!isValidDateValue(editCompletedDate)) {
      setErrorMessage("완료일 형식이 올바르지 않습니다.");
      return;
    }

    if (editStartDate && editDueDate && editStartDate > editDueDate) {
      setErrorMessage("시작일은 종료일보다 늦을 수 없습니다.");
      return;
    }

    setIsSaving(true);

    const originalCompletedDate = task.completedDate || "";
    const completedDateWasEdited = editCompletedDate !== originalCompletedDate;
    const nextCompletedDate = isTaskCompleted(editStatus)
      ? editCompletedDate || today
      : completedDateWasEdited
        ? editCompletedDate || null
        : null;

    const { data, error } = await supabase
      .from("tasks")
      .update({
        start_date: editStartDate || null,
        due_date: editDueDate || null,
        status: editStatus,
        completed_date: nextCompletedDate,
      })
      .eq("id", task.taskId)
      .select(
        "id, project_id, task_order, task_name, task_type, assignee, status, start_date, due_date, completed_date"
      )
      .single();

    if (error) {
      setErrorMessage(error.message);
      setIsSaving(false);
      return;
    }

    onTaskUpdated(data as IntegratedTask);
    setIsSaving(false);
    onClose();
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        requestClose();
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  });

  const scheduleLabel = getScheduleLabel(previewTask, today);
  const scheduleVariant = getScheduleVariant(previewTask, today);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
      onClick={requestClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="gantt-task-detail-title"
        className="w-full max-w-[640px] rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${task.taskTypeClassName}`}
              >
                {task.taskType || "미지정"}
              </span>
              <Badge variant={scheduleVariant} className="px-2.5 py-1 font-semibold">
                {scheduleLabel}
              </Badge>
            </div>
            <h2
              id="gantt-task-detail-title"
              className="truncate text-xl font-bold tracking-tight text-slate-950"
              title={task.taskName || "업무명 없음"}
            >
              {task.taskName || "업무명 없음"}
            </h2>
            <p className="mt-1 truncate text-sm font-medium text-slate-600">
              {task.projectName}
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="rounded-full px-2 py-1 text-sm text-slate-500 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100"
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        <div className="mb-5 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          {[
            ["현장명", task.projectName],
            ["프로젝트 코드", task.projectCode || "-"],
            ["업무유형", task.taskType || "미지정"],
            ["담당자", task.assignee || "미배정"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-slate-50 p-3">
              <div className="text-xs font-medium text-slate-500">{label}</div>
              <div className="mt-1 truncate font-semibold text-slate-900">
                {value}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label>
            <span className="mb-1.5 block text-xs font-medium text-slate-500">
              시작일
            </span>
            <input
              type="date"
              value={editStartDate}
              onChange={(event) => setEditStartDate(event.target.value)}
              className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition-colors focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <label>
            <span className="mb-1.5 block text-xs font-medium text-slate-500">
              종료일
            </span>
            <input
              type="date"
              value={editDueDate}
              onChange={(event) => setEditDueDate(event.target.value)}
              className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition-colors focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <label>
            <span className="mb-1.5 block text-xs font-medium text-slate-500">
              상태
            </span>
            <select
              value={editStatus}
              onChange={(event) => setEditStatus(event.target.value)}
              className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition-colors focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
            >
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {getTaskStatusLabel(status)}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="mb-1.5 block text-xs font-medium text-slate-500">
              완료일
            </span>
            <input
              type="date"
              value={editCompletedDate}
              onChange={(event) => setEditCompletedDate(event.target.value)}
              className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition-colors focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
            />
          </label>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3">
          <div className="text-xs font-medium text-slate-500">일정 상태</div>
          <Badge variant={scheduleVariant} className="mt-2 px-2.5 py-1 font-semibold">
            {scheduleLabel}
          </Badge>
        </div>

        {errorMessage && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
            {errorMessage}
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={requestClose}
            disabled={isSaving}
            className="rounded-2xl px-4 py-2 text-sm"
          >
            취소
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={saveTask}
            disabled={isSaving}
            className="rounded-2xl px-4 py-2 text-sm"
          >
            {isSaving ? "저장 중..." : "저장"}
          </Button>
          <Link
            href={`/projects/${task.projectId}`}
            onClick={(event) => {
              if (
                isDirty &&
                !window.confirm(
                  "저장하지 않은 변경사항이 있습니다. 이동하시겠습니까?"
                )
              ) {
                event.preventDefault();
                return;
              }

              onClose();
            }}
            className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100"
          >
            프로젝트 상세 보기
          </Link>
        </div>
      </div>
    </div>
  );
}
