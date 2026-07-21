"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Pencil, X } from "lucide-react";
import { TaskDetailView, type TaskDetailData } from "@/components/tasks/TaskDetailView";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { completeTask, updateTask, type TaskUpdatePatch } from "@/lib/task-actions";
import {
  TASK_DETAIL_OPEN_EVENT,
  TASK_DETAIL_UPDATED_EVENT,
} from "@/lib/task-detail";
import { getLocalDateString } from "@/lib/task-priority";
import { isTaskCompleted, normalizeTaskStatus } from "@/lib/status";
import { supabase } from "@/lib/supabase";
import { toast } from "@/lib/toast";

type EditForm = {
  assignee: string;
  status: string;
  start_date: string;
  due_date: string;
};

const EMPTY_FORM: EditForm = {
  assignee: "",
  status: "pending",
  start_date: "",
  due_date: "",
};

export function TaskDetailDialog() {
  const [taskId, setTaskId] = useState<number | null>(null);
  const [task, setTask] = useState<TaskDetailData | null>(null);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [form, setForm] = useState<EditForm>(EMPTY_FORM);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const today = getLocalDateString();

  const loadTask = useCallback(async (nextTaskId: number) => {
    setIsLoading(true);
    setErrorMessage("");
    setTask(null);
    setIsEditing(false);

    try {
      const { data: taskData, error: taskError } = await supabase
        .from("tasks")
        .select(
          "id, project_id, task_order, task_name, task_type, assignee, status, start_date, due_date, completed_date, created_at"
        )
        .eq("id", nextTaskId)
        .single();
      if (taskError) throw taskError;

      const [{ data: projectData, error: projectError }, { data: employeeData }] =
        await Promise.all([
          supabase
            .from("projects")
            .select("id, project_name, project_code")
            .eq("id", taskData.project_id)
            .maybeSingle(),
          supabase
            .from("employees")
            .select("name")
            .eq("active", true)
            .order("name"),
        ]);
      if (projectError) throw projectError;

      const loadedTask: TaskDetailData = {
        ...taskData,
        project: projectData,
      };
      setTask(loadedTask);
      setAssignees((employeeData ?? []).map((employee) => employee.name));
      setForm({
        assignee: loadedTask.assignee || "",
        status: normalizeTaskStatus(loadedTask.status) || "pending",
        start_date: loadedTask.start_date || "",
        due_date: loadedTask.due_date || "",
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "업무 정보를 불러오지 못했습니다."
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    function handleOpen(event: Event) {
      const nextTaskId = (
        event as CustomEvent<{ taskId: number }>
      ).detail.taskId;
      setTaskId(nextTaskId);
      void loadTask(nextTaskId);
    }
    window.addEventListener(TASK_DETAIL_OPEN_EVENT, handleOpen);
    return () => window.removeEventListener(TASK_DETAIL_OPEN_EVENT, handleOpen);
  }, [loadTask]);

  const initialForm = useMemo<EditForm>(
    () => ({
      assignee: task?.assignee || "",
      status: normalizeTaskStatus(task?.status || null) || "pending",
      start_date: task?.start_date || "",
      due_date: task?.due_date || "",
    }),
    [task]
  );
  const isDirty = isEditing && JSON.stringify(form) !== JSON.stringify(initialForm);

  const closeDialog = useCallback(
    (force = false) => {
      if (isDirty && !force) {
        setShowDiscardConfirm(true);
        return;
      }
      setTaskId(null);
      setTask(null);
      setIsEditing(false);
      setErrorMessage("");
    },
    [isDirty]
  );

  useEffect(() => {
    if (taskId === null) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (showDiscardConfirm) return;
      if (event.key === "Escape") closeDialog();
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (isEditing && !isSaving) void saveChanges();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  function notifyUpdated(updatedTask: TaskDetailData) {
    window.dispatchEvent(
      new CustomEvent(TASK_DETAIL_UPDATED_EVENT, {
        detail: { task: updatedTask },
      })
    );
  }

  async function saveChanges() {
    if (!task || isSaving) return;
    setIsSaving(true);
    try {
      const patch: TaskUpdatePatch = {
        assignee: form.assignee || null,
        status: form.status,
        start_date: form.start_date || null,
        due_date: form.due_date || null,
      };
      const updated = await updateTask(task, patch);
      const nextTask: TaskDetailData = { ...task, ...updated };
      setTask(nextTask);
      setForm({
        assignee: nextTask.assignee || "",
        status: nextTask.status || "pending",
        start_date: nextTask.start_date || "",
        due_date: nextTask.due_date || "",
      });
      setIsEditing(false);
      notifyUpdated(nextTask);
      toast.success("업무가 수정되었습니다.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "업무 수정에 실패했습니다."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleComplete() {
    if (!task || isSaving) return;
    setIsSaving(true);
    try {
      const updated = await completeTask(task);
      const nextTask: TaskDetailData = { ...task, ...updated };
      setTask(nextTask);
      setForm((current) => ({ ...current, status: "completed" }));
      notifyUpdated(nextTask);
      toast.success("업무가 완료되었습니다.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "업무 완료 처리에 실패했습니다."
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (taskId === null) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[105] flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-4"
        role="presentation"
        onMouseDown={() => closeDialog()}
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-label="업무 상세"
          className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-2xl sm:rounded-2xl sm:p-6"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="mb-5 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-500">업무 상세</p>
            <button
              type="button"
              onClick={() => closeDialog()}
              aria-label="업무 상세 닫기"
              className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
            >
              <X size={18} />
            </button>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-2/3" />
              <div className="grid gap-3 sm:grid-cols-2">
                {Array.from({ length: 8 }).map((_, index) => (
                  <Skeleton key={index} className="h-16" />
                ))}
              </div>
            </div>
          ) : errorMessage ? (
            <ErrorState
              message={errorMessage}
              onRetry={() => {
                if (taskId !== null) void loadTask(taskId);
              }}
            />
          ) : task && isEditing ? (
            <div>
              <h2 className="text-xl font-bold text-slate-950">
                {task.task_name || "업무명 없음"}
              </h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label="담당자">
                  <select
                    value={form.assignee}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        assignee: event.target.value,
                      }))
                    }
                    className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
                  >
                    <option value="">미배정</option>
                    {assignees.map((assignee) => (
                      <option key={assignee} value={assignee}>
                        {assignee}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="상태">
                  <select
                    value={form.status}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        status: event.target.value,
                      }))
                    }
                    className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
                  >
                    <option value="pending">대기</option>
                    <option value="in_progress">진행중</option>
                    <option value="completed">완료</option>
                  </select>
                </Field>
                <Field label="시작일">
                  <input
                    type="date"
                    value={form.start_date}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        start_date: event.target.value,
                      }))
                    }
                    className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
                  />
                </Field>
                <Field label="마감일">
                  <input
                    type="date"
                    value={form.due_date}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        due_date: event.target.value,
                      }))
                    }
                    className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
                  />
                </Field>
              </div>
            </div>
          ) : task ? (
            <TaskDetailView task={task} today={today} />
          ) : null}

          {task && !isLoading && !errorMessage && (
            <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
              <Button variant="outline" onClick={() => closeDialog()}>
                닫기
              </Button>
              {isEditing ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setForm(initialForm);
                      setIsEditing(false);
                    }}
                    disabled={isSaving}
                  >
                    취소
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => void saveChanges()}
                    disabled={isSaving || !isDirty}
                  >
                    {isSaving ? "저장 중..." : "저장"}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setIsEditing(true)}
                    disabled={isSaving}
                  >
                    <Pencil size={15} />
                    수정
                  </Button>
                  {!isTaskCompleted(task.status) && (
                    <Button
                      variant="primary"
                      onClick={() => void handleComplete()}
                      disabled={isSaving}
                    >
                      <CheckCircle2 size={15} />
                      완료 처리
                    </Button>
                  )}
                </>
              )}
              <Link
                href={`/projects/${task.project_id}`}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => closeDialog(true)}
              >
                프로젝트 보기
              </Link>
            </div>
          )}
        </section>
      </div>
      <ConfirmDialog
        open={showDiscardConfirm}
        title="저장하지 않은 변경사항"
        description="저장하지 않은 변경사항이 있습니다. 팝업을 닫으시겠습니까?"
        confirmLabel="변경사항 버리기"
        danger
        onClose={() => setShowDiscardConfirm(false)}
        onConfirm={() => {
          setShowDiscardConfirm(false);
          closeDialog(true);
        }}
      />
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label>
      <span className="mb-1.5 block text-xs font-medium text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}
