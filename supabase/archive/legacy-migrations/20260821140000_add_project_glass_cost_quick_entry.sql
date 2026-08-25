begin;

create or replace function public.create_project_glass_cost_entry(p_project_id bigint,p_vendor_organization_id bigint,p_accounting_month date,p_supply_amount_krw bigint,p_vat_amount_krw bigint,p_invoice_number text default null,p_memo text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.glass_cost_statements%rowtype; a public.glass_cost_allocations%rowtype;
begin
 if not public.is_approved_admin() then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
 if not exists(select 1 from public.projects where id=p_project_id) then raise exception '프로젝트를 찾을 수 없습니다.' using errcode='P0002'; end if;
 s:=public.save_glass_cost_statement(null,p_vendor_organization_id,p_accounting_month,p_invoice_number,p_supply_amount_krw,p_vat_amount_krw,p_memo);
 a:=public.save_glass_cost_allocation(s.id,p_project_id,p_supply_amount_krw,p_memo,'save');
 if s.supply_amount_krw<>a.allocated_supply_amount_krw then raise exception '계산서와 프로젝트 배분금액이 일치하지 않습니다.' using errcode='23514'; end if;
 return jsonb_build_object('statement',to_jsonb(s),'allocation',to_jsonb(a));
end $$;

create or replace function public.update_project_glass_cost_entry(p_statement_id uuid,p_project_id bigint,p_vendor_organization_id bigint,p_accounting_month date,p_supply_amount_krw bigint,p_vat_amount_krw bigint,p_invoice_number text default null,p_memo text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.glass_cost_statements%rowtype; a public.glass_cost_allocations%rowtype; active_count integer; active_amount bigint; active_project bigint;
begin
 if not public.is_approved_admin() then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
 select * into s from public.glass_cost_statements where id=p_statement_id for update;
 if not found or s.status<>'active' then raise exception '수정 가능한 계산서를 찾을 수 없습니다.' using errcode='P0002'; end if;
 select count(*),coalesce(sum(allocated_supply_amount_krw),0),min(project_id) into active_count,active_amount,active_project from public.glass_cost_allocations where statement_id=p_statement_id and status='active';
 if active_count<>1 or active_project<>p_project_id or active_amount<>s.supply_amount_krw then raise exception '공동 계산서는 전체 유리 원가관리에서 수정해주세요.' using errcode='23514'; end if;
 if p_supply_amount_krw<s.supply_amount_krw then
  a:=public.save_glass_cost_allocation(p_statement_id,p_project_id,p_supply_amount_krw,p_memo,'save');
  s:=public.save_glass_cost_statement(p_statement_id,p_vendor_organization_id,p_accounting_month,p_invoice_number,p_supply_amount_krw,p_vat_amount_krw,p_memo);
 else
  s:=public.save_glass_cost_statement(p_statement_id,p_vendor_organization_id,p_accounting_month,p_invoice_number,p_supply_amount_krw,p_vat_amount_krw,p_memo);
  a:=public.save_glass_cost_allocation(p_statement_id,p_project_id,p_supply_amount_krw,p_memo,'save');
 end if;
 return jsonb_build_object('statement',to_jsonb(s),'allocation',to_jsonb(a));
end $$;

create or replace function public.void_project_glass_cost_entry(p_statement_id uuid,p_project_id bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.glass_cost_statements%rowtype; a public.glass_cost_allocations%rowtype; active_count integer; active_amount bigint; active_project bigint;
begin
 if not public.is_approved_admin() then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
 select * into s from public.glass_cost_statements where id=p_statement_id for update;
 if not found or s.status<>'active' then raise exception '무효 처리할 계산서를 찾을 수 없습니다.' using errcode='P0002'; end if;
 select count(*),coalesce(sum(allocated_supply_amount_krw),0),min(project_id) into active_count,active_amount,active_project from public.glass_cost_allocations where statement_id=p_statement_id and status='active';
 if active_count<>1 or active_project<>p_project_id or active_amount<>s.supply_amount_krw then raise exception '공동 계산서는 전체 유리 원가관리에서 수정해주세요.' using errcode='23514'; end if;
 a:=public.save_glass_cost_allocation(p_statement_id,p_project_id,1,null,'void');
 s:=public.void_glass_cost_statement(p_statement_id);
 return jsonb_build_object('statement',to_jsonb(s),'allocation',to_jsonb(a));
end $$;

revoke all on function public.create_project_glass_cost_entry(bigint,bigint,date,bigint,bigint,text,text),public.update_project_glass_cost_entry(uuid,bigint,bigint,date,bigint,bigint,text,text),public.void_project_glass_cost_entry(uuid,bigint) from public,anon;
grant execute on function public.create_project_glass_cost_entry(bigint,bigint,date,bigint,bigint,text,text),public.update_project_glass_cost_entry(uuid,bigint,bigint,date,bigint,bigint,text,text),public.void_project_glass_cost_entry(uuid,bigint) to authenticated;
notify pgrst,'reload schema';
commit;
