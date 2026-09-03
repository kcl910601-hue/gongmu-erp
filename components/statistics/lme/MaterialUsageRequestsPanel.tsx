"use client";import{Download,History,Pencil,PlusCircle,XCircle}from"lucide-react";import{useCallback,useEffect,useMemo,useState,type ReactNode}from"react";import{Button}from"@/components/ui/Button";import{MaterialUsageGroupSelector}from"@/components/statistics/lme/MaterialUsageGroupSelector";import{MATERIAL_USAGE_REQUESTS_CHANGED_EVENT,scheduleCollaborationEvents}from"@/lib/collaboration-events";import{withShortEditingLock}from"@/lib/editing-locks";import{formatNumber}from"@/lib/lme";import{MATERIAL_USAGE_GROUP_CATEGORY_LABELS,MATERIAL_USAGE_GROUP_STATUS_LABELS,type MaterialUsageGroup,type MaterialUsageGroupCategory,type MaterialUsageGroupStatus}from"@/lib/material-usage-groups";import type{MaterialUsageAllocationState,MaterialUsageRequest}from"@/lib/material-usage-requests";import{toast}from"@/lib/toast";type Filter="all"|"has_unallocated"|MaterialUsageAllocationState|"cancelled";type Category="all"|MaterialUsageGroupCategory|"none";type ContractOption={id:string;contract_name:string;material_code:string;allocation_summary:{availableTons:number;};};type HistoryRow={created_at:string;activity_type:string;title:string;description:string|null;employee_name:string|null;};const stateLabels:Record<MaterialUsageAllocationState,string>={unallocated:"미배정",partially_allocated:"부분배정",fully_allocated:"배정완료"};export function MaterialUsageRequestsPanel(){const[rows,setRows]=useState<MaterialUsageRequest[]>([]);const[groups,setGroups]=useState<MaterialUsageGroup[]>([]);const[canManage,setCanManage]=useState(false);const[view,setView]=useState<"grouped"|"flat">(()=>typeof window!=="undefined"&&window.localStorage.getItem("material-usage-view")==="flat"?"flat":"grouped");const[filter,setFilter]=useState<Filter>("has_unallocated");const[category,setCategory]=useState<Category>("all");const[query,setQuery]=useState("");const[editing,setEditing]=useState<MaterialUsageRequest|null>(null);const[cancelling,setCancelling]=useState<MaterialUsageRequest|null>(null);const[allocating,setAllocating]=useState<MaterialUsageRequest|null>(null);const[historyFor,setHistoryFor]=useState<MaterialUsageRequest|null>(null);const[editingGroup,setEditingGroup]=useState<MaterialUsageGroup|null>(null);const[history,setHistory]=useState<HistoryRow[]>([]);const[contracts,setContracts]=useState<ContractOption[]>([]);const[saving,setSaving]=useState(false);const[editForm,setEditForm]=useState({quantityTons:"",purchaseOrderNo:"",usageDate:"",memo:"",materialUsageGroupId:null as string|null});const[groupForm,setGroupForm]=useState({plannedDate:"",status:"planned"as MaterialUsageGroupStatus,memo:""});const[cancelReason,setCancelReason]=useState("");const[allocationForm,setAllocationForm]=useState({contractId:"",quantityKg:"",status:"planned"});const load=useCallback(async()=>{const[requestResponse,groupResponse]=await Promise.all([fetch("/api/statistics/lme/usage-requests",{cache:"no-store"}),fetch("/api/statistics/lme/material-usage-groups",{cache:"no-store"})]);const requestResult=(await requestResponse.json())as{requests?:MaterialUsageRequest[];canManage?:boolean;error?:string;};const groupResult=(await groupResponse.json())as{groups?:MaterialUsageGroup[];error?:string;};if(!requestResponse.ok)throw new Error(requestResult.error);if(!groupResponse.ok)throw new Error(groupResult.error);setCanManage(Boolean(requestResult.canManage));setRows((requestResult.requests??[]).map(row=>({...row,quantity_tons:Number(row.quantity_tons),allocated_tons:Number(row.allocated_tons),unallocated_tons:Number(row.unallocated_tons)})));setGroups((groupResult.groups??[]).map(group=>({...group,request_count:Number(group.request_count??0),requested_tons:Number(group.requested_tons??0),allocated_tons:Number(group.allocated_tons??0),unallocated_tons:Number(group.unallocated_tons??0)})));},[]);useEffect(()=>{const reload=()=>void load().catch(error=>toast.error(error instanceof Error?error.message:"사용요청을 불러오지 못했습니다."));const timer=window.setTimeout(reload,0);window.addEventListener(MATERIAL_USAGE_REQUESTS_CHANGED_EVENT,reload);return()=>{window.clearTimeout(timer);window.removeEventListener(MATERIAL_USAGE_REQUESTS_CHANGED_EVENT,reload);};},[load]);function changeView(next:"grouped"|"flat"){setView(next);window.localStorage.setItem("material-usage-view",next);}const projectTotals=useMemo(()=>{const totals=new Map<number,{requested:number;unallocated:number;}>();for(const row of rows){if(row.status!=="active"||row.allocation_type!=="project"||row.project_id===null||row.material_code!=="AL")continue;const total=totals.get(row.project_id)??{requested:0,unallocated:0};total.requested+=row.quantity_tons;total.unallocated+=row.unallocated_tons;totals.set(row.project_id,total);}return totals;},[rows]);const visible=useMemo(()=>rows.filter(row=>{const projectTotal=row.project_id===null?null:projectTotals.get(row.project_id);const statusOk=filter==="cancelled"?row.status==="cancelled":row.status==="active"&&(filter==="all"||filter==="has_unallocated"&&(projectTotal?.unallocated??row.unallocated_tons)>0||filter==="fully_allocated"&&(projectTotal?projectTotal.requested>0&&projectTotal.unallocated<=0:row.allocation_state==="fully_allocated")||filter==="unallocated"&&row.allocation_state==="unallocated"||filter==="partially_allocated"&&row.allocation_state==="partially_allocated");const categoryOk=category==="all"||category==="none"&&!row.material_usage_group_id||row.group_category===category;const haystack=`${row.group_name??"구분 없음"} ${row.project_name??""} ${row.project_code??""} ${row.material_code} ${row.purchase_order_no??""} ${row.memo??""}`.toLowerCase();return statusOk&&categoryOk&&haystack.includes(query.trim().toLowerCase());}),[category,filter,projectTotals,query,rows]);const sections=useMemo(()=>{const map=new Map<string,{group:MaterialUsageGroup|null;rows:MaterialUsageRequest[];}>();for(const row of visible){const key=row.material_usage_group_id??"ungrouped";if(!map.has(key))map.set(key,{group:groups.find(group=>group.id===key)??null,rows:[]});map.get(key)?.rows.push(row);}for(const group of groups.filter(item=>item.is_active)){if(category!=="all"&&category!==group.category)continue;if(query&&!group.name.toLowerCase().includes(query.toLowerCase()))continue;if(!map.has(group.id))map.set(group.id,{group,rows:[]});}return[...map.entries()];},[category,groups,query,visible]);const projectSummaries=useMemo(()=>{const summaries=new Map<number,{name:string;requested:number;allocated:number;unallocated:number;rows:MaterialUsageRequest[];}>();for(const row of visible){if(row.status!=="active"||row.allocation_type!=="project"||row.project_id===null||row.material_code!=="AL")continue;const summary=summaries.get(row.project_id)??{name:row.project_name??`프로젝트 #${row.project_id}`,requested:0,allocated:0,unallocated:0,rows:[]};summary.requested+=row.quantity_tons;summary.allocated+=row.allocated_tons;summary.unallocated+=row.unallocated_tons;summary.rows.push(row);summaries.set(row.project_id,summary);}return[...summaries.entries()];},[visible]);const visibleUnallocatedTons=projectSummaries.reduce((sum,[,summary])=>sum+summary.unallocated,0);function openEdit(row:MaterialUsageRequest){setEditing(row);setEditForm({quantityTons:String(row.quantity_tons),purchaseOrderNo:row.purchase_order_no??"",usageDate:row.usage_date,memo:row.memo??"",materialUsageGroupId:row.material_usage_group_id});}async function saveEdit(){if(!editing||saving)return;setSaving(true);try{const response=await fetch("/api/statistics/lme/usage-requests",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({usageRequestId:editing.id,...editForm})});const result=(await response.json())as{error?:string;};if(!response.ok)throw new Error(result.error);setEditing(null);await load();toast.success("사용요청을 수정했습니다.");}catch(error){toast.error(error instanceof Error?error.message:"수정하지 못했습니다.");}finally{setSaving(false);}}async function cancelRequest(){if(!cancelling||saving)return;setSaving(true);try{const response=await fetch(`/api/statistics/lme/usage-requests/${cancelling.id}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"cancel",reason:cancelReason})});const result=(await response.json())as{error?:string;};if(!response.ok)throw new Error(result.error);scheduleCollaborationEvents([MATERIAL_USAGE_REQUESTS_CHANGED_EVENT]);setCancelling(null);setCancelReason("");await load();toast.success("사용요청과 연결된 배정을 취소했습니다.");}catch(error){toast.error(error instanceof Error?error.message:"취소하지 못했습니다.");}finally{setSaving(false);}}async function openHistory(row:MaterialUsageRequest){setHistoryFor(row);const response=await fetch(`/api/statistics/lme/usage-requests/${row.id}`,{cache:"no-store"});const result=(await response.json())as{history?:HistoryRow[];error?:string;};if(!response.ok)return toast.error(result.error??"이력을 불러오지 못했습니다.");setHistory(result.history??[]);}async function openAllocation(row:MaterialUsageRequest){setAllocating(row);setAllocationForm({contractId:"",quantityKg:String(row.unallocated_tons*1_000),status:"planned"});const response=await fetch(`/api/statistics/lme/contracts?material=${encodeURIComponent(row.material_code)}&status=active`,{cache:"no-store"});const result=(await response.json())as{contracts?:ContractOption[];};setContracts((result.contracts??[]).filter(contract=>contract.material_code===row.material_code));}async function allocate(){if(!allocating||saving)return;const contract=contracts.find(item=>item.id===allocationForm.contractId);const quantityKg=Number(allocationForm.quantityKg);const maximumKg=Math.min(allocating.unallocated_tons,contract?.allocation_summary.availableTons??0)*1_000;if(!contract||!Number.isFinite(quantityKg)||quantityKg<=0||quantityKg>maximumKg+0.05)return toast.error(`배정량은 최대 ${formatNumber(maximumKg,1)} kg입니다.`);setSaving(true);try{const response=await fetch("/api/statistics/lme/usage-requests",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({usageRequestId:allocating.id,contractId:allocationForm.contractId,quantityTons:quantityKg/1_000,status:allocationForm.status,expectedAvailableTons:contract?.allocation_summary.availableTons})});const result=(await response.json())as{error?:string;};if(!response.ok)throw new Error(result.error);scheduleCollaborationEvents([MATERIAL_USAGE_REQUESTS_CHANGED_EVENT]);setAllocating(null);await load();toast.success("미배정 물량을 배정했습니다.");}catch(error){toast.error(error instanceof Error?error.message:"배정하지 못했습니다.");}finally{setSaving(false);}}function openGroup(group:MaterialUsageGroup){setEditingGroup(group);setGroupForm({plannedDate:group.planned_date??"",status:group.status,memo:group.memo??""});}async function saveGroup(action?:"archive"){if(!editingGroup||saving)return;if(action==="archive"&&!window.confirm(`${editingGroup.name}을 Archive 하시겠습니까?`))return;const groupRows=rows.filter(row=>row.material_usage_group_id===editingGroup.id&&row.status==="active");const unallocated=groupRows.reduce((sum,row)=>sum+row.unallocated_tons,0);if(!action&&groupForm.status==="completed"&&unallocated>0&&!window.confirm(`${editingGroup.name}에 미배정 자재 ${formatNumber(unallocated,4)}t가 남아 있습니다. 그래도 완료 처리하시겠습니까?`))return;setSaving(true);try{await withShortEditingLock("material_usage_group",editingGroup.id,async()=>{const response=await fetch("/api/statistics/lme/material-usage-groups",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(action?{groupId:editingGroup.id,action}:{groupId:editingGroup.id,...groupForm})});const result=(await response.json())as{error?:string;};if(!response.ok)throw new Error(result.error);});setEditingGroup(null);await load();toast.success(action?"사용 구분을 Archive 했습니다.":"사용 구분을 수정했습니다.");}catch(error){toast.error(error instanceof Error?error.message:"사용 구분을 저장하지 못했습니다.");}finally{setSaving(false);}}const actions=(row:MaterialUsageRequest)=><div className="flex gap-1">
      {canManage&&row.status==="active"&&row.unallocated_tons>0&&<IconButton label="배정 관리"onClick={()=>void openAllocation(row)}>
          <PlusCircle size={14}/>
        </IconButton>}
      {canManage&&row.status==="active"&&<IconButton label="수정"onClick={()=>openEdit(row)}>
          <Pencil size={14}/>
        </IconButton>}
      <IconButton label="History"onClick={()=>void openHistory(row)}>
        <History size={14}/>
      </IconButton>
      {canManage&&row.status==="active"&&<IconButton label="취소"danger onClick={()=>setCancelling(row)}>
          <XCircle size={14}/>
        </IconButton>}
    </div>;return<section className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">원자재 사용요청 관리</h2>
          <p className="text-xs text-slate-500">
            프로젝트 발주와 계약 배정을 분리해 관리합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline"onClick={()=>window.location.assign("/api/statistics/lme/usage-requests/export")}>
            <Download size={14}/>
            CSV
          </Button>
          <Button variant={view==="grouped"?"primary":"outline"}onClick={()=>changeView("grouped")}>
            차수별 보기
          </Button>
          <Button variant={view==="flat"?"primary":"outline"}onClick={()=>changeView("flat")}>
            전체 요청
          </Button>
        </div>
      </div>
      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><strong>프로젝트 발주 현황</strong>{filter!=="fully_allocated"&&<span className="font-bold text-amber-700">총 미배정 {formatNumber(visibleUnallocatedTons*1_000,1)} kg</span>}</div>
        <div className="mt-3 grid gap-2 lg:grid-cols-2 xl:grid-cols-3">{projectSummaries.map(([projectId,summary])=><details key={projectId}className="rounded-xl border bg-white p-3"><summary className="cursor-pointer text-sm font-bold">{summary.name}</summary><p className="mt-2 text-xs text-slate-600">발주 {formatNumber(summary.requested*1_000,1)} kg · 배정 {formatNumber(summary.allocated*1_000,1)} kg · <span className="font-semibold text-amber-700">미배정 {formatNumber(summary.unallocated*1_000,1)} kg</span> · 배정률 {formatNumber(summary.requested>0?summary.allocated/summary.requested*100:0,2)}%</p><div className="mt-2 space-y-1 border-t pt-2">{summary.rows.map(row=><p key={row.id}className="text-xs text-slate-500">{row.usage_date} · 발주 {formatNumber(row.quantity_tons*1_000,1)} kg · 배정 {formatNumber(row.allocated_tons*1_000,1)} kg · 미배정 {formatNumber(row.unallocated_tons*1_000,1)} kg</p>)}</div></details>)}{projectSummaries.length===0&&<p className="py-3 text-sm text-slate-500">현재 조건에 해당하는 프로젝트 발주가 없습니다.</p>}</div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <input value={query}onChange={event=>setQuery(event.target.value)}placeholder="프로젝트, 구분명, 자재, 발주번호 검색"className="rounded-xl border px-3 py-2 text-sm"/>
        <select value={filter}onChange={event=>setFilter(event.target.value as Filter)}className="rounded-xl border px-3 py-2 text-sm">
          <option value="has_unallocated">미배정 있음</option>
          <option value="fully_allocated">전량 배정</option>
          <option value="all">전체</option>
          <option value="cancelled">취소</option>
        </select>
        <select value={category}onChange={event=>setCategory(event.target.value as Category)}className="rounded-xl border px-3 py-2 text-sm">
          <option value="all">전체 구분</option>
          <option value="frame">문틀</option>
          <option value="door">도어</option>
          <option value="other">기타</option>
          <option value="none">구분 없음</option>
        </select>
      </div>
      {view==="grouped"?<div className="mt-4 space-y-3">
          {sections.map(([key,section])=><GroupCard key={key}group={section.group}rows={section.rows}canManage={canManage}onEditGroup={openGroup}actions={actions}/>)}
          {sections.length===0&&<Empty/>}
        </div>:<FlatTable rows={visible}actions={actions}/>}
      {editing&&<Modal title="사용요청 수정"onClose={()=>setEditing(null)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="요청량(t)"type="number"value={editForm.quantityTons}onChange={quantityTons=>setEditForm({...editForm,quantityTons})}/>
            <Field label="사용일"type="date"value={editForm.usageDate}onChange={usageDate=>setEditForm({...editForm,usageDate})}/>
            <Field label="발주번호"value={editForm.purchaseOrderNo}onChange={purchaseOrderNo=>setEditForm({...editForm,purchaseOrderNo})}/>
            {editing.allocation_type==="project"&&<label className="text-xs font-semibold sm:col-span-2">
                사용 구분
                <MaterialUsageGroupSelector projectId={editing.project_id}value={editForm.materialUsageGroupId}onChange={materialUsageGroupId=>setEditForm({...editForm,materialUsageGroupId})}/>
              </label>}
            <label className="text-xs font-semibold sm:col-span-2">
              메모
              <textarea rows={3}value={editForm.memo}onChange={event=>setEditForm({...editForm,memo:event.target.value})}className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"/>
            </label>
          </div>
          <Actions saving={saving}confirm="저장"onCancel={()=>setEditing(null)}onConfirm={()=>void saveEdit()}/>
        </Modal>}
      {editingGroup&&<Modal title={`${editingGroup.name} 편집`}onClose={()=>setEditingGroup(null)}>
          <div className="rounded-xl bg-slate-50 p-3 text-sm">
            {MATERIAL_USAGE_GROUP_CATEGORY_LABELS[editingGroup.category]} ·{" "}
            {editingGroup.sequence}차
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="예정일"type="date"value={groupForm.plannedDate}onChange={plannedDate=>setGroupForm({...groupForm,plannedDate})}/>
            <label className="text-xs font-semibold">
              상태
              <select value={groupForm.status}onChange={event=>setGroupForm({...groupForm,status:event.target.value as MaterialUsageGroupStatus})}className="mt-1 w-full rounded-xl border px-3 py-2 text-sm">
                <option value="planned">예정</option>
                <option value="in_progress">진행</option>
                <option value="completed">완료</option>
              </select>
            </label>
            <label className="text-xs font-semibold sm:col-span-2">
              메모
              <textarea rows={3}value={groupForm.memo}onChange={event=>setGroupForm({...groupForm,memo:event.target.value})}className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"/>
            </label>
          </div>
          <div className="mt-5 flex justify-between">
            <Button variant="danger"disabled={saving}onClick={()=>void saveGroup("archive")}>
              Archive
            </Button>
            <Actions saving={saving}confirm="저장"onCancel={()=>setEditingGroup(null)}onConfirm={()=>void saveGroup()}/>
          </div>
        </Modal>}
      {cancelling&&<Modal title="사용요청을 취소하시겠습니까?"onClose={()=>setCancelling(null)}>
          <p className="text-sm">
            요청 {formatNumber(cancelling.quantity_tons,4)}t · 배정{" "}
            {formatNumber(cancelling.allocated_tons,4)}t
          </p>
          <textarea placeholder="취소 사유"value={cancelReason}onChange={event=>setCancelReason(event.target.value)}className="mt-3 w-full rounded-xl border px-3 py-2 text-sm"/>
          <Actions saving={saving}confirm="사용요청 취소"onCancel={()=>setCancelling(null)}onConfirm={()=>void cancelRequest()}/>
        </Modal>}
      {allocating&&<Modal title="미배정 물량 배정"onClose={()=>setAllocating(null)}>
          <div className="mb-3 grid grid-cols-3 gap-2 text-xs"><Summary label="발주"value={allocating.quantity_tons}/><Summary label="기배정"value={allocating.allocated_tons}/><Summary label="미배정"value={allocating.unallocated_tons}warning/></div>
          <select value={allocationForm.contractId}onChange={event=>setAllocationForm({...allocationForm,contractId:event.target.value})}className="w-full rounded-xl border px-3 py-2 text-sm">
            <option value="">계약 선택</option>
            {contracts.map(contract=><option key={contract.id}value={contract.id}>
                {contract.contract_name} · 가용{" "}
                {formatNumber(contract.allocation_summary.availableTons*1_000,1)} kg
              </option>)}
          </select>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="배정량(kg)"type="number"value={allocationForm.quantityKg}onChange={quantityKg=>setAllocationForm({...allocationForm,quantityKg})}/>
            <label className="text-xs font-semibold">
              상태
              <select value={allocationForm.status}onChange={event=>setAllocationForm({...allocationForm,status:event.target.value})}className="mt-1 w-full rounded-xl border px-3 py-2 text-sm">
                <option value="planned">예정</option>
                <option value="confirmed">확정</option>
              </select>
            </label>
          </div>
          <Actions saving={saving}confirm="배정"onCancel={()=>setAllocating(null)}onConfirm={()=>void allocate()}/>
        </Modal>}
      {historyFor&&<Modal title="사용요청 History"onClose={()=>setHistoryFor(null)}>
          <div className="max-h-[55vh] space-y-2 overflow-y-auto">
            {history.map((item,index)=><article key={`${item.created_at}-${index}`}className="rounded-xl border p-3">
                <div className="flex justify-between gap-2">
                  <strong className="text-sm">{item.title}</strong>
                  <time className="text-xs text-slate-400">
                    {new Date(item.created_at).toLocaleString("ko-KR")}
                  </time>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {item.description??item.activity_type} ·{" "}
                  {item.employee_name??"-"}
                </p>
              </article>)}
            {history.length===0&&<Empty/>}
          </div>
        </Modal>}
    </section>;}function GroupCard({group,rows,canManage,onEditGroup,actions}:{group:MaterialUsageGroup|null;rows:MaterialUsageRequest[];canManage:boolean;onEditGroup:(group:MaterialUsageGroup)=>void;actions:(row:MaterialUsageRequest)=>ReactNode;}){const requested=rows.filter(row=>row.status==="active").reduce((sum,row)=>sum+row.quantity_tons,0);const allocated=rows.filter(row=>row.status==="active").reduce((sum,row)=>sum+row.allocated_tons,0);const unallocated=Math.max(requested-allocated,0);return<article className="rounded-2xl border p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold">{group?.name??"구분 없음"}</h3>
            {group&&<span className="rounded-full bg-slate-100 px-2 py-1 text-xs">
                {MATERIAL_USAGE_GROUP_STATUS_LABELS[group.status]}
              </span>}
            {unallocated>0&&<span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                미배정 {formatNumber(unallocated,4)}t
              </span>}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {group?.planned_date?`예정일 ${group.planned_date}`:"예정일 없음"}{" "}
            · 요청 {rows.length}건
          </p>
        </div>
        {canManage&&group&&<Button variant="outline"onClick={()=>onEditGroup(group)}>
            <Pencil size={14}/>
            편집
          </Button>}
      </header>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Summary label="요청"value={requested}/>
        <Summary label="배정"value={allocated}/>
        <Summary label="미배정"value={unallocated}warning={unallocated>0}/>
      </div>
      <div className="mt-3 divide-y rounded-xl border">
        {rows.map(row=><div key={row.id}className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <strong className="text-sm">{row.material_code}</strong>
              <p className="text-xs text-slate-500">
                요청 {formatNumber(row.quantity_tons,4)}t · 배정{" "}
                {formatNumber(row.allocated_tons,4)}t ·{" "}
                {row.purchase_order_no??"발주번호 없음"} · {row.usage_date}
              </p>
            </div>
            {actions(row)}
          </div>)}
        {rows.length===0&&<p className="p-4 text-center text-sm text-slate-400">
            등록된 사용요청이 없습니다.
          </p>}
      </div>
    </article>;}function FlatTable({rows,actions}:{rows:MaterialUsageRequest[];actions:(row:MaterialUsageRequest)=>ReactNode;}){return<div className="mt-4 overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[1050px] text-xs">
        <thead className="bg-slate-100">
          <tr>
            {["사용 구분","대상","자재","발주번호","사용일","요청","배정","미배정","상태","관리"].map(label=><th key={label}className="px-3 py-2 text-left">
                {label}
              </th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(row=><tr key={row.id}className="border-t">
              <td className="px-3 py-2">{row.group_name??"구분 없음"}</td>
              <td className="px-3 py-2">
                {row.allocation_type==="project"?row.project_name??`프로젝트 #${row.project_id}`:row.allocation_type==="factory"?"공장 재고":row.destination_name}
              </td>
              <td className="px-3 py-2">{row.material_code}</td>
              <td className="px-3 py-2">{row.purchase_order_no??"-"}</td>
              <td className="px-3 py-2">{row.usage_date}</td>
              <td className="px-3 py-2">
                {formatNumber(row.quantity_tons,4)}t
              </td>
              <td className="px-3 py-2">
                {formatNumber(row.allocated_tons,4)}t
              </td>
              <td className="px-3 py-2 font-semibold text-amber-700">
                {formatNumber(row.unallocated_tons,4)}t
              </td>
              <td className="px-3 py-2">
                {row.status==="cancelled"?"취소":stateLabels[row.allocation_state]}
              </td>
              <td className="px-3 py-2">{actions(row)}</td>
            </tr>)}
          {rows.length===0&&<tr>
              <td colSpan={10}>
                <Empty/>
              </td>
            </tr>}
        </tbody>
      </table>
    </div>;}function Summary({label,value,warning}:{label:string;value:number;warning?:boolean;}){return<div className={`rounded-xl p-3 text-xs ${warning?"bg-amber-50 text-amber-700":"bg-slate-50"}`}>
      <span>{label}</span>
      <strong className="mt-1 block">{formatNumber(value,4)}t</strong>
    </div>;}function IconButton({label,onClick,danger,children}:{label:string;onClick:()=>void;danger?:boolean;children:ReactNode;}){return<button type="button"aria-label={label}title={label}onClick={onClick}className={`rounded-lg border p-1.5 ${danger?"border-red-200 text-red-600":"bg-white"}`}>
      {children}
    </button>;}function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode;}){return<div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/40 p-4"onMouseDown={onClose}>
      <div role="dialog"aria-modal="true"className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"onMouseDown={event=>event.stopPropagation()}>
        <h3 className="mb-4 text-lg font-bold">{title}</h3>
        {children}
      </div>
    </div>;}function Field({label,value,onChange,type="text"}:{label:string;value:string;onChange:(value:string)=>void;type?:string;}){return<label className="text-xs font-semibold">
      {label}
      <input type={type}step={type==="number"?"0.0001":undefined}value={value}onChange={event=>onChange(event.target.value)}className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"/>
    </label>;}function Actions({saving,confirm,onCancel,onConfirm}:{saving:boolean;confirm:string;onCancel:()=>void;onConfirm:()=>void;}){return<div className="flex justify-end gap-2">
      <Button variant="outline"disabled={saving}onClick={onCancel}>
        취소
      </Button>
      <Button variant="primary"disabled={saving}onClick={onConfirm}>
        {saving?"처리 중...":confirm}
      </Button>
    </div>;}function Empty(){return<p className="py-8 text-center text-sm text-slate-400">
      조건에 맞는 자재 사용요청이 없습니다.
    </p>;}
