begin;

create table public.project_cost_import_batches (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  file_name text not null,
  row_count integer not null,
  supply_total_krw bigint not null,
  vat_total_krw bigint not null,
  grand_total_krw bigint not null,
  constraint project_cost_import_batches_file_check check (btrim(file_name) <> '' and char_length(file_name) <= 255),
  constraint project_cost_import_batches_count_check check (row_count between 1 and 1000),
  constraint project_cost_import_batches_amount_check check (supply_total_krw >= 0 and vat_total_krw >= 0 and grand_total_krw = supply_total_krw + vat_total_krw)
);

alter table public.project_cost_entries add column import_batch_id uuid references public.project_cost_import_batches(id) on update cascade on delete restrict;
create index project_cost_entries_import_batch_idx on public.project_cost_entries(import_batch_id) where import_batch_id is not null;

alter table public.project_cost_import_batches enable row level security;
create policy project_cost_import_batches_select_approved on public.project_cost_import_batches for select to authenticated using(public.is_approved_erp_user());
revoke all on public.project_cost_import_batches from anon,authenticated;
grant select on public.project_cost_import_batches to authenticated;

create or replace function public.import_project_cost_entries(p_file_name text,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path=public set row_security=off as $$
declare v_batch_id uuid; v_row jsonb; v_project_id bigint; v_category_id uuid; v_count integer; v_supply bigint:=0; v_vat bigint:=0; v_total bigint:=0; v_index integer:=0;
begin
  if not public.is_approved_admin() then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
  if p_file_name is null or btrim(p_file_name)='' or char_length(p_file_name)>255 then raise exception '파일명이 올바르지 않습니다.' using errcode='22023'; end if;
  if jsonb_typeof(p_rows)<>'array' then raise exception '비용 목록이 올바르지 않습니다.' using errcode='22023'; end if;
  v_count:=jsonb_array_length(p_rows); if v_count<1 or v_count>1000 then raise exception '비용 행은 1~1,000건이어야 합니다.' using errcode='22023'; end if;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_index:=v_index+1;
    select id into v_project_id from public.projects where project_code=btrim(v_row->>'project_code') limit 1;
    select id into v_category_id from public.project_cost_categories where code=v_row->>'category_code' and code in ('subcontract','transportation','labor','installation','as_service','other') and is_active limit 1;
    if v_project_id is null then raise exception '%행 프로젝트 코드를 찾을 수 없습니다.',v_index using errcode='23503'; end if;
    if v_category_id is null then raise exception '%행 비용 분류가 올바르지 않습니다.',v_index using errcode='23514'; end if;
    if coalesce(btrim(v_row->>'cost_title'),'')='' or char_length(v_row->>'cost_title')>200 then raise exception '%행 비용 제목이 올바르지 않습니다.',v_index using errcode='23514'; end if;
    if (v_row->>'cost_date')!~'^\d{4}-\d{2}-\d{2}$' or (v_row->>'cost_date')::date is null then raise exception '%행 발생일이 올바르지 않습니다.',v_index using errcode='22007'; end if;
    if nullif(v_row->>'recognition_date','') is not null and (v_row->>'recognition_date')!~'^\d{4}-\d{2}-\d{2}$' then raise exception '%행 귀속일이 올바르지 않습니다.',v_index using errcode='22007'; end if;
    if (v_row->>'supply_amount_krw')::bigint<0 or (v_row->>'vat_amount_krw')::bigint<0 or (v_row->>'supply_amount_krw')::bigint+(v_row->>'vat_amount_krw')::bigint<=0 then raise exception '%행 금액이 올바르지 않습니다.',v_index using errcode='23514'; end if;
    if (v_row->>'payment_status') not in ('unpaid','partial','paid','not_applicable') then raise exception '%행 지급상태가 올바르지 않습니다.',v_index using errcode='23514'; end if;
    v_supply:=v_supply+(v_row->>'supply_amount_krw')::bigint; v_vat:=v_vat+(v_row->>'vat_amount_krw')::bigint;
  end loop;
  v_total:=v_supply+v_vat;
  insert into public.project_cost_import_batches(created_by,file_name,row_count,supply_total_krw,vat_total_krw,grand_total_krw) values(auth.uid(),btrim(p_file_name),v_count,v_supply,v_vat,v_total) returning id into v_batch_id;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    select id into v_project_id from public.projects where project_code=btrim(v_row->>'project_code') limit 1;
    select id into v_category_id from public.project_cost_categories where code=v_row->>'category_code' and is_active limit 1;
    insert into public.project_cost_entries(project_id,category_id,cost_title,cost_date,recognition_date,vendor_name,document_number,supply_amount_krw,vat_amount_krw,total_amount_krw,status,payment_status,memo,created_by,import_batch_id)
    values(v_project_id,v_category_id,btrim(v_row->>'cost_title'),(v_row->>'cost_date')::date,nullif(v_row->>'recognition_date','')::date,nullif(btrim(v_row->>'vendor_name'),''),nullif(btrim(v_row->>'document_number'),''),(v_row->>'supply_amount_krw')::bigint,(v_row->>'vat_amount_krw')::bigint,(v_row->>'supply_amount_krw')::bigint+(v_row->>'vat_amount_krw')::bigint,'confirmed',v_row->>'payment_status',nullif(btrim(v_row->>'memo'),''),auth.uid(),v_batch_id);
  end loop;
  return jsonb_build_object('batch_id',v_batch_id,'row_count',v_count,'supply_total_krw',v_supply,'vat_total_krw',v_vat,'grand_total_krw',v_total);
end; $$;
revoke all on function public.import_project_cost_entries(text,jsonb) from public,anon;
grant execute on function public.import_project_cost_entries(text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
