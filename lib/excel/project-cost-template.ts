import XLSX from "xlsx-js-style";
import { COST_IMPORT_HEADERS } from "../project-cost-import.ts";
import { PAYMENT_STATUS_LABEL } from "../project-costs.ts";
import { getProjectStatusLabel } from "../status.ts";

export type CostTemplateProject = { project_code: string | null; project_name: string; client_name: string | null; salesperson: string | null; task_manager: string | null; status: string | null };
type Sheet = XLSX.WorkSheet & { "!freeze"?: { xSplit: number; ySplit: number }; "!dataValidation"?: Array<Record<string, unknown>> };
const categories = ["외주비", "운송비", "노무비", "설치비", "AS 비용", "기타 비용"];
function today(date: Date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`; }
export function getProjectCostTemplateFileName(date: Date) { return `프로젝트_비용등록_양식_${today(date)}.xlsx`; }
export function buildProjectCostTemplate(projects: CostTemplateProject[]) {
  const inputRows = [["프로젝트 비용 등록 양식"], ["양식 버전: 1 · 부가세 빈칸은 공급가액의 10%, 0은 부가세 없음으로 처리됩니다."], [], [...COST_IMPORT_HEADERS]];
  const input = XLSX.utils.aoa_to_sheet(inputRows) as Sheet;
  const projectSheet = XLSX.utils.aoa_to_sheet([["프로젝트 코드","프로젝트명","발주처","영업담당","업무담당","상태"], ...projects.filter(p=>p.project_code).map(p=>[p.project_code,p.project_name,p.client_name??"",p.salesperson??"",p.task_manager??"",getProjectStatusLabel(p.status)])]) as Sheet;
  const guide = XLSX.utils.aoa_to_sheet([["양식 버전",1],["컬럼","필수","입력 안내"],["프로젝트 코드","필수","프로젝트 목록 Sheet의 현재 코드를 입력합니다."],["프로젝트명","선택","사람 확인용이며 연결 기준이 아닙니다."],["비용 분류","필수",categories.join(" / ")],["비용 제목","필수","200자 이하"],["비용 발생일","필수","YYYY-MM-DD"],["비용 귀속일","선택","YYYY-MM-DD"],["공급가액","필수","0 이상 정수이며 공급가액+부가세는 0보다 커야 합니다."],["부가세","선택","빈칸=10% 자동, 0=없음, 숫자=직접 입력"],["지급상태","선택",`${Object.values(PAYMENT_STATUS_LABEL).join(" / ")} (빈칸=미지급)`],["메모","선택","줄바꿈 가능, 2,000자 이하"]]);
  input["!merges"]=[{s:{r:0,c:0},e:{r:0,c:COST_IMPORT_HEADERS.length-1}},{s:{r:1,c:0},e:{r:1,c:COST_IMPORT_HEADERS.length-1}}]; input["!autofilter"]={ref:"A4:L1004"}; input["!freeze"]={xSplit:0,ySplit:4}; input["!cols"]=[18,28,16,28,14,14,24,18,16,14,14,36].map(wch=>({wch}));
  input["!dataValidation"]=[{sqref:"A5:A1004",type:"list",formula1:`'프로젝트 목록'!$A$2:$A$${Math.max(projects.length+1,2)}`},{sqref:"C5:C1004",type:"list",formula1:`"${categories.join(",")}"`},{sqref:"K5:K1004",type:"list",formula1:`"${Object.values(PAYMENT_STATUS_LABEL).join(",")}"`}];
  const range=XLSX.utils.decode_range(input["!ref"]??"A1:A4"); for(let r=0;r<=range.e.r;r++)for(let c=0;c<=range.e.c;c++){const cell=input[XLSX.utils.encode_cell({r,c})]??(input[XLSX.utils.encode_cell({r,c})]={t:"s",v:""});cell.s={font:{name:"맑은 고딕",sz:10,color:{rgb:"334155"}},alignment:{vertical:"center",wrapText:c===11}};if(r===0)cell.s={fill:{fgColor:{rgb:"0F172A"}},font:{name:"맑은 고딕",sz:16,bold:true,color:{rgb:"FFFFFF"}}};if(r===3)cell.s={fill:{fgColor:{rgb:"1E3A5F"}},font:{name:"맑은 고딕",sz:10,bold:true,color:{rgb:"FFFFFF"}},alignment:{horizontal:"center",vertical:"center"}};}
  const workbook=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook,input,"비용 입력"); XLSX.utils.book_append_sheet(workbook,projectSheet,"프로젝트 목록"); XLSX.utils.book_append_sheet(workbook,guide,"작성 안내"); return workbook;
}
export function downloadProjectCostTemplate(projects: CostTemplateProject[], date=new Date()){XLSX.writeFile(buildProjectCostTemplate(projects),getProjectCostTemplateFileName(date),{compression:true});}
