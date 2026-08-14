export const MATERIAL_USAGE_GROUP_CATEGORIES = ["frame","door","other"] as const;
export const MATERIAL_USAGE_GROUP_STATUSES = ["planned","in_progress","completed"] as const;
export type MaterialUsageGroupCategory = typeof MATERIAL_USAGE_GROUP_CATEGORIES[number];
export type MaterialUsageGroupStatus = typeof MATERIAL_USAGE_GROUP_STATUSES[number];
export const MATERIAL_USAGE_GROUP_CATEGORY_LABELS:Record<MaterialUsageGroupCategory,string>={frame:"문틀",door:"도어",other:"기타"};
export const MATERIAL_USAGE_GROUP_STATUS_LABELS:Record<MaterialUsageGroupStatus,string>={planned:"예정",in_progress:"진행",completed:"완료"};
export type MaterialUsageGroup={id:string;project_id:number;category:MaterialUsageGroupCategory;sequence:number;name:string;planned_date:string|null;status:MaterialUsageGroupStatus;memo:string|null;is_active:boolean;created_at:string;request_count:number;requested_tons:number;allocated_tons:number;unallocated_tons:number};
export function isMaterialUsageGroupCategory(value:unknown):value is MaterialUsageGroupCategory{return typeof value==="string"&&MATERIAL_USAGE_GROUP_CATEGORIES.includes(value as MaterialUsageGroupCategory);}
export function getMaterialUsageGroupName(category:MaterialUsageGroupCategory,sequence:number){return `${MATERIAL_USAGE_GROUP_CATEGORY_LABELS[category]} ${sequence}차`;}
export function aggregateMaterialUsageGroup(rows:readonly {status:"active"|"cancelled";quantity_tons:number;allocated_tons:number}[]){const active=rows.filter(row=>row.status==="active");const requestedTons=active.reduce((sum,row)=>sum+row.quantity_tons,0);const allocatedTons=active.reduce((sum,row)=>sum+row.allocated_tons,0);return{requestCount:active.length,requestedTons,allocatedTons,unallocatedTons:Math.max(requestedTons-allocatedTons,0)};}
