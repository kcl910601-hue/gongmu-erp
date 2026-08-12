import XLSX from "xlsx-js-style";
import { formatTaskNoteForExport } from "../task-notes.ts";

export type GanttExportTemplate = "current" | "project" | "summary";

export type GanttExcelTask = {
  projectCode: string | null;
  projectName: string;
  orderer?: string | null;
  projectStartDate?: string | null;
  projectEndDate?: string | null;
  taskName: string | null;
  taskTypeName: string;
  assignee: string | null;
  statusLabel: string;
  status: string | null;
  startDate: string;
  endDate: string;
  progress: number | null;
  delayed: boolean;
  displayOrder?: number;
  ganttColor?: string;
  memo?: string | null;
  memoIsImportant?: boolean;
  memoCheckDate?: string | null;
};

export type GanttExcelOptions = {
  tasks: GanttExcelTask[];
  startDate: string;
  endDate: string;
  today: string;
  generatedAt: Date;
  filterSummary?: string;
};

type LayoutSheet = XLSX.WorkSheet & {
  "!freeze"?: { xSplit: number; ySplit: number };
  "!pageSetup"?: { orientation: "landscape"; fitToWidth: number; fitToHeight: number };
  "!margins"?: { left: number; right: number; top: number; bottom: number; header: number; footer: number };
  "!repeatRows"?: string;
};

type ProjectExportGroup = { key: string; projectCode: string | null; projectName: string; orderer: string | null; startDate: string; endDate: string; tasks: GanttExcelTask[] };

const CURRENT_HEADERS = ["프로젝트 코드", "현장/프로젝트명", "업무명", "업무 유형", "담당자", "상태", "시작일", "종료일", "기간", "진행률"];
const PROJECT_HEADERS = ["공정/업무명", "업무 유형", "담당자", "상태", "시작일", "종료일", "기간", "진행률", "메모"];
const BORDER = { style: "thin", color: { rgb: "D8DEE9" } } as const;
const FONT = "맑은 고딕";

