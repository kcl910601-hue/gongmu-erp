-- Run after the migration, or in the same transaction before its COMMIT.
-- All verification records are rolled back; existing contracts are not edited.
begin;
do $$
declare
  project bigint;
  admin_id uuid;
  original_id uuid;
  total_id uuid;
  delta_id uuid;
  payload jsonb;
  preview jsonb;
  result jsonb;
  audit_before bigint;
  rejected boolean;
begin
  select auth_user_id into admin_id from public.employees
    where active and approval_status = 'approved' and role = 'admin' and auth_user_id is not null limit 1;
  select p.id into project from public.projects p
    where not exists (select 1 from public.project_contract_entries e where e.project_id = p.id) order by p.id limit 1;
  if admin_id is null or project is null then raise exception '검증에 사용할 관리자 또는 계약 미등록 프로젝트가 없습니다.'; end if;
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  select count(*) into audit_before from public.activity_logs where project_id = project and target_type = 'project_contract_entry';
  payload := jsonb_build_object('entry_type','original','amount_input_mode','delta','contract_title','ROLLBACK verification',
    'contract_date',current_date,'effective_date',current_date,'supply_amount_krw',40000000,'vat_amount_krw',4000000);
  preview := public.save_project_contract_entry(project,null,payload,false,null);
  if (preview->>'after_supply')::bigint <> 40000000 then raise exception 'Original preview failed'; end if;
  if exists(select 1 from public.project_contract_entries where project_id = project) then raise exception 'Preview wrote data'; end if;
  result := public.save_project_contract_entry(project,null,payload,true,preview->>'revision');
  select id into original_id from public.project_contract_entries where project_id = project and entry_type = 'original';

  rejected := false;
  begin
    perform public.save_project_contract_entry(project,null,payload,true,preview->>'revision');
  exception when serialization_failure then rejected := true;
  end;
  if not rejected then raise exception 'Stale revision was accepted'; end if;

  payload := payload || jsonb_build_object('entry_type','increase','amount_input_mode','total','supply_amount_krw',43000000,'vat_amount_krw',4300000);
  preview := public.save_project_contract_entry(project,null,payload,false,null);
  result := public.save_project_contract_entry(project,null,payload,true,preview->>'revision');
  if (result->>'after_supply')::bigint <> 43000000 then raise exception '40m -> 43m total input failed'; end if;
  select id into total_id from public.project_contract_entries where project_id = project and amount_input_mode = 'total';
  if (select supply_amount_krw from public.project_contract_entries where id = total_id) <> 3000000 then raise exception 'Stored delta is not 3m'; end if;

  payload := payload || jsonb_build_object('amount_input_mode','delta','supply_amount_krw',1000000,'vat_amount_krw',100000);
  preview := public.save_project_contract_entry(project,null,payload,false,null);
  result := public.save_project_contract_entry(project,null,payload,true,preview->>'revision');
  if (result->>'after_supply')::bigint <> 44000000 then raise exception 'Delta input failed'; end if;
  select id into delta_id from public.project_contract_entries where project_id = project and id not in (original_id,total_id);

  payload := payload || jsonb_build_object('entry_type','original','supply_amount_krw',41000000,'vat_amount_krw',4100000);
  preview := public.save_project_contract_entry(project,original_id,payload,false,null);
  result := public.save_project_contract_entry(project,original_id,payload,true,preview->>'revision');
  if (result->>'after_supply')::bigint <> 44000000 then raise exception 'Total anchor changed after earlier edit'; end if;
  if (select supply_amount_krw from public.project_contract_entries where id = total_id) <> 2000000 then raise exception 'Later delta not recalculated'; end if;
  if (select supply_amount_krw from public.project_contract_entries where id = delta_id) <> 1000000 then raise exception 'Delta input was changed'; end if;

  payload := payload || jsonb_build_object('entry_type','increase','amount_input_mode','total','supply_amount_krw',42000000,'vat_amount_krw',4200000);
  preview := public.save_project_contract_entry(project,total_id,payload,false,null);
  result := public.save_project_contract_entry(project,total_id,payload,true,preview->>'revision');
  if (result->>'after_supply')::bigint <> 43000000 then raise exception 'Editing total anchor failed'; end if;

  payload := payload || jsonb_build_object('entry_type','decrease','amount_input_mode','delta','supply_amount_krw',500000,'vat_amount_krw',50000);
  preview := public.save_project_contract_entry(project,null,payload,false,null);
  result := public.save_project_contract_entry(project,null,payload,true,preview->>'revision');
  if (result->>'after_supply')::bigint <> 42500000 then raise exception 'Decrease input failed'; end if;
  preview := public.save_project_contract_entry(project,delta_id,'{"action":"void"}',false,null);
  result := public.save_project_contract_entry(project,delta_id,'{"action":"void"}',true,preview->>'revision');
  if (result->>'after_supply')::bigint <> 41500000 then raise exception 'Void calculation failed'; end if;

  payload := payload || jsonb_build_object('entry_type','original','supply_amount_krw',50000000,'vat_amount_krw',5000000);
  preview := public.save_project_contract_entry(project,original_id,payload,false,null);
  result := public.save_project_contract_entry(project,original_id,payload,true,preview->>'revision');
  if (result->>'after_supply')::bigint <> 41500000 or (result->>'after_vat')::bigint <> 4150000 then raise exception 'Total anchor/VAT failed after direction reversal'; end if;
  if (select entry_type from public.project_contract_entries where id = total_id) <> 'decrease' then raise exception 'Direction reversal failed'; end if;
  if (select count(*) from public.activity_logs where project_id = project and target_type = 'project_contract_entry') <> audit_before + 8 then raise exception 'Audit count failed'; end if;

  rejected := false;
  begin
    perform public.save_project_contract_entry(project,original_id,'{"action":"void"}',false,null);
  exception when check_violation then rejected := true;
  end;
  if not rejected then raise exception 'Original was voided with active changes'; end if;
  rejected := false;
  begin
    perform public.save_project_contract_entry(project,delta_id,payload,false,null);
  exception when check_violation then rejected := true;
  end;
  if not rejected then raise exception 'Void entry was editable'; end if;
  if has_table_privilege('authenticated','public.project_contract_entries','INSERT')
    or has_table_privilege('authenticated','public.project_contract_entries','UPDATE') then raise exception 'Direct write bypass allowed'; end if;

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000000', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
  rejected := false;
  begin
    perform public.save_project_contract_entry(project,null,payload,false,null);
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'Unauthorized preview accepted'; end if;
end;
$$;
select 'PASS: original, total/delta input, edits, downstream recalculation, VAT, void, audit, stale revision, permissions; all verification changes rolled back' as verification;
rollback;
