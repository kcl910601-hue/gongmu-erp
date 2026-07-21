export const GLOBAL_SEARCH_MIN_LENGTH = 2;
export const GLOBAL_SEARCH_MAX_LENGTH = 100;
export const GLOBAL_SEARCH_RESULT_LIMIT = 5;
export const RECENT_SEARCH_STORAGE_KEY = "gongmu-global-recent-searches";

export function normalizeSearchQuery(value: string) {
  return value.trim().slice(0, GLOBAL_SEARCH_MAX_LENGTH);
}

export function sanitizePostgrestSearchValue(value: string) {
  return value.replace(/[,%().*_'":\\]/g, " ").replace(/\s+/g, " ").trim();
}

export function createIlikeFilter(value: string, columns: string[]) {
  return columns.map((column) => `${column}.ilike.%${value}%`).join(",");
}