function parseDate(value: string) { return new Date(`${value}T00:00:00`); }
function formatDate(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
export function getGanttExportDates(startDate: string, endDate: string) {
  const dates: string[] = [];
  for (let cursor = parseDate(startDate), end = parseDate(endDate); cursor <= end; cursor.setDate(cursor.getDate() + 1)) dates.push(formatDate(cursor));
  return dates;
}
export function filterGanttTasksForRange(tasks: GanttExcelTask[], startDate: string, endDate: string) {
  return tasks.filter((task) => task.startDate <= endDate && task.endDate >= startDate);
}
function duration(startDate: string, endDate: string) { return Math.floor((parseDate(endDate).getTime() - parseDate(startDate).getTime()) / 86_400_000) + 1; }
function statusFill(task: Pick<GanttExcelTask, "delayed" | "status">) {
  if (task.delayed) return "FECACA";
  if (task.status === "completed") return "BBF7D0";
  if (task.status === "in_progress") return "BFDBFE";
  return "E2E8F0";
}
function safeFilePart(value: string) { return value.replace(/[\\/:*?"<>|]/g, "_").replace(/[. ]+$/g, "").trim().slice(0, 80); }
export function getGanttExcelFileName(date: string, projectName?: string) {
  const prefix = projectName ? `${safeFilePart(projectName)}_` : "공무팀_";
  return `${prefix}간트차트_${date}.xlsx`;
}
export function getTemplateFileName(template: GanttExportTemplate, date: string, projectName?: string) {
  if (template === "current") return getGanttExcelFileName(date, projectName);
  if (template === "project") return projectName ? `${safeFilePart(projectName)}_공정표_${date}.xlsx` : `현장공정표_${date}.xlsx`;
  return `프로젝트_공정현황_${date}.xlsx`;
}

function safeSheetBase(value: string) { return value.replace(/[\\/?*:[\]]/g, "_").trim().slice(0, 31) || "프로젝트"; }
export function createUniqueSheetName(value: string, used: Set<string>) {
  const base = safeSheetBase(value);
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate.toLocaleLowerCase("ko-KR"))) {
    const tail = `(${suffix})`;
    candidate = `${base.slice(0, 31 - tail.length)}${tail}`;
    suffix += 1;
  }
  used.add(candidate.toLocaleLowerCase("ko-KR"));
  return candidate;
}

export function groupGanttTasksByProject(tasks: GanttExcelTask[]): ProjectExportGroup[] {
  const groups = new Map<string, ProjectExportGroup>();
  tasks.forEach((task) => {
    const key = JSON.stringify([task.projectCode ?? "", task.projectName]);
    const current = groups.get(key);
    if (current) current.tasks.push(task);
    else groups.set(key, { key, projectCode: task.projectCode, projectName: task.projectName, orderer: task.orderer ?? null, startDate: task.projectStartDate || "", endDate: task.projectEndDate || "", tasks: [task] });
  });
  return Array.from(groups.values()).map((group) => ({
    ...group,
    startDate: group.startDate || group.tasks.reduce((min, task) => task.startDate < min ? task.startDate : min, group.tasks[0].startDate),
    endDate: group.endDate || group.tasks.reduce((max, task) => task.endDate > max ? task.endDate : max, group.tasks[0].endDate),
  }));
}

function styleTimelineSheet(sheet: LayoutSheet, headerRows: number, fixedColumns: number, dates: string[], tasks: GanttExcelTask[], today: string, progressColumn = fixedColumns - 1) {
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1");
  sheet["!freeze"] = { xSplit: fixedColumns, ySplit: headerRows };
  sheet["!pageSetup"] = { orientation: "landscape", fitToWidth: 1, fitToHeight: 0 };
  sheet["!margins"] = { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 };
  for (let r = 0; r <= range.e.r; r += 1) for (let c = 0; c <= range.e.c; c += 1) {
    const address = XLSX.utils.encode_cell({ r, c });
    const cell = sheet[address] ?? (sheet[address] = { t: "s", v: "" });
    cell.s = { font: { name: FONT, sz: 10, color: { rgb: "334155" } }, alignment: { vertical: "center", horizontal: c >= fixedColumns ? "center" : "left" } };
    if (r === 0) cell.s = { fill: { fgColor: { rgb: "0F172A" } }, font: { name: FONT, sz: 16, bold: true, color: { rgb: "FFFFFF" } }, alignment: { vertical: "center", horizontal: "left" } };
    else if (r < headerRows - 2) cell.s = { fill: { fgColor: { rgb: "F1F5F9" } }, font: { name: FONT, sz: 9, color: { rgb: "64748B" } }, alignment: { vertical: "center", horizontal: "left" } };
    else if (r < headerRows) cell.s = { fill: { fgColor: { rgb: r === headerRows - 2 ? "1E3A5F" : "E2E8F0" } }, font: { name: FONT, sz: 9, bold: true, color: { rgb: r === headerRows - 2 ? "FFFFFF" : "334155" } }, alignment: { vertical: "center", horizontal: "center", wrapText: true }, border: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER } };
    else {
      const task = tasks[r - headerRows];
      const date = dates[c - fixedColumns];
      cell.s.border = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
      if (c === progressColumn && typeof cell.v === "number" && task.progress !== null) cell.z = "0%";
      if (c === 0) cell.s.alignment = { vertical: "center", horizontal: "left", wrapText: true };
      if (date) {
        const day = parseDate(date).getDay();
        if (day === 0 || day === 6) cell.s.fill = { fgColor: { rgb: "F8FAFC" } };
        if (date === today) cell.s.fill = { fgColor: { rgb: "FEF3C7" } };
        if (date >= task.startDate && date <= task.endDate) cell.s.fill = { fgColor: { rgb: task.ganttColor ?? statusFill(task) } };
      }
    }
  }
}

function appendDateHeaderMerges(sheet: LayoutSheet, dates: string[], headerRow: number, fixedColumns: number) {
  const lastColumn = fixedColumns + dates.length - 1;
  let monthStart = fixedColumns;
  while (monthStart <= lastColumn) {
    const month = dates[monthStart - fixedColumns]?.slice(0, 7);
    let monthEnd = monthStart;
    while (monthEnd + 1 <= lastColumn && dates[monthEnd + 1 - fixedColumns]?.slice(0, 7) === month) monthEnd += 1;
    sheet["!merges"]?.push({ s: { r: headerRow, c: monthStart }, e: { r: headerRow, c: monthEnd } });
    monthStart = monthEnd + 1;
  }
}

export function renderCurrentViewWorkbook(options: GanttExcelOptions) {
  const dates = getGanttExportDates(options.startDate, options.endDate);
  const lastColumn = CURRENT_HEADERS.length + dates.length - 1;
  const rows: Array<Array<string | number>> = [
    ["공무팀 프로젝트 간트차트"],
    [`생성: ${options.generatedAt.toLocaleString("ko-KR")} · 기간: ${options.startDate} ~ ${options.endDate}${options.filterSummary ? ` · ${options.filterSummary}` : ""}`],
    [...CURRENT_HEADERS, ...dates.map((date) => date.slice(0, 7))],
    [...CURRENT_HEADERS.map(() => ""), ...dates.map((date) => `${Number(date.slice(8))} (${["일", "월", "화", "수", "목", "금", "토"][parseDate(date).getDay()]})`)],
    ...options.tasks.map((task) => [task.projectCode || "-", task.projectName, task.taskName || "업무명 없음", task.taskTypeName || "미지정", task.assignee || "미배정", task.statusLabel, task.startDate, task.endDate, duration(task.startDate, task.endDate), task.progress === null ? "" : task.progress / 100, ...dates.map(() => "")]),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows) as LayoutSheet;
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "간트차트");
  sheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: lastColumn } }, { s: { r: 1, c: 0 }, e: { r: 1, c: lastColumn } }, ...CURRENT_HEADERS.map((_, c) => ({ s: { r: 2, c }, e: { r: 3, c } }))];
  appendDateHeaderMerges(sheet, dates, 2, CURRENT_HEADERS.length);
  sheet["!cols"] = [12, 24, 26, 16, 12, 12, 12, 12, 8, 9].map((wch) => ({ wch })).concat(dates.map(() => ({ wch: 5.5 })));
  sheet["!rows"] = [{ hpt: 27 }, { hpt: 20 }, { hpt: 22 }, { hpt: 30 }, ...options.tasks.map(() => ({ hpt: 22 }))];
  styleTimelineSheet(sheet, 4, CURRENT_HEADERS.length, dates, options.tasks, options.today);
  return workbook;
}

