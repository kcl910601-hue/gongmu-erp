import type { LmeMarketPrice } from "@/lib/lme-market";
import type { RawMaterialContract } from "@/lib/raw-material-contracts";

export const CONTRACT_COMPARISON_THRESHOLDS = { favorableMax: -3, normalMax: 3, cautionMax: 7 } as const;
export type ContractComparisonStatus = "favorable" | "normal" | "caution" | "high";
export type ContractComparisonUnavailable = "no_market" | "zero_remaining" | "cancelled" | "inactive_material" | "unavailable";
export type ContractComparisonResult = {
  contract: RawMaterialContract; supplier: { id: string; name: string | null }; material: { code: string; name: string | null; is_active: boolean };
  latest_market: LmeMarketPrice | null; current_procurement_cost_krw_per_kg: number | null; difference_krw_per_kg: number | null;
  difference_rate: number | null; estimated_difference_amount_krw: number | null; comparison_status: ContractComparisonStatus | ContractComparisonUnavailable;
  calculation_basis: { latest_reference_date: string | null; latest_round: 1 | 2 | null; domestic_lme_krw_per_kg: number | null; processing_cost_krw_per_kg: number; contract_price_krw_per_kg: number; remaining_quantity_ton: number; note: string };
  calculated_at: string;
};
export const COMPARISON_STATUS_PRESENTATION: Record<ContractComparisonResult["comparison_status"], { label: string; className: string }> = {
  favorable:{label:"유리",className:"bg-emerald-100 text-emerald-700"},normal:{label:"보통",className:"bg-blue-100 text-blue-700"},caution:{label:"주의",className:"bg-amber-100 text-amber-700"},high:{label:"부담 높음",className:"bg-red-100 text-red-700"},no_market:{label:"최신 시세 없음",className:"bg-slate-100 text-slate-600"},zero_remaining:{label:"잔여물량 없음",className:"bg-slate-100 text-slate-600"},cancelled:{label:"계약 취소",className:"bg-slate-100 text-slate-600"},inactive_material:{label:"Material 비활성",className:"bg-slate-100 text-slate-600"},unavailable:{label:"계산 불가",className:"bg-slate-100 text-slate-600"},
};
function round(value:number,digits:number){const factor=10**digits;return Math.round((value+Number.EPSILON)*factor)/factor;}
export function getComparisonStatus(rate:number):ContractComparisonStatus{if(rate<=CONTRACT_COMPARISON_THRESHOLDS.favorableMax)return"favorable";if(rate<=CONTRACT_COMPARISON_THRESHOLDS.normalMax)return"normal";if(rate<=CONTRACT_COMPARISON_THRESHOLDS.cautionMax)return"caution";return"high";}
export function calculateContractComparison(contract:RawMaterialContract,material:{code:string;name:string|null;is_active:boolean},market:LmeMarketPrice|null,calculatedAt:string):ContractComparisonResult{
  let unavailable:ContractComparisonUnavailable|null=null;let note="";
  if(contract.status==="cancelled"){unavailable="cancelled";note="취소된 계약은 비교하지 않습니다.";}else if(contract.remaining_quantity_ton<=0){unavailable="zero_remaining";note="잔여물량이 없어 비교하지 않습니다.";}else if(!material.is_active){unavailable="inactive_material";note="비활성 Material은 비교하지 않습니다.";}else if(!market){unavailable="no_market";note="해당 Material의 최신 시장 시세가 없습니다.";}else if(market.domestic_lme_krw_per_kg===null){unavailable="unavailable";note="환율이 없어 국내환산 LME를 계산할 수 없습니다.";}
  const basis={latest_reference_date:market?.reference_date??null,latest_round:market?.round??null,domestic_lme_krw_per_kg:market?.domestic_lme_krw_per_kg??null,processing_cost_krw_per_kg:contract.processing_cost_krw_per_kg,contract_price_krw_per_kg:contract.contract_price_krw_per_kg,remaining_quantity_ton:contract.remaining_quantity_ton,note};
  if(unavailable||!market||market.domestic_lme_krw_per_kg===null)return{contract,supplier:{id:contract.supplier_id,name:contract.supplier_name},material,latest_market:market,current_procurement_cost_krw_per_kg:null,difference_krw_per_kg:null,difference_rate:null,estimated_difference_amount_krw:null,comparison_status:unavailable??"unavailable",calculation_basis:basis,calculated_at:calculatedAt};
  const procurement=round(market.domestic_lme_krw_per_kg+contract.processing_cost_krw_per_kg,4);if(!Number.isFinite(procurement)||procurement<=0)return{contract,supplier:{id:contract.supplier_id,name:contract.supplier_name},material,latest_market:market,current_procurement_cost_krw_per_kg:null,difference_krw_per_kg:null,difference_rate:null,estimated_difference_amount_krw:null,comparison_status:"unavailable",calculation_basis:{...basis,note:"현재 조달원가를 계산할 수 없습니다."},calculated_at:calculatedAt};
  const difference=round(contract.contract_price_krw_per_kg-procurement,4);const rate=round(difference/procurement*100,4);const estimated=Math.round(difference*contract.remaining_quantity_ton*1000);
  return{contract,supplier:{id:contract.supplier_id,name:contract.supplier_name},material,latest_market:market,current_procurement_cost_krw_per_kg:procurement,difference_krw_per_kg:difference,difference_rate:rate,estimated_difference_amount_krw:estimated,comparison_status:getComparisonStatus(rate),calculation_basis:{...basis,note:"최신 국내환산 LME와 계약 인가공비를 합산한 조달원가 기준입니다."},calculated_at:calculatedAt};
}
