"use client";

import { useCallback, useEffect, useState } from "react";
import { EmployeeForm, type EmployeeFormValue } from "@/components/employees/EmployeeForm";
import { saveEmployee } from "@/lib/employees";
import { normalizeRole } from "@/lib/permissions";
import { toast } from "@/lib/toast";
import type { Employee, EmployeeAccountInfo, EmployeeOrganizationOption } from "@/types/employee";

function getInitialForm(employee: Employee | null): EmployeeFormValue {
  return {
    name: employee?.name ?? "",
    email: employee?.email ?? "",
    phone: employee?.phone ?? "",
    organization_id: employee?.organization_id ? String(employee.organization_id) : "",
    position: employee?.position ?? "",
    role: normalizeRole(employee?.role),
    active: employee?.active ?? true,
    memo: employee?.memo ?? "",
  };
}

export function EmployeeDialog({ mode, employee, organizations, accountInfo, onAuthLink, onClose, onSaved }: {
  mode: "create" | "edit";
  employee: Employee | null;
  organizations: EmployeeOrganizationOption[];
  accountInfo: EmployeeAccountInfo | null;
  onAuthLink: (employee: Employee) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [initialForm] = useState<EmployeeFormValue>(() => getInitialForm(employee));
  const [form, setForm] = useState<EmployeeFormValue>(initialForm);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);

  const requestClose = useCallback(() => {
    if (isSaving) return;
    if (isDirty && !window.confirm("작성 중인 내용이 있습니다.\n닫으시겠습니까?")) return;
    onClose();
  }, [isDirty, isSaving, onClose]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") requestClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [requestClose]);

  async function handleSave() {
    setErrorMessage("");
    if (!form.name.trim()) return setErrorMessage("이름을 입력해주세요.");
    const organization = organizations.find((item) => item.id === Number(form.organization_id));
    if (!organization) return setErrorMessage("조직을 선택해주세요.");
    setIsSaving(true);
    const result = await saveEmployee({
      id: mode === "edit" ? employee?.id : undefined,
      name: form.name,
      email: form.email,
      phone: form.phone,
      organizationId: organization.id,
      position: form.position,
      role: form.role,
      active: form.active,
      memo: form.memo,
    });
    setIsSaving(false);
    if (result.error) return setErrorMessage(result.error);
    toast.success(mode === "create" ? "직원이 추가되었습니다." : "직원 정보가 수정되었습니다.");
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="employee-dialog-title" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
      <div className="max-h-[92vh] w-full max-w-[700px] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <h2 id="employee-dialog-title" className="text-xl font-semibold text-slate-900">{mode === "create" ? "신규 직원 등록" : "직원 정보 수정"}</h2>
        <div className="mt-5"><EmployeeForm value={form} organizations={organizations} disabled={isSaving} onChange={setForm} /></div>
        {mode === "edit" && employee && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <h3 className="font-semibold text-slate-800">계정정보</h3>
            <div className="mt-2 grid gap-2 sm:grid-cols-2"><span>상태: {employee.auth_user_id ? "연결" : "미연결"}</span><span>가입 이메일: {accountInfo?.email ?? employee.email ?? "-"}</span><span>가입일: {accountInfo?.createdAt ? new Date(accountInfo.createdAt).toLocaleDateString("ko-KR") : "-"}</span><span>마지막 로그인: {accountInfo?.lastSignInAt ? new Date(accountInfo.lastSignInAt).toLocaleString("ko-KR") : "-"}</span></div>
            {!employee.auth_user_id && <button type="button" onClick={() => onAuthLink(employee)} className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-white">Auth 연결</button>}
          </div>
        )}
        {errorMessage && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{errorMessage}</p>}
        <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={requestClose} disabled={isSaving} className="rounded-xl border border-slate-300 px-4 py-2 text-sm">취소</button><button type="button" onClick={() => void handleSave()} disabled={isSaving} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-400">{isSaving ? "저장 중..." : mode === "create" ? "등록" : "저장"}</button></div>
      </div>
    </div>
  );
}
