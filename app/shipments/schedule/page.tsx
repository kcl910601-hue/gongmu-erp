"use client";

import { useEffect, useMemo, useState } from "react";
import { FileDown, Search } from "lucide-react";
import { ShipmentScheduleEditor } from "@/components/shipments/ShipmentScheduleEditor";
import { Button } from "@/components/ui/Button";
import { supabase } from "@/lib/supabase";
import { filterShipmentScheduleItems, getShipmentMonthRange, printShipmentSchedulePdf, validateShipmentScheduleRange, type ShipmentScheduleDocument, type ShipmentScheduleItem, type ShipmentScheduleOptions, type ShipmentScheduleRange } from "@/lib/shipment-schedule-pdf";
import { formatTaskNoteForExport } from "@/lib/task-notes";
import { resolveTaskDisplayQuantity } from "@/lib/task-form-rules";
import { buildCalendarProcessTypeMap, resolveCalendarProcessType } from "@/lib/calendar-process-type";

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
  project_section_id: number | null;
  status: string | null;
  start_date: string | null;
  due_date: string | null;
  quantity: number | null;
  project_assembly_vendor_id: number | null;
};

type ProjectRow = {
  id: number;
  project_name: string | null;
  client_name: string | null;
  process_type: string | null;
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

function resolveShipmentDate(task: Pick<TaskRow, "start_date" | "due_date">) {
  const start = task.start_date?.slice(0, 10) || "";
  const due = task.due_date?.slice(0, 10) || "";
  return start > due ? start : due;
}

export default function ShipmentSchedulePage() {
  const now = new Date();
  const initialMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const initialRange = getShipmentMonthRange(initialMonth)!;
  const [rangeMode, setRangeMode] = useState<"month" | "custom">("month");
  const [month, setMonth] = useState(initialMonth);
  const [customRange, setCustomRange] = useState<ShipmentScheduleRange>(initialRange);
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [selectedVendorIds, setSelectedVendorIds] = useState<number[]>([]);
  const [options, setOptions] = useState<ShipmentScheduleOptions>({ showCalendar: true, showDetails: true, includeCheckbox: true, showQuantity: true, showStatus: true, paperSize: "A4", weekly: false, separateDetails: false });
  const [drafts, setDrafts] = useState<{ vendorId: number; vendorName: string; items: ShipmentScheduleItem[]; original: ShipmentScheduleItem[] }[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [filters, setFilters] = useState({ incompleteOnly: false, project: "", process: "" });
  const [isLoadingVendors, setIsLoadingVendors] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const selectedVendors = useMemo(() => vendors.filter((vendor) => selectedVendorIds.includes(vendor.organizationId)), [selectedVendorIds, vendors]);
  const printedAt = localDateString(new Date());
  const allDraftItems = (drafts ?? []).flatMap((draft) => [...draft.original, ...draft.items]);
  const projectNames = [...new Set(allDraftItems.map((item) => item.projectName))].sort((a, b) => a.localeCompare(b, "ko"));
  const processNames = [...new Set(allDraftItems.map((item) => item.processName).filter((name): name is string => Boolean(name)))].sort((a, b) => a.localeCompare(b, "ko"));

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  function confirmDiscard() {
    return !dirty || window.confirm("출력용 편집 내용이 사라집니다. 계속하시겠습니까?");
  }

  function changeContext(change: () => void) {
    if (!confirmDiscard()) return;
    change();
    setDrafts(null); setDirty(false); setErrorMessage("");
    setFilters((current) => ({ ...current, project: "", process: "" }));
    setPreviewVersion((current) => current + 1);
  }

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

  async function fetchScheduleItems(selectedVendor: VendorOption): Promise<ShipmentScheduleItem[]> {
    if (!selectedVendor) throw new Error("조립업체를 선택해 주세요.");
    const range = rangeMode === "month" ? getShipmentMonthRange(month) : customRange;
    if (!range) throw new Error("출력월을 선택해 주세요.");
    const rangeError = validateShipmentScheduleRange(range);
    if (rangeError) throw new Error(rangeError);
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
      shipmentDate: { basis: "later of start_date and due_date", gte: range.start, lte: range.end },
      projectAssemblyVendorIds: relationIds,
      excludesNullProjectAssemblyVendorId: true,
    }));
    const [projectsResult, tasksResult] = await Promise.all([
      supabase
        .from("projects")
        .select("id, project_name, client_name, process_type, quantity, quantity_unit, memo")
        .in("id", projectIds),
      supabase
        .from("tasks")
        .select("id, task_name, task_type, project_section_id, status, start_date, due_date, quantity, project_assembly_vendor_id")
        .ilike("task_type", "%출고%")
        .in("project_assembly_vendor_id", relationIds)
        // At least one date is in range, and the other cannot be later than its end.
        .or(`and(start_date.gte.${range.start},start_date.lte.${range.end},or(due_date.is.null,due_date.lte.${range.end})),and(due_date.gte.${range.start},due_date.lte.${range.end},or(start_date.is.null,start_date.lte.${range.end}))`)
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
    const tasks = monthlyShipmentTasks.map((task) => ({ ...task, shipmentDate: resolveShipmentDate(task) })).filter(
      (task) => task.project_assembly_vendor_id !== null
        && relationIdSet.has(Number(task.project_assembly_vendor_id))
        && task.shipmentDate >= range.start && task.shipmentDate <= range.end
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

    const sectionIds = [...new Set(tasks.map((task) => task.project_section_id).filter((id): id is number => typeof id === "number"))];
    const [sectionResult, processTypeResult] = await Promise.all([
      sectionIds.length ? supabase.from("project_sections").select("id, process_type").in("id", sectionIds) : Promise.resolve({ data: [], error: null }),
      supabase.from("process_types").select("code, name"),
    ]);
    if (sectionResult.error) throw new Error(`공정 정보를 불러오지 못했습니다: ${sectionResult.error.message}`);
    if (processTypeResult.error) throw new Error(`공정명을 불러오지 못했습니다: ${processTypeResult.error.message}`);
    const sectionProcessById = new Map((sectionResult.data ?? []).map((section) => [Number(section.id), typeof section.process_type === "string" ? section.process_type : null]));
    const processTypesByCode = buildCalendarProcessTypeMap(processTypeResult.data ?? []);

    const notesResult = tasks.length ? await supabase.from("task_notes")
      .select("id, task_id, note, is_important, check_date, created_at")
      .in("task_id", tasks.map((task) => task.id)).order("created_at", { ascending: false }) : { data: [], error: null };
    if (notesResult.error) throw new Error(`업무 메모를 불러오지 못했습니다: ${notesResult.error.message}`);
    const notesByTask = new Map<number, { id: string; text: string }[]>();
    for (const note of notesResult.data ?? []) {
      const taskId = Number(note.task_id);
      const notes = notesByTask.get(taskId) ?? [];
      notes.push({ id: String(note.id), text: formatTaskNoteForExport({ note: note.note, isImportant: note.is_important, checkDate: note.check_date }) });
      notesByTask.set(taskId, notes);
    }

    const calendarItemCandidates = tasks.map((task) => {
      const assignment = assignmentsById.get(Number(task.project_assembly_vendor_id));
      const project = assignment ? projectsById.get(assignment.projectId) : undefined;
      const processType = resolveCalendarProcessType(task.project_section_id ? sectionProcessById.get(task.project_section_id) : null, project?.process_type, processTypesByCode);
      return {
        id: Number(task.id),
        status: task.status,
        processName: processType?.name || "",
        notes: notesByTask.get(Number(task.id)) ?? [],
        shipmentDate: task.shipmentDate,
        projectName: project?.project_name || "현장명 없음",
        clientName: project?.client_name?.trim() || null,
        taskName: task.task_name || "출고",
        shipmentLabel: [task.task_type || "출고", processType?.name].filter(Boolean).join(" "),
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
    if (!confirmDiscard()) return;
    setIsLoading(true); setErrorMessage("");
    try {
      if (!selectedVendors.length) throw new Error("조립업체를 선택해 주세요.");
      const next = await Promise.all(selectedVendors.map(async (vendor) => {
        const items = await fetchScheduleItems(vendor);
        return { vendorId: vendor.organizationId, vendorName: vendor.name, items, original: items };
      }));
      setDrafts(next); setDirty(false); setPreviewVersion((current) => current + 1);
      setFilters((current) => ({ ...current, project: "", process: "" }));
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : "미리보기를 생성하지 못했습니다."); }
    finally { setIsLoading(false); }
  }

  function makeDocument(draft: NonNullable<typeof drafts>[number]): ShipmentScheduleDocument {
    return { month, range: rangeMode === "custom" ? customRange : undefined, vendorName: draft.vendorName, printedAt, items: filterShipmentScheduleItems(draft.items, filters), options };
  }

  function handlePdf() {
    setErrorMessage("");
    if (document.querySelector("[data-schedule-editor]")) { setErrorMessage("편집 중인 일정을 적용하거나 취소한 뒤 PDF를 생성해 주세요."); return; }
    if (!drafts?.length) { setErrorMessage("미리보기를 먼저 생성해 주세요."); return; }
    try {
      const documents = drafts.map(makeDocument);
      printShipmentSchedulePdf(documents[0], documents.slice(1));
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : "PDF를 생성하지 못했습니다."); }
  }

  return (
    <main className="space-y-6 p-6">
      <div><h1 className="text-2xl font-bold text-slate-900">출고 일정표 출력(PDF)</h1><p className="mt-1 text-sm text-slate-500">조립업체별 출고 일정과 수량을 미리보기에서 편집한 후 출력합니다.</p></div>
      <fieldset disabled={isLoading} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <fieldset className="mb-5"><legend className="text-sm font-semibold text-slate-700">출력 범위</legend><div className="mt-2 flex gap-5">{([["month", "월 단위"], ["custom", "기간 지정"]] as const).map(([value, label]) => <label key={value} className="flex items-center gap-2 text-sm"><input type="radio" name="shipment-schedule-range" checked={rangeMode === value} onChange={() => changeContext(() => setRangeMode(value))} />{label}</label>)}</div></fieldset>
        {rangeMode === "month" ? <label className="block max-w-sm text-sm font-medium">출력월<input type="month" value={month} onChange={(event) => changeContext(() => setMonth(event.target.value))} className="mt-1 block h-10 w-full rounded-xl border border-slate-300 px-3" /></label> : <div className="flex flex-wrap gap-3">{([["start", "시작일"], ["end", "종료일"]] as const).map(([key, label]) => <label key={key} className="text-sm font-medium">{label}<input type="date" value={customRange[key]} onChange={(event) => changeContext(() => setCustomRange((current) => ({ ...current, [key]: event.target.value })))} className="mt-1 block h-10 rounded-xl border border-slate-300 px-3" /></label>)}</div>}
        <fieldset disabled={isLoadingVendors} className="mt-4"><legend className="text-sm font-semibold">조립업체 · 여러 업체 선택 가능</legend><div className="mt-2 flex max-h-40 flex-wrap gap-x-5 gap-y-3 overflow-y-auto">{vendors.map((vendor) => <label key={vendor.organizationId} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selectedVendorIds.includes(vendor.organizationId)} onChange={(event) => changeContext(() => setSelectedVendorIds((current) => event.target.checked ? [...current, vendor.organizationId] : current.filter((id) => id !== vendor.organizationId)))} />{vendor.name}</label>)}</div>{!isLoadingVendors && !vendors.length && <p className="mt-2 text-sm text-slate-500">출력 가능한 조립업체가 없습니다.</p>}</fieldset>
        <fieldset className="mt-5"><legend className="text-sm font-semibold">출력 옵션</legend><div className="mt-2 flex flex-wrap gap-5">{([
          ["showCalendar", "달력형"], ["showDetails", "상세목록 포함"], ["includeCheckbox", "체크박스 포함"], ["showQuantity", "달력 수량"], ["showStatus", "상태 표시"], ["weekly", "주간 확대"], ["separateDetails", "상세목록 별도 페이지"],
        ] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(options[key])} disabled={(key === "includeCheckbox" && !options.showDetails) || ((key === "showQuantity" || key === "weekly") && !options.showCalendar)} onChange={(event) => setOptions((current) => ({ ...current, [key]: event.target.checked }))} />{label}</label>)}<label className="flex items-center gap-2 text-sm">용지<select value={options.paperSize} onChange={(event) => setOptions((current) => ({ ...current, paperSize: event.target.value === "A3" ? "A3" : "A4" }))} className="rounded border border-slate-300 p-1"><option value="A4">A4 가로</option><option value="A3">A3 가로</option></select></label></div></fieldset>
        <div className="mt-5 flex flex-wrap items-center gap-4"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={filters.incompleteOnly} onChange={(event) => setFilters((current) => ({ ...current, incompleteOnly: event.target.checked }))} />미완료만 출력</label><label className="text-sm">현장 <select aria-label="현장 필터" value={filters.project} onChange={(event) => setFilters((current) => ({ ...current, project: event.target.value }))} className="rounded border border-slate-300 p-2"><option value="">전체 현장</option>{projectNames.map((name) => <option key={name}>{name}</option>)}</select></label><label className="text-sm">공정 <select aria-label="공정 필터" value={filters.process} onChange={(event) => setFilters((current) => ({ ...current, process: event.target.value }))} className="rounded border border-slate-300 p-2"><option value="">전체 공정</option>{processNames.map((name) => <option key={name}>{name}</option>)}</select></label></div>
        {errorMessage && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{errorMessage}</p>}
        <div className="mt-5 flex flex-wrap gap-2"><Button variant="outline" onClick={handlePreview} disabled={isLoading || !selectedVendors.length}><Search className="mr-2 h-4 w-4" />{isLoading ? "불러오는 중…" : drafts ? "원본 다시 조회" : "미리보기"}</Button><Button variant="primary" onClick={handlePdf} disabled={isLoading || !drafts?.length || (!options.showCalendar && !options.showDetails)}><FileDown className="mr-2 h-4 w-4" />PDF 생성</Button></div>
      </fieldset>
      {drafts && <>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4"><div><p className="text-sm font-semibold text-blue-900">출력용 편집 — 원본 프로젝트에 반영되지 않습니다.</p><p className="mt-1 text-xs text-slate-600">추가·수정·제외 내역은 현재 화면에서만 유지됩니다. 필터에 맞는 일정만 출력되며, 새로고침하거나 화면을 떠나면 편집 내용이 사라집니다.</p></div><Button variant="outline" disabled={isLoading} onClick={() => {
          if (!confirmDiscard()) return;
          setDrafts((current) => current?.map((draft) => ({ ...draft, items: draft.original })) ?? null);
          setDirty(false); setPreviewVersion((current) => current + 1);
        }}>원본으로 초기화</Button></div>
        <fieldset disabled={isLoading} className="space-y-6">{drafts.map((draft) => <ShipmentScheduleEditor key={previewVersion + ":" + draft.vendorId} document={makeDocument(draft)} allItems={draft.items} onEditing={() => setDirty(true)} onChange={(items) => {
          setDrafts((current) => current?.map((candidate) => candidate.vendorId === draft.vendorId ? { ...candidate, items } : candidate) ?? null);
          setDirty(true);
        }} />)}</fieldset>
      </>}
    </main>
  );
}
