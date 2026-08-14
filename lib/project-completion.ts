import { summarizeUnallocatedUsageRequests } from "./material-usage-requests.ts";
import { REQUIRED_PROCESS_RULES } from "./required-process-alerts.ts";
import { isTaskCompleted } from "./status.ts";
import { getTaskNoteCheckDateStatus } from "./task-notes.ts";
import { getTaskPriority, type PrioritizableTask } from "./task-priority.ts";

export type ProjectCompletionCheckState = "ok" | "warning";
export type ProjectCompletionCheckResult = { projectId: number; projectName: string; canComplete: true; hasWarnings: boolean; checkedAt: string; checks: {
  incompleteTasks: { state: ProjectCompletionCheckState; count: number; href: string };
  overdueTasks: { state: ProjectCompletionCheckState; count: number; href: string };
  overdueNoteChecks: { state: ProjectCompletionCheckState; count: number; href: string };
  unallocatedMaterial: { state: ProjectCompletionCheckState; count: number; totalTons: number; href: string };
  incompleteShipments: { state: ProjectCompletionCheckState; count: number; href: string };
  requiredProcesses: { state: ProjectCompletionCheckState; finalDeliveryDoorRegistered: boolean; href: string };
} };
export type CompletionTask = PrioritizableTask;
export type CompletionTaskNote = { id: string; task_id: number; check_date: string | null };
export type CompletionMaterialRequest = { status: "active" | "cancelled"; unallocated_tons: number };
export type CompletionShipment = { id: number; status: string | null };
export type CompletionProjectSection = { process_type: string };

const state = (warning: boolean): ProjectCompletionCheckState => warning ? "warning" : "ok";
function isValidTask(task: Pick<CompletionTask, "status">) { const value = task.status?.trim().toLocaleLowerCase("ko-KR"); return !["cancelled", "canceled", "deleted", "취소", "삭제"].includes(value ?? ""); }
export function isIncompleteShipment(status: string | null) { const value = status?.trim().toLocaleLowerCase("ko-KR") ?? ""; return !["completed", "완료", "출고완료", "cancelled", "canceled", "취소"].includes(value); }

export function evaluateProjectCompletionCheck(input: { projectId: number; projectName: string; today: string; checkedAt: string; tasks: CompletionTask[]; taskNotes: CompletionTaskNote[]; materialRequests: CompletionMaterialRequest[]; shipments: CompletionShipment[]; projectSections: CompletionProjectSection[] }): ProjectCompletionCheckResult {
  const validTasks = input.tasks.filter(isValidTask);
  const incompleteTasks = validTasks.filter((task) => !isTaskCompleted(task.status)).length;
  const overdueTasks = validTasks.filter((task) => getTaskPriority(task, input.today).level === "overdue").length;
  const validTaskIds = new Set(validTasks.map((task) => task.id));
  const overdueNoteChecks = input.taskNotes.filter((note) => validTaskIds.has(note.task_id) && getTaskNoteCheckDateStatus(note.check_date, input.today) === "overdue").length;
  const unallocated = summarizeUnallocatedUsageRequests(input.materialRequests);
  const incompleteShipments = input.shipments.filter((shipment) => isIncompleteShipment(shipment.status)).length;
  const requiredCode = REQUIRED_PROCESS_RULES[0]?.processTypeCode ?? "본납-도어";
  const finalDeliveryDoorRegistered = input.projectSections.some((section) => section.process_type === requiredCode);
  const hasWarnings = incompleteTasks > 0 || overdueTasks > 0 || overdueNoteChecks > 0 || unallocated.count > 0 || incompleteShipments > 0 || !finalDeliveryDoorRegistered;
  const href = `/projects/${input.projectId}`;
  return { projectId: input.projectId, projectName: input.projectName, canComplete: true, hasWarnings, checkedAt: input.checkedAt, checks: {
    incompleteTasks: { state: state(incompleteTasks > 0), count: incompleteTasks, href: `${href}#project-tasks` },
    overdueTasks: { state: state(overdueTasks > 0), count: overdueTasks, href: `${href}#project-tasks` },
    overdueNoteChecks: { state: state(overdueNoteChecks > 0), count: overdueNoteChecks, href: `${href}#project-tasks` },
    unallocatedMaterial: { state: state(unallocated.count > 0), ...unallocated, href: `${href}#material-allocations` },
    incompleteShipments: { state: state(incompleteShipments > 0), count: incompleteShipments, href: `${href}#project-tasks` },
    requiredProcesses: { state: state(!finalDeliveryDoorRegistered), finalDeliveryDoorRegistered, href: `${href}#project-tasks` },
  } };
}

export function getProjectCompletionSummary(result: ProjectCompletionCheckResult) { return { incompleteTasks: result.checks.incompleteTasks.count, overdueTasks: result.checks.overdueTasks.count, overdueNoteChecks: result.checks.overdueNoteChecks.count, unallocatedRequestCount: result.checks.unallocatedMaterial.count, unallocatedTons: result.checks.unallocatedMaterial.totalTons, incompleteShipments: result.checks.incompleteShipments.count, finalDeliveryDoorRegistered: result.checks.requiredProcesses.finalDeliveryDoorRegistered }; }
export function getProjectCompletionFingerprint(result: ProjectCompletionCheckResult) { return JSON.stringify(getProjectCompletionSummary(result)); }
export function decideProjectCompletion(result: ProjectCompletionCheckResult, acknowledged: boolean, expectedFingerprint: string | null) {
  if (expectedFingerprint !== getProjectCompletionFingerprint(result)) return "changed" as const;
  if (result.hasWarnings && !acknowledged) return "acknowledgement_required" as const;
  return "complete" as const;
}
