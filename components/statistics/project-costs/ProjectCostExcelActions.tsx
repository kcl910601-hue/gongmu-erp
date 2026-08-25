"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ProjectCostExcelImportDialog } from "./ProjectCostExcelImportDialog";
import { downloadProjectCostTemplate, type CostTemplateProject } from "@/lib/excel/project-cost-template";
import { downloadProjectCostExport, type ProjectCostExportRow } from "@/lib/excel/project-cost-export";
import { toast } from "@/lib/toast";

type CostFilters={query:string;project_status:string;salesperson:string;task_manager:string;process_type:string;start_date_from:string;start_date_to:string;has_cost:string;category_code:string};
export function ProjectCostExcelActions({ projects, filters, canManage, onCompleted }: { projects: CostTemplateProject[]; filters: CostFilters; canManage: boolean; onCompleted: () => void | Promise<void> }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [dialog, setDialog] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [exporting, setExporting] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setTarget(document.querySelector<HTMLElement>("main > header")), 0);
    return () => window.clearTimeout(timer);
  }, []);
  if (!target) return null;
  async function download() {
    if (downloading) return;
    setDownloading(true);
    try {
      const response = await fetch("/api/statistics/project-costs/projects");
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "프로젝트 목록을 조회하지 못했습니다.");
      downloadProjectCostTemplate((body.projects ?? projects) as CostTemplateProject[]);
      toast.success("프로젝트 비용 Excel 양식을 다운로드했습니다.");
    }
    catch (reason) { console.error("project cost template error", reason); toast.error("Excel 양식 생성에 실패했습니다."); }
    finally { setDownloading(false); }
  }
  async function exportCurrentCosts(){if(exporting)return;setExporting(true);try{const params=new URLSearchParams({include_entries:"true"});Object.entries(filters).forEach(([key,value])=>{if(value)params.set(key,value)});const response=await fetch(`/api/statistics/project-costs/projects?${params}`);const body=await response.json();if(!response.ok)throw new Error(body.error??"비용 내역을 조회하지 못했습니다.");const rows=(body.export_entries??[]) as ProjectCostExportRow[];if(!rows.length){toast.error("다운로드할 비용 내역이 없습니다.");return;}const categoryName=(body.categories as Array<{code:string;name:string}>|undefined)?.find(item=>item.code===filters.category_code)?.name;const summary=[filters.query?`검색: ${filters.query}`:"",filters.project_status?`프로젝트 상태: ${filters.project_status}`:"",filters.salesperson?`영업담당: ${filters.salesperson}`:"",filters.task_manager?`업무담당: ${filters.task_manager}`:"",filters.process_type?`공정: ${filters.process_type}`:"",filters.has_cost?`비용 등록: ${filters.has_cost==="true"?"등록":"미등록"}`:"",categoryName?`비용 분류: ${categoryName}`:"",filters.start_date_from||filters.start_date_to?`프로젝트 시작일: ${filters.start_date_from||"처음"} ~ ${filters.start_date_to||"현재"}`:""] .filter(Boolean).join(" · ")||"전체";downloadProjectCostExport({rows,filterSummary:summary,generatedAt:new Date()});toast.success(`프로젝트 비용 내역 ${rows.length}건을 다운로드했습니다.`);}catch(reason){console.error("project cost export error",reason);toast.error("프로젝트 비용내역 Excel 생성에 실패했습니다.");}finally{setExporting(false);}}
  return createPortal(<><div className="flex shrink-0 flex-wrap gap-2">{canManage&&<Button variant="outline" disabled={downloading} onClick={download}><Download size={15} className="mr-1" />Excel 양식</Button>}<Button variant="outline" disabled={exporting} onClick={()=>void exportCurrentCosts()}><Download size={15} className="mr-1" />{exporting?"생성 중...":"현재 비용 다운로드"}</Button>{canManage&&<Button variant="outline" onClick={() => setDialog(true)}><Upload size={15} className="mr-1" />Excel 업로드</Button>}</div>{canManage&&dialog && <ProjectCostExcelImportDialog onClose={() => setDialog(false)} onCompleted={onCompleted} />}</>, target);
}
