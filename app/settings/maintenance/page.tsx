"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { useAppShellUser } from "@/contexts/AppShellUserContext";
import { canManageMaintenanceMode, getDefaultMaintenanceModeSetting, getMaintenanceModeSetting, MAINTENANCE_MODE_UPDATED_EVENT, updateMaintenanceModeSetting, type MaintenanceModeSetting } from "@/lib/maintenance-mode";
import { supabase } from "@/lib/supabase";
import { toast } from "@/lib/toast";
import { withShortEditingLock } from "@/lib/editing-locks";

export default function MaintenanceSettingsPage() {
  const { employee, authUserId } = useAppShellUser();
  const [setting, setSetting] = useState<MaintenanceModeSetting>(getDefaultMaintenanceModeSetting);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingEnabled, setPendingEnabled] = useState<boolean | null>(null);
  const canManage = canManageMaintenanceMode(employee);

  const loadSetting = useCallback(async () => {
    setIsLoading(true);
    const next = await getMaintenanceModeSetting(supabase);
    setSetting(next);
    setMessage(next.message);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadSetting(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadSetting]);

  async function save(enabled = setting.enabled) {
    if (!canManage || !employee || !authUserId || isSaving) return;
    setIsSaving(true);
    try {
      const next = await withShortEditingLock("setting", "maintenance-mode", () => updateMaintenanceModeSetting(supabase, {
        enabled,
        message,
        authUserId,
        updatedByName: employee.name,
      }));
      setSetting(next);
      setMessage(next.message);
      window.dispatchEvent(new CustomEvent(MAINTENANCE_MODE_UPDATED_EVENT, { detail: next }));
      toast.success(enabled ? "시스템 점검모드가 활성화되었습니다." : "시스템 점검모드가 해제되었습니다.");
      setPendingEnabled(null);
    } catch (error) {
      console.error("maintenance mode setting update error:", error);
      toast.error(error instanceof Error ? error.message : "점검모드를 저장하지 못했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  if (!canManage) {
    return <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"><h2 className="text-lg font-bold text-slate-900">관리자 전용 설정입니다.</h2><p className="mt-2 text-sm text-slate-500">시스템 점검모드는 admin만 변경할 수 있습니다.</p></section>;
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><ShieldAlert size={20} /></div><div><h2 className="text-xl font-bold text-slate-950">시스템 점검모드</h2><p className="mt-1 text-sm text-slate-500">점검 중에는 관리자만 ERP에 접근할 수 있습니다.</p></div></div>
        <span className={`w-fit rounded-full px-3 py-1.5 text-xs font-semibold ${setting.enabled ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{setting.enabled ? "점검 중" : "운영 중"}</span>
      </div>
      {isLoading ? <p className="py-12 text-center text-sm text-slate-400">설정을 불러오고 있습니다.</p> : <div className="mt-6 space-y-5">
        <label className="block text-sm font-semibold text-slate-700">안내 메시지<textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={4} maxLength={500} className="mt-2 w-full resize-none rounded-xl border border-slate-200 p-3 text-sm font-normal outline-none focus:border-blue-400" /></label>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5"><p className="text-xs text-slate-400">최종 변경: {setting.updated_at ? new Date(setting.updated_at).toLocaleString("ko-KR") : "-"} {setting.updated_by_name ? `· ${setting.updated_by_name}` : ""}</p><div className="flex gap-2"><Button variant="outline" disabled={isSaving || message.trim() === setting.message} onClick={() => void save()}>메시지 저장</Button><Button variant={setting.enabled ? "secondary" : "danger"} disabled={isSaving} onClick={() => setPendingEnabled(!setting.enabled)}>{setting.enabled ? "점검모드 해제" : "점검모드 활성화"}</Button></div></div>
      </div>}
      <ConfirmDialog open={pendingEnabled !== null} title={pendingEnabled ? "점검모드를 활성화할까요?" : "점검모드를 해제할까요?"} description={pendingEnabled ? "점검모드를 활성화하면 일반 사용자는 ERP에 접근할 수 없습니다.\n계속하시겠습니까?" : "일반 사용자의 ERP 접근이 다시 허용됩니다."} confirmLabel={pendingEnabled ? "활성화" : "해제"} danger={pendingEnabled === true} isPending={isSaving} onClose={() => setPendingEnabled(null)} onConfirm={() => { if (pendingEnabled !== null) void save(pendingEnabled); }} />
    </section>
  );
}
