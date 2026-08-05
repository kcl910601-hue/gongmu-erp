export const DASHBOARD_CARD_IDS = [
  "today_tasks",
  "workspace",
  "kpi",
  "shipments",
  "progress",
  "recent_projects",
  "recent_activity",
] as const;

export type DashboardCardId = (typeof DASHBOARD_CARD_IDS)[number];
export type DashboardCardSize = "small" | "medium" | "large";
export type DashboardCardPreference = {
  cardId: DashboardCardId;
  order: number;
  size: DashboardCardSize;
  hidden: boolean;
  collapsed: boolean;
};

const defaultSizes: Record<DashboardCardId, DashboardCardSize> = {
  today_tasks: "large",
  workspace: "large",
  kpi: "large",
  shipments: "large",
  progress: "large",
  recent_projects: "large",
  recent_activity: "medium",
};

export function getDefaultDashboardPreferences(): DashboardCardPreference[] {
  return DASHBOARD_CARD_IDS.map((cardId, order) => ({ cardId, order, size: defaultSizes[cardId], hidden: false, collapsed: false }));
}

export function normalizeDashboardPreferences(value: unknown): DashboardCardPreference[] {
  const defaults = getDefaultDashboardPreferences();
  if (!Array.isArray(value)) return defaults;
  const validSizes = new Set<DashboardCardSize>(["small", "medium", "large"]);
  const parsed = new Map<DashboardCardId, DashboardCardPreference>();
  value.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") return;
    const raw = entry as Record<string, unknown>;
    if (!DASHBOARD_CARD_IDS.includes(raw.cardId as DashboardCardId) || parsed.has(raw.cardId as DashboardCardId)) return;
    const cardId = raw.cardId as DashboardCardId;
    parsed.set(cardId, {
      cardId,
      order: Number.isSafeInteger(raw.order) && Number(raw.order) >= 0 ? Number(raw.order) : index,
      size: validSizes.has(raw.size as DashboardCardSize) ? raw.size as DashboardCardSize : defaultSizes[cardId],
      hidden: raw.hidden === true,
      collapsed: raw.collapsed === true,
    });
  });
  const merged = defaults.map((fallback) => parsed.get(fallback.cardId) ?? fallback);
  return merged.sort((left, right) => left.order - right.order).map((entry, order) => ({ ...entry, order }));
}

export function moveDashboardCard(cards: DashboardCardPreference[], sourceId: DashboardCardId, targetId: DashboardCardId) {
  const ordered = [...cards].sort((left, right) => left.order - right.order);
  const sourceIndex = ordered.findIndex((card) => card.cardId === sourceId);
  const targetIndex = ordered.findIndex((card) => card.cardId === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return ordered;
  const [source] = ordered.splice(sourceIndex, 1);
  ordered.splice(targetIndex, 0, source);
  return ordered.map((card, order) => ({ ...card, order }));
}
