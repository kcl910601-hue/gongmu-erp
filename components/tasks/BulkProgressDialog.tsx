export function BulkProgressDialog({
  open,
  completed,
  total,
}: {
  open: boolean;
  completed: number;
  total: number;
}) {
  if (!open || total === 0) return null;
  const progress = Math.round((completed / total) * 100);

  return (
    <div className="fixed inset-0 z-[115] flex items-center justify-center bg-slate-950/40 p-4">
      <section role="dialog" aria-modal="true" aria-label="일괄 작업 진행 중" className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-slate-950">{total}건 처리 중</h2>
        <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-blue-600 transition-all duration-200" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-3 text-right text-sm font-medium text-slate-600">
          {completed} / {total}
        </p>
      </section>
    </div>
  );
}
