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

export function splitSearchHighlight(value: string, query: string) {
  const keyword = query.trim();
  if (!keyword) return [{ text: value, match: false }];
  const lowerValue = value.toLocaleLowerCase("ko-KR");
  const lowerKeyword = keyword.toLocaleLowerCase("ko-KR");
  const parts: { text: string; match: boolean }[] = [];
  let cursor = 0;
  while (cursor < value.length) {
    const index = lowerValue.indexOf(lowerKeyword, cursor);
    if (index < 0) {
      parts.push({ text: value.slice(cursor), match: false });
      break;
    }
    if (index > cursor) parts.push({ text: value.slice(cursor, index), match: false });
    parts.push({ text: value.slice(index, index + keyword.length), match: true });
    cursor = index + keyword.length;
  }
  return parts.length > 0 ? parts : [{ text: value, match: false }];
}