export function renderProjectScheduleWorkbook(options: GanttExcelOptions) {
  const workbook = XLSX.utils.book_new();
  const used = new Set<string>();
  const dates = getGanttExportDates(options.startDate, options.endDate);
  for (const group of groupGanttTasksByProject(options.tasks)) {
    const lastColumn = PROJECT_HEADERS.length + dates.length - 1;
    const rows: Array<Array<string | number>> = [
      ["프로젝트 일정 공정표"], [`현장명: ${group.projectName}`], [`프로젝트 코드: ${group.projectCode || "-"}`], [`발주처: ${group.orderer || "-"}`], [`기간: ${options.startDate} ~ ${options.endDate}`], [`출력일: ${formatDate(options.generatedAt)}`],
      [...PROJECT_HEADERS, ...dates.map((date) => date.slice(0, 7))], [...PROJECT_HEADERS.map(() => ""), ...dates.map((date) => `${Number(date.slice(8))} (${["일", "월", "화", "수", "목", "금", "토"][parseDate(date).getDay()]})`)],
      ...group.tasks.map((task) => [task.taskName || "업무명 없음", task.taskTypeName || "미지정", task.assignee || "미배정", task.statusLabel, task.startDate, task.endDate, duration(task.startDate, task.endDate), task.progress === null ? "" : task.progress / 100, formatTaskNoteForExport(task.memo ? { note: task.memo, isImportant: Boolean(task.memoIsImportant), checkDate: task.memoCheckDate ?? null } : null), ...dates.map(() => "")]),
    ];
    const sheet = XLSX.utils.aoa_to_sheet(rows) as LayoutSheet;
    sheet["!merges"] = Array.from({ length: 6 }, (_, r) => ({ s: { r, c: 0 }, e: { r, c: lastColumn } })).concat(PROJECT_HEADERS.map((_, c) => ({ s: { r: 6, c }, e: { r: 7, c } })));
    appendDateHeaderMerges(sheet, dates, 6, PROJECT_HEADERS.length);
    sheet["!cols"] = [30, 16, 14, 12, 12, 12, 8, 9, 34].map((wch) => ({ wch })).concat(dates.map(() => ({ wch: 5.5 })));
    sheet["!rows"] = [{ hpt: 28 }, ...Array.from({ length: 5 }, () => ({ hpt: 19 })), { hpt: 22 }, { hpt: 30 }, ...group.tasks.map(() => ({ hpt: 30 }))];
    sheet["!repeatRows"] = "7:8";
    styleTimelineSheet(sheet, 8, PROJECT_HEADERS.length, dates, group.tasks, options.today, 7);
    XLSX.utils.book_append_sheet(workbook, sheet, createUniqueSheetName(group.projectName, used));
  }
  return workbook;
}

