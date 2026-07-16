export function normalizeProjectStatus(status: string | null) {
  if (status === "pending" || status === "대기") return "pending";
  if (status === "in_progress" || status === "진행중") return "in_progress";
  if (status === "hold" || status === "보류") return "hold";
  if (status === "completed" || status === "완료") return "completed";

  return status;
}

export function getProjectStatusLabel(status: string | null) {
  const statusValue = normalizeProjectStatus(status);

  if (statusValue === "pending") return "대기";
  if (statusValue === "in_progress") return "진행중";
  if (statusValue === "hold") return "보류";
  if (statusValue === "completed") return "완료";

  return status || "미정";
}

export function isProjectCompleted(status: string | null) {
  return normalizeProjectStatus(status) === "completed";
}

export function isProjectInProgress(status: string | null) {
  return normalizeProjectStatus(status) === "in_progress";
}

export function normalizeTaskStatus(status: string | null) {
  if (status === "pending" || status === "대기") return "pending";
  if (status === "in_progress" || status === "진행중") return "in_progress";
  if (status === "completed" || status === "완료") return "completed";

  return status;
}

export function getTaskStatusLabel(status: string | null) {
  const statusValue = normalizeTaskStatus(status);

  if (statusValue === "pending") return "대기";
  if (statusValue === "in_progress") return "진행중";
  if (statusValue === "completed") return "완료";

  return status || "미정";
}

export function isTaskCompleted(status: string | null) {
  return normalizeTaskStatus(status) === "completed";
}

export function isTaskInProgress(status: string | null) {
  return normalizeTaskStatus(status) === "in_progress";
}

export function isTaskPending(status: string | null) {
  return normalizeTaskStatus(status) === "pending";
}
