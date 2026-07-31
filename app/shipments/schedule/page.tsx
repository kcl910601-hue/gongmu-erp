"use client";

import { useEffect, useMemo, useState } from "react";
import { FileDown, Search } from "lucide-react";
import { ShipmentSchedulePreview } from "@/components/shipments/ShipmentSchedulePreview";
import { Button } from "@/components/ui/Button";
import { supabase } from "@/lib/supabase";
import { printShipmentSchedulePdf, type ShipmentScheduleItem, type ShipmentScheduleOptions } from "@/lib/shipment-schedule-pdf";
import { resolveTaskDisplayQuantity } from "@/lib/task-form-rules";

type VendorRelation = {
  id: number;
  project_id: number;
  organization_id: number;
  allocated_quantity: number | null;
  organization: unknown;
};

type TaskRow = {
  id: number;
  task_name: string | null;
  task_type: string | null;
  status: string | null;
  due_date: string | null;
  quantity: number | null;
  project_assembly_vendor_id: number | null;
};

type ProjectRow = {
  id: number;
  project_name: string | null;
  quantity: number | null;
  quantity_unit: string | null;
  memo: string | null;
};

type VendorAssignment = {
  id: number;
  projectId: number;
  allocatedQuantity: number | null;
};

type VendorOption = {
  organizationId: number;
  name: string;
  assignments: VendorAssignment[];
};

function relationObject(value: unknown) {
  const relation = Array.isArray(value) ? value[0] : value;
  return relation && typeof relation === "object" ? relation as Record<string, unknown> : null;
}

function textField(value: unknown, field: string) {
  const relation = relationObject(value);
  return relation && typeof relation[field] === "string" ? relation[field] : null;
}

function localDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function ShipmentSchedulePage() {
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [selectedVendorId, setSelectedVendorId] = useState("");
  const [options, setOptions] = useState<ShipmentScheduleOptions>({ showCalendar: true, showDetails: true, includeCheckbox: true });
  const [previewItems, setPreviewItems] = useState<ShipmentScheduleItem[] | null>(null);
  const [isLoadingVendors, setIsLoadingVendors] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const selectedVendor = useMemo(
    () => (Array.isArray(vendors) ? vendors : []).find(
      (vendor) => vendor.organizationId === Number(selectedVendorId)
    ) ?? null,
    [selectedVendorId, vendors]
  );
  const printedAt = localDateString(new Date());

  useEffect(() => {
    let active = true;
    async function loadVendors() {
      setIsLoadingVendors(true);
      const { data, error } = await supabase
        .from("project_assembly_vendors")
        .select("id, project_id, organization_id, allocated_quantity, organization:organizations(name)")
        .order("organization_id");
      if (!active) return;
      if (error) {
        setErrorMessage(`조립업체를 불러오지 못했습니다: ${error.message}`);
        setIsLoadingVendors(false);
        return;
      }
      const grouped = new Map<number, VendorOption>();
      const vendorRelations = Array.isArray(data) ? data as VendorRelation[] : [];
      console.info("[shipment-schedule] ① project_assembly_vendors 조회 결과");
      console.table(vendorRelations.map((row) => ({
        id: row.id,
        project_id: row.project_id,
        organization_id: row.organization_id,
        allocated_quantity: row.allocated_quantity,
        organization_name: textField(row.organization, "name"),
      })));
      for (const row of vendorRelations) {
        const name = textField(row.organization, "name");
        if (!name) continue;
        const existing = grouped.get(Number(row.organization_id));
        const assignment = {
          id: Number(row.id),
          projectId: Number(row.project_id),
          allocatedQuantity: row.allocated_quantity === null ? null : Number(row.allocated_quantity),
        };
        if (existing) existing.assignments.push(assignment);
        else grouped.set(Number(row.organization_id), {
          organizationId: Number(row.organization_id),
          name,
          assignments: [assignment],
        });
      }
      const nextVendors = [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name, "ko"));
      console.info("[shipment-schedule] vendors:", JSON.stringify({
        relations: vendorRelations.length,
        organizations: nextVendors.length,
        assignments: nextVendors.map((vendor) => ({
          name: vendor.name,
          relationIds: vendor.assignments.map((assignment) => assignment.id),
        })),
      }));
      setVendors(nextVendors);
      setIsLoadingVendors(false);
    }
    void loadVendors();
    return () => { active = false; };
  }, []);

  async function fetchScheduleItems() {
    if (!selectedVendor) throw new Error("조립업체를 선택해 주세요.");
    const [year, monthNumber] = month.split("-").map(Number);
    const monthStart = `${month}-01`;
    const nextMonthStart = localDateString(new Date(year, monthNumber, 1));
    const assignments = Array.isArray(selectedVendor.assignments)
      ? selectedVendor.assignments
      : [];
    if (assignments.length === 0) return [];
    const relationIds = assignments.map((assignment) => assignment.id);
    const projectIds = [...new Set(assignments.map((assignment) => assignment.projectId))];
    console.info("[shipment-schedule] ② 선택한 업체 vendorIds");
    console.log(relationIds);
    console.info("[shipment-schedule] query conditions:", JSON.stringify({
      taskType: "contains 출고",
      status: "no filter",
      dueDate: { gte: monthStart, lt: nextMonthStart },
      projectAssemblyVendorIds: relationIds,
      excludesNullProjectAssemblyVendorId: true,
    }));
    const [projectsResult, tasksResult] = await Promise.all([
      supabase
        .from("projects")
        .select("id, project_name, quantity, quantity_unit, memo")
        .in("id", projectIds),
      supabase
        .from("tasks")
        .select("id, task_name, task_type, status, due_date, quantity, project_assembly_vendor_id")
        .ilike("task_type", "%출고%")
        .gte("due_date", monthStart)
        .lt("due_date", nextMonthStart)
        .order("due_date", { ascending: true }),
    ]);
    if (projectsResult.error) throw new Error(`현장 정보를 불러오지 못했습니다: ${projectsResult.error.message}`);
    if (tasksResult.error) throw new Error(`출고 일정을 불러오지 못했습니다: ${tasksResult.error.message}`);

    const projects = Array.isArray(projectsResult.data)
      ? projectsResult.data as ProjectRow[]
      : [];
    const monthlyShipmentTasks = Array.isArray(tasksResult.data)
      ? tasksResult.data as TaskRow[]
      : [];
    console.info("[shipment-schedule] ③ tasks 조회 결과");
    console.table(monthlyShipmentTasks.map((task) => ({
      id: task.id,
      task_name: task.task_name,
      task_type: task.task_type,
      status: task.status,
      due_date: task.due_date,
      quantity: task.quantity,
      project_assembly_vendor_id: task.project_assembly_vendor_id,
    })));
    const relationIdSet = new Set(relationIds);
    const tasks = monthlyShipmentTasks.filter(
      (task) => task.project_assembly_vendor_id !== null
        && relationIdSet.has(Number(task.project_assembly_vendor_id))
    );
    console.info("[shipment-schedule] projects:", JSON.stringify({
      requested: projectIds.length,
      fetched: projects.length,
    }));
    console.info("[shipment-schedule] tasks:", JSON.stringify({
      monthlyShipmentTasks: monthlyShipmentTasks.length,
      fetched: tasks.length,
      ids: tasks.map((task) => task.id),
      rows: monthlyShipmentTasks.map((task) => ({
        id: task.id,
        task_name: task.task_name,
        task_type: task.task_type,
        status: task.status,
        due_date: task.due_date,
        quantity: task.quantity,
        project_assembly_vendor_id: task.project_assembly_vendor_id,
      })),
      nullVendorTaskIds: monthlyShipmentTasks
        .filter((task) => task.project_assembly_vendor_id === null)
        .map((task) => task.id),
      unmatchedVendorTasks: monthlyShipmentTasks
        .filter((task) => task.project_assembly_vendor_id !== null && !relationIdSet.has(Number(task.project_assembly_vendor_id)))
        .map((task) => ({ id: task.id, projectAssemblyVendorId: task.project_assembly_vendor_id })),
    }));
    const projectsById = new Map(
      projects.map((project) => [Number(project.id), project])
    );
    const assignmentsById = new Map(
      assignments.map((assignment) => [assignment.id, assignment])
    );

    const calendarItemCandidates = tasks.map((task) => {
      const assignment = assignmentsById.get(Number(task.project_assembly_vendor_id));
      const project = assignment ? projectsById.get(assignment.projectId) : undefined;
      return {
        id: Number(task.id),
        shipmentDate: task.due_date?.slice(0, 10) ?? "",
        projectName: project?.project_name || "현장명 없음",
        taskName: task.task_name || "출고",
        quantity: resolveTaskDisplayQuantity(task.task_name, task.quantity, project?.quantity),
        quantityUnit: project?.quantity_unit ?? null,
        memo: project?.memo ?? null,
      };
    });
    console.info("[shipment-schedule] ④ calendarItems 생성 직전");
    console.table(calendarItemCandidates);
    const calendarItems = calendarItemCandidates.filter((item) => item.shipmentDate !== "");
    console.info("[shipment-schedule] ⑤ calendarItems 생성 후");
    console.table(calendarItems);
    console.info("[shipment-schedule] calendarItems:", JSON.stringify({
      created: calendarItems.length,
      taskIds: calendarItems.map((item) => item.id),
    }));
    return calendarItems;
  }

  async function handlePreview() {
    setIsLoading(true); setErrorMessage("");
    try { setPreviewItems(await fetchScheduleItems()); } catch (error) { setErrorMessage(error instanceof Error ? error.message : "미리보기를 생성하지 못했습니다."); }
    finally { setIsLoading(false); }
  }

  async function handlePdf() {
    setIsLoading(true); setErrorMessage("");
    try {
      const items = await fetchScheduleItems();
      setPreviewItems(items);
      printShipmentSchedulePdf({ month, vendorName: selectedVendor?.name || "조립업체", printedAt, items, options });
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : "PDF를 생성하지 못했습니다."); }
    finally { setIsLoading(false); }
  }

  return (
    <main className="space-y-6 p-6">
      <div><h1 className="text-2xl font-bold text-slate-900">출고 일정표 출력(PDF)</h1><p className="mt-1 text-sm text-slate-500">조립업체별 월간 출고 Task와 배정 수량을 일정표로 출력합니다.</p></div>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">출력월<input type="month" value={month} onChange={(event) => { setMonth(event.target.value); setPreviewItems(null); }} className="mt-1 block h-10 w-full rounded-xl border border-slate-300 px-3" /></label>
          <label className="text-sm font-medium text-slate-700">조립업체<select value={selectedVendorId} onChange={(event) => { setSelectedVendorId(event.target.value); setPreviewItems(null); }} disabled={isLoadingVendors} className="mt-1 block h-10 w-full rounded-xl border border-slate-300 bg-white px-3"><option value="">조립업체 선택</option>{(Array.isArray(vendors) ? vendors : []).map((vendor) => <option key={vendor.organizationId} value={vendor.organizationId}>{vendor.name}</option>)}</select></label>
        </div>
        <fieldset className="mt-5"><legend className="text-sm font-semibold text-slate-700">출력 옵션</legend><div className="mt-2 flex flex-wrap gap-5">{([
          ["showCalendar", "달력형"], ["showDetails", "상세목록 포함"], ["includeCheckbox", "체크박스 포함"],
        ] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={options[key]} disabled={key === "includeCheckbox" && !options.showDetails} onChange={(event) => setOptions((current) => ({ ...current, [key]: event.target.checked }))} className="h-4 w-4 rounded border-slate-300" />{label}</label>)}</div></fieldset>
        {errorMessage && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{errorMessage}</p>}
        <div className="mt-5 flex gap-2"><Button variant="outline" onClick={handlePreview} disabled={isLoading || !month || !selectedVendor}><Search className="mr-2 h-4 w-4" />미리보기</Button><Button variant="primary" onClick={handlePdf} disabled={isLoading || !month || !selectedVendor || (!options.showCalendar && !options.showDetails)}><FileDown className="mr-2 h-4 w-4" />PDF 생성</Button></div>
      </section>
      {previewItems !== null && <section><div className="mb-2 flex items-center justify-between"><h2 className="text-lg font-semibold text-slate-900">미리보기</h2><span className="text-sm text-slate-500">출고 {previewItems.length}건</span></div><div className="overflow-x-auto rounded-2xl border border-slate-200 bg-slate-100 p-4"><ShipmentSchedulePreview month={month} vendorName={selectedVendor?.name || "조립업체"} printedAt={printedAt} items={previewItems} options={options} /></div></section>}
    </main>
  );
}
