"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import * as XLSX from "xlsx-js-style";
import { addActivity } from "@/lib/activity";
import { getProjectEntryOptions } from "@/lib/project-master-data";
import { getActiveProcessTypes, normalizeProcessTypeCode } from "@/lib/process-types";
import { normalizeProjectStatus } from "@/lib/status";
import { supabase } from "@/lib/supabase";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/Button";
import {
  downloadProjectExcelTemplate,
  PROJECT_EXCEL_COLUMNS as COLUMNS,
  PROJECT_EXCEL_COMMON_FIELDS as COMMON_FIELDS,
} from "@/lib/excel/project-template";

const VALID_STATUS = new Set(["pending", "in_progress", "hold", "completed"]);
type SheetRow = Record<string, unknown>;
type NormalizedRow = {
  rowNumber: number;
  project_code: string;
  project_name: string;
  client_name: string | null;
  site_address: string | null;
  salesperson: string | null;
  task_manager: string | null;
  process_type: string;
  assembly_vendor: string | null;
  assemblyVendorIds: number[];
  assemblyVendorNames: string[];
  start_date: string | null;
  end_date: string | null;
  status: string;
  memo: string | null;
  errors: string[];
  saveError?: string;
  saved?: boolean;
};

type Props = { open: boolean; onClose: () => void; onCompleted: () => void };

function text(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function normalizeHeader(value: unknown) {
  return text(value).replace(/\*$/, "").trim();
}

function normalizeSheetRow(row: SheetRow): SheetRow {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeHeader(key), value]));
}

function dateValue(value: unknown): { value: string | null; error: boolean } {
  if (value == null || value === "") return { value: null, error: false };
  let date: Date | null = null;
  let expected: [number, number, number] | null = null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) date = value;
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      expected = [parsed.y, parsed.m, parsed.d];
      date = new Date(parsed.y, parsed.m - 1, parsed.d);
    }
  }
  if (typeof value === "string") {
    const match = value.trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (match) {
      expected = [Number(match[1]), Number(match[2]), Number(match[3])];
      date = new Date(expected[0], expected[1] - 1, expected[2]);
    }
  }
  if (!date || Number.isNaN(date.getTime())) return { value: null, error: true };
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  if (year < 1900 || (expected && (year !== expected[0] || month !== expected[1] || day !== expected[2]))) return { value: null, error: true };
  return { value: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, error: false };
}

function uniqueNameErrors(name: string, options: Array<{ value: string }>, label: string) {
  if (!name) return [];
  const count = options.filter((option) => option.value.trim() === name).length;
  if (count === 0) return [`${label}과 일치하는 직원이 없습니다.`];
  if (count > 1) return [`${label} 동명이인이 있어 식별할 수 없습니다.`];
  return [];
}

function parseAssemblyVendors(value: string) {
  return [...new Set(value.split(",").map((vendor) => vendor.trim()).filter(Boolean))];
}

