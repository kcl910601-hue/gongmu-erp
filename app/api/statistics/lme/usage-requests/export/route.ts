import { getLmeContext } from "@/lib/lme-server";
import { MATERIAL_USAGE_GROUP_CATEGORY_LABELS, type MaterialUsageGroupCategory } from "@/lib/material-usage-groups";

const csv=(value:unknown)=>`"${String(value??"").replaceAll('"','""')}"`;
type ExportRow={project_id:number|null;group_name:string|null;group_category:string|null;group_sequence:number|null;material_code:string;quantity_tons:number|string;allocated_tons:number|string;unallocated_tons:number|string;purchase_order_no:string|null;usage_date:string;status:string};

export async function GET(){
  const {supabase,employee}=await getLmeContext();
  if(!employee)return Response.json({error:"승인된 사용자만 조회할 수 있습니다."},{status:403});
  const result=await supabase.rpc("get_material_usage_requests_v2",{p_project_id:null});
  if(result.error)return Response.json({error:result.error.message},{status:500});
  const header=["프로젝트","사용 구분","구분 종류","차수","자재","요청량(t)","배정량(t)","미배정량(t)","발주번호","사용일","상태"];
  const rows=((result.data??[]) as ExportRow[]).map(row=>[row.project_id??"-",row.group_name??"구분 없음",row.group_category?MATERIAL_USAGE_GROUP_CATEGORY_LABELS[row.group_category as MaterialUsageGroupCategory]:"-",row.group_sequence??"-",row.material_code,row.quantity_tons,row.allocated_tons,row.unallocated_tons,row.purchase_order_no??"",row.usage_date,row.status]);
  const body="\uFEFF"+[header,...rows].map(row=>row.map(csv).join(",")).join("\r\n");
  return new Response(body,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="material-usage-requests-${new Date().toISOString().slice(0,10)}.csv"`}});
}
