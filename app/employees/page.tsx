"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import SignupRequests from "@/components/employees/SignupRequests";
import { EmployeeDialog } from "@/components/employees/EmployeeDialog";
import { getEmployeeOrganizations } from "@/lib/employee-master-data";
import { setEmployeeActive } from "@/lib/employees";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { toast } from "@/lib/toast";
import { normalizeRole, ROLE_PRESENTATION } from "@/lib/permissions";
import { getEmployeeActiveBadge, getEmployeeApprovalBadge } from "@/lib/employee-status";
import { usePermission } from "@/hooks/usePermission";
import type { Employee, EmployeeAccountInfo, EmployeeOrganizationOption } from "@/types/employee";

function AuthLinkDialog({ employee, organizationName, onClose, onSuccess }: {
  employee: Employee;
  organizationName: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [email, setEmail] = useState(employee.email ?? "");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit() {
    setIsSaving(true);
    try {
      const response = await fetch("/api/employees/auth-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: employee.id, email }),
      });
      const result = await response.json() as { error?: string; invited?: boolean };
      if (!response.ok) {
        toast.error(result.error ?? "Auth 연결을 처리하지 못했습니다.");
        return;
      }
      toast.success(result.invited ? "초대 메일을 발송하고 계정을 연결했습니다." : "기존 Auth 계정을 연결했습니다.");
      onSuccess();
    } catch (error) {
      console.error("employee auth link request error:", error);
      toast.error("네트워크 오류로 Auth 연결을 처리하지 못했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="auth-link-title">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 id="auth-link-title" className="text-lg font-semibold text-slate-900">Auth 연결</h2>
        <div className="mt-5 space-y-4">
          <label className="block text-sm font-medium text-slate-700">직원명<input value={employee.name} readOnly className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" /></label>
          <label className="block text-sm font-medium text-slate-700">조직<input value={organizationName} readOnly className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" /></label>
          <label className="block text-sm font-medium text-slate-700">이메일<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoFocus className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" /></label>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={isSaving} className="rounded-xl border border-slate-300 px-4 py-2 text-sm">취소</button>
          <button type="button" onClick={handleSubmit} disabled={isSaving} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-400">{isSaving ? "연결 중..." : "연결 또는 초대"}</button>
        </div>
      </div>
    </div>
  );
}

export function EmployeeManagement({ embedded = false }: { embedded?: boolean }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [organizations, setOrganizations] = useState<EmployeeOrganizationOption[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(
    null
  );
  const [authLinkEmployee, setAuthLinkEmployee] = useState<Employee | null>(null);
  const [accountInfo, setAccountInfo] = useState<EmployeeAccountInfo | null>(null);
  const [isEmployeeDialogOpen, setIsEmployeeDialogOpen] = useState(false);

  const [searchText, setSearchText] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [deletePlan, setDeletePlan] = useState<{ action: "delete" | "deactivate"; referenceCount: number } | null>(null);
  const [accountStatuses, setAccountStatuses] = useState<Record<string, "linked" | "unlinked" | "missing_auth">>({});
  const [isDeleting, setIsDeleting] = useState(false);
  const { can, role } = usePermission();
  const canCreateEmployee = can("manage_employees");
  const canEditEmployee = can("manage_employees");
  const canDeleteEmployee = role === "admin";

  const loadEmployees = useCallback(async function loadEmployees() {
    const [employeeResult, organizationResult] = await Promise.all([
      supabase
        .from("employees")
        .select("id, name, position, active, created_at, email, auth_user_id, role, approval_status, approved_at, approved_by, rejected_at, organization_id, phone, memo, updated_at")
        .order("created_at", { ascending: false }),
      getEmployeeOrganizations(),
    ]);

    if (employeeResult.error || organizationResult.error) {
      alert(employeeResult.error?.message || organizationResult.error || "직원 정보를 불러오지 못했습니다.");
      return;
    }

    setEmployees(employeeResult.data || []);
    setOrganizations(organizationResult.data);
    const statusResponse = await fetch("/api/employees/account-status", { cache: "no-store" });
    if (statusResponse.ok) {
      const statusResult = await statusResponse.json() as { statuses?: Record<string, "linked" | "unlinked" | "missing_auth"> };
      setAccountStatuses(statusResult.statuses ?? {});
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadEmployees();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadEmployees]);

  useEffect(() => {
    if (!selectedEmployee?.auth_user_id) {
      return;
    }
    let cancelled = false;
    void fetch(`/api/employees/auth-link?employeeId=${selectedEmployee.id}`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as { account?: EmployeeAccountInfo | null };
        if (!cancelled && response.ok) setAccountInfo(result.account ?? null);
      })
      .catch((error) => console.error("employee account info error:", error));
    return () => { cancelled = true; };
  }, [selectedEmployee]);

  const filteredEmployees = useMemo(() => {
    return employees.filter((employee) => {
      const keyword = searchText.toLowerCase();

      const matchesSearch =
        employee.name.toLowerCase().includes(keyword) ||
        (employee.email || "").toLowerCase().includes(keyword) ||
        (employee.phone || "").toLowerCase().includes(keyword) ||
        (organizations.find((organization) => organization.id === employee.organization_id)?.name || "")
          .toLowerCase()
          .includes(keyword);

      const matchesRole =
        roleFilter === "all" || employee.role === roleFilter;

      return matchesSearch && matchesRole;
    }).sort((left, right) => {
      if (left.active !== right.active) return left.active ? -1 : 1;
      return left.name.localeCompare(right.name, "ko-KR", { numeric: true, sensitivity: "base" });
    });
  }, [employees, organizations, searchText, roleFilter]);

  function openEditDialog(employee: Employee) {
    setAccountInfo(null);
    setSelectedEmployee(employee);
    setIsEmployeeDialogOpen(true);
  }

  async function toggleActive(employee: Employee) {
    if (employee.active && !window.confirm(`${employee.name} 직원을 비활성 처리하시겠습니까?`)) {
      return;
    }
    const { error } = await setEmployeeActive(employee.id, !employee.active);

    if (error) {
      alert(error);
      return;
    }

    loadEmployees();
  }

  async function prepareDelete(employee: Employee) {
    if (!canDeleteEmployee || isDeleting) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/employees/account-delete?employeeId=${employee.id}`, { cache: "no-store" });
      const result = await response.json() as { action?: "delete" | "deactivate"; referenceCount?: number; error?: string };
      if (!response.ok || !result.action) {
        toast.error(result.error ?? "삭제 영향을 확인하지 못했습니다.");
        return;
      }
      setDeleteTarget(employee);
      setDeletePlan({ action: result.action, referenceCount: result.referenceCount ?? 0 });
    } catch (error) {
      console.error("employee delete inspection error:", error);
      toast.error("삭제하지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setIsDeleting(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || !deletePlan || isDeleting) return;
    const target = deleteTarget;
    setIsDeleting(true);
    try {
      if (deletePlan.action === "delete") {
        const response = await fetch(`/api/employees/account-delete?employeeId=${target.id}`, { method: "DELETE" });
        const result = await response.json() as { error?: string };
        if (!response.ok) {
          toast.error(result.error ?? "직원 계정을 삭제하지 못했습니다.");
          return;
        }
        setEmployees((current) => current.filter((employee) => employee.id !== target.id));
        toast.success(`"${target.name}" 직원과 Auth 계정을 삭제했습니다.`);
      } else {
        const result = await setEmployeeActive(target.id, false);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        setEmployees((current) => current.map((employee) => employee.id === target.id ? { ...employee, active: false } : employee));
        toast.success(`"${target.name}"은 관련 기록이 있어 비활성화했습니다.`);
      }
      setDeleteTarget(null);
      setDeletePlan(null);
    } catch (error) {
      console.error("employee delete error:", error);
      toast.error("삭제하지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <main className={embedded ? "space-y-5" : "space-y-5 p-6"}>
      <div className={`items-center justify-between ${embedded ? "flex justify-end" : "flex"}`}>
        {!embedded && (
        <div>
          <h1 className="text-xl font-bold text-slate-900">직원관리</h1>
          <p className="mt-1 text-sm text-slate-500">
            직원 정보, 권한, 활성 상태를 관리합니다.
          </p>
        </div>
        )}

      </div>

      <SignupRequests />

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">직원 관리</h2>
        <div className="mb-3 mt-3 flex flex-col gap-2.5 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-1 gap-2">
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="이름, 이메일, 연락처, 조직 검색"
              className="w-full max-w-md rounded-xl border border-slate-300 px-4 py-2 text-sm"
            />

            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm"
            >
              <option value="all">전체 권한</option>
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="staff">Staff</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          {canCreateEmployee && <button
            type="button"
            onClick={() => {
              setSelectedEmployee(null);
              setAccountInfo(null);
              setIsEmployeeDialogOpen(true);
            }}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
          >+ 신규 직원</button>}
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="px-3 py-2">이름</th>
                <th className="px-3 py-2">조직</th>
                <th className="px-3 py-2">직급</th>
                <th className="px-3 py-2">권한</th>
                <th className="px-3 py-2">연락처</th>
                <th className="px-3 py-2">상태</th>
                <th className="px-3 py-2">승인</th>
                {canDeleteEmployee && <th className="px-3 py-2 text-right">관리</th>}
              </tr>
            </thead>

            <tbody>
              {filteredEmployees.map((employee) => (
                <tr
                  key={employee.id}
                  className="border-t border-slate-200 hover:bg-slate-50"
                >
                  <td className="px-3 py-2 font-medium">
                    {canEditEmployee ? (
                      <button type="button" onClick={() => openEditDialog(employee)} className="text-blue-600 hover:underline">{employee.name}</button>
                    ) : employee.name}
                  </td>
                  <td className="px-3 py-2">
                    {organizations.find((organization) => organization.id === employee.organization_id)?.name || "-"}
                  </td>
                  <td className="px-3 py-2">{employee.position || "-"}</td>
                  <td className="px-3 py-2">
                    <Badge variant={ROLE_PRESENTATION[normalizeRole(employee.role)].badge}>
                      {ROLE_PRESENTATION[normalizeRole(employee.role)].label}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">{employee.phone || "-"}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={employee.active}
                      disabled={!canEditEmployee}
                      onClick={() => void toggleActive(employee)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:cursor-default ${employee.active ? "bg-emerald-500" : "bg-slate-300"}`}
                    >
                      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${employee.active ? "translate-x-6" : "translate-x-1"}`} />
                      <span className="sr-only">{employee.active ? "활성" : "비활성"}</span>
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant={accountStatuses[employee.id] === "linked" ? "success" : "warning"}>
                        {accountStatuses[employee.id] === "linked" ? "Auth 연결됨" : "Auth 미연결"}
                      </Badge>
                      <Badge variant={getEmployeeActiveBadge(employee.active).variant}>{getEmployeeActiveBadge(employee.active).label}</Badge>
                      <Badge variant={getEmployeeApprovalBadge(employee.approval_status).variant}>{getEmployeeApprovalBadge(employee.approval_status).label}</Badge>
                    </div>
                  </td>
                  {canDeleteEmployee && (
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        title="직원 삭제"
                        aria-label={`${employee.name} 삭제`}
                        disabled={isDeleting}
                        onClick={() => void prepareDelete(employee)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}

              {filteredEmployees.length === 0 && (
                <tr>
                  <td
                    colSpan={canDeleteEmployee ? 8 : 7}
                    className="px-4 py-10 text-center text-slate-400"
                  >
                    표시할 직원이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      {isEmployeeDialogOpen && (
        <EmployeeDialog
          key={selectedEmployee?.id ?? "create"}
          mode={selectedEmployee ? "edit" : "create"}
          employee={selectedEmployee}
          organizations={organizations}
          accountInfo={accountInfo}
          onAuthLink={(employee) => {
            setIsEmployeeDialogOpen(false);
            setAuthLinkEmployee(employee);
          }}
          onClose={() => setIsEmployeeDialogOpen(false)}
          onSaved={() => {
            setIsEmployeeDialogOpen(false);
            setSelectedEmployee(null);
            setAccountInfo(null);
            void loadEmployees();
          }}
        />
      )}
      {authLinkEmployee && (
        <AuthLinkDialog
          employee={authLinkEmployee}
          organizationName={organizations.find((organization) => organization.id === authLinkEmployee.organization_id)?.name || "-"}
          onClose={() => setAuthLinkEmployee(null)}
          onSuccess={() => {
            setAuthLinkEmployee(null);
            void loadEmployees();
          }}
        />
      )}
      <ConfirmDialog
        open={deleteTarget !== null && deletePlan !== null}
        title={deletePlan?.action === "deactivate" ? "직원 비활성화" : "직원 계정 완전 삭제"}
        description={deletePlan?.action === "deactivate"
          ? `"${deleteTarget?.name || "직원"}" 직원은 기존 업무 또는 기록에 사용 중입니다.\n완전 삭제할 수 없어 비활성화 처리됩니다.\n과거 업무와 활동 기록은 유지됩니다.`
          : `"${deleteTarget?.name || "직원"}" 직원과 연결된 Supabase Auth 계정을 완전히 삭제하시겠습니까?\n삭제 후에는 복구할 수 없습니다.`}
        confirmLabel={deletePlan?.action === "deactivate" ? "비활성화" : "완전 삭제"}
        danger
        isPending={isDeleting}
        onConfirm={() => void confirmDelete()}
        onClose={() => {
          if (isDeleting) return;
          setDeleteTarget(null);
          setDeletePlan(null);
        }}
      />
    </main>
  );
}

export default function EmployeesPage() {
  return <EmployeeManagement />;
}
