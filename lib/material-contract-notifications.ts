import type { EngineNotification, NotificationPriority } from "./notifications/types.ts";

export type MaterialContractAlertKind = "available_ratio" | "expiry";
export type MaterialContractAlertStage = "20" | "10" | "5" | "30d" | "7d" | "today" | "expired";
export type MaterialContractNotificationEvent = { notification_id: string; contract_id: string; contract_name: string; alert_kind: MaterialContractAlertKind; stage: MaterialContractAlertStage; available_tons: number | null; available_ratio: number | null; effective_end_date: string; created_at: string };

export function getAvailableRatioStage(ratio: number): "20" | "10" | "5" | null { if (ratio <= 0.05) return "5"; if (ratio <= 0.1) return "10"; if (ratio <= 0.2) return "20"; return null; }
export function getExpiryStage(daysRemaining: number): "30d" | "7d" | "today" | "expired" | null { if (daysRemaining < 0) return "expired"; if (daysRemaining === 0) return "today"; if (daysRemaining <= 7) return "7d"; if (daysRemaining <= 30) return "30d"; return null; }
const priorities: Record<MaterialContractAlertStage, NotificationPriority> = { "20": "medium", "10": "high", "5": "critical", "30d": "medium", "7d": "high", today: "critical", expired: "critical" };

export function mapMaterialContractEvent(event: MaterialContractNotificationEvent): EngineNotification {
  const isRatio = event.alert_kind === "available_ratio";
  const expiryLabel: Record<string, string> = { "30d": "30일 이내 종료", "7d": "7일 이내 종료", today: "오늘 종료", expired: "계약 만료" };
  return { id: event.notification_id, type: isRatio ? "raw_material_remaining" : "raw_material_contract_ending", category: "raw_material", priority: priorities[event.stage], title: isRatio ? `원자재 계약 가용량 ${event.stage}% 이하` : expiryLabel[event.stage], description: isRatio ? `${event.contract_name} · 가용 ${event.available_tons?.toFixed(2) ?? "-"} ton (${event.available_ratio === null ? "-" : `${(event.available_ratio * 100).toFixed(1)}%`})` : `${event.contract_name} · 종료일 ${event.effective_end_date}`, date: event.created_at, action: { label: "계약 보기", href: `/statistics/lme?tab=contracts&contract=${event.contract_id}` }, projectName: event.contract_name };
}