export function renderSummaryWorkbook(options: GanttExcelOptions) {
  const groups = groupGanttTasksByProject(options.tasks);
  const dates = getGanttExportDates(options.startDate, options.endDate);
  const total = options.tasks.length;
  const completed = options.tasks.filter((task) => task.status === "completed").length;
  const inProgress = options.tasks.filter((task) => task.status === "in_progress" && !task.delayed).length;
  const delayed = options.tasks.filter((task) => task.delayed).length;
  const pending = total - completed - inProgress - delayed;
  const fixedColumns = 8;
  const rows: Array<Array<string | number>> = [
    ["프로젝트 공정 현황 요약"], [`기간: ${options.startDate} ~ ${options.endDate} · 출력일: ${formatDate(options.generatedAt)}${options.filterSummary ? ` · ${options.filterSummary}` : ""}`],
    ["프로젝트", groups.length, "전체 업무", total, "진행", inProgress, "완료", completed, "지연", delayed, "예정", pending], [],
    ["프로젝트명", "전체 업무", "진행", "완료", "지연", "전체 공정률", "시작일", "종료예정일", ...dates.map((date) => date.slice(0, 7))],
    ["", "", "", "", "", "", "", "", ...dates.map((date) => `${Number(date.slice(8))} (${["일", "월", "화", "수", "목", "금", "토"][parseDate(date).getDay()]})`)],
    ...groups.map((group) => {
      const groupCompleted = group.tasks.filter((task) => task.status === "completed").length;
      const groupDelayed = group.tasks.filter((task) => task.delayed).length;
      const groupProgress = group.tasks.length ? group.tasks.reduce((sum, task) => sum + (task.progress ?? 0), 0) / group.tasks.length / 100 : 0;
      return [group.projectName, group.tasks.length, group.tasks.filter((task) => task.status === "in_progress" && !task.delayed).length, groupCompleted, groupDelayed, groupProgress, group.startDate, group.endDate, ...dates.map(() => "")];
    }),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows) as LayoutSheet;
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "요약");
  const lastColumn = fixedColumns + dates.length - 1;
  sheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: lastColumn } }, { s: { r: 1, c: 0 }, e: { r: 1, c: lastColumn } }, ...Array.from({ length: fixedColumns }, (_, c) => ({ s: { r: 4, c }, e: { r: 5, c } }))];
  appendDateHeaderMerges(sheet, dates, 4, fixedColumns);
  sheet["!cols"] = [28, 10, 9, 9, 9, 12, 12, 14].map((wch) => ({ wch })).concat(dates.map(() => ({ wch: 5.5 })));
  sheet["!freeze"] = { xSplit: fixedColumns, ySplit: 6 };
  sheet["!pageSetup"] = { orientation: "landscape", fitToWidth: 1, fitToHeight: 0 };
  sheet["!margins"] = { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 };
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1");
  for (let r = 0; r <= range.e.r; r += 1) for (let c = 0; c <= range.e.c; c += 1) {
    const address = XLSX.utils.encode_cell({ r, c });
    const cell = sheet[address] ?? (sheet[address] = { t: "s", v: "" });
    cell.s = { font: { name: FONT, sz: 10, color: { rgb: "334155" } }, alignment: { vertical: "center", horizontal: c === 0 ? "left" : "center" } };
    if (r === 0) cell.s = { fill: { fgColor: { rgb: "0F172A" } }, font: { name: FONT, sz: 16, bold: true, color: { rgb: "FFFFFF" } }, alignment: { vertical: "center", horizontal: "left" } };
    else if (r === 2) cell.s = { fill: { fgColor: { rgb: "EFF6FF" } }, font: { name: FONT, sz: 11, bold: c % 2 === 1, color: { rgb: c === 9 && delayed > 0 ? "B91C1C" : "1E3A5F" } }, alignment: { vertical: "center", horizontal: "center" } };
    else if (r === 4 || r === 5) cell.s = { fill: { fgColor: { rgb: r === 4 ? "1E3A5F" : "E2E8F0" } }, font: { name: FONT, sz: 9, bold: true, color: { rgb: r === 4 ? "FFFFFF" : "334155" } }, alignment: { vertical: "center", horizontal: "center", wrapText: true }, border: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER } };
    else if (r >= 6) {
      const group = groups[r - 6];
      cell.s.border = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
      if (c === 5 && typeof cell.v === "number") cell.z = "0%";
      if (c === 4 && Number(cell.v) > 0) cell.s.font = { name: FONT, sz: 10, bold: true, color: { rgb: "B91C1C" } };
      const date = dates[c - fixedColumns];
      if (date && date >= group.startDate && date <= group.endDate) cell.s.fill = { fgColor: { rgb: group.tasks.some((task) => task.delayed) ? "FCA5A5" : group.tasks.every((task) => task.status === "completed") ? "86EFAC" : "93C5FD" } };
    }
  }
  return workbook;
}

export function buildGanttWorkbook(options: GanttExcelOptions) { return renderCurrentViewWorkbook(options); }
export function buildGanttTemplateWorkbook(template: GanttExportTemplate, options: GanttExcelOptions) {
  if (template === "project") return renderProjectScheduleWorkbook(options);
  if (template === "summary") return renderSummaryWorkbook(options);
  return renderCurrentViewWorkbook(options);
}
export function downloadGanttWorkbook(options: GanttExcelOptions, fileName: string, template: GanttExportTemplate = "current") {
  XLSX.writeFile(buildGanttTemplateWorkbook(template, options), fileName, { compression: true });
}
