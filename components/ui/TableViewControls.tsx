import type { SortDirection } from "@/lib/table-view";

type SortOption = {
  value: string;
  label: string;
};

type TableViewControlsProps = {
  sortKey: string;
  sortDirection: SortDirection;
  sortOptions: SortOption[];
  pageSize: number;
  page: number;
  totalPages: number;
  totalItems: number;
  onSortKeyChange: (value: string) => void;
  onSortDirectionChange: (value: SortDirection) => void;
  onPageSizeChange: (value: number) => void;
  onPageChange: (value: number) => void;
};

export function TableViewControls({
  sortKey,
  sortDirection,
  sortOptions,
  pageSize,
  page,
  totalPages,
  totalItems,
  onSortKeyChange,
  onSortDirectionChange,
  onPageSizeChange,
  onPageChange,
}: TableViewControlsProps) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
      <div className="flex flex-wrap items-center gap-2">
        <span>{totalItems}건</span>
        <select
          value={sortKey}
          onChange={(event) => onSortKeyChange(event.target.value)}
          aria-label="정렬 컬럼"
          className="h-8 rounded-lg border border-slate-200 bg-white px-2 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          value={sortDirection}
          onChange={(event) =>
            onSortDirectionChange(event.target.value as SortDirection)
          }
          aria-label="정렬 방향"
          className="h-8 rounded-lg border border-slate-200 bg-white px-2 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        >
          <option value="asc">오름차순</option>
          <option value="desc">내림차순</option>
        </select>
        <select
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          aria-label="페이지 크기"
          className="h-8 rounded-lg border border-slate-200 bg-white px-2 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        >
          {[20, 50, 100].map((size) => (
            <option key={size} value={size}>
              {size}개
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="rounded-lg border border-slate-200 px-2.5 py-1.5 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          이전
        </button>
        <span className="min-w-16 text-center">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="rounded-lg border border-slate-200 px-2.5 py-1.5 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          다음
        </button>
      </div>
    </div>
  );
}
