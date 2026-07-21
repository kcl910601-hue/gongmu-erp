import { logActivity } from "@/lib/activity";
import { recordRecentWorkspaceItem } from "@/lib/recent";
import { supabase } from "@/lib/supabase";
import { getLocalDateString, type PrioritizableTask } from "@/lib/task-priority";
import { isTaskCompleted } from "@/lib/status";

export type TaskUpdatePatch = Partial<
  Pick<
    PrioritizableTask,
    "assignee" | "status" | "start_date" | "due_date" | "completed_date"
  >
>;

export async function completeTask(task: PrioritizableTask) {
  const completedDate = getLocalDateString();
  const { error } = await supabase
    .from("tasks")
    .update({
      status: "completed",
      completed_date: completedDate,
    })
    .eq("id", task.id);

  if (error) throw error;

  await Promise.all([
    logActivity({
      type: "task_complete",
      title: "업무 완료",
      description: `${task.task_name || "업무"} 상태를 완료로 변경했습니다.`,
      projectId: task.project_id,
      targetType: "task",
      targetId: task.id,
      metadata: {
        previousStatus: task.status,
        nextStatus: "completed",
        completedDate,
      },
    }),
    recordRecentWorkspaceItem({
      key: `task-${task.id}`,
      type: "task",
      name: task.task_name || "업무",
      href: `/projects/${task.project_id}#project-tasks`,
      project_id: task.project_id,
    }),
  ]);

  return {
    ...task,
    status: "completed",
    completed_date: completedDate,
  };
}

export async function updateTask(
  task: PrioritizableTask,
  patch: TaskUpdatePatch
) {
  if (
    patch.status &&
    isTaskCompleted(patch.status) &&
    patch.completed_date === undefined
  ) {
    return completeTask(task);
  }

  const payload: TaskUpdatePatch = { ...patch };
  if (patch.status !== undefined && patch.completed_date === undefined) {
    payload.completed_date = null;
  }

  const { error } = await supabase
    .from("tasks")
    .update(payload)
    .eq("id", task.id);
  if (error) throw error;

  const updatedTask = {
    ...task,
    ...patch,
    ...(patch.status !== undefined && patch.completed_date === undefined
      ? { completed_date: null }
      : {}),
  };
  const changedFields = Object.keys(patch);
  const activityType =
    patch.assignee !== undefined
      ? "task_assignee_change"
      : patch.status !== undefined
        ? "task_status_change"
        : "task_update";

  await Promise.all([
    logActivity({
      type: activityType,
      title:
        activityType === "task_assignee_change"
          ? "업무 담당자 변경"
          : activityType === "task_status_change"
            ? "업무 상태 변경"
            : "업무 수정",
      description: `${task.task_name || "업무"}의 ${changedFields.join(", ")} 항목을 변경했습니다.`,
      projectId: task.project_id,
      targetType: "task",
      targetId: task.id,
      metadata: {
        changedFields,
        previousStatus: task.status,
        nextStatus: updatedTask.status,
        previousAssignee: task.assignee,
        nextAssignee: updatedTask.assignee,
      },
    }),
    recordRecentWorkspaceItem({
      key: `task-${task.id}`,
      type: "task",
      name: task.task_name || "업무",
      href: `/projects/${task.project_id}#project-tasks`,
      project_id: task.project_id,
    }),
  ]);

  return updatedTask;
}

export async function deleteTask(task: PrioritizableTask) {
  const { error } = await supabase.from("tasks").delete().eq("id", task.id);
  if (error) throw error;

  await logActivity({
    type: "task_delete",
    title: "업무 삭제",
    description: `${task.task_name || "업무"}를 삭제했습니다.`,
    projectId: task.project_id,
    targetType: "task",
    targetId: task.id,
    metadata: {
      deletedStatus: task.status,
      deletedAssignee: task.assignee,
    },
  });
}
