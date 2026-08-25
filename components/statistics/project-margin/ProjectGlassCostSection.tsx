"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useEditingLock } from "@/hooks/useEditingLock";
import { toast } from "@/lib/toast";
export type ProjectGlassCostRow = {
  id: string;
  statement_id: string;
  accounting_month: string;
  invoice_number: string | null;
  vendor_name: string;
  vendor_organization_id: number;
  allocated_supply_amount_krw: number;
  statement_supply_amount_krw: number;
  vat_amount_krw: number;
  memo: string | null;
  statement_status: string;
  active_allocation_count: number;
  is_single_project_full_allocation: boolean;
};
type Vendor = { id: number; name: string; is_active: boolean };
type Project = {
  id: number;
  project_code: string | null;
  project_name: string;
};
const now = () => new Date().toISOString().slice(0, 7),
  money = (value: number) => `${value.toLocaleString("ko-KR")}원`;
export function ProjectGlassCostSection({
  project,
  rows,
  total,
  canManage,
  editable = true,
  onChanged,
}: {
  project: Project;
  rows: ProjectGlassCostRow[];
  total: number;
  canManage: boolean;
  editable?: boolean;
  onChanged: () => Promise<void>;
}) {
  const [vendors, setVendors] = useState<Vendor[]>([]),
    [editing, setEditing] = useState<ProjectGlassCostRow | null>(null),
    [open, setOpen] = useState(false),
    [saving, setSaving] = useState(false),
    [form, setForm] = useState({
      vendor_organization_id: "",
      accounting_month: now(),
      supply_amount_krw: "",
      vat_amount_krw: "",
      invoice_number: "",
      memo: "",
    });
  const lock = useEditingLock(
    "glass_cost_statement",
    editing?.statement_id ?? null,
    Boolean(editing && open),
  );
  useEffect(() => {
    if (!editable) return;
    void fetch("/api/partner-organizations?partner_type=glass", {
      cache: "no-store",
    }).then(async (response) => {
      const body = (await response.json()) as { partners?: Vendor[] };
      if (response.ok) setVendors(body.partners ?? []);
    });
  }, [editable]);
  const sorted = useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          b.accounting_month.localeCompare(a.accounting_month) ||
          b.id.localeCompare(a.id),
      ),
    [rows],
  );
  function start(row?: ProjectGlassCostRow) {
    setEditing(row ?? null);
    setForm(
      row
        ? {
            vendor_organization_id: String(row.vendor_organization_id),
            accounting_month: row.accounting_month.slice(0, 7),
            supply_amount_krw: String(row.statement_supply_amount_krw),
            vat_amount_krw: String(row.vat_amount_krw),
            invoice_number: row.invoice_number ?? "",
            memo: row.memo ?? "",
          }
        : {
            vendor_organization_id: "",
            accounting_month: now(),
            supply_amount_krw: "",
            vat_amount_krw: "",
            invoice_number: "",
            memo: "",
          },
    );
    setOpen(true);
  }
  async function save() {
    setSaving(true);
    try {
      const response = await fetch(
          `/api/statistics/project-margin/${project.id}/glass-costs`,
          {
            method: editing ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...form,
              statement_id: editing?.statement_id,
            }),
          },
        ),
        body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error);
      toast.success(
        editing ? "유리 원가가 수정되었습니다." : "유리 원가가 등록되었습니다.",
      );
      setOpen(false);
      setEditing(null);
      await onChanged();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "저장하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function voidEntry(row: ProjectGlassCostRow) {
    if (!confirm("이 유리 원가를 무효 처리하시겠습니까?")) return;
    const response = await fetch(
        `/api/statistics/project-margin/${project.id}/glass-costs`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            statement_id: row.statement_id,
            action: "void",
          }),
        },
      ),
      body = (await response.json()) as { error?: string };
    if (!response.ok)
      return toast.error(body.error ?? "무효 처리하지 못했습니다.");
    toast.success("유리 원가를 무효 처리했습니다.");
    await onChanged();
  }
  return (
    <section className="mt-4 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">유리 실제원가 상세</h3>
          <p className="mt-1 text-sm text-slate-500">
            총 {money(total)} · 실제 계산서 배분 공급가액 기준
          </p>
        </div>
        {canManage && editable ? (
          <Button size="sm" variant="primary" onClick={() => start()}>
            + 유리원가 등록
          </Button>
        ) : <Link className="rounded-lg border px-3 py-2 text-xs" href={`/statistics/cost-analysis?projectId=${project.id}`}>원가분석에서 관리</Link>}
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-xs">
          <thead className="bg-slate-100">
            <tr>
              {[
                "귀속월",
                "업체",
                "계산서번호",
                "배분 공급가액",
                "구분",
                "작업",
              ].map((label) => (
                <th key={label} className="px-3 py-2">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="px-3 py-2">
                  {row.accounting_month.slice(0, 7)}
                </td>
                <td>{row.vendor_name}</td>
                <td>{row.invoice_number ?? "-"}</td>
                <td>{money(row.allocated_supply_amount_krw)}</td>
                <td>
                  {row.is_single_project_full_allocation
                    ? "단일 프로젝트"
                    : "공동 계산서"}
                </td>
                  <td>
                    {canManage && editable && row.is_single_project_full_allocation ? (
                    <>
                      <button
                        className="mr-3 text-blue-600"
                        onClick={() => start(row)}
                      >
                        수정
                      </button>
                      <button
                        className="text-red-600"
                        onClick={() => void voidEntry(row)}
                      >
                        무효
                      </button>
                    </>
                    ) : !row.is_single_project_full_allocation ? (
                      <Link
                      className="text-blue-600"
                      href={`/statistics/glass-costs?statementId=${row.statement_id}`}
                    >
                        전체 정산 보기
                      </Link>
                    ) : <span className="text-slate-400">조회</span>}
                </td>
              </tr>
            ))}
            {!sorted.length && (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-8 text-center text-slate-400"
                >
                  등록된 유리 실제원가가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t font-bold">
              <td className="px-3 py-2" colSpan={3}>
                합계
              </td>
              <td>{money(total)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-xl rounded-2xl bg-white p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-lg font-bold">
              유리 원가 {editing ? "수정" : "등록"}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {project.project_code ?? "-"} · {project.project_name}
            </p>
            {editing && !lock.canEdit && (
              <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                {lock.state === "locked"
                  ? `${lock.lock?.employeeName ?? "다른 사용자"}가 편집 중입니다.`
                  : "편집 잠금을 확인하고 있습니다."}
              </p>
            )}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                유리업체 *
                <select
                  value={form.vendor_organization_id}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      vendor_organization_id: event.target.value,
                    })
                  }
                  disabled={Boolean(editing && !lock.canEdit)}
                  className="mt-1 w-full rounded-xl border px-3 py-2"
                >
                  <option value="">선택</option>
                  {vendors
                    .filter(
                      (vendor) =>
                        vendor.is_active ||
                        String(vendor.id) === form.vendor_organization_id,
                    )
                    .map((vendor) => (
                      <option key={vendor.id} value={vendor.id}>
                        {vendor.name}
                        {vendor.is_active ? "" : " (비활성)"}
                      </option>
                    ))}
                </select>
              </label>
              <label className="text-sm">
                귀속연월 *
                <input
                  type="month"
                  value={form.accounting_month}
                  onChange={(event) =>
                    setForm({ ...form, accounting_month: event.target.value })
                  }
                  disabled={Boolean(editing && !lock.canEdit)}
                  className="mt-1 w-full rounded-xl border px-3 py-2"
                />
              </label>
              <label className="text-sm">
                공급가액 *
                <input
                  type="number"
                  min="0"
                  value={form.supply_amount_krw}
                  onChange={(event) => {
                    const supply = event.target.value;
                    setForm({
                      ...form,
                      supply_amount_krw: supply,
                      vat_amount_krw: String(
                        Math.round(Number(supply || 0) * 0.1),
                      ),
                    });
                  }}
                  disabled={Boolean(editing && !lock.canEdit)}
                  className="mt-1 w-full rounded-xl border px-3 py-2"
                />
              </label>
              <label className="text-sm">
                VAT *
                <input
                  type="number"
                  min="0"
                  value={form.vat_amount_krw}
                  onChange={(event) =>
                    setForm({ ...form, vat_amount_krw: event.target.value })
                  }
                  disabled={Boolean(editing && !lock.canEdit)}
                  className="mt-1 w-full rounded-xl border px-3 py-2"
                />
              </label>
              <label className="text-sm">
                계산서번호
                <input
                  value={form.invoice_number}
                  onChange={(event) =>
                    setForm({ ...form, invoice_number: event.target.value })
                  }
                  disabled={Boolean(editing && !lock.canEdit)}
                  className="mt-1 w-full rounded-xl border px-3 py-2"
                />
              </label>
              <label className="text-sm">
                메모
                <input
                  value={form.memo}
                  onChange={(event) =>
                    setForm({ ...form, memo: event.target.value })
                  }
                  disabled={Boolean(editing && !lock.canEdit)}
                  className="mt-1 w-full rounded-xl border px-3 py-2"
                />
              </label>
            </div>
            <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm">
              <p>
                공급가액{" "}
                <b className="float-right">
                  {money(Number(form.supply_amount_krw || 0))}
                </b>
              </p>
              <p>
                VAT{" "}
                <b className="float-right">
                  {money(Number(form.vat_amount_krw || 0))}
                </b>
              </p>
              <p className="mt-1 border-t pt-1">
                총액{" "}
                <b className="float-right">
                  {money(
                    Number(form.supply_amount_krw || 0) +
                      Number(form.vat_amount_krw || 0),
                  )}
                </b>
              </p>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                취소
              </Button>
              <Button
                disabled={saving || Boolean(editing && !lock.canEdit)}
                onClick={() => void save()}
              >
                {saving ? "저장 중..." : "저장"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
