type EmptyStateProps = {
  title?: string;
  message?: string;
  className?: string;
};

export function EmptyState({
  title,
  message,
  className = "rounded-2xl bg-slate-50 p-8 text-center text-slate-500",
}: EmptyStateProps) {
  return <div className={className}>{title || message || "없음"}</div>;
}
