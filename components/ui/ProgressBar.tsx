type ProgressBarProps = {
  percent: number;
  className?: string;
  barClassName?: string;
};

export function ProgressBar({
  percent,
  className = "h-2 w-full",
  barClassName = "h-2",
}: ProgressBarProps) {
  const safePercent = Math.min(100, Math.max(0, percent));

  return (
    <div className={`${className} rounded-full bg-slate-200`}>
      <div
        className={`${barClassName} rounded-full bg-blue-600`}
        style={{ width: `${safePercent}%` }}
      />
    </div>
  );
}
