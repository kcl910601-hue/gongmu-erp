import { getLmeContext } from "@/lib/lme-server";
import { parseCostEntry } from "@/lib/project-costs-server";

type ImportRow = Record<string, unknown> & { excel_row?: number; project_code?: string; category_code?: string };
const ALLOWED_CODES = new Set(["subcontract","transportation","labor","installation","as_service","other"]);
function duplicateKey(row: { project_id:number; category_code:string; cost_date:string; supply_amount_krw:number; vat_amount_krw:number; vendor_name:string|null; cost_title:string; document_number:string|null }) {
  const identity=row.document_number?`doc:${row.document_number}`:`title:${row.cost_title}`;
  return [row.project_id,row.category_code,row.cost_date,row.supply_amount_krw,row.vat_amount_krw,row.vendor_name??"",identity].join("|").toLocaleLowerCase("ko-KR");
}
export async function POST(request:Request){
  const {supabase,user,employee}=await getLmeContext(); if(!user||!employee||employee.role!=="admin")return Response.json({error:"관리자 권한이 필요합니다."},{status:403});
  const body=await request.json() as {action?:string;file_name?:string;rows?:ImportRow[];duplicate_acknowledged?:boolean}; const rows=Array.isArray(body.rows)?body.rows:[];
  if(!rows.length||rows.length>1000)return Response.json({error:"비용 행은 1~1,000건이어야 합니다."},{status:400});
  const codes=[...new Set(rows.map(row=>typeof row.project_code==="string"?row.project_code.trim():"").filter(Boolean))];
  const [projectsResult,categoriesResult]=await Promise.all([supabase.from("projects").select("id,project_code,project_name").in("project_code",codes),supabase.from("project_cost_categories").select("id,code,name,is_active").in("code",[...ALLOWED_CODES])]);
  if(projectsResult.error||categoriesResult.error)return Response.json({error:projectsResult.error?.message??categoriesResult.error?.message},{status:500});
  const projects=new Map((projectsResult.data??[]).map(row=>[row.project_code,row])); const categories=new Map((categoriesResult.data??[]).filter(row=>row.is_active).map(row=>[row.code,row]));
  const normalized=rows.map((row,index)=>{
    const excelRow=Number.isInteger(row.excel_row)?Number(row.excel_row):index+5; const projectCode=typeof row.project_code==="string"?row.project_code.trim():""; const categoryCode=typeof row.category_code==="string"?row.category_code:""; const project=projects.get(projectCode); const category=categories.get(categoryCode);
    const parsed=parseCostEntry({...row,project_id:project?.id??0,category_code:categoryCode,payment_status:row.payment_status??"unpaid"}); const errors:string[]=[];
    if(!projectCode)errors.push("프로젝트 코드가 필요합니다."); else if(!project)errors.push(`프로젝트 코드 ${projectCode}를 찾을 수 없거나 접근 권한이 없습니다.`);
    if(!ALLOWED_CODES.has(categoryCode)||!category)errors.push("비용 분류가 올바르지 않습니다."); if(!parsed.data)errors.push("제목, 날짜, 금액, 지급상태 입력값을 확인해주세요.");
    return {excel_row:excelRow,project_code:projectCode,project_name:project?.project_name??"",category_name:category?.name??String(row.category_label??""),errors,data:parsed.data?{...parsed.data,category_id:category?.id??"",category_code:categoryCode}:null};
  });
  const valid=normalized.filter(row=>row.data!==null&&row.errors.length===0); const projectIds=[...new Set(valid.map(row=>row.data!.project_id))];
  const existing=projectIds.length?await supabase.from("project_cost_entries").select("project_id,category_id,cost_title,cost_date,vendor_name,document_number,supply_amount_krw,vat_amount_krw,status").in("project_id",projectIds).eq("status","confirmed"):{data:[],error:null};
  if(existing.error)return Response.json({error:existing.error.message},{status:500}); const categoryById=new Map((categoriesResult.data??[]).map(row=>[row.id,row.code])); const seen=new Map<string,number>(); const existingKeys=new Set((existing.data??[]).map(row=>duplicateKey({...row,category_code:categoryById.get(row.category_id)??"",supply_amount_krw:Number(row.supply_amount_krw),vat_amount_krw:Number(row.vat_amount_krw)})));
  const preview=normalized.map(row=>{if(!row.data||row.errors.length)return {...row,status:"ERROR" as const,warnings:[]};const key=duplicateKey(row.data);const previous=seen.get(key);const warnings:string[]=[];if(existingKeys.has(key))warnings.push("기존 등록 비용과 중복이 의심됩니다.");if(previous)warnings.push(`Excel ${previous}행과 중복이 의심됩니다.`);else seen.set(key,row.excel_row);return {...row,status:warnings.length?"DUPLICATE_WARNING" as const:"VALID" as const,warnings};});
  const totals=valid.reduce((sum,row)=>({supply:sum.supply+row.data!.supply_amount_krw,vat:sum.vat+row.data!.vat_amount_krw,total:sum.total+row.data!.total_amount_krw}),{supply:0,vat:0,total:0});
  if(body.action!=="commit")return Response.json({rows:preview,summary:{row_count:rows.length,valid:preview.filter(r=>r.status==="VALID").length,duplicate:preview.filter(r=>r.status==="DUPLICATE_WARNING").length,error:preview.filter(r=>r.status==="ERROR").length,supply:totals.supply,vat:totals.vat,grand_total:totals.total}});
  if(preview.some(row=>row.status==="ERROR"))return Response.json({error:"오류 행이 있어 등록할 수 없습니다.",rows:preview},{status:400}); if(preview.some(row=>row.status==="DUPLICATE_WARNING")&&!body.duplicate_acknowledged)return Response.json({error:"중복 의심 항목 확인이 필요합니다."},{status:409});
  const payload=valid.map(row=>({project_code:row.project_code,category_code:row.data!.category_code,cost_title:row.data!.cost_title,cost_date:row.data!.cost_date,recognition_date:row.data!.recognition_date,vendor_name:row.data!.vendor_name,document_number:row.data!.document_number,supply_amount_krw:row.data!.supply_amount_krw,vat_amount_krw:row.data!.vat_amount_krw,payment_status:row.data!.payment_status,memo:row.data!.memo}));
  const result=await supabase.rpc("import_project_cost_entries",{p_file_name:typeof body.file_name==="string"?body.file_name.slice(0,255):"비용등록.xlsx",p_rows:payload}); if(result.error)return Response.json({error:result.error.message},{status:409}); return Response.json({result:result.data,summary:{count:payload.length,...totals}},{status:201});
}
