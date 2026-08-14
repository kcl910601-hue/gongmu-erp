import { getDday } from "./dday.ts";
import { normalizeProjectStatus } from "./status.ts";
import type { EngineNotification } from "./notifications/types.ts";

export type RequiredProcessRule = {
  id: string;
  processTypeCode: string;
  monthsBeforeEnd: number;
  label: string;
};

export type RequiredProcessProject = {
  id: number;
  project_name: string;
  status: string | null;
  end_date: string | null;
};

export type RequiredProjectProcess = {
  project_id: number;
  process_type: string;
};

export const REQUIRED_PROCESS_RULES: readonly RequiredProcessRule[] = [
  { id: "final_delivery_door", processTypeCode: "본납-도어", monthsBeforeEnd: 4, label: "본납-도어" },
];

function parseDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return month >= 1 && month <= 12 && day >= 1 && day <= lastDay ? { year, month, day } : null;
}

export function subtractCalendarMonths(value: string, months: number) {
  const parsed = parseDateOnly(value);
  if (!parsed || !Number.isInteger(months) || months < 0) return null;
  const monthIndex = parsed.year * 12 + parsed.month - 1 - months;
  const year = Math.floor(monthIndex / 12);
  const month = monthIndex - year * 12 + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(parsed.day, lastDay);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isEligibleProject(status: string | null) {
  const normalized = normalizeProjectStatus(status);
  return normalized === "pending" || normalized === "in_progress";
}

export function evaluateRequiredProcessAlerts(
  projects: RequiredProcessProject[],
  projectProcesses: RequiredProjectProcess[],
  today: string,
  rules: readonly RequiredProcessRule[] = REQUIRED_PROCESS_RULES
): EngineNotification[] {
  const registeredProcessKeys = new Set(
    projectProcesses.flatMap((process) => rules.filter((rule) => process.process_type === rule.processTypeCode).map((rule) => `${process.project_id}:${rule.id}`))
  );

  return projects.flatMap((project) => {
    if (!project.end_date || !isEligibleProject(project.status)) return [];
    return rules.flatMap((rule) => {
      const alertDate = subtractCalendarMonths(project.end_date as string, rule.monthsBeforeEnd);
      if (!alertDate || today < alertDate || registeredProcessKeys.has(`${project.id}:${rule.id}`)) return [];
      const dday = getDday(project.end_date as string, today);
      return [{
        id: `required_process_missing:${project.id}:${rule.id}`,
        type: "required_process_missing" as const,
        category: "project" as const,
        priority: "medium" as const,
        title: "⚠ 필수 공정 미등록",
        description: `${rule.label} 공정이 아직 등록되지 않았습니다.\n종료일 ${project.end_date} · ${dday?.label ?? "-"}\n알림 기준: 종료 ${rule.monthsBeforeEnd}개월 전`,
        date: alertDate,
        action: { label: "프로젝트 보기", href: `/projects/${project.id}` },
        projectName: project.project_name,
        statusLabel: "미해결",
        isPersistent: true,
      }];
    });
  });
}
