"use client";

import { Button } from "@/components/ui/Button";
import type { BulkFailure } from "@/lib/bulk-utils";

export type BulkResult = {
  successCount: number;
  failures: BulkFailure[];
};

export function BulkResultDialog({
  result,
  onClose,
}: {
  result: BulkResult | null;
  onClose: () => void;
}) {
  if (!result) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/40 p-4">
      <section role="dialog" aria-modal="true" aria-label="일괄 작업 결과" className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-slate-950">일괄 작업 결과</h2>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-emerald-50 p-4">
            <p className="text-xs text-emerald-600">성공</p>
            <p className="mt-1 text-2xl font-bold text-emerald-700">{result.successCount}건</p>
          </div>
          <div className="rounded-xl bg-red-50 p-4">
            <p className="text-xs text-red-600">실패</p>
            <p className="mt-1 text-2xl font-bold text-red-700">{result.failures.length}건</p>
          </div>
        </div>
        {result.failures.length > 0 && (
          <details className="mt-4 rounded-xl border border-red-100">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-red-700">
              실패 목록 보기
            </summary>
            <div className="divide-y divide-red-50 border-t border-red-100">
              {result.failures.map((failure) => (
                <div key={failure.taskId} className="px-4 py-3">
                  <p className="text-sm font-medium text-slate-800">{failure.taskName}</p>
                  <p className="mt-1 text-xs text-red-600">{failure.reason}</p>
                </div>
              ))}
            </div>
          </details>
        )}
        <div className="mt-6 flex justify-end">
          <Button variant="primary" onClick={onClose}>확인</Button>
        </div>
      </section>
    </div>
  );
}
