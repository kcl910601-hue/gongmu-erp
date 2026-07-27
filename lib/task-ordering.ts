import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type OrderableTask = {
  id: number;
  project_id: number;
  project_section_id?: number | null;
  project_assembly_vendor_id: number | null;
  start_date: string | null;
  due_date: string | null;
  task_order: number | null;
  created_at: string | null;
};

function getScheduleTier(task: OrderableTask) {
  if (task.start_date) return 0;
  if (task.due_date) return 1;
  return 2;
}

export function compareTasksBySchedule(a: OrderableTask, b: OrderableTask) {
  const tierCompare = getScheduleTier(a) - getScheduleTier(b);
  if (tierCompare !== 0) return tierCompare;

  const dateA = a.start_date || a.due_date;
  const dateB = b.start_date || b.due_date;
  if (dateA && dateB) {
    const dateCompare = dateA.localeCompare(dateB);
    if (dateCompare !== 0) return dateCompare;
  }

  const orderCompare = (a.task_order ?? Number.MAX_SAFE_INTEGER) - (b.task_order ?? Number.MAX_SAFE_INTEGER);
  if (orderCompare !== 0) return orderCompare;

  const createdCompare = (a.created_at ?? "9999-12-31").localeCompare(b.created_at ?? "9999-12-31");
  if (createdCompare !== 0) return createdCompare;
  return a.id - b.id;
}

export function sortTasksBySchedule<T extends OrderableTask>(tasks: T[]) {
  return [...tasks].sort(compareTasksBySchedule);
}

function getTaskScopeKey(task: OrderableTask) {
  return `${task.project_id}:${task.project_assembly_vendor_id ?? "legacy"}:${task.project_section_id ?? "legacy-section"}`;
}

export function assignTaskOrdersByCurrentSequence<T extends OrderableTask>(tasks: T[]) {
  const nextOrderByScope = new Map<string, number>();
  return tasks.map((task) => {
    const scopeKey = getTaskScopeKey(task);
    const nextOrder = (nextOrderByScope.get(scopeKey) ?? 0) + 1;
    nextOrderByScope.set(scopeKey, nextOrder);
    return { ...task, task_order: nextOrder };
  });
}

export function recalculateTaskOrders<T extends OrderableTask>(tasks: T[]) {
  const tasksByScope = new Map<string, T[]>();
  tasks.forEach((task) => {
    const scopeKey = getTaskScopeKey(task);
    tasksByScope.set(scopeKey, [...(tasksByScope.get(scopeKey) ?? []), task]);
  });

  const nextOrderById = new Map<number, number>();
  tasksByScope.forEach((scopeTasks) => {
    sortTasksBySchedule(scopeTasks).forEach((task, index) => nextOrderById.set(task.id, index + 1));
  });

  return tasks.map((task) => ({ ...task, task_order: nextOrderById.get(task.id) ?? task.task_order }));
}

export async function persistRecalculatedTaskOrders<T extends OrderableTask>(tasks: T[]): Promise<{
  data: T[];
  error: PostgrestError | null;
}> {
  const normalizedTasks = recalculateTaskOrders(tasks);
  const changedTasks = normalizedTasks.filter((task) =>
    tasks.find((current) => current.id === task.id)?.task_order !== task.task_order
  );
  const results = await Promise.all(changedTasks.map((task) =>
    supabase.from("tasks").update({ task_order: task.task_order }).eq("id", task.id)
  ));
  const error = results.find((result) => result.error)?.error ?? null;
  return { data: error ? tasks : normalizedTasks, error };
}
