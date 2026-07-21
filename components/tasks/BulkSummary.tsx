export type BulkSelectionSummary = {
  projectCount: number;
  assigneeCount: number;
  dueTodayCount: number;
  overdueCount: number;
};

export function BulkSummary({
  selectedCount,
  summary,
}: {
  selectedCount: number;
  summary: BulkSelectionSummary;
}) {
  const items = [
    `${selectedCount}개 선택`,
    `프로젝트 ${summary.projectCount}`,
    `담당자 ${summary.assigneeCount}`,
    `오늘 마감 ${summary.dueTodayCount}`,
    `지연 ${summary.overdueCount}`,
  ];

  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="선택 업무 요약">
      {items.map((item, index) => (
        <span
          key={item}
          className={
            index === 0
              ? "rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700"
              : "rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600"
          }
        >
          {item}
        </span>
      ))}
    </div>
  );
}
