"use client";

import { useCallback, useEffect, useState } from "react";
import {
  EMPLOYEE_ROLES,
  EMPLOYEE_ROLE_LABELS,
  type EmployeeRole,
} from "@/lib/approval";

type SignupRequest = {
  id: number;
  name: string;
  email: string;
  position: string | null;
  approval_status: "pending" | "rejected";
  created_at: string | null;
};

export default function SignupRequests() {
  const [requests, setRequests] = useState<SignupRequest[]>([]);
  const [selected, setSelected] = useState<SignupRequest | null>(null);
  const [role, setRole] = useState<EmployeeRole>("member");
  const [position, setPosition] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const response = await fetch("/api/signup-requests", { cache: "no-store" });
      const result = (await response.json()) as {
        requests?: SignupRequest[];
        error?: string;
      };
      if (!response.ok) {
        setErrorMessage(result.error ?? "가입 요청을 불러오지 못했습니다.");
        return;
      }
      setRequests(result.requests ?? []);
    } catch (error) {
      console.error("signup requests load error:", error);
      setErrorMessage("가입 요청을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadRequests(), 0);
    return () => window.clearTimeout(timer);
  }, [loadRequests]);

  function openApproval(request: SignupRequest) {
    setSelected(request);
    setRole("member");
    setPosition(request.position ?? "");
    setErrorMessage("");
  }

  async function updateRequest(
    request: SignupRequest,
    action: "approve" | "reject"
  ) {
    if (saving) return;
    setSaving(true);
    setErrorMessage("");
    try {
      const response = await fetch("/api/signup-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: request.id,
          action,
          ...(action === "approve" ? { role, position } : {}),
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setErrorMessage(result.error ?? "요청 처리에 실패했습니다.");
        return;
      }
      setSelected(null);
      await loadRequests();
    } catch (error) {
      console.error("signup request update error:", error);
      setErrorMessage("요청 처리에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  const pendingCount = requests.filter(
    (request) => request.approval_status === "pending"
  ).length;

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-lg font-semibold">가입 승인 요청</h2>
        <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">
          대기 {pendingCount}
        </span>
      </div>

      {errorMessage && (
        <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {errorMessage}
        </p>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-slate-500">불러오는 중...</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="px-4 py-3">이름</th>
                <th className="px-4 py-3">이메일</th>
                <th className="px-4 py-3">요청일</th>
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3 text-right">관리</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id} className="border-t border-slate-200">
                  <td className="px-4 py-3 font-medium">{request.name}</td>
                  <td className="px-4 py-3">{request.email}</td>
                  <td className="px-4 py-3">{request.created_at?.slice(0, 10) ?? "-"}</td>
                  <td className="px-4 py-3">
                    {request.approval_status === "pending" ? "승인 대기" : "거절"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {request.approval_status === "pending" && (
                      <>
                        <button
                          type="button"
                          onClick={() => openApproval(request)}
                          className="mr-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white"
                        >
                          승인
                        </button>
                        <button
                          type="button"
                          onClick={() => void updateRequest(request, "reject")}
                          disabled={saving}
                          className="rounded-lg border border-red-300 px-3 py-1.5 text-xs text-red-600 disabled:opacity-50"
                        >
                          거절
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {requests.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                    가입 승인 요청이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4">
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-xl font-bold">가입 승인</h3>
            <p className="mt-1 text-sm text-slate-500">{selected.name} · {selected.email}</p>
            <label className="mt-5 block text-sm font-semibold">
              권한
              <select
                value={role}
                onChange={(event) => setRole(event.target.value as EmployeeRole)}
                className="mt-2 w-full rounded-xl border border-slate-300 p-3 font-normal"
              >
                {EMPLOYEE_ROLES.map((value) => (
                  <option key={value} value={value}>{EMPLOYEE_ROLE_LABELS[value]}</option>
                ))}
              </select>
            </label>
            <label className="mt-4 block text-sm font-semibold">
              직급
              <input
                value={position}
                onChange={(event) => setPosition(event.target.value)}
                placeholder="직급을 입력하세요"
                className="mt-2 w-full rounded-xl border border-slate-300 p-3 font-normal"
              />
            </label>
            <p className="mt-4 text-sm text-slate-500">
              승인하면 계정이 활성화되고 선택한 권한이 적용됩니다.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelected(null)}
                disabled={saving}
                className="rounded-xl border border-slate-300 px-4 py-2"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void updateRequest(selected, "approve")}
                disabled={saving || !position.trim()}
                className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white disabled:bg-slate-400"
              >
                {saving ? "처리 중..." : "승인"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

