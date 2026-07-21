import type { ReactNode } from "react";

type EmptyStateProps = {
  title?: string;
  message?: string;
  className?: string;
  icon?: ReactNode;
  action?: ReactNode;
};

export function EmptyState({
  title,
  message,
  icon,
  action,
  className = "rounded-2xl bg-slate-50 p-8 text-center text-slate-500",
}: EmptyStateProps) {
  return (
    <div className={className}>
      {icon && <div className="mb-3 flex justify-center text-slate-400">{icon}</div>}
      <p className="font-semibold text-slate-700">
        {title || "데이터가 없습니다."}
      </p>
      {message && <p className="mt-1 text-sm text-slate-500">{message}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
