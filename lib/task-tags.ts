export const TASK_TAGS = [
  { code: "important", label: "중요", icon: "⭐", colorClassName: "bg-amber-100 text-amber-800 ring-amber-200" },
  { code: "meeting", label: "회의", icon: "📌", colorClassName: "bg-blue-100 text-blue-800 ring-blue-200" },
  { code: "delay_risk", label: "지연위험", icon: "⚠", colorClassName: "bg-red-100 text-red-800 ring-red-200" },
  { code: "shipment_pending", label: "출고대기", icon: "🚚", colorClassName: "bg-orange-100 text-orange-800 ring-orange-200" },
  { code: "settlement_pending", label: "정산대기", icon: "💰", colorClassName: "bg-emerald-100 text-emerald-800 ring-emerald-200" },
  { code: "site_check", label: "현장확인", icon: "🏗", colorClassName: "bg-violet-100 text-violet-800 ring-violet-200" },
  { code: "customer_request", label: "고객요청", icon: "📞", colorClassName: "bg-teal-100 text-teal-800 ring-teal-200" },
] as const;

export type TaskTagCode = (typeof TASK_TAGS)[number]["code"];

export function getTaskTagDefinition(code: string) {
  return TASK_TAGS.find((tag) => tag.code === code);
}
