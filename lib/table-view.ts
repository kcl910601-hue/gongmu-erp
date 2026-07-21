export type SortDirection = "asc" | "desc";

export function sortRows<T>(
  rows: T[],
  getValue: (row: T) => string | number | null | undefined,
  direction: SortDirection
) {
  return [...rows].sort((left, right) => {
    const leftValue = getValue(left) ?? "";
    const rightValue = getValue(right) ?? "";
    const result =
      typeof leftValue === "number" && typeof rightValue === "number"
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue), "ko-KR", {
            numeric: true,
          });

    return direction === "asc" ? result : -result;
  });
}

export function paginateRows<T>(rows: T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;

  return {
    rows: rows.slice(start, start + pageSize),
    page: safePage,
    totalPages,
  };
}
