"use client";import{useCallback,useEffect,useMemo,useRef,useState}from"react";import{Download,History,Pencil,X}from"lucide-react";import{Button}from"@/components/ui/Button";import{MaterialAllocationHistoryDialog}from"@/components/statistics/lme/MaterialAllocationHistoryDialog";import{MaterialUsageGroupSelector}from"@/components/statistics/lme/MaterialUsageGroupSelector";import{formatNumber}from"@/lib/lme";import{MATERIAL_ALLOCATION_TYPES,MATERIAL_ALLOCATION_TYPE_LABELS,type ContractAllocationSummary,type MaterialAllocationType,type MaterialContractAllocation}from"@/lib/material-contract-allocations";import type{RawMaterialContract}from"@/lib/raw-material-contracts";import{toast}from"@/lib/toast";import{buildMaterialUsageAllocationPreview,type MaterialUsageAllocationStrategy}from"@/lib/material-usage-requests";type ProjectOption={id:number;project_code:string|null;project_name:string;client_name:string|null;site_address:string|null;};type FormState={allocationType:MaterialAllocationType;projectId:string;materialUsageGroupId:string|null;destinationName:string;quantityTons:string;allocationDate:string;status:"planned"|"confirmed";purchaseOrderNo:string;memo:string;};const emptyForm=(fixedProject?:ProjectOption):FormState=>({allocationType:"project",projectId:fixedProject?String(fixedProject.id):"",materialUsageGroupId:null,destinationName:"",quantityTons:"",allocationDate:new Date().toISOString().slice(0,10),status:"planned",purchaseOrderNo:"",memo:""});const statusLabel={planned:"예정",confirmed:"확정",cancelled:"취소"}as const;type ExcessPlan={requestedTons:number;availableTons:number;excessTons:number;contracts:Array<{id:string;contractName:string;priceKrwPerKg:number;effectiveStartDate:string;availableTons:number;}>;};export function MaterialContractAllocationDialog({contract,fixedProject,initialAllocationId,startInCreateMode=false,onClose,onChanged}:{contract:RawMaterialContract|null;fixedProject?:ProjectOption;initialAllocationId?:string|null;startInCreateMode?:boolean;onClose:()=>void;onChanged:()=>Promise<void>;}){const[allocations,setAllocations]=useState<MaterialContractAllocation[]>([]);const[summary,setSummary]=useState<ContractAllocationSummary|null>(contract?.allocation_summary??null);const[canManage,setCanManage]=useState(false);const[loading,setLoading]=useState(true);const[editing,setEditing]=useState<MaterialContractAllocation|"new"|null>(null);const[form,setForm]=useState<FormState>(()=>emptyForm(fixedProject));const[projects,setProjects]=useState<ProjectOption[]>(fixedProject?[fixedProject]:[]);const[projectQuery,setProjectQuery]=useState("");const[saving,setSaving]=useState(false);const[updatingStatusId,setUpdatingStatusId]=useState<string|null>(null);const[historyAllocation,setHistoryAllocation]=useState<MaterialContractAllocation|null>(null);const[excessPlan,setExcessPlan]=useState<ExcessPlan|null>(null);const[strategy,setStrategy]=useState<MaterialUsageAllocationStrategy>("leave_unallocated");const[increaseReason,setIncreaseReason]=useState("");const initialEditOpened=useRef(false);const initialCreateOpened=useRef(false);const load=useCallback(async()=>{if(!contract)return;const response=await fetch(`/api/statistics/lme/contracts/${contract.id}/allocations`,{cache:"no-store"});const result=(await response.json())as{allocations?:MaterialContractAllocation[];summary?:ContractAllocationSummary;canManage?:boolean;error?:string;};if(!response.ok)throw new Error(result.error??"배정 이력을 불러오지 못했습니다.");setAllocations(result.allocations??[]);setSummary(result.summary??null);setCanManage(result.canManage===true);},[contract]);useEffect(()=>{if(!contract)return;const timer=window.setTimeout(()=>{setLoading(true);void load().catch(error=>toast.error(error instanceof Error?error.message:"배정 이력을 불러오지 못했습니다.")).finally(()=>setLoading(false));},0);return()=>window.clearTimeout(timer);},[contract,load]);useEffect(()=>{if(!editing||fixedProject)return;const timer=window.setTimeout(()=>{const params=new URLSearchParams();if(projectQuery.trim())params.set("search",projectQuery.trim());void fetch(`/api/statistics/cost-analysis/projects?${params}`,{cache:"no-store"}).then(async response=>{const result=(await response.json())as{projects?:ProjectOption[];error?:string;};if(!response.ok)throw new Error(result.error??"현장을 불러오지 못했습니다.");setProjects(result.projects??[]);}).catch(error=>toast.error(error instanceof Error?error.message:"현장을 불러오지 못했습니다."));},250);return()=>window.clearTimeout(timer);},[editing,fixedProject,projectQuery]);useEffect(()=>{if(!initialAllocationId||initialEditOpened.current)return;const allocation=allocations.find(item=>item.id===initialAllocationId);if(!allocation)return;initialEditOpened.current=true;const timer=window.setTimeout(()=>startEdit(allocation),0);return()=>window.clearTimeout(timer);},[allocations,initialAllocationId]);useEffect(()=>{if(!startInCreateMode||!canManage||initialAllocationId||initialCreateOpened.current)return;initialCreateOpened.current=true;const timer=window.setTimeout(()=>{setEditing("new");setForm(emptyForm(fixedProject));setProjectQuery(fixedProject?`${fixedProject.project_code??""} ${fixedProject.project_name}`.trim():"");},0);return()=>window.clearTimeout(timer);},[canManage,fixedProject,initialAllocationId,startInCreateMode]);const editableAllocation=editing==="new"?null:editing;const maximum=useMemo(()=>(summary?.availableTons??0)+(editableAllocation&&editableAllocation.status!=="cancelled"?editableAllocation.quantity_tons:0),[editableAllocation,summary]);if(!contract)return null;const contractId=contract.id;function startEdit(allocation:MaterialContractAllocation){setEditing(allocation);setProjectQuery(`${allocation.project_code??""} ${allocation.project_name}`.trim());setForm({allocationType:allocation.allocation_type,projectId:allocation.project_id===null?"":String(allocation.project_id),materialUsageGroupId:null,destinationName:allocation.destination_name??"",quantityTons:String(allocation.quantity_tons),allocationDate:allocation.allocation_date,status:allocation.status==="confirmed"?"confirmed":"planned",purchaseOrderNo:allocation.purchase_order_no??"",memo:allocation.memo??""});}async function refresh(){await Promise.all([load(),onChanged()]);}async function save(selectedStrategy?:MaterialUsageAllocationStrategy){const quantity=Number(form.quantityTons);if(!form.allocationType)return toast.error("사용 대상을 선택해 주세요.");if(form.allocationType==="project"&&!form.projectId)return toast.error("프로젝트를 선택해 주세요.");if(form.allocationType!=="project"&&form.allocationType!=="factory"&&!form.destinationName.trim())return toast.error("사용처명을 입력해 주세요.");if(!form.quantityTons)return toast.error("사용량을 입력해 주세요.");if(!Number.isFinite(quantity))return toast.error("사용량은 숫자로 입력해 주세요.");if(quantity<=0)return toast.error("사용량은 0보다 커야 합니다.");if(!/^\d+(\.\d{1,4})?$/.test(form.quantityTons))return toast.error("사용량은 소수점 4자리까지 입력할 수 있습니다.");setSaving(true);try{const url=editing==="new"?`/api/statistics/lme/contracts/${contractId}/allocations`:`/api/statistics/lme/contracts/${contractId}/allocations/${editing?.id}`;const response=await fetch(url,{method:editing==="new"?"POST":"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,projectId:form.allocationType==="project"?Number(form.projectId):null,destinationName:form.allocationType==="project"?null:form.destinationName.trim(),quantityTons:quantity,contextProjectId:fixedProject?.id,strategy:selectedStrategy,increaseReason})});const result=(await response.json())as{error?:string;requiresStrategy?:boolean;requestedTons?:number;availableTons?:number;excessTons?:number;contracts?:ExcessPlan["contracts"];};if(response.status===409&&result.requiresStrategy&&result.requestedTons!==undefined&&result.availableTons!==undefined&&result.excessTons!==undefined){const plan={requestedTons:result.requestedTons,availableTons:result.availableTons,excessTons:result.excessTons,contracts:result.contracts??[]};setExcessPlan(plan);setStrategy(plan.contracts.reduce((sum,item)=>sum+item.availableTons,0)>=plan.requestedTons?"auto_split":"leave_unallocated");return;}if(!response.ok)throw new Error(result.error??"배정을 저장하지 못했습니다.");toast.success(editing==="new"?"원자재 사용을 등록했습니다.":"원자재 사용을 수정했습니다.");setEditing(null);await refresh();}catch(error){toast.error(error instanceof Error?error.message:"배정을 저장하지 못했습니다.");}finally{setSaving(false);}}async function cancelAllocation(allocation:MaterialContractAllocation){if(!window.confirm("이 배정을 취소하시겠습니까?\n취소된 배정은 물량 집계에서 제외됩니다."))return;const response=await fetch(`/api/statistics/lme/contracts/${contractId}/allocations/${allocation.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"cancel",contextProjectId:fixedProject?.id})});const result=(await response.json())as{error?:string;};if(!response.ok)return toast.error(result.error??"배정을 취소하지 못했습니다.");toast.success("배정을 취소했습니다.");await refresh();}async function changeStatus(allocation:MaterialContractAllocation,status:"planned"|"confirmed"){if(allocation.status===status||updatingStatusId)return;const previousStatus=allocation.status;setUpdatingStatusId(allocation.id);setAllocations(current=>current.map(item=>item.id===allocation.id?{...item,status}:item));try{const response=await fetch(`/api/statistics/lme/contracts/${contractId}/allocations/${allocation.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({allocationType:allocation.allocation_type,projectId:allocation.project_id,destinationName:allocation.destination_name,quantityTons:allocation.quantity_tons,allocationDate:allocation.allocation_date,status,purchaseOrderNo:allocation.purchase_order_no,memo:allocation.memo,contextProjectId:fixedProject?.id})});const result=(await response.json())as{error?:string;};if(!response.ok)throw new Error(result.error??"상태를 변경하지 못했습니다.");await refresh();toast.success(status==="confirmed"?"확정 상태로 변경했습니다.":"예정 상태로 변경했습니다.");}catch(error){setAllocations(current=>current.map(item=>item.id===allocation.id?{...item,status:previousStatus}:item));toast.error(error instanceof Error?error.message:"상태를 변경하지 못했습니다.");}finally{setUpdatingStatusId(null);}}return<div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/45 p-4"role="dialog"onMouseDown={event=>{if(event.target===event.currentTarget&&!saving)onClose();}}>
      <div className="max-h-[94vh] w-full max-w-[96vw] overflow-y-auto rounded-2xl bg-white p-5 xl:max-w-7xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">프로젝트 배정 내역</h2>
            <p className="mt-1 text-sm text-slate-500">
              {contract.contract_name} · {contract.supplier_name}
            </p>
          </div>
          <button aria-label="닫기"onClick={onClose}>
            <X size={18}/>
          </button>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-5">
          {[["계약 수량",summary?.contractQuantityTons],["확정 사용량",summary?.confirmedTons],["예정 배정량",summary?.plannedTons],["잔여 계약량",summary?.remainingTons],["현재 가용량",summary?.availableTons]].map(([label,value])=><div key={String(label)}className="rounded-xl bg-slate-50 p-3 text-xs">
              <span className="text-slate-500">{label}</span>
              <p className="mt-1 font-bold">
                {formatNumber(Number(value??0)*1_000,1)} kg
              </p>
            </div>)}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <a href={`/api/statistics/lme/contracts/${contractId}/allocations/export`}className="inline-flex h-8 items-center justify-center gap-1 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition-all duration-200 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-200">
            <Download size={14}/>
            CSV 내보내기
          </a>
        </div>
        {editing&&<section className="mt-4 rounded-2xl border border-blue-200 bg-blue-50/30 p-4">
            {form.allocationType==="project"&&editing==="new"&&<label className="mb-3 block text-xs font-semibold">
                사용 구분
                <MaterialUsageGroupSelector projectId={form.projectId?Number(form.projectId):null}value={form.materialUsageGroupId}onChange={materialUsageGroupId=>setForm({...form,materialUsageGroupId})}/>
              </label>}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-xs font-semibold">
                사용 구분
                <select disabled={Boolean(fixedProject)}value={form.allocationType}onChange={event=>setForm({...form,allocationType:event.target.value as MaterialAllocationType,projectId:"",destinationName:""})}className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm">
                  {MATERIAL_ALLOCATION_TYPES.map(type=><option key={type}value={type}>
                      {MATERIAL_ALLOCATION_TYPE_LABELS[type]}
                    </option>)}
                </select>
              </label>
              {form.allocationType==="project"?<label className="text-xs font-semibold lg:col-span-2">
                  프로젝트{" "}
                  {fixedProject?null:<input value={projectQuery}onChange={event=>setProjectQuery(event.target.value)}placeholder="프로젝트 코드 또는 현장명"className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm"/>}
                  <select disabled={Boolean(fixedProject)}value={form.projectId}onChange={event=>setForm({...form,projectId:event.target.value})}className="mt-2 w-full rounded-xl border bg-white px-3 py-2 text-sm">
                    <option value="">프로젝트 선택</option>
                    {projects.map(project=><option key={project.id}value={project.id}>
                        {project.project_code??"코드 없음"} ·{" "}
                        {project.project_name} ·{" "}
                        {project.client_name??project.site_address??"-"}
                      </option>)}
                  </select>
                </label>:form.allocationType==="factory"?<div className="lg:col-span-2">
                  <span className="text-xs font-semibold">사용 대상</span>
                  <div className="mt-1 rounded-xl border bg-slate-50 px-3 py-2 text-sm font-semibold text-blue-700">
                    공장 재고
                  </div>
                </div>:<label className="text-xs font-semibold lg:col-span-2">
                  사용처명
                  <input maxLength={200}value={form.destinationName}onChange={event=>setForm({...form,destinationName:event.target.value})}placeholder="사용처를 입력하세요"className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm"/>
                </label>}
              <label className="text-xs font-semibold">
                배정 톤수
                <div className="mt-1 flex">
                  <input type="number"min="0.0001"step="0.0001"value={form.quantityTons}onChange={event=>setForm({...form,quantityTons:event.target.value})}className="w-full rounded-l-xl border px-3 py-2 text-sm"/>
                  <span className="rounded-r-xl border border-l-0 bg-white px-3 py-2 text-sm">
                    t
                  </span>
                </div>
                <span className="mt-1 block font-normal text-slate-500">
                  수정 가능 최대 {formatNumber(maximum,4)}t
                </span>
              </label>
              <label className="text-xs font-semibold">
                배정일
                <input type="date"value={form.allocationDate}onChange={event=>setForm({...form,allocationDate:event.target.value})}className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm"/>
              </label>
              <label className="text-xs font-semibold">
                상태
                <select value={form.status}onChange={event=>setForm({...form,status:event.target.value as"planned"|"confirmed"})}className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm">
                  <option value="planned">예정 - 가용량 선점</option>
                  <option value="confirmed">확정 - 실제 발주</option>
                </select>
              </label>
              <label className="text-xs font-semibold">
                발주번호
                <input maxLength={100}value={form.purchaseOrderNo}onChange={event=>setForm({...form,purchaseOrderNo:event.target.value})}className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm"/>
              </label>
              <label className="text-xs font-semibold sm:col-span-2 lg:col-span-3">
                메모
                <textarea rows={3}maxLength={2000}value={form.memo}onChange={event=>setForm({...form,memo:event.target.value})}className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm"/>
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline"onClick={()=>setEditing(null)}>
                취소
              </Button>
              <Button variant="primary"disabled={saving}onClick={()=>void save()}>
                {saving?"저장 중...":"저장"}
              </Button>
            </div>
          </section>}
        {excessPlan&&<div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/50 p-4">
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5">
              <h3 className="text-lg font-bold">계약 가용량을 초과합니다</h3>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-xl bg-slate-50 p-3">
                  요청량
                  <b className="mt-1 block">
                    {formatNumber(excessPlan.requestedTons,4)}t
                  </b>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  현재 계약 가용
                  <b className="mt-1 block">
                    {formatNumber(excessPlan.availableTons,4)}t
                  </b>
                </div>
                <div className="rounded-xl bg-red-50 p-3 text-red-700">
                  초과량
                  <b className="mt-1 block">
                    {formatNumber(excessPlan.excessTons,4)}t
                  </b>
                </div>
              </div>
              <div className="mt-4 space-y-2 text-sm">
                {([["auto_split","다음 계약으로 자동 배정"],["increase_contract","현재 계약 증액 후 배정"],["leave_unallocated","잔여량까지만 배정하고 초과분 미배정"]]as const).map(([value,label])=><label key={value}className="flex items-start gap-2 rounded-xl border p-3">
                    <input type="radio"checked={strategy===value}onChange={()=>setStrategy(value)}/>
                    <span>
                      <b>{label}</b>
                      {value==="auto_split"&&excessPlan.contracts.length===0&&<small className="block text-red-600">
                            사용 가능한 다음 계약이 없습니다.
                          </small>}
                    </span>
                  </label>)}
              </div>
              {strategy==="increase_contract"&&<label className="mt-3 block text-xs font-semibold">
                  증액 사유
                  <textarea value={increaseReason}onChange={event=>setIncreaseReason(event.target.value)}rows={2}className="mt-1 w-full rounded-xl border p-2 text-sm"/>
                </label>}
              {strategy==="auto_split"&&(()=>{const preview=buildMaterialUsageAllocationPreview(excessPlan.requestedTons,excessPlan.contracts.map(item=>({id:item.id,availableTons:item.availableTons,priceKrwPerKg:item.priceKrwPerKg,effectiveStartDate:item.effectiveStartDate})));return<div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs">
                      <b>배정 Preview</b>
                      {preview.allocations.map(row=><p key={row.contractId}className="mt-1">
                          {excessPlan.contracts.find(item=>item.id===row.contractId)?.contractName}{" "}
                          · {formatNumber(row.quantityTons,4)}t ·{" "}
                          {formatNumber(row.priceKrwPerKg)}원/kg
                        </p>)}
                      <p className="mt-2 font-semibold">
                        총 배정 {formatNumber(preview.allocatedTons,4)}t ·
                        미배정 {formatNumber(preview.unallocatedTons,4)}t ·
                        예상 원가 {formatNumber(preview.estimatedCostKrw)}원
                      </p>
                    </div>;})()}
              <div className="mt-5 flex justify-end gap-2">
                <Button variant="outline"onClick={()=>setExcessPlan(null)}>
                  취소
                </Button>
                <Button variant="primary"disabled={saving||strategy==="increase_contract"&&!increaseReason.trim()}onClick={()=>{setExcessPlan(null);void save(strategy);}}>
                  선택한 방식으로 저장
                </Button>
              </div>
            </div>
          </div>}
        {loading?<p className="py-12 text-center text-sm text-slate-400">
            불러오는 중...
          </p>:<div className="mt-4 overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[1180px] table-fixed text-left text-xs">
              <colgroup>
                <col className="w-[88px]"/>
                <col className="w-[112px]"/>
                <col/>
                <col className="w-[108px]"/>
                <col className="w-[96px]"/>
                <col className="w-[88px]"/>
                <col className="w-[190px]"/>
                <col className="w-[150px]"/>
                <col className="w-[96px]"/>
                <col className="w-[90px]"/>
                <col className="w-[164px]"/>
              </colgroup>
              <thead className="bg-slate-100">
                <tr>
                  {["배정일","사용 구분","대상","프로젝트 코드","상태","배정량","발주번호","메모","작성자","작성일","관리"].map(label=><th key={label}className="whitespace-nowrap px-3 py-2">
                      {label}
                    </th>)}
                </tr>
              </thead>
              <tbody>
                {allocations.filter(allocation=>!fixedProject||allocation.project_id===fixedProject.id).map(allocation=><tr key={allocation.id}className={`border-t ${allocation.status==="cancelled"?"bg-slate-50 text-slate-400":""}`}>
                      <td className="whitespace-nowrap px-3 py-2 align-middle">
                        {allocation.allocation_date}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 align-middle">
                        <span className="inline-flex whitespace-nowrap rounded-full bg-slate-100 px-2 py-1">
                          {MATERIAL_ALLOCATION_TYPE_LABELS[allocation.allocation_type]}
                        </span>
                      </td>
                      <td className="truncate px-3 py-2 align-middle font-semibold"title={allocation.allocation_type==="project"?allocation.project_name:allocation.allocation_type==="factory"?"공장 재고":allocation.destination_name??""}>
                        {allocation.allocation_type==="project"?allocation.project_name:allocation.allocation_type==="factory"?"공장 재고":allocation.destination_name}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 align-middle">
                        {allocation.allocation_type==="project"?allocation.project_code??"-":"-"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 align-middle">
                        {allocation.status==="cancelled"?<span className="inline-flex min-w-16 justify-center rounded-full bg-slate-100 px-2 py-1">
                            취소
                          </span>:canManage?<div className="flex flex-col gap-1">
                            <select aria-label="배정 상태 변경"disabled={updatingStatusId!==null}value={allocation.status}onChange={event=>void changeStatus(allocation,event.target.value as"planned"|"confirmed")}className={`min-w-18 rounded-lg border px-2 py-1 text-xs font-semibold ${allocation.status==="confirmed"?"border-emerald-200 bg-emerald-50 text-emerald-700":"border-amber-200 bg-amber-50 text-amber-700"}`}>
                              <option value="planned">예정</option>
                              <option value="confirmed">확정</option>
                            </select>
                            {updatingStatusId===allocation.id&&<span className="text-[10px] text-slate-500">
                                저장 중...
                              </span>}
                          </div>:<span className={`inline-flex min-w-16 justify-center rounded-full px-2 py-1 font-semibold ${allocation.status==="confirmed"?"bg-emerald-50 text-emerald-700":"bg-amber-50 text-amber-700"}`}>
                            {statusLabel[allocation.status]}
                          </span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right align-middle tabular-nums">
                        {formatNumber(allocation.quantity_tons*1_000,1)} kg
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <span className="line-clamp-2 break-words"title={allocation.purchase_order_no??""}>
                          {allocation.purchase_order_no??"-"}
                        </span>
                      </td>
                      <td className="truncate px-3 py-2 align-middle"title={allocation.memo??""}>
                        {allocation.memo??"-"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 align-middle"title={allocation.created_by_name??""}>
                        {allocation.created_by_name??"-"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 align-middle">
                        {allocation.created_at.slice(0,10)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 align-middle">
                        <div className="flex items-center gap-1">
                          <button type="button"aria-label="변경 이력"title="변경 이력"className="rounded-lg border bg-white p-1.5 text-slate-600 hover:bg-slate-50"onClick={()=>setHistoryAllocation(allocation)}>
                            <History size={13}/>
                          </button>
                          {canManage&&allocation.status!=="cancelled"&&<>
                              <button type="button"aria-label="사용등록 수정"className="rounded-lg border bg-white p-1.5"onClick={()=>startEdit(allocation)}>
                                <Pencil size={13}/>
                              </button>
                              <Button size="sm"variant="danger"onClick={()=>void cancelAllocation(allocation)}>
                                배정 취소
                              </Button>
                            </>}
                        </div>
                      </td>
                    </tr>)}
                {allocations.filter(allocation=>!fixedProject||allocation.project_id===fixedProject.id).length===0&&<tr>
                    <td colSpan={11}className="px-4 py-12 text-center text-slate-400">
                      프로젝트 배정 이력이 없습니다.
                    </td>
                  </tr>}
              </tbody>
            </table>
          </div>}
        <MaterialAllocationHistoryDialog contractId={contractId}allocation={historyAllocation}onClose={()=>setHistoryAllocation(null)}/>
      </div>
    </div>;}
