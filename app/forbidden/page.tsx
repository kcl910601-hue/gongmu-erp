import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold text-red-600">403</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">권한이 없습니다.</h1>
        <p className="mt-2 text-sm text-slate-500">이 화면에 접근할 권한이 없습니다. 관리자에게 문의해주세요.</p>
        <Link href="/dashboard" className="mt-6 inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">대시보드로 이동</Link>
      </div>
    </div>
  );
}
