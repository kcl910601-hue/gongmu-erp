import XLSX from "xlsx-js-style";

export type GanttExcelTask = {
  projectCode: string | null;
  projectName: string;
  taskName: string | null;
  assignee: string | null;
  statusLabel: string;
  status: string | null;
  startDate: string;
  endDate: string;
  progress: number | null;
  delayed: boolean;
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
};

const STATIC_HEADERS = ["프로젝트 코드", "현장/프로젝트명", "업무명", "담당자", "상태", "시작일", "종료일", "기간", "진행률"];
const BORDER = { style: "thin", color: { rgb: "D8DEE9" } } as const;

function parseDate(value: string) { return new Date(`${value}T00:00:00`); }
function formatDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function getGanttExportDates(startDate: string, endDate: string) {
  const dates: string[] = [];
  for (let cursor = parseDate(startDate), end = parseDate(endDate); cursor <= end; cursor.setDate(cursor.getDate() + 1)) dates.push(formatDate(cursor));
  return dates;
}
export function filterGanttTasksForRange(tasks: GanttExcelTask[], startDate: string, endDate: string) {
  return tasks.filter((task) => task.startDate <= endDate && task.endDate >= startDate);
}
function duration(startDate: string, endDate: string) {
  return Math.floor((parseDate(endDate).getTime() - parseDate(startDate).getTime()) / 86_400_000) + 1;
}
function statusFill(task: GanttExcelTask) {
  if (task.delayed) return "FECACA";
  if (task.status === "completed") return "BBF7D0";
  if (task.status === "in_progress") return "BFDBFE";
  return "E2E8F0";
}
function safeFilePart(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "_").replace(/[. ]+$/g, "").trim().slice(0, 80);
}
export function getGanttExcelFileName(date: string, projectName?: string) {
  const prefix = projectName ? `${safeFilePart(projectName)}_` : "공무팀_";
  return `${prefix}간트차트_${date}.xlsx`;
}

export function buildGanttWorkbook(options: GanttExcelOptions) {
  const dates = getGanttExportDates(options.startDate, options.endDate);
  const lastColumn = STATIC_HEADERS.length + dates.length - 1;
  const rows: Array<Array<string | number>> = [
    ["공무팀 프로젝트 간트차트"],
    [`생성: ${options.generatedAt.toLocaleString("ko-KR")} · 기간: ${options.startDate} ~ ${options.endDate}${options.filterSummary ? ` · ${options.filterSummary}` : ""}`],
    [...STATIC_HEADERS, ...dates.map((date) => date.slice(0, 7))],
    [...STATIC_HEADERS.map(() => ""), ...dates.map((date) => `${Number(date.slice(8))} (${["일", "월", "화", "수", "목", "금", "토"][parseDate(date).getDay()]})`)],
    ...options.tasks.map((task) => [
      task.projectCode || "-", task.projectName, task.taskName || "업무명 없음", task.assignee || "미배정",
      task.statusLabel, task.startDate, task.endDate, duration(task.startDate, task.endDate), task.progress === null ? "" : task.progress / 100,
      ...dates.map(() => ""),
    ]),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows) as LayoutSheet;
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "간트차트");
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1");
  sheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: lastColumn } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: lastColumn } },
    ...STATIC_HEADERS.map((_, index) => ({ s: { r: 2, c: index }, e: { r: 3, c: index } })),
  ];
  let monthStart = STATIC_HEADERS.length;
  while (monthStart <= lastColumn) {
    const month = dates[monthStart - STATIC_HEADERS.length]?.slice(0, 7);
    let monthEnd = monthStart;
    while (monthEnd + 1 <= lastColumn && dates[monthEnd + 1 - STATIC_HEADERS.length]?.slice(0, 7) === month) monthEnd += 1;
    sheet["!merges"].push({ s: { r: 2, c: monthStart }, e: { r: 2, c: monthEnd } });
    monthStart = monthEnd + 1;
  }
  sheet["!cols"] = [12, 24, 26, 12, 12, 12, 12, 8, 9].map((wch) => ({ wch }));
  sheet["!cols"].push(...dates.map(() => ({ wch: 5.5 })));
  sheet["!rows"] = [{ hpt: 27 }, { hpt: 20 }, { hpt: 22 }, { hpt: 30 }, ...options.tasks.map(() => ({ hpt: 22 }))];
  sheet["!freeze"] = { xSplit: STATIC_HEADERS.length, ySplit: 4 };
  sheet["!pageSetup"] = { orientation: "landscape", fitToWidth: 1, fitToHeight: 0 };
  sheet["!margins"] = { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 };
  for (let r = 0; r <= range.e.r; r += 1) for (let c = 0; c <= range.e.c; c += 1) {
    const cell = sheet[XLSX.utils.encode_cell({ r, c })] ?? (sheet[XLSX.utils.encode_cell({ r, c })] = { t: "s", v: "" });
    cell.s = { font: { name: "맑은 고딕", sz: 10, color: { rgb: "334155" } }, alignment: { vertical: "center", horizontal: c >= 4 ? "center" : "left" } };
    if (r === 0) cell.s = { fill: { fgColor: { rgb: "0F172A" } }, font: { name: "맑은 고딕", sz: 16, bold: true, color: { rgb: "FFFFFF" } }, alignment: { vertical: "center", horizontal: "left" } };
    else if (r === 1) cell.s = { fill: { fgColor: { rgb: "F1F5F9" } }, font: { name: "맑은 고딕", sz: 9, color: { rgb: "64748B" } }, alignment: { vertical: "center", horizontal: "left" } };
    else if (r <= 3) cell.s = { fill: { fgColor: { rgb: r === 2 ? "1E3A5F" : "E2E8F0" } }, font: { name: "맑은 고딕", sz: 9, bold: true, color: { rgb: r === 2 ? "FFFFFF" : "334155" } }, alignment: { vertical: "center", horizontal: "center", wrapText: true }, border: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER } };
    else {
      const task = options.tasks[r - 4];
      const date = dates[c - STATIC_HEADERS.length];
      const previous = options.tasks[r - 5];
      const projectTop = !previous || previous.projectCode !== task.projectCode || previous.projectName !== task.projectName;
      cell.s.border = { bottom: BORDER, left: BORDER, right: BORDER, ...(projectTop ? { top: { style: "medium", color: { rgb: "94A3B8" } } } : { top: BORDER }) };
      if (c === 8 && typeof cell.v === "number") cell.z = "0%";
      if (date) {
        const day = parseDate(date).getDay();
        if (day === 0 || day === 6) cell.s.fill = { fgColor: { rgb: "F8FAFC" } };
        if (date === options.today) cell.s.fill = { fgColor: { rgb: "FEF3C7" } };
        if (date >= task.startDate && date <= task.endDate) cell.s.fill = { fgColor: { rgb: statusFill(task) } };
      }
    }
  }
  return workbook;
}

export function downloadGanttWorkbook(options: GanttExcelOptions, fileName: string) {
  XLSX.writeFile(buildGanttWorkbook(options), fileName, { compression: true });
}
