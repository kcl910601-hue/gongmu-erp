"use client";import{useMemo,useState}from"react";import{History,Plus,Settings2}from"lucide-react";import{Button}from"@/components/ui/Button";import{ErrorState}from"@/components/ui/ErrorState";import{Skeleton}from"@/components/ui/Skeleton";import{ContractEntryDialog}from"@/components/statistics/lme/ContractEntryDialog";import{ContractHistoryDialog}from"@/components/statistics/lme/ContractHistoryDialog";import{ContractOperationDialog}from"@/components/statistics/lme/ContractOperationDialog";import{useRawMaterialContracts,type ContractSupplier}from"@/hooks/useRawMaterialContracts";import{formatNumber}from"@/lib/lme";import{CONTRACT_STATUS_PRESENTATION,isContractEndingSoon,type RawMaterialContract}from"@/lib/raw-material-contracts";const kg=(tons:number)=>`${formatNumber(tons*1000,1)} kg`;export function RawMaterialContractsPanel({isAdmin}:{isAdmin:boolean;}){const data=useRawMaterialContracts();const[entryOpen,setEntryOpen]=useState(false);const[operation,setOperation]=useState<RawMaterialContract|null>(null);const[historySupplier,setHistorySupplier]=useState<ContractSupplier|null>(null);const activeCount=data.contracts.filter(item=>item.status==="active").length;const endingSoon=data.contracts.filter(item=>isContractEndingSoon(item)).length;const available=useMemo(()=>data.contracts.filter(item=>item.status==="active").reduce((sum,item)=>sum+item.allocation_summary.availableTons,0),[data.contracts]);return<div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-bold">원자재 공급계약</h2>
          <p className="mt-1 text-sm text-slate-500">
            계약 점유·가용량을 확인하고, 위 미배정 요청에서 프로젝트에
            배정합니다.
          </p>
        </div>
        {isAdmin&&<Button variant="primary"onClick={()=>setEntryOpen(true)}>
            <Plus size={15}/>
            계약 등록
          </Button>}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[["진행중 계약",`${activeCount}건`],["30일 이내 종료 예정",`${endingSoon}건`],["진행중 계약 가용량",kg(available)]].map(([label,value])=><div key={label}className="rounded-2xl border bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-500">{label}</p>
            <p className="mt-1 text-xl font-bold">{value}</p>
          </div>)}
      </div>
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <select value={data.filters.supplier}onChange={e=>data.setFilters({...data.filters,supplier:e.target.value})}className="rounded-xl border px-3 py-2 text-sm">
            <option value="">전체 AL업체</option>
            {data.suppliers.map(item=><option key={item.id}value={item.id}>
                {item.name}
              </option>)}
          </select>
          <select value={data.filters.status}onChange={e=>data.setFilters({...data.filters,status:e.target.value})}className="rounded-xl border px-3 py-2 text-sm">
            <option value="">전체 상태</option>
            {Object.entries(CONTRACT_STATUS_PRESENTATION).map(([value,item])=><option key={value}value={value}>
                  {item.label}
                </option>)}
          </select>
          <select value={data.filters.material}onChange={e=>data.setFilters({...data.filters,material:e.target.value})}className="rounded-xl border px-3 py-2 text-sm">
            <option value="AL">AL · 알루미늄</option>
          </select>
          <input type="number"placeholder="계약연도"value={data.filters.year}onChange={e=>data.setFilters({...data.filters,year:e.target.value})}className="rounded-xl border px-3 py-2 text-sm"/>
          <Button variant="outline"onClick={()=>data.setFilters({supplier:"",status:"",material:"AL",year:""})}>
            필터 초기화
          </Button>
        </div>
      </section>
      {data.isLoading?<Skeleton className="h-72 rounded-2xl"/>:data.error?<ErrorState message={data.error}onRetry={()=>void data.reload()}/>:<section className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="overflow-x-auto rounded-xl border">
            <table className="min-w-[1550px] w-full text-left text-xs">
              <thead className="bg-slate-100">
                <tr>
                  {["AL업체","계약명","Material","연도","계약기간","계약단가","인가공비","계약량","확정 배정","예정 배정","총 점유","가용량","상태","메모","관리"].map(label=><th key={label}className="px-3 py-2">
                      {label}
                    </th>)}
                </tr>
              </thead>
              <tbody>
                {data.contracts.map(item=>{const status=CONTRACT_STATUS_PRESENTATION[item.status];const occupied=item.allocation_summary.confirmedTons+item.allocation_summary.plannedTons;return<tr key={item.id}className="border-t">
                      <td className="px-3 py-2">
                        <button className="font-semibold text-blue-700"onClick={()=>setHistorySupplier(data.suppliers.find(s=>s.id===item.supplier_id)??null)}>
                          {item.supplier_name??"-"}
                        </button>
                      </td>
                      <td className="px-3 py-2 font-semibold">
                        {item.contract_name}
                      </td>
                      <td className="px-3 py-2">{item.material_code}</td>
                      <td className="px-3 py-2">{item.contract_year}</td>
                      <td className="px-3 py-2">
                        {item.effective_start_date} ~ {item.effective_end_date}
                      </td>
                      <td className="px-3 py-2">
                        {formatNumber(item.contract_price_krw_per_kg)}
                      </td>
                      <td className="px-3 py-2">
                        {formatNumber(item.processing_cost_krw_per_kg)}
                      </td>
                      <td className="px-3 py-2">
                        {kg(item.contract_quantity_ton)}
                      </td>
                      <td className="px-3 py-2">
                        {kg(item.allocation_summary.confirmedTons)}
                      </td>
                      <td className="px-3 py-2">
                        {kg(item.allocation_summary.plannedTons)}
                      </td>
                      <td className="px-3 py-2 font-semibold">
                        {kg(occupied)}
                      </td>
                      <td className="px-3 py-2 font-semibold text-blue-700">
                        {kg(item.allocation_summary.availableTons)}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-1 font-semibold ${status.className}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="max-w-52 truncate px-3 py-2">
                        {item.memo??"-"}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <button aria-label="계약 배정 내역"onClick={()=>setHistorySupplier(data.suppliers.find(s=>s.id===item.supplier_id)??null)}className="rounded-lg border p-1.5">
                            <History size={14}/>
                          </button>
                          {isAdmin&&<button aria-label="운영값 수정"onClick={()=>setOperation(item)}className="rounded-lg border p-1.5">
                              <Settings2 size={14}/>
                            </button>}
                        </div>
                      </td>
                    </tr>;})}
                {data.contracts.length===0&&<tr>
                    <td colSpan={15}className="px-4 py-12 text-center text-sm text-slate-400">
                      등록된 원자재 공급계약이 없습니다.
                    </td>
                  </tr>}
              </tbody>
            </table>
          </div>
        </section>}
      <ContractEntryDialog open={entryOpen}suppliers={data.suppliers}onClose={()=>setEntryOpen(false)}onSaved={data.reload}/>
      <ContractOperationDialog contract={operation}onClose={()=>setOperation(null)}onSaved={data.reload}/>
      <ContractHistoryDialog supplier={historySupplier}isAdmin={isAdmin}onClose={()=>setHistorySupplier(null)}onChanged={data.reload}/>
    </div>;}
