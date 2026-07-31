"use client";

import { LogOut, RefreshCw, Wrench } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { supabase } from "@/lib/supabase";
import type { CurrentEmployee } from "@/lib/auth";
import type { MaintenanceModeSetting } from "@/lib/maintenance-mode";

export function MaintenanceScreen({ employee, setting }: { employee: CurrentEmployee; setting: MaintenanceModeSetting }) {
  const router = useRouter();

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <section className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><Wrench size={28} /></div>
        <p className="mt-5 text-sm font-medium text-slate-500">{employee.name}님</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-950">시스템 점검 중</h1>
        <p className="mt-4 text-sm leading-6 text-slate-600">관리자가 시스템 업데이트 작업을 진행하고 있습니다.<br />잠시 후 다시 접속해 주세요.</p>
        <div className="mt-6 rounded-2xl bg-slate-50 p-5 text-left">
          <p className="text-xs font-semibold text-slate-400">관리자 안내</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{setting.message}</p>
        </div>
        <div className="mt-7 flex justify-center gap-2">
          <Button variant="outline" onClick={() => window.location.reload()}><RefreshCw size={15} className="mr-1.5" />새로고침</Button>
          <Button variant="primary" onClick={() => void logout()}><LogOut size={15} className="mr-1.5" />로그아웃</Button>
        </div>
      </section>
    </main>
  );
}