export function ProjectExcelUploadDialog({ open, onClose, onCompleted }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<NormalizedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const normalCount = rows.filter((row) => row.errors.length === 0 && !row.saveError && !row.saved).length;
  const errorCount = rows.filter((row) => row.errors.length > 0 || Boolean(row.saveError)).length;
  const savedCount = rows.filter((row) => row.saved).length;

  const requestClose = useCallback(() => {
    if (isSaving) return;
    if (rows.length > 0 && !window.confirm("파싱한 업로드 내용이 있습니다. 닫으시겠습니까?")) return;
    setRows([]); setFileName(""); onClose();
  }, [isSaving, onClose, rows.length]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if (open && event.key === "Escape") requestClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, requestClose]);

  const downloadTemplate = async () => {
    try {
      await downloadProjectExcelTemplate();
    } catch (error) {
      console.error("project excel template error", error);
      toast.error("엑셀 양식을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  };

  async function parseFile(file: File) {
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) return toast.warning(".xlsx, .xls, .csv 파일만 업로드할 수 있습니다.");
    setIsParsing(true); setRows([]); setFileName(file.name);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const isCsv = /\.csv$/i.test(file.name);
      const commonSheet = workbook.Sheets["공통설정"];
      const worksheet = isCsv ? workbook.Sheets[workbook.SheetNames[0]] : workbook.Sheets["프로젝트목록"];
      if (!isCsv && !commonSheet) throw new Error("공통설정 시트를 찾을 수 없습니다.");
      if (!worksheet) throw new Error("프로젝트목록 시트를 찾을 수 없습니다.");
      const commonRows = commonSheet ? XLSX.utils.sheet_to_json<unknown[]>(commonSheet, { header: 1, defval: "", raw: true }) : [];
      const commonValues = new Map<string, unknown>();
      commonRows.slice(1).forEach((row) => {
        const field = text(row[0]);
        if ((COMMON_FIELDS as readonly string[]).includes(field)) commonValues.set(field, row[1]);
      });
      const sourceRows = XLSX.utils.sheet_to_json<SheetRow>(worksheet, { defval: "", raw: true }).map(normalizeSheetRow);
      const headers = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, range: 0, defval: "" })[0]?.map(normalizeHeader) ?? [];
      if (!headers.includes("프로젝트코드")) throw new Error("프로젝트코드 컬럼을 찾을 수 없습니다.");
      if (!headers.includes("프로젝트명")) throw new Error("프로젝트명 컬럼을 찾을 수 없습니다.");
      const nonEmpty = sourceRows.filter((row) => COLUMNS.some((column) => text(row[column]) !== ""));
      if (nonEmpty.length === 0) {
        toast.info("등록할 프로젝트 데이터가 없습니다.");
        return;
      }
      const [entry, processResult] = await Promise.all([getProjectEntryOptions(), getActiveProcessTypes()]);
      if (entry.error) throw new Error(entry.error);
      if (processResult.error) throw processResult.error;

      const mergedValue = (row: SheetRow, column: (typeof COMMON_FIELDS)[number]) => text(row[column]) || text(commonValues.get(column));

      const codes = nonEmpty.map((row) => text(row["프로젝트코드"])).filter(Boolean);
      const codeCounts = new Map<string, number>();
      codes.forEach((code) => codeCounts.set(code, (codeCounts.get(code) ?? 0) + 1));
      const { data: existing, error: existingError } = codes.length
        ? await supabase.from("projects").select("project_code").in("project_code", [...new Set(codes)])
        : { data: [], error: null };
      if (existingError) throw existingError;
      const existingCodes = new Set((existing ?? []).map((item) => String(item.project_code)));

      setRows(nonEmpty.map((row, index) => {
        const code = text(row["프로젝트코드"]);
        const name = text(row["프로젝트명"]);
        const start = dateValue(text(row["시작일"]) ? row["시작일"] : commonValues.get("시작일"));
        const end = dateValue(text(row["종료예정일"]) ? row["종료예정일"] : commonValues.get("종료예정일"));
        const salesperson = mergedValue(row, "영업담당");
        const taskManager = mergedValue(row, "공무담당");
        const processType = normalizeProcessTypeCode(mergedValue(row, "공정유형"));
        const assemblyVendors = parseAssemblyVendors(mergedValue(row, "조립업체"));
        const vendorByName = new Map(entry.data.assemblyVendors.map((vendor) => [vendor.name, vendor]));
        const missingVendors = assemblyVendors.filter((vendor) => !vendorByName.has(vendor));
        const rawStatus = mergedValue(row, "상태") || "in_progress";
        const status = normalizeProjectStatus(rawStatus);
        const errors: string[] = [];
        if (!code) errors.push("프로젝트코드는 필수입니다.");
        if (!name) errors.push("프로젝트명은 필수입니다.");
        if (code && (codeCounts.get(code) ?? 0) > 1) errors.push("파일 안에 프로젝트코드가 중복되었습니다.");
        if (code && existingCodes.has(code)) errors.push("이미 사용 중인 프로젝트코드입니다.");
        if (start.error) errors.push("시작일 형식이 올바르지 않습니다.");
        if (end.error) errors.push("종료예정일 형식이 올바르지 않습니다.");
        if (start.value && end.value && end.value < start.value) errors.push("종료예정일이 시작일보다 빠릅니다.");
        if (!VALID_STATUS.has(status ?? "")) errors.push("상태값이 올바르지 않습니다.");
        errors.push(...uniqueNameErrors(salesperson, entry.data.salespeople, "영업담당"));
        errors.push(...uniqueNameErrors(taskManager, entry.data.taskManagers, "공무담당"));
        if (processType && !processResult.data.some((process) => process.code === processType || process.name === processType)) errors.push("등록되지 않은 공정유형입니다.");
        if (missingVendors.length > 0) errors.push(`등록되지 않은 조립업체: ${missingVendors.join(", ")}`);
        return {
          rowNumber: index + 2, project_code: code, project_name: name,
          client_name: mergedValue(row, "발주처") || null, site_address: mergedValue(row, "현장주소") || null,
          salesperson: salesperson || null, task_manager: taskManager || null,
          process_type: processType, assembly_vendor: assemblyVendors[0] ?? null,
          assemblyVendorIds: assemblyVendors.flatMap((vendor) => {
            const matched = vendorByName.get(vendor);
            return matched ? [matched.id] : [];
          }),
          assemblyVendorNames: assemblyVendors,
          start_date: start.value, end_date: end.value,
          status: VALID_STATUS.has(status ?? "") ? String(status) : rawStatus,
          memo: text(row["메모"]) || null, errors,
        };
      }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "파일을 읽지 못했습니다.");
    } finally { setIsParsing(false); }
  }

  async function saveRows() {
    const targets = rows.filter((row) => row.errors.length === 0 && !row.saved);
    if (targets.length === 0 || isSaving) return;
    setIsSaving(true);
    const results = await Promise.allSettled(targets.map(async (row) => {
      const { rowNumber: _rowNumber, errors: _errors, saveError: _saveError, saved: _saved, assemblyVendorIds, assemblyVendorNames: _assemblyVendorNames, ...payload } = row;
      void _rowNumber; void _errors; void _saveError; void _saved; void _assemblyVendorNames;
      const { data, error } = await supabase.rpc("create_project_with_vendors", {
        p_project: payload,
        p_assembly_vendor_ids: assemblyVendorIds,
      });
      if (error) throw error;
      const projectId = Number(data);
      await addActivity({ type: "project_create", title: "프로젝트 생성", description: `${row.project_name} 프로젝트를 엑셀로 등록했습니다.`, projectId, targetType: "project", targetId: projectId, metadata: { source: "excel" } });
      return row.rowNumber;
    }));
    const outcome = new Map<number, string | null>();
    results.forEach((result, index) => outcome.set(targets[index].rowNumber, result.status === "fulfilled" ? null : result.reason instanceof Error ? result.reason.message : "등록 실패"));
    setRows((current) => current.map((row) => outcome.has(row.rowNumber) ? { ...row, saved: outcome.get(row.rowNumber) === null, saveError: outcome.get(row.rowNumber) ?? undefined } : row));
    const success = [...outcome.values()].filter((error) => error === null).length;
    const failed = outcome.size - success;
    if (success) { onCompleted(); toast.success(`${success}건의 프로젝트가 등록되었습니다.`); }
    if (failed) toast.error(`${failed}건 등록에 실패했습니다.`);
    setIsSaving(false);
  }

  const previewRows = useMemo(() => rows.slice(0, 200), [rows]);
  if (!open) return null;
  return <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="excel-upload-title" className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
      <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4"><div><h2 id="excel-upload-title" className="text-xl font-bold text-slate-950">프로젝트 엑셀 일괄 업로드</h2><p className="mt-1 text-xs text-slate-500">오류가 없는 행만 등록됩니다. 업무와 공정 Section은 생성하지 않습니다.</p></div><button onClick={requestClose} aria-label="닫기" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={19} /></button></header>
      <div className="overflow-y-auto p-6">
        <div className="flex flex-wrap justify-between gap-3"><Button variant="outline" onClick={() => void downloadTemplate()}><Download size={16} /> 엑셀 양식 다운로드</Button><input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void parseFile(file); event.currentTarget.value = ""; }} /></div>
        <button type="button" onClick={() => inputRef.current?.click()} onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }} onDragOver={(e) => e.preventDefault()} onDragLeave={() => setIsDragging(false)} onDrop={(e) => { e.preventDefault(); setIsDragging(false); const file = e.dataTransfer.files[0]; if (file) void parseFile(file); }} className={`mt-4 flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-8 transition ${isDragging ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-slate-50 hover:border-blue-300"}`}>
          {isParsing ? <Loader2 className="animate-spin text-blue-600" /> : <FileSpreadsheet className="text-emerald-600" />}<span className="mt-2 text-sm font-semibold text-slate-700">{fileName || "파일을 끌어놓거나 클릭해서 선택하세요"}</span><span className="mt-1 text-xs text-slate-400">.xlsx, .xls, .csv</span>
        </button>
        {rows.length > 0 && <><div className="my-4 flex flex-wrap gap-2 text-xs font-semibold"><span className="rounded-full bg-slate-100 px-3 py-1.5">전체 {rows.length}건</span><span className="rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-700">정상 {normalCount}건</span><span className="rounded-full bg-red-50 px-3 py-1.5 text-red-700">오류 {errorCount}건</span>{savedCount > 0 && <span className="rounded-full bg-blue-50 px-3 py-1.5 text-blue-700">성공 {savedCount}건</span>}</div><div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[1420px] text-xs"><thead className="bg-slate-50 text-slate-500"><tr>{["행", "프로젝트코드", "프로젝트명", "발주처", "영업담당", "공무담당", "공정유형", "조립업체", "시작일", "종료예정일", "상태", "검증 결과"].map((header) => <th key={header} className="px-3 py-2.5 text-left">{header}</th>)}</tr></thead><tbody>{previewRows.map((row) => <tr key={row.rowNumber} className={`border-t border-slate-100 ${row.errors.length || row.saveError ? "bg-red-50/60" : row.saved ? "bg-emerald-50/60" : ""}`}><td className="px-3 py-2">{row.rowNumber}</td><td className="px-3 py-2 font-semibold">{row.project_code || "-"}</td><td className="px-3 py-2">{row.project_name || "-"}</td><td className="px-3 py-2">{row.client_name || "-"}</td><td className="px-3 py-2">{row.salesperson || "-"}</td><td className="px-3 py-2">{row.task_manager || "-"}</td><td className="px-3 py-2">{row.process_type || "-"}</td><td className="px-3 py-2">{row.assemblyVendorNames.join(" · ") || "-"}</td><td className="px-3 py-2">{row.start_date || "-"}</td><td className="px-3 py-2">{row.end_date || "-"}</td><td className="px-3 py-2">{row.status}</td><td className={`max-w-[300px] px-3 py-2 ${row.errors.length || row.saveError ? "text-red-700" : "text-emerald-700"}`}>{row.saved ? "등록 완료" : row.saveError || row.errors.join(" / ") || "정상"}</td></tr>)}</tbody></table></div>{rows.length > 200 && <p className="mt-2 text-xs text-slate-500">미리보기는 처음 200행까지 표시합니다.</p>}</>}
      </div>
      <footer className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-6 py-4"><Button variant="outline" onClick={requestClose} disabled={isSaving}>닫기</Button><Button variant="primary" onClick={() => void saveRows()} disabled={normalCount === 0 || isSaving}>{isSaving ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}{isSaving ? "등록 중..." : `정상 ${normalCount}건 등록`}</Button></footer>
    </section>
  </div>;
}
