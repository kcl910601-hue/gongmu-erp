-- Production legacy baseline captured on 2026-08-25.
-- Production already has this schema: never execute this file against the
-- production project during baseline adoption. Production receives only the
-- matching migration-history version after explicit verification.
-- Source: credential-free public schema-only logical backup.

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.11

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
-- transaction_timeout is PostgreSQL 17-specific and is not required to replay
-- the schema on a compatible Supabase environment.
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: partner_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.partner_type AS ENUM (
    'supplier',
    'assembly',
    'glass',
    'coating',
    'accessory'
);


--
-- Name: accept_all_share_invitations(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.accept_all_share_invitations() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_employee_id bigint;
  v_requested integer := 0;
  v_accepted integer := 0;
begin
  v_employee_id := public.sharing_current_employee_id();
  if v_employee_id is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  with pending as materialized (
    select invitation.id, invitation.shared_item_id, invitation.permission
    from public.share_invitations invitation
    where invitation.invitee_id = v_employee_id
      and invitation.status = 'pending'
    order by invitation.created_at asc, invitation.id asc
    for update
  ), inserted_members as (
    insert into public.shared_item_members(shared_item_id, employee_id, permission)
    select pending.shared_item_id, v_employee_id, pending.permission
    from pending
    on conflict (shared_item_id, employee_id) do nothing
  ), accepted as (
    update public.share_invitations invitation
    set status = 'accepted', responded_at = now(), updated_at = now()
    from pending
    where invitation.id = pending.id
      and invitation.invitee_id = v_employee_id
      and invitation.status = 'pending'
    returning invitation.id
  )
  select (select count(*) from pending), (select count(*) from accepted)
  into v_requested, v_accepted;

  return jsonb_build_object(
    'requested', v_requested,
    'accepted', v_accepted,
    'skipped', greatest(v_requested - v_accepted, 0),
    'failed', 0
  );
end;
$$;


--
-- Name: acquire_editing_lock(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.acquire_editing_lock(p_resource_type text, p_resource_id text) RETURNS TABLE(acquired boolean, lock_token uuid, employee_id bigint, employee_name text, expires_at timestamp with time zone, is_mine boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_employee_id bigint; v_inserted integer;
begin
  v_employee_id := public.assert_editing_lock_permission(p_resource_type, p_resource_id);
  delete from public.editing_locks l where l.resource_type = p_resource_type and l.resource_id = p_resource_id and l.expires_at <= now();
  insert into public.editing_locks(resource_type, resource_id, employee_id)
  values (p_resource_type, p_resource_id, v_employee_id)
  on conflict (resource_type, resource_id) do nothing;
  get diagnostics v_inserted = row_count;
  return query select v_inserted = 1, l.lock_token, l.employee_id, e.name, l.expires_at, l.employee_id = v_employee_id
    from public.editing_locks l join public.employees e on e.id = l.employee_id
    where l.resource_type = p_resource_type and l.resource_id = p_resource_id;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: material_contract_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.material_contract_allocations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contract_id uuid NOT NULL,
    project_id bigint,
    quantity_tons numeric(16,4) NOT NULL,
    allocation_date date NOT NULL,
    status text NOT NULL,
    purchase_order_no text,
    memo text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    allocation_type text NOT NULL,
    destination_name text,
    usage_request_id uuid,
    CONSTRAINT material_contract_allocations_destination_name_check CHECK (((destination_name IS NULL) OR (char_length(destination_name) <= 200))),
    CONSTRAINT material_contract_allocations_memo_check CHECK (((memo IS NULL) OR (char_length(memo) <= 2000))),
    CONSTRAINT material_contract_allocations_purchase_order_check CHECK (((purchase_order_no IS NULL) OR (char_length(purchase_order_no) <= 100))),
    CONSTRAINT material_contract_allocations_quantity_tons_check CHECK ((quantity_tons > (0)::numeric)),
    CONSTRAINT material_contract_allocations_status_check CHECK ((status = ANY (ARRAY['planned'::text, 'confirmed'::text, 'cancelled'::text]))),
    CONSTRAINT material_contract_allocations_target_check CHECK ((((allocation_type = 'project'::text) AND (project_id IS NOT NULL) AND (destination_name IS NULL)) OR ((allocation_type = 'factory'::text) AND (project_id IS NULL)) OR ((allocation_type = ANY (ARRAY['as'::text, 'sample'::text, 'etc'::text])) AND (project_id IS NULL) AND (NULLIF(btrim(destination_name), ''::text) IS NOT NULL))))
);


--
-- Name: allocate_material_usage_request(uuid, uuid, numeric, text, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.allocate_material_usage_request(p_usage_request_id uuid, p_contract_id uuid, p_quantity_tons numeric, p_status text, p_expected_available numeric DEFAULT NULL::numeric) RETURNS public.material_contract_allocations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare v_employee public.employees%rowtype; v_request public.material_usage_requests%rowtype; v_contract public.raw_material_contracts%rowtype; v_available numeric(16,4); v_allocated numeric(16,4); v_result public.material_contract_allocations%rowtype;
begin
  select * into v_employee from public.employees where auth_user_id=auth.uid() and active=true and approval_status='approved';
  if v_employee.id is null or v_employee.role<>'admin' then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
  select * into v_request from public.material_usage_requests where id=p_usage_request_id and status='active' for update;
  if not found then raise exception '사용요청을 찾을 수 없습니다.' using errcode='P0002'; end if;
  select * into v_contract from public.raw_material_contracts where id=p_contract_id and material_code=v_request.material_code and status='active' for update;
  if not found then raise exception '동일 원자재의 활성 계약이 필요합니다.' using errcode='P0002'; end if;
  if p_status not in ('planned','confirmed') or p_quantity_tons is null or p_quantity_tons<=0 or p_quantity_tons<>round(p_quantity_tons,4) then raise exception '배정값을 확인해주세요.' using errcode='22023'; end if;
  select greatest(v_contract.contract_quantity_ton-coalesce(sum(quantity_tons) filter(where status in ('planned','confirmed')),0),0) into v_available from public.material_contract_allocations where contract_id=v_contract.id;
  select coalesce(sum(quantity_tons) filter(where status in ('planned','confirmed')),0) into v_allocated from public.material_contract_allocations where usage_request_id=v_request.id;
  if p_expected_available is not null and abs(v_available-p_expected_available)>0.00005 then raise exception '계약 가용량이 변경되었습니다. 배정 계획을 다시 확인해주세요.' using errcode='40001'; end if;
  if p_quantity_tons>v_available+0.00005 or v_allocated+p_quantity_tons>v_request.quantity_tons+0.00005 then raise exception '가용량 또는 미배정량을 초과할 수 없습니다.' using errcode='23514'; end if;
  insert into public.material_contract_allocations(contract_id,usage_request_id,allocation_type,project_id,destination_name,quantity_tons,allocation_date,status,created_by)
  values(v_contract.id,v_request.id,v_request.allocation_type,v_request.project_id,v_request.destination_name,p_quantity_tons,v_request.usage_date,p_status,auth.uid()) returning * into v_result;
  perform public.record_material_allocation_activity(v_contract.id,v_result.id,'material_allocation_created','미배정 물량 추가 배정',null,'배정',null,jsonb_build_object('usage_request_id',v_request.id,'quantity_tons',p_quantity_tons,'status',p_status),null,to_char(p_quantity_tons,'FM999999999990.0000')||'t');
  return v_result;
end; $$;


--
-- Name: archive_material_usage_group(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.archive_material_usage_group(p_group_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare v_employee public.employees%rowtype; v_name text;
begin
  select * into v_employee from public.employees where auth_user_id=auth.uid() and active=true and approval_status='approved';
  if v_employee.id is null or v_employee.role<>'admin' then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
  update public.material_usage_groups set is_active=false,updated_by=auth.uid(),updated_at=now() where id=p_group_id and is_active=true returning name into v_name;
  if not found then raise exception '활성 사용구분을 찾을 수 없습니다.' using errcode='P0002'; end if;
  insert into public.activity_logs(activity_type,action_type,target_type,employee_id,employee_name,employee_email,title,description,metadata)
  values('material_usage_group_archived','material_usage_group_archived','material_usage_group',v_employee.id,v_employee.name,v_employee.email,'자재 사용구분 Archive',v_name,jsonb_build_object('material_usage_group_id',p_group_id));
end $$;


--
-- Name: assert_accessory_vendor(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assert_accessory_vendor() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$ begin
 if new.vendor_organization_id is not null and not exists(select 1 from public.organizations where id=new.vendor_organization_id and partner_type='accessory') then raise exception '부자재업체만 선택할 수 있습니다.' using errcode='23514'; end if; return new; end $$;


--
-- Name: assert_coating_vendor(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assert_coating_vendor() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$ begin
 if not exists(select 1 from public.organizations where id=new.vendor_organization_id and partner_type='coating') then raise exception '도장업체만 선택할 수 있습니다.' using errcode='23514'; end if; return new; end $$;


--
-- Name: assert_editing_lock_permission(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assert_editing_lock_permission(p_resource_type text, p_resource_id text) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$ declare eid bigint; allowed boolean:=false; begin
 select id into eid from public.employees where auth_user_id=auth.uid() and active=true and approval_status='approved'; if eid is null then raise exception 'permission denied'; end if;
 case p_resource_type when 'project' then allowed:=p_resource_id~'^[0-9]+$' and public.can_manage_projects() and exists(select 1 from public.projects where id=p_resource_id::bigint); when 'task' then allowed:=p_resource_id~'^[0-9]+$' and public.can_edit_tasks() and exists(select 1 from public.tasks where id=p_resource_id::bigint); when 'shipment' then allowed:=p_resource_id~'^[0-9]+$' and public.can_edit_tasks() and exists(select 1 from public.shipments where id=p_resource_id::bigint); when 'employee' then allowed:=p_resource_id~'^[0-9]+$' and public.is_approved_admin(); when 'setting' then allowed:=public.can_manage_settings(); when 'comment' then allowed:=p_resource_id~'^[0-9]+$'; when 'personal_note' then allowed:=p_resource_id~*'^[0-9a-f-]{36}$'; when 'material_usage_request' then allowed:=p_resource_id~*'^[0-9a-f-]{36}$' and public.is_approved_admin(); when 'material_usage_group' then allowed:=p_resource_id~*'^[0-9a-f-]{36}$' and public.is_approved_admin(); when 'glass_cost_statement' then allowed:=p_resource_id~*'^[0-9a-f-]{36}$' and public.is_approved_admin() and exists(select 1 from public.glass_cost_statements where id=p_resource_id::uuid and status='active'); when 'coating_cost_statement' then allowed:=p_resource_id~*'^[0-9a-f-]{36}$' and public.is_approved_admin() and exists(select 1 from public.coating_cost_statements where id=p_resource_id::uuid and status='active'); when 'accessory_item' then allowed:=p_resource_id~*'^[0-9a-f-]{36}$' and public.is_approved_admin() and exists(select 1 from public.accessory_items where id=p_resource_id::uuid); when 'project_accessory_usage' then allowed:=p_resource_id~*'^[0-9a-f-]{36}$' and public.is_approved_admin() and exists(select 1 from public.project_accessory_usages where id=p_resource_id::uuid and status='active'); else allowed:=false; end case;
 if not allowed then raise exception 'resource not editable'; end if; return eid; end $_$;


--
-- Name: assert_glass_vendor(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assert_glass_vendor() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$ begin
 if not exists(select 1 from public.organizations where id=new.vendor_organization_id and partner_type='glass') then raise exception '유리업체만 선택할 수 있습니다.' using errcode='23514'; end if; return new; end $$;


--
-- Name: assert_project_assembly_organization(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assert_project_assembly_organization() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if not exists (
    select 1 from public.organizations organization
    where organization.id = new.organization_id
      and organization.partner_type = 'assembly'
      and organization.is_active is true
  ) then
    raise exception '조립처 타입의 활성 협력업체만 프로젝트에 연결할 수 있습니다.' using errcode = '23514';
  end if;
  return new;
end;
$$;


--
-- Name: assert_supplier_organization(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assert_supplier_organization() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if not exists (
    select 1 from public.organizations organization
    join public.organization_categories category
      on category.id = organization.category_id
    where organization.id = new.organization_id
      and organization.partner_type = 'supplier'
      and category.code = 'partner'
  ) then
    raise exception '구매처 타입의 협력업체만 suppliers에 연결할 수 있습니다.' using errcode = '23514';
  end if;
  return new;
end;
$$;


--
-- Name: assert_valid_assembly_vendor_ids(bigint[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assert_valid_assembly_vendor_ids(p_vendor_ids bigint[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_ids bigint[] := coalesce(p_vendor_ids, array[]::bigint[]);
begin
  if cardinality(v_ids) <> (select count(distinct id) from unnest(v_ids) id) then
    raise exception using message = '조립처가 중복되었습니다.', errcode = '22023';
  end if;

  if cardinality(v_ids) <> (
    select count(*) from public.organizations organization
    where organization.id = any(v_ids)
      and organization.partner_type = 'assembly'
      and organization.is_active is true
  ) then
    raise exception using message = '활성 조립처가 아닌 업체가 포함되었습니다.', errcode = '23514';
  end if;
end;
$$;


--
-- Name: calculate_lme_market_price(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_lme_market_price() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  if not exists (select 1 from public.lme_materials where code = new.material_code and is_active) then
    raise exception 'Material code does not exist or is inactive.' using errcode = '23514';
  end if;
  new.reference_month := date_trunc('month', new.reference_date)::date;
  if new.exchange_rate_krw_per_usd is null then
    new.domestic_lme_krw_per_kg := null;
  else
    new.domestic_lme_krw_per_kg := round(new.lme_al_usd_per_ton * new.exchange_rate_krw_per_usd / 1000, 4);
  end if;
  return new;
end;
$$;


--
-- Name: calculate_lme_price_record(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_lme_price_record() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  threshold_row public.lme_status_thresholds%rowtype;
  previous_row public.lme_price_records%rowtype;
begin
  if not public.is_approved_admin() then
    raise exception 'Admin permission is required.' using errcode = '42501';
  end if;
  select * into threshold_row from public.lme_status_thresholds where id = 1;
  if not found then raise exception 'LME status threshold row is missing.'; end if;

  new.reference_month = date_trunc('month', new.reference_date)::date;
  new.is_current = true;
  if new.supersedes_id is not null then
    if new.supersedes_id = new.id then raise exception 'An LME revision cannot supersede itself.'; end if;
    select * into previous_row
    from public.lme_price_records
    where id = new.supersedes_id
    for update;
    if not found or previous_row.is_current is not true then
      raise exception 'The superseded LME record is not the current revision.' using errcode = 'P0002';
    end if;
    if previous_row.reference_month <> new.reference_month
       or previous_row.round <> new.round
       or previous_row.supplier_id <> new.supplier_id then
      raise exception 'A revision must retain reference month, round, and supplier.' using errcode = '23514';
    end if;
    new.revision = previous_row.revision + 1;
    update public.lme_price_records set is_current = false where id = previous_row.id;
  else
    new.revision = 1;
  end if;

  new.domestic_lme_krw_per_kg = round(new.lme_al_usd_per_ton * new.exchange_rate_krw_per_usd / 1000, 4);
  new.standard_cost_krw_per_kg = round(new.domestic_lme_krw_per_kg + new.processing_cost_krw_per_kg, 4);
  new.difference_krw_per_kg = round(new.applied_price_krw_per_kg - new.standard_cost_krw_per_kg, 4);
  new.difference_rate = case when new.standard_cost_krw_per_kg = 0 then 0 else round(new.difference_krw_per_kg / new.standard_cost_krw_per_kg * 100, 4) end;
  new.status = case
    when new.difference_rate <= 0 then 'favorable'
    when new.difference_rate <= threshold_row.normal_max_rate then 'normal'
    when new.difference_rate <= threshold_row.caution_max_rate then 'caution'
    else 'high'
  end;
  return new;
end;
$$;


--
-- Name: can_comment_shared_item(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_comment_shared_item(p_shared_item_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.shared_items
    where id = p_shared_item_id and owner_id = public.sharing_current_employee_id()
  ) or exists (
    select 1 from public.shared_item_members
    where shared_item_id = p_shared_item_id and employee_id = public.sharing_current_employee_id()
  )
$$;


--
-- Name: can_edit_shared_note(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_edit_shared_note(note_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.shared_items si
    join public.shared_item_members sim on sim.shared_item_id = si.id
    where si.item_id = note_id
      and sim.employee_id = public.sharing_current_employee_id()
      and sim.permission = 'edit'
  )
$$;


--
-- Name: can_edit_tasks(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_edit_tasks() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select public.has_erp_role(array['admin', 'manager', 'staff']);
$$;


--
-- Name: can_manage_projects(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_manage_projects() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select public.has_erp_role(array['admin', 'manager']);
$$;


--
-- Name: can_manage_settings(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_manage_settings() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select public.has_erp_role(array['admin', 'manager']);
$$;


--
-- Name: can_view_shared_activity(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_view_shared_activity(p_item_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.personal_notes pn
    join public.employees e on e.auth_user_id = pn.user_id
    where pn.id = p_item_id and e.id = public.sharing_current_employee_id()
  ) or exists (
    select 1 from public.shared_items si
    join public.shared_item_members sim on sim.shared_item_id = si.id
    where si.item_id = p_item_id and sim.employee_id = public.sharing_current_employee_id()
  )
$$;


--
-- Name: can_view_shared_note(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_view_shared_note(note_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.shared_items si
    join public.shared_item_members sim on sim.shared_item_id = si.id
    where si.item_id = note_id
      and sim.employee_id = public.sharing_current_employee_id()
  )
$$;


--
-- Name: cancel_material_usage_request(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_material_usage_request(p_usage_request_id uuid, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_employee public.employees%rowtype; v_request public.material_usage_requests%rowtype;
  v_allocation record; v_confirmed numeric(16,4); v_cancelled integer:=0;
begin
  select * into v_employee from public.employees where auth_user_id=auth.uid() and active=true and approval_status='approved';
  if v_employee.id is null or v_employee.role <> 'admin' then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
  select * into v_request from public.material_usage_requests where id=p_usage_request_id and status='active' for update;
  if not found then raise exception '활성 사용요청을 찾을 수 없습니다.' using errcode='P0002'; end if;
  select coalesce(sum(quantity_tons) filter(where status='confirmed'),0) into v_confirmed from public.material_contract_allocations where usage_request_id=v_request.id;
  if v_confirmed>0 and nullif(btrim(p_reason),'') is null then raise exception '확정 배정이 포함된 요청은 취소 사유가 필요합니다.' using errcode='22023'; end if;
  for v_allocation in update public.material_contract_allocations set status='cancelled',updated_at=now()
    where usage_request_id=v_request.id and status in ('planned','confirmed') returning *
  loop
    v_cancelled:=v_cancelled+1;
    perform public.record_material_allocation_activity(v_allocation.contract_id,v_allocation.id,'material_allocation_cancelled','사용요청 취소에 따른 배정 취소',v_allocation.status,'cancelled',null,jsonb_build_object('usage_request_id',v_request.id,'reason',nullif(btrim(p_reason),'')),to_char(v_allocation.quantity_tons,'FM999999999990.0000')||'t',null);
  end loop;
  update public.material_usage_requests set status='cancelled',updated_by=auth.uid(),updated_at=now() where id=v_request.id;
  insert into public.activity_logs(activity_type,action_type,target_type,employee_id,employee_name,employee_email,title,description,metadata)
  values('material_usage_request_cancelled','material_usage_request_cancelled','material_usage_request',v_employee.id,v_employee.name,v_employee.email,'원자재 사용요청 취소',nullif(btrim(p_reason),''),jsonb_build_object('usage_request_id',v_request.id,'cancelled_allocations',v_cancelled,'confirmed_tons',v_confirmed,'reason',nullif(btrim(p_reason),'')));
  return jsonb_build_object('cancelled',true,'cancelled_allocations',v_cancelled,'confirmed_tons',v_confirmed);
end; $$;


--
-- Name: cancel_share_invitation(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_share_invitation(p_invitation_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update public.share_invitations set status = 'cancelled', updated_at = now()
  where id = p_invitation_id and inviter_id = public.sharing_current_employee_id() and status = 'pending';
  if not found then raise exception 'invitation_not_pending'; end if;
end;
$$;


--
-- Name: material_usage_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.material_usage_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id bigint NOT NULL,
    category text NOT NULL,
    sequence integer NOT NULL,
    name text NOT NULL,
    planned_date date,
    status text DEFAULT 'planned'::text NOT NULL,
    memo text,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT material_usage_groups_category_check CHECK ((category = ANY (ARRAY['frame'::text, 'door'::text, 'other'::text]))),
    CONSTRAINT material_usage_groups_memo_check CHECK (((memo IS NULL) OR (char_length(memo) <= 2000))),
    CONSTRAINT material_usage_groups_name_check CHECK ((NULLIF(btrim(name), ''::text) IS NOT NULL)),
    CONSTRAINT material_usage_groups_sequence_check CHECK ((sequence > 0)),
    CONSTRAINT material_usage_groups_status_check CHECK ((status = ANY (ARRAY['planned'::text, 'in_progress'::text, 'completed'::text])))
);

ALTER TABLE ONLY public.material_usage_groups REPLICA IDENTITY FULL;


--
-- Name: create_material_usage_group(bigint, text, date, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_material_usage_group(p_project_id bigint, p_category text, p_planned_date date DEFAULT NULL::date, p_memo text DEFAULT NULL::text) RETURNS public.material_usage_groups
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare v_employee public.employees%rowtype; v_sequence integer; v_result public.material_usage_groups%rowtype; v_label text;
begin
  select * into v_employee from public.employees where auth_user_id=auth.uid() and active=true and approval_status='approved';
  if v_employee.id is null or v_employee.role<>'admin' then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
  if p_category not in ('frame','door','other') or not exists(select 1 from public.projects where id=p_project_id) then raise exception '프로젝트 또는 구분을 확인해 주세요.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_project_id::text||':'||p_category,0));
  select coalesce(max(sequence),0)+1 into v_sequence from public.material_usage_groups where project_id=p_project_id and category=p_category;
  v_label:=case p_category when 'frame' then '문틀' when 'door' then '도어' else '기타' end;
  insert into public.material_usage_groups(project_id,category,sequence,name,planned_date,memo,created_by)
  values(p_project_id,p_category,v_sequence,v_label||' '||v_sequence||'차',p_planned_date,nullif(btrim(p_memo),''),auth.uid()) returning * into v_result;
  insert into public.activity_logs(activity_type,action_type,target_type,employee_id,employee_name,employee_email,title,description,metadata)
  values('material_usage_group_created','material_usage_group_created','material_usage_group',v_employee.id,v_employee.name,v_employee.email,'자재 사용구분 생성',v_result.name,jsonb_build_object('material_usage_group_id',v_result.id,'project_id',p_project_id,'category',p_category,'sequence',v_sequence));
  return v_result;
end $$;


--
-- Name: create_material_usage_request(uuid, text, bigint, text, numeric, date, text, text, text, text, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_material_usage_request(p_starting_contract_id uuid, p_allocation_type text, p_project_id bigint, p_destination_name text, p_quantity_tons numeric, p_usage_date date, p_status text, p_purchase_order_no text, p_memo text, p_strategy text, p_expected_starting_available numeric DEFAULT NULL::numeric, p_increase_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_employee public.employees%rowtype; v_start public.raw_material_contracts%rowtype; v_request_id uuid;
  v_contract record; v_allocated numeric(16,4) := 0; v_available numeric(16,4); v_take numeric(16,4);
  v_start_available numeric(16,4); v_increase numeric(16,4) := 0; v_allocation_id uuid; v_plan jsonb := '[]'::jsonb;
begin
  select * into v_employee from public.employees where auth_user_id=auth.uid() and active=true and approval_status='approved';
  if v_employee.id is null or v_employee.role <> 'admin' then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
  if p_strategy not in ('auto_split','increase_contract','leave_unallocated') then raise exception '배정 전략을 확인해주세요.' using errcode='22023'; end if;
  if p_status not in ('planned','confirmed') or p_quantity_tons is null or p_quantity_tons <= 0 or p_quantity_tons <> round(p_quantity_tons,4) then raise exception '요청량 또는 상태를 확인해주세요.' using errcode='22023'; end if;
  select * into v_start from public.raw_material_contracts where id=p_starting_contract_id;
  if not found or v_start.status <> 'active' then raise exception '활성 계약을 찾을 수 없습니다.' using errcode='P0002'; end if;
  if p_allocation_type='project' and (p_project_id is null or not exists(select 1 from public.projects where id=p_project_id)) then raise exception '유효한 프로젝트가 필요합니다.' using errcode='22023'; end if;
  if p_allocation_type not in ('project','factory','as','sample','etc') then raise exception '사용 구분을 확인해주세요.' using errcode='22023'; end if;
  perform 1 from public.raw_material_contracts where material_code=v_start.material_code and status='active' order by id for update;
  select * into v_start from public.raw_material_contracts where id=p_starting_contract_id;
  select greatest(v_start.contract_quantity_ton-coalesce(sum(a.quantity_tons) filter(where a.status in ('planned','confirmed')),0),0)
    into v_start_available from public.raw_material_contracts c left join public.material_contract_allocations a on a.contract_id=c.id where c.id=v_start.id group by c.id;
  if p_expected_starting_available is not null and abs(v_start_available-p_expected_starting_available)>0.00005 then raise exception '계약 가용량이 변경되었습니다. 배정 계획을 다시 확인해주세요.' using errcode='40001'; end if;

  if p_strategy='increase_contract' then
    v_increase := greatest(p_quantity_tons-v_start_available,0);
    if v_increase > 0 and nullif(btrim(p_increase_reason),'') is null then raise exception '계약 증액 사유가 필요합니다.' using errcode='22023'; end if;
    if v_increase > 0 then
      perform set_config('app.material_contract_quantity_increase','on',true);
      update public.raw_material_contracts set contract_quantity_ton=contract_quantity_ton+v_increase, remaining_quantity_ton=remaining_quantity_ton+v_increase, updated_by=auth.uid() where id=v_start.id;
      perform set_config('app.material_contract_quantity_increase','off',true);
      insert into public.activity_logs(activity_type,action_type,target_type,employee_id,employee_name,employee_email,title,description,metadata)
      values('material_contract_quantity_increased','material_contract_quantity_increased','raw_material_contract',v_employee.id,v_employee.name,v_employee.email,'원자재 계약 물량 증액',btrim(p_increase_reason),jsonb_build_object('contract_id',v_start.id,'before_quantity_ton',v_start.contract_quantity_ton,'increase_quantity_ton',v_increase,'after_quantity_ton',v_start.contract_quantity_ton+v_increase,'reason',btrim(p_increase_reason)));
      v_start_available := v_start_available+v_increase;
    end if;
  end if;

  insert into public.material_usage_requests(material_code,allocation_type,project_id,destination_name,quantity_tons,purchase_order_no,usage_date,memo,created_by)
  values(v_start.material_code,p_allocation_type,case when p_allocation_type='project' then p_project_id end,case when p_allocation_type in ('as','sample','etc') then nullif(btrim(p_destination_name),'') end,p_quantity_tons,nullif(btrim(p_purchase_order_no),''),p_usage_date,nullif(btrim(p_memo),''),auth.uid()) returning id into v_request_id;

  for v_contract in
    select c.*, greatest(c.contract_quantity_ton-coalesce(sum(a.quantity_tons) filter(where a.status in ('planned','confirmed')),0),0)::numeric(16,4) available
    from public.raw_material_contracts c left join public.material_contract_allocations a on a.contract_id=c.id
    where c.material_code=v_start.material_code and c.status='active' and (p_strategy='auto_split' or c.id=v_start.id)
    group by c.id order by case when c.id=v_start.id then 0 else 1 end,c.effective_start_date,c.id
  loop
    exit when v_allocated >= p_quantity_tons;
    if v_contract.id <> v_start.id then
      perform 1 from public.raw_material_contracts where id=v_contract.id for update;
      select greatest(c.contract_quantity_ton-coalesce(sum(a.quantity_tons) filter(where a.status in ('planned','confirmed')),0),0)
      into v_available from public.raw_material_contracts c left join public.material_contract_allocations a on a.contract_id=c.id where c.id=v_contract.id group by c.id;
    else v_available := greatest(v_start_available,0); end if;
    v_take := least(v_available,p_quantity_tons-v_allocated);
    if v_take <= 0 then continue; end if;
    insert into public.material_contract_allocations(contract_id,usage_request_id,allocation_type,project_id,destination_name,quantity_tons,allocation_date,status,purchase_order_no,memo,created_by)
    values(v_contract.id,v_request_id,p_allocation_type,case when p_allocation_type='project' then p_project_id end,case when p_allocation_type in ('as','sample','etc') then nullif(btrim(p_destination_name),'') end,v_take,p_usage_date,p_status,null,null,auth.uid()) returning id into v_allocation_id;
    perform public.record_material_allocation_activity(v_contract.id,v_allocation_id,'material_allocation_created','사용요청 계약 배정',null,'배정',null,jsonb_build_object('usage_request_id',v_request_id,'quantity_tons',v_take,'status',p_status),null,to_char(v_take,'FM999999999990.0000')||'t');
    v_plan := v_plan || jsonb_build_array(jsonb_build_object('contract_id',v_contract.id,'allocation_id',v_allocation_id,'quantity_tons',v_take,'price_krw_per_kg',v_contract.contract_price_krw_per_kg));
    v_allocated := v_allocated+v_take;
  end loop;
  return jsonb_build_object('usage_request_id',v_request_id,'requested_tons',p_quantity_tons,'allocated_tons',v_allocated,'unallocated_tons',greatest(p_quantity_tons-v_allocated,0),'allocations',v_plan,'increased_tons',v_increase);
end;
$$;


--
-- Name: create_project_coating_cost_entry(bigint, bigint, date, bigint, bigint, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_project_coating_cost_entry(p_project_id bigint, p_vendor_organization_id bigint, p_accounting_month date, p_supply_amount_krw bigint, p_vat_amount_krw bigint, p_invoice_number text DEFAULT NULL::text, p_memo text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare s public.coating_cost_statements%rowtype; a public.coating_cost_allocations%rowtype;
begin
 if not public.is_approved_admin() then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
 if not exists(select 1 from public.projects where id=p_project_id) then raise exception '프로젝트를 찾을 수 없습니다.' using errcode='P0002'; end if;
 s:=public.save_coating_cost_statement(null,p_vendor_organization_id,p_accounting_month,p_invoice_number,p_supply_amount_krw,p_vat_amount_krw,p_memo);
 a:=public.save_coating_cost_allocation(s.id,p_project_id,p_supply_amount_krw,p_memo,'save');
 if s.supply_amount_krw<>a.allocated_supply_amount_krw then raise exception '계산서와 프로젝트 배분금액이 일치하지 않습니다.' using errcode='23514'; end if;
 return jsonb_build_object('statement',to_jsonb(s),'allocation',to_jsonb(a));
end $$;


--
-- Name: create_project_glass_cost_entry(bigint, bigint, date, bigint, bigint, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_project_glass_cost_entry(p_project_id bigint, p_vendor_organization_id bigint, p_accounting_month date, p_supply_amount_krw bigint, p_vat_amount_krw bigint, p_invoice_number text DEFAULT NULL::text, p_memo text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare s public.glass_cost_statements%rowtype; a public.glass_cost_allocations%rowtype;
begin
 if not public.is_approved_admin() then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
 if not exists(select 1 from public.projects where id=p_project_id) then raise exception '프로젝트를 찾을 수 없습니다.' using errcode='P0002'; end if;
 s:=public.save_glass_cost_statement(null,p_vendor_organization_id,p_accounting_month,p_invoice_number,p_supply_amount_krw,p_vat_amount_krw,p_memo);
 a:=public.save_glass_cost_allocation(s.id,p_project_id,p_supply_amount_krw,p_memo,'save');
 if s.supply_amount_krw<>a.allocated_supply_amount_krw then raise exception '계산서와 프로젝트 배분금액이 일치하지 않습니다.' using errcode='23514'; end if;
 return jsonb_build_object('statement',to_jsonb(s),'allocation',to_jsonb(a));
end $$;


--
-- Name: create_project_section_with_tasks(bigint, text, text, text, integer, date, date, text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_project_section_with_tasks(p_project_id bigint, p_process_type text, p_assembly_vendor text DEFAULT NULL::text, p_task_manager text DEFAULT NULL::text, p_quantity integer DEFAULT NULL::integer, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_memo text DEFAULT NULL::text, p_source_section_id bigint DEFAULT NULL::bigint) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_section_id bigint;
  v_task_count integer;
  v_sort_order integer;
begin
  if not exists (select 1 from public.projects where id = p_project_id) then
    raise exception using message = '프로젝트를 찾을 수 없습니다.', errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.process_types
    where code = btrim(p_process_type) and is_active = true
  ) then
    raise exception using message = '활성 공정을 찾을 수 없습니다.', errcode = '22023';
  end if;
  if exists (
    select 1 from public.project_sections
    where project_id = p_project_id and process_type = btrim(p_process_type)
  ) then
    raise exception using message = '이미 존재하는 공정입니다.', errcode = '23505';
  end if;
  if p_source_section_id is not null and not exists (
    select 1 from public.project_sections
    where id = p_source_section_id and project_id = p_project_id
  ) then
    raise exception using message = '기준 공정을 찾을 수 없습니다.', errcode = '22023';
  end if;
  if p_quantity is not null and p_quantity < 0 then
    raise exception using message = '수량은 0 이상이어야 합니다.', errcode = '22023';
  end if;
  if p_start_date is not null and p_end_date is not null and p_end_date < p_start_date then
    raise exception using message = '종료일은 시작일보다 빠를 수 없습니다.', errcode = '22023';
  end if;

  select coalesce(max(sort_order), 0) + 1 into v_sort_order
  from public.project_sections
  where project_id = p_project_id;

  insert into public.project_sections (
    project_id, process_type, assembly_vendor, task_manager, quantity,
    start_date, end_date, status, memo, sort_order
  ) values (
    p_project_id, btrim(p_process_type), nullif(btrim(p_assembly_vendor), ''),
    nullif(btrim(p_task_manager), ''), p_quantity, p_start_date, p_end_date,
    'pending', nullif(btrim(p_memo), ''), v_sort_order
  ) returning id into v_section_id;

  insert into public.tasks (
    project_id, project_section_id, project_assembly_vendor_id,
    task_order, task_type, task_name, assignee, status,
    start_date, due_date, completed_date
  )
  select p_project_id, v_section_id, vendor_relation.id,
    template.task_order, template.task_type, template.task_name,
    nullif(btrim(p_task_manager), ''), 'pending', null, null, null
  from public.task_templates template
  cross join lateral (
    select pav.id
    from public.project_assembly_vendors pav
    where pav.project_id = p_project_id
    union all
    select null::bigint
    where not exists (
      select 1 from public.project_assembly_vendors pav
      where pav.project_id = p_project_id
    )
  ) vendor_relation
  where template.process_type = btrim(p_process_type)
  order by vendor_relation.id nulls first, template.task_order, template.id;

  get diagnostics v_task_count = row_count;
  return jsonb_build_object(
    'section_id', v_section_id,
    'task_count', v_task_count,
    'vendor_count', (
      select count(*) from public.project_assembly_vendors pav
      where pav.project_id = p_project_id
    )
  );
end;
$$;


--
-- Name: create_project_section_with_vendor_tasks(bigint, text, text, text, integer, date, date, text, bigint, bigint[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_project_section_with_vendor_tasks(p_project_id bigint, p_process_type text, p_assembly_vendor text DEFAULT NULL::text, p_task_manager text DEFAULT NULL::text, p_quantity integer DEFAULT NULL::integer, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_memo text DEFAULT NULL::text, p_source_section_id bigint DEFAULT NULL::bigint, p_target_project_assembly_vendor_ids bigint[] DEFAULT NULL::bigint[]) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_section_id bigint;
  v_task_count integer;
  v_sort_order integer;
begin
  if not exists (select 1 from public.projects where id = p_project_id) then
    raise exception using message = '프로젝트를 찾을 수 없습니다.', errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.process_types
    where code = btrim(p_process_type) and is_active = true
  ) then
    raise exception using message = '활성 공정을 찾을 수 없습니다.', errcode = '22023';
  end if;
  if exists (
    select 1 from public.project_sections
    where project_id = p_project_id and process_type = btrim(p_process_type)
  ) then
    raise exception using message = '이미 존재하는 공정입니다.', errcode = '23505';
  end if;
  if p_source_section_id is not null and not exists (
    select 1 from public.project_sections
    where id = p_source_section_id and project_id = p_project_id
  ) then
    raise exception using message = '기준 공정을 찾을 수 없습니다.', errcode = '22023';
  end if;
  if p_target_project_assembly_vendor_ids is not null and cardinality(p_target_project_assembly_vendor_ids) = 0 then
    raise exception using message = '적용할 조립업체를 선택하세요.', errcode = '22023';
  end if;
  if p_target_project_assembly_vendor_ids is not null and cardinality(p_target_project_assembly_vendor_ids) <> (
    select count(distinct pav.id)
    from public.project_assembly_vendors pav
    where pav.project_id = p_project_id
      and pav.id = any(p_target_project_assembly_vendor_ids)
  ) then
    raise exception using message = '프로젝트에 등록되지 않은 조립업체가 포함되어 있습니다.', errcode = '23503';
  end if;
  if p_quantity is not null and p_quantity < 0 then
    raise exception using message = '수량은 0 이상이어야 합니다.', errcode = '22023';
  end if;
  if p_start_date is not null and p_end_date is not null and p_end_date < p_start_date then
    raise exception using message = '종료일은 시작일보다 빠를 수 없습니다.', errcode = '22023';
  end if;

  select coalesce(max(sort_order), 0) + 1 into v_sort_order
  from public.project_sections
  where project_id = p_project_id;

  insert into public.project_sections (
    project_id, process_type, assembly_vendor, task_manager, quantity,
    start_date, end_date, status, memo, sort_order
  ) values (
    p_project_id, btrim(p_process_type), nullif(btrim(p_assembly_vendor), ''),
    nullif(btrim(p_task_manager), ''), p_quantity, p_start_date, p_end_date,
    'pending', nullif(btrim(p_memo), ''), v_sort_order
  ) returning id into v_section_id;

  insert into public.tasks (
    project_id, project_section_id, project_assembly_vendor_id,
    task_order, task_type, task_name, assignee, status,
    start_date, due_date, completed_date
  )
  select p_project_id, v_section_id, vendor_relation.id,
    template.task_order, template.task_type, template.task_name,
    nullif(btrim(p_task_manager), ''), 'pending', null, null, null
  from public.task_templates template
  cross join lateral (
    select pav.id
    from public.project_assembly_vendors pav
    where pav.project_id = p_project_id
      and (
        p_target_project_assembly_vendor_ids is null
        or pav.id = any(p_target_project_assembly_vendor_ids)
      )
    union all
    select null::bigint
    where p_target_project_assembly_vendor_ids is null
      and not exists (
        select 1 from public.project_assembly_vendors pav
        where pav.project_id = p_project_id
      )
  ) vendor_relation
  where template.process_type = btrim(p_process_type)
  order by vendor_relation.id nulls first, template.task_order, template.id;

  get diagnostics v_task_count = row_count;
  return jsonb_build_object(
    'section_id', v_section_id,
    'task_count', v_task_count,
    'vendor_count', case
      when p_target_project_assembly_vendor_ids is null then (
        select count(*) from public.project_assembly_vendors where project_id = p_project_id
      )
      else cardinality(p_target_project_assembly_vendor_ids)
    end
  );
end;
$$;


--
-- Name: create_project_with_sections(jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_project_with_sections(p_project jsonb, p_sections jsonb) RETURNS bigint
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_project_id bigint;
  v_section_id bigint;
  v_section jsonb;
  v_first_process_type text;
  v_process_type text;
  v_quantity integer;
  v_project_start date;
  v_project_end date;
  v_section_start date;
  v_section_end date;
begin
  if p_project is null or jsonb_typeof(p_project) <> 'object' then
    raise exception using message = '프로젝트 입력값이 올바르지 않습니다.', errcode = '22023';
  end if;

  if p_sections is null
     or jsonb_typeof(p_sections) <> 'array'
     or jsonb_array_length(p_sections) = 0 then
    raise exception using message = '공정을 최소 1개 선택해야 합니다.', errcode = '22023';
  end if;

  if nullif(btrim(p_project->>'project_code'), '') is null then
    raise exception using message = '프로젝트 코드는 필수입니다.', errcode = '22023';
  end if;

  if nullif(btrim(p_project->>'project_name'), '') is null then
    raise exception using message = '프로젝트명은 필수입니다.', errcode = '22023';
  end if;

  v_project_start := nullif(p_project->>'start_date', '')::date;
  v_project_end := nullif(p_project->>'end_date', '')::date;

  if v_project_start is not null
     and v_project_end is not null
     and v_project_end < v_project_start then
    raise exception using message = '프로젝트 종료일은 시작일보다 빠를 수 없습니다.', errcode = '22023';
  end if;

  if exists (
    select 1
    from public.projects
    where project_code = btrim(p_project->>'project_code')
  ) then
    raise exception using message = '이미 같은 프로젝트 코드가 있습니다.', errcode = '23505';
  end if;

  if (
    select count(*)
    from jsonb_array_elements(p_sections)
  ) <> (
    select count(distinct btrim(value->>'process_type'))
    from jsonb_array_elements(p_sections)
  ) then
    raise exception using message = '동일한 공정을 중복 선택할 수 없습니다.', errcode = '22023';
  end if;

  select btrim(value->>'process_type')
  into v_first_process_type
  from jsonb_array_elements(p_sections)
  order by
    coalesce(nullif(value->>'sort_order', '')::integer, 0),
    btrim(value->>'process_type')
  limit 1;

  insert into public.projects (
    project_code,
    project_name,
    client_name,
    salesperson,
    site_address,
    assembly_vendor,
    task_manager,
    process_type,
    start_date,
    end_date,
    status,
    memo
  )
  values (
    btrim(p_project->>'project_code'),
    btrim(p_project->>'project_name'),
    nullif(btrim(p_project->>'client_name'), ''),
    nullif(btrim(p_project->>'salesperson'), ''),
    nullif(btrim(p_project->>'site_address'), ''),
    nullif(btrim(p_project->>'assembly_vendor'), ''),
    nullif(btrim(p_project->>'task_manager'), ''),
    v_first_process_type,
    v_project_start,
    v_project_end,
    'in_progress',
    nullif(btrim(p_project->>'memo'), '')
  )
  returning id into v_project_id;

  for v_section in
    select value
    from jsonb_array_elements(p_sections)
    order by
      coalesce(nullif(value->>'sort_order', '')::integer, 0),
      btrim(value->>'process_type')
  loop
    v_process_type := nullif(btrim(v_section->>'process_type'), '');
    v_quantity := nullif(v_section->>'quantity', '')::integer;
    v_section_start := nullif(v_section->>'start_date', '')::date;
    v_section_end := nullif(v_section->>'end_date', '')::date;

    if v_process_type is null then
      raise exception using message = '공정 코드가 비어 있습니다.', errcode = '22023';
    end if;

    if not exists (
      select 1
      from public.process_types
      where code = v_process_type
        and is_active = true
    ) then
      raise exception using message = format('활성 공정을 찾을 수 없습니다: %s', v_process_type), errcode = '22023';
    end if;

    if v_quantity is not null and v_quantity < 0 then
      raise exception using message = format('%s 공정의 수량은 0 이상이어야 합니다.', v_process_type), errcode = '22023';
    end if;

    if v_section_start is not null
       and v_section_end is not null
       and v_section_end < v_section_start then
      raise exception using message = format('%s 공정의 종료일은 시작일보다 빠를 수 없습니다.', v_process_type), errcode = '22023';
    end if;

    insert into public.project_sections (
      project_id,
      process_type,
      assembly_vendor,
      task_manager,
      quantity,
      start_date,
      end_date,
      status,
      memo,
      sort_order
    )
    values (
      v_project_id,
      v_process_type,
      nullif(btrim(v_section->>'assembly_vendor'), ''),
      nullif(btrim(v_section->>'task_manager'), ''),
      v_quantity,
      v_section_start,
      v_section_end,
      'pending',
      nullif(btrim(v_section->>'memo'), ''),
      coalesce(nullif(v_section->>'sort_order', '')::integer, 0)
    )
    returning id into v_section_id;

    insert into public.tasks (
      project_id,
      project_section_id,
      task_order,
      task_type,
      task_name,
      assignee,
      status,
      start_date,
      due_date,
      completed_date
    )
    select
      v_project_id,
      v_section_id,
      template.task_order,
      template.task_type,
      template.task_name,
      nullif(btrim(v_section->>'task_manager'), ''),
      'pending',
      null,
      null,
      null
    from public.task_templates template
    where template.process_type = v_process_type
    order by template.task_order, template.id;
  end loop;

  return v_project_id;
end;
$$;


--
-- Name: create_project_with_sections_and_vendors(jsonb, jsonb, bigint[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_project_with_sections_and_vendors(p_project jsonb, p_sections jsonb, p_assembly_vendor_ids bigint[]) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_project_id bigint;
  v_section_id bigint;
  v_section jsonb;
  v_first_process_type text;
  v_process_type text;
begin
  if not public.can_manage_projects() then
    raise exception using message = '프로젝트 등록 권한이 없습니다.', errcode = '42501';
  end if;
  if p_project is null or jsonb_typeof(p_project) <> 'object'
     or nullif(btrim(p_project->>'project_code'), '') is null
     or nullif(btrim(p_project->>'project_name'), '') is null then
    raise exception using message = '프로젝트 필수 입력값이 올바르지 않습니다.', errcode = '22023';
  end if;
  if nullif(p_project->>'quantity', '')::numeric < 0 then
    raise exception using message = '프로젝트 수량은 0 이상이어야 합니다.', errcode = '22023';
  end if;
  if p_sections is null or jsonb_typeof(p_sections) <> 'array' or jsonb_array_length(p_sections) = 0 then
    raise exception using message = '공정을 최소 1개 선택해야 합니다.', errcode = '22023';
  end if;
  perform public.assert_valid_assembly_vendor_ids(p_assembly_vendor_ids);

  select btrim(value->>'process_type') into v_first_process_type
  from jsonb_array_elements(p_sections)
  order by coalesce(nullif(value->>'sort_order', '')::integer, 0), btrim(value->>'process_type')
  limit 1;

  insert into public.projects (
    project_code, project_name, client_name, salesperson, site_address,
    task_manager, process_type, start_date, end_date, status, memo,
    assembly_vendor, assembly_vendor_organization_id, quantity, quantity_unit
  ) values (
    btrim(p_project->>'project_code'), btrim(p_project->>'project_name'),
    nullif(btrim(p_project->>'client_name'), ''), nullif(btrim(p_project->>'salesperson'), ''),
    nullif(btrim(p_project->>'site_address'), ''), nullif(btrim(p_project->>'task_manager'), ''),
    v_first_process_type, nullif(p_project->>'start_date', '')::date,
    nullif(p_project->>'end_date', '')::date, 'in_progress', nullif(btrim(p_project->>'memo'), ''),
    null, null, nullif(p_project->>'quantity', '')::numeric, nullif(btrim(p_project->>'quantity_unit'), '')
  ) returning id into v_project_id;

  insert into public.project_assembly_vendors (project_id, organization_id, sort_order, is_primary)
  select v_project_id, vendor.id, vendor.ordinality::integer, vendor.ordinality = 1
  from unnest(coalesce(p_assembly_vendor_ids, array[]::bigint[])) with ordinality vendor(id, ordinality);

  for v_section in
    select value from jsonb_array_elements(p_sections)
    order by coalesce(nullif(value->>'sort_order', '')::integer, 0), btrim(value->>'process_type')
  loop
    v_process_type := nullif(btrim(v_section->>'process_type'), '');
    if v_process_type is null or not exists (
      select 1 from public.process_types where code = v_process_type and is_active is true
    ) then
      raise exception using message = format('활성 공정을 찾을 수 없습니다: %s', coalesce(v_process_type, '')), errcode = '22023';
    end if;

    insert into public.project_sections (
      project_id, process_type, assembly_vendor, task_manager, quantity,
      start_date, end_date, status, memo, sort_order
    ) values (
      v_project_id, v_process_type, nullif(btrim(v_section->>'assembly_vendor'), ''),
      nullif(btrim(v_section->>'task_manager'), ''), nullif(v_section->>'quantity', '')::integer,
      nullif(v_section->>'start_date', '')::date, nullif(v_section->>'end_date', '')::date,
      'pending', nullif(btrim(v_section->>'memo'), ''),
      coalesce(nullif(v_section->>'sort_order', '')::integer, 0)
    ) returning id into v_section_id;

    insert into public.tasks (
      project_id, project_section_id, project_assembly_vendor_id,
      task_order, task_type, task_name, assignee, status,
      start_date, due_date, completed_date
    )
    select v_project_id, v_section_id, vendor_relation.id,
      template.task_order, template.task_type, template.task_name,
      nullif(btrim(v_section->>'task_manager'), ''), 'pending', null, null, null
    from public.task_templates template
    cross join lateral (
      select pav.id
      from public.project_assembly_vendors pav
      where pav.project_id = v_project_id
      union all
      select null::bigint
      where not exists (
        select 1 from public.project_assembly_vendors pav
        where pav.project_id = v_project_id
      )
    ) vendor_relation
    where template.process_type = v_process_type
    order by vendor_relation.id nulls first, template.task_order, template.id;
  end loop;

  return v_project_id;
end;
$$;


--
-- Name: create_project_with_vendors(jsonb, bigint[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_project_with_vendors(p_project jsonb, p_assembly_vendor_ids bigint[]) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_project_id bigint;
begin
  if not public.can_manage_projects() then
    raise exception using message = '프로젝트 등록 권한이 없습니다.', errcode = '42501';
  end if;
  perform public.assert_valid_assembly_vendor_ids(p_assembly_vendor_ids);

  insert into public.projects (
    project_code, project_name, client_name, site_address, salesperson,
    task_manager, process_type, start_date, end_date, status, memo,
    assembly_vendor, assembly_vendor_organization_id
  ) values (
    btrim(p_project->>'project_code'), btrim(p_project->>'project_name'),
    nullif(btrim(p_project->>'client_name'), ''), nullif(btrim(p_project->>'site_address'), ''),
    nullif(btrim(p_project->>'salesperson'), ''), nullif(btrim(p_project->>'task_manager'), ''),
    btrim(p_project->>'process_type'), nullif(p_project->>'start_date', '')::date,
    nullif(p_project->>'end_date', '')::date, nullif(btrim(p_project->>'status'), ''),
    nullif(btrim(p_project->>'memo'), ''), null, null
  ) returning id into v_project_id;

  insert into public.project_assembly_vendors (project_id, organization_id, sort_order, is_primary)
  select v_project_id, vendor.id, vendor.ordinality::integer, vendor.ordinality = 1
  from unnest(coalesce(p_assembly_vendor_ids, array[]::bigint[])) with ordinality vendor(id, ordinality);
  return v_project_id;
end;
$$;


--
-- Name: create_reference_task(bigint, text, date, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_reference_task(p_comment_id bigint, p_title text, p_due_date date DEFAULT NULL::date, p_priority text DEFAULT 'normal'::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_employee_id bigint; v_comment public.shared_comments%rowtype; v_task_id uuid;
begin
  v_employee_id := public.sharing_current_employee_id();
  if v_employee_id is null then raise exception 'not_authorized'; end if;
  if nullif(btrim(p_title), '') is null or char_length(btrim(p_title)) > 200 then raise exception 'invalid_title'; end if;
  if p_priority not in ('low', 'normal', 'high') then raise exception 'invalid_priority'; end if;
  select * into v_comment from public.shared_comments where id = p_comment_id;
  if v_comment.id is null then raise exception 'comment_not_found'; end if;
  if not public.can_comment_shared_item(v_comment.shared_item_id) then raise exception 'not_authorized'; end if;
  insert into public.reference_tasks(comment_id, shared_item_id, created_by, assigned_to, title, due_date, priority)
  values (v_comment.id, v_comment.shared_item_id, v_employee_id, v_employee_id, btrim(p_title), p_due_date, p_priority)
  on conflict (assigned_to, comment_id) where comment_id is not null
  do update set assigned_to = excluded.assigned_to
  returning id into v_task_id;
  return v_task_id;
end;
$$;


--
-- Name: create_share_invitation(uuid, bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_share_invitation(p_item_id uuid, p_invitee_id bigint, p_permission text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_owner public.employees%rowtype; v_note public.personal_notes%rowtype;
  v_shared_item_id uuid; v_invitation_id uuid; v_item_type text;
begin
  if p_permission not in ('view', 'edit') then raise exception 'invalid_permission'; end if;
  select * into v_owner from public.employees where auth_user_id = auth.uid() and active = true and approval_status = 'approved';
  if v_owner.id is null then raise exception 'not_authorized'; end if;
  select * into v_note from public.personal_notes where id = p_item_id and user_id = auth.uid();
  if v_note.id is null then raise exception 'owner_only'; end if;
  if p_invitee_id = v_owner.id then raise exception 'cannot_share_with_self'; end if;
  if not exists (select 1 from public.employees where id = p_invitee_id and active = true and approval_status = 'approved' and auth_user_id is not null) then raise exception 'inactive_invitee'; end if;
  v_item_type := case when v_note.note_type = 'todo' then 'todo' when v_note.note_type = 'reminder' then 'schedule' else 'memo' end;
  insert into public.shared_items(item_type, item_id, owner_id)
  values (v_item_type, p_item_id, v_owner.id)
  on conflict (item_id) do update set updated_at = now()
  returning id into v_shared_item_id;
  if exists (select 1 from public.shared_item_members where shared_item_id = v_shared_item_id and employee_id = p_invitee_id) then raise exception 'already_member'; end if;
  insert into public.share_invitations(shared_item_id, inviter_id, invitee_id, permission)
  values (v_shared_item_id, v_owner.id, p_invitee_id, p_permission)
  returning id into v_invitation_id;
  return v_invitation_id;
end;
$$;


--
-- Name: create_shared_comment_with_mentions(uuid, text, bigint[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_shared_comment_with_mentions(p_shared_item_id uuid, p_content text, p_mention_employee_ids bigint[] DEFAULT '{}'::bigint[]) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_author_id bigint;
  v_comment_id bigint;
  v_item_id uuid;
  v_mention_names text;
  v_mention_ids bigint[];
  v_author public.employees%rowtype;
begin
  v_author_id := public.sharing_current_employee_id();
  if v_author_id is null or not public.can_comment_shared_item(p_shared_item_id) then
    raise exception 'not_authorized';
  end if;
  if nullif(btrim(p_content), '') is null or char_length(btrim(p_content)) > 2000 then
    raise exception 'invalid_content';
  end if;

  insert into public.shared_comments(shared_item_id, author_id, content)
  values (p_shared_item_id, v_author_id, btrim(p_content))
  returning id into v_comment_id;

  with valid_mentions as (
    select distinct employee.id, employee.name
    from unnest(coalesce(p_mention_employee_ids, '{}'::bigint[])) requested(employee_id)
    join public.employees employee on employee.id = requested.employee_id
      and employee.active = true and employee.approval_status = 'approved'
    join public.shared_items shared_item on shared_item.id = p_shared_item_id
    where employee.id <> v_author_id
      and (
        employee.id = shared_item.owner_id
        or exists (
          select 1 from public.shared_item_members member
          where member.shared_item_id = p_shared_item_id and member.employee_id = employee.id
        )
      )
  ), inserted as (
    insert into public.shared_comment_mentions(comment_id, employee_id)
    select v_comment_id, id from valid_mentions
    on conflict do nothing
    returning employee_id
  )
  select array_agg(valid_mentions.id order by valid_mentions.id),
         string_agg('@' || valid_mentions.name, ', ' order by valid_mentions.name)
    into v_mention_ids, v_mention_names
  from valid_mentions
  join inserted on inserted.employee_id = valid_mentions.id;

  if coalesce(cardinality(v_mention_ids), 0) > 0 then
    select item_id into v_item_id from public.shared_items where id = p_shared_item_id;
    select * into v_author from public.employees where id = v_author_id;
    insert into public.activity_logs(
      activity_type, action_type, target_type, target_id, project_id, employee_id,
      employee_name, employee_email, title, description, metadata, source_item_id
    ) values (
      'shared_comment_mention', 'shared_comment_mention', 'personal_note', null, null, v_author_id,
      v_author.name, v_author.email, '댓글 멘션', v_mention_names,
      jsonb_build_object('comment_id', v_comment_id, 'employee_ids', to_jsonb(v_mention_ids), 'personal_note_id', v_item_id),
      v_item_id
    );
  end if;

  return v_comment_id;
end;
$$;


--
-- Name: task_dependencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_dependencies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    predecessor_task_id bigint NOT NULL,
    successor_task_id bigint NOT NULL,
    dependency_type text DEFAULT 'FS'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid DEFAULT auth.uid() NOT NULL,
    CONSTRAINT task_dependencies_dependency_type_check CHECK ((dependency_type = 'FS'::text)),
    CONSTRAINT task_dependencies_different_tasks CHECK ((predecessor_task_id <> successor_task_id))
);


--
-- Name: create_task_dependency(bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_task_dependency(p_predecessor_task_id bigint, p_successor_task_id bigint) RETURNS public.task_dependencies
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  v_dependency public.task_dependencies;
begin
  if p_predecessor_task_id = p_successor_task_id then
    raise exception 'A task cannot depend on itself.';
  end if;
  if not exists (
    select 1 from public.employees as e
    where e.auth_user_id = auth.uid()
      and e.active is true
      and e.role in ('admin', 'manager', 'staff')
  ) then
    raise exception 'Task dependency update permission is required.';
  end if;
  if not exists (
    select 1
    from public.tasks as predecessor
    join public.tasks as successor on successor.id = p_successor_task_id
    where predecessor.id = p_predecessor_task_id
      and predecessor.project_id = successor.project_id
      and predecessor.project_assembly_vendor_id is not distinct from successor.project_assembly_vendor_id
  ) then
    raise exception 'Dependencies are allowed only between tasks for the same project assembly vendor.';
  end if;
  if exists (
    with recursive successors(task_id) as (
      select td.successor_task_id
      from public.task_dependencies as td
      where td.predecessor_task_id = p_successor_task_id
      union
      select td.successor_task_id
      from public.task_dependencies as td
      join successors as path on td.predecessor_task_id = path.task_id
    )
    select 1 from successors as path where path.task_id = p_predecessor_task_id
  ) then
    raise exception 'This dependency would create a cycle.';
  end if;

  insert into public.task_dependencies as td (
    predecessor_task_id, successor_task_id, dependency_type, created_by
  ) values (
    p_predecessor_task_id, p_successor_task_id, 'FS', auth.uid()
  )
  on conflict on constraint task_dependencies_unique_fs
  do update set dependency_type = excluded.dependency_type
  returning * into v_dependency;

  return v_dependency;
end;
$$;


--
-- Name: current_user_is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_user_is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1
    from public.employees e
    where lower(e.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
      and e.role = 'admin'
  );
$$;


--
-- Name: delete_project_section_with_tasks(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_project_section_with_tasks(p_section_id bigint) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_section public.project_sections%rowtype;
  v_task_count integer;
  v_section_count integer;
  v_project_status text;
  v_employee_id bigint;
  v_employee_name text;
  v_employee_email text;
begin
  select * into v_section
  from public.project_sections
  where id = p_section_id
  for update;

  if not found then
    raise exception using message = '공정을 찾을 수 없습니다.', errcode = 'P0002';
  end if;

  select count(*) into v_section_count
  from public.project_sections
  where project_id = v_section.project_id;

  if v_section_count <= 1 then
    raise exception using message = '프로젝트에는 최소 1개의 공정이 필요합니다.', errcode = '22023';
  end if;

  select count(*) into v_task_count
  from public.tasks
  where project_section_id = p_section_id
    and project_id = v_section.project_id;

  select id, name, email
    into v_employee_id, v_employee_name, v_employee_email
  from public.employees
  where auth_user_id = auth.uid()
     or email = auth.jwt() ->> 'email'
  order by case when auth_user_id = auth.uid() then 0 else 1 end
  limit 1;

  insert into public.activity_logs (
    activity_type,
    action_type,
    target_type,
    target_id,
    project_id,
    employee_id,
    employee_name,
    employee_email,
    title,
    description,
    metadata
  ) values (
    'project_update',
    'project_update',
    'project_section',
    v_section.id,
    v_section.project_id,
    v_employee_id,
    v_employee_name,
    v_employee_email,
    '공정 삭제',
    format('%s 공정과 업무 %s건을 함께 삭제했습니다.', v_section.process_type, v_task_count),
    jsonb_build_object(
      'sectionId', v_section.id,
      'processType', v_section.process_type,
      'deletedTaskCount', v_task_count
    )
  );

  delete from public.tasks
  where project_section_id = p_section_id
    and project_id = v_section.project_id;

  delete from public.project_sections
  where id = p_section_id
    and project_id = v_section.project_id;

  select case
    when count(*) = 0 then 'pending'
    when bool_and(coalesce(status, 'pending') in ('completed', '완료')) then 'completed'
    when bool_or(coalesce(status, 'pending') in ('in_progress', '진행중', 'completed', '완료')) then 'in_progress'
    else 'pending'
  end
  into v_project_status
  from public.tasks
  where project_id = v_section.project_id;

  update public.projects
  set status = v_project_status,
      updated_at = now()
  where id = v_section.project_id;

  return jsonb_build_object(
    'section_id', v_section.id,
    'project_id', v_section.project_id,
    'deleted_task_count', v_task_count,
    'project_status', v_project_status
  );
end;
$$;


--
-- Name: delete_project_task(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_project_task(p_task_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare v_task public.tasks%rowtype; v_project_status text; v_unlinked_shipments integer := 0; v_lock_count integer; v_locks jsonb;
begin
  if not public.can_manage_projects() then raise exception using message = 'permission denied', errcode = '42501'; end if;
  lock table public.editing_locks in share row exclusive mode;
  delete from public.editing_locks where expires_at <= now();
  select count(*) into v_lock_count from public.get_hierarchical_delete_locks('task', p_task_id);
  if v_lock_count > 0 then
    select coalesce(jsonb_agg(to_jsonb(item)), '[]'::jsonb) into v_locks from (select * from public.get_hierarchical_delete_locks('task', p_task_id) limit 5) item;
    return jsonb_build_object('deleted', false, 'lock_count', v_lock_count, 'locks', v_locks);
  end if;
  select * into v_task from public.tasks where id = p_task_id for update;
  if not found then raise exception using message = 'task not found', errcode = 'P0002'; end if;
  update public.shipments set task_id = null where task_id = p_task_id;
  get diagnostics v_unlinked_shipments = row_count;
  delete from public.tasks where id = p_task_id;
  with ordered as (
    select id, row_number() over (partition by project_section_id order by task_order nulls last, id)::integer next_order
    from public.tasks where project_id = v_task.project_id
  ) update public.tasks task set task_order = ordered.next_order from ordered where task.id = ordered.id and task.task_order is distinct from ordered.next_order;
  select case when count(*) = 0 then 'pending' when bool_and(coalesce(status, 'pending') in ('completed', '완료')) then 'completed'
    when bool_or(coalesce(status, 'pending') in ('in_progress', '진행중', 'completed', '완료')) then 'in_progress' else 'pending' end
    into v_project_status from public.tasks where project_id = v_task.project_id;
  update public.projects set status = v_project_status, updated_at = now() where id = v_task.project_id;
  return jsonb_build_object('deleted', true, 'deleted_task_id', v_task.id, 'project_id', v_task.project_id, 'project_status', v_project_status, 'unlinked_shipment_count', v_unlinked_shipments, 'lock_count', 0, 'locks', '[]'::jsonb);
end;
$$;


--
-- Name: delete_project_with_lock_check(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_project_with_lock_check(p_project_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare v_locks jsonb; v_lock_count integer; v_project public.projects%rowtype;
begin
  if not public.is_approved_admin() then raise exception using message = 'permission denied', errcode = '42501'; end if;
  lock table public.editing_locks in share row exclusive mode;
  delete from public.editing_locks where expires_at <= now();
  select count(*) into v_lock_count from public.get_hierarchical_delete_locks('project', p_project_id);
  if v_lock_count > 0 then
    select coalesce(jsonb_agg(to_jsonb(item)), '[]'::jsonb) into v_locks from (select * from public.get_hierarchical_delete_locks('project', p_project_id) limit 5) item;
    return jsonb_build_object('deleted', false, 'lock_count', v_lock_count, 'locks', v_locks);
  end if;
  select * into v_project from public.projects where id = p_project_id for update;
  if not found then raise exception using message = 'project not found', errcode = 'P0002'; end if;
  delete from public.shipments where project_id = p_project_id or task_id in (select id from public.tasks where project_id = p_project_id);
  delete from public.tasks where project_id = p_project_id;
  delete from public.project_sections where project_id = p_project_id;
  delete from public.projects where id = p_project_id;
  return jsonb_build_object('deleted', true, 'project_id', p_project_id, 'lock_count', 0, 'locks', '[]'::jsonb);
end;
$$;


--
-- Name: delete_reference_task(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_reference_task(p_task_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_employee_id bigint;
begin
  v_employee_id := public.sharing_current_employee_id();
  delete from public.reference_tasks where id = p_task_id and assigned_to = v_employee_id;
  if not found then raise exception 'task_not_found'; end if;
end;
$$;


--
-- Name: ensure_shared_item_for_comment(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_shared_item_for_comment(p_item_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_employee_id bigint; v_note public.personal_notes%rowtype; v_shared_item_id uuid; v_item_type text;
begin
  v_employee_id := public.sharing_current_employee_id();
  if v_employee_id is null then raise exception 'not_authorized'; end if;
  select * into v_note from public.personal_notes where id = p_item_id and user_id = auth.uid();
  if v_note.id is null then raise exception 'owner_only'; end if;
  v_item_type := case when v_note.note_type = 'todo' then 'todo' when v_note.note_type = 'reminder' then 'schedule' else 'memo' end;
  insert into public.shared_items(item_type, item_id, owner_id)
  values (v_item_type, p_item_id, v_employee_id)
  on conflict (item_id) do update set updated_at = now()
  returning id into v_shared_item_id;
  return v_shared_item_id;
end;
$$;


--
-- Name: evaluate_material_contract_notifications(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.evaluate_material_contract_notifications() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_row record; v_state public.material_contract_notification_states%rowtype;
  v_available numeric(16,4); v_ratio numeric(12,8); v_available_stage text; v_expiry_stage text;
  v_generation integer; v_inserted integer := 0; v_count integer; v_days integer;
begin
  if auth.uid() is null or not public.is_approved_admin() then raise exception '관리자 권한이 필요합니다.' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext('material_contract_notifications'));
  for v_row in
    select c.id, c.contract_name, c.contract_quantity_ton, c.effective_end_date,
      coalesce(sum(a.quantity_tons) filter (where a.status in ('planned','confirmed')), 0) allocated_tons
    from public.raw_material_contracts c
    left join public.material_contract_allocations a on a.contract_id = c.id
    where c.status = 'active'
    group by c.id, c.contract_name, c.contract_quantity_ton, c.effective_end_date
  loop
    v_available := greatest(v_row.contract_quantity_ton - v_row.allocated_tons, 0);
    v_ratio := case when v_row.contract_quantity_ton > 0 then v_available / v_row.contract_quantity_ton else 0 end;
    v_available_stage := case when v_ratio <= .05 then '5' when v_ratio <= .10 then '10' when v_ratio <= .20 then '20' else null end;
    v_days := v_row.effective_end_date - current_date;
    v_expiry_stage := case when v_days < 0 then 'expired' when v_days = 0 then 'today' when v_days <= 7 then '7d' when v_days <= 30 then '30d' else null end;

    insert into public.material_contract_notification_states(contract_id) values (v_row.id) on conflict do nothing;
    select * into v_state from public.material_contract_notification_states where contract_id = v_row.id for update;
    v_generation := v_state.available_generation;
    if v_available_stage is null then
      update public.material_contract_notification_states set available_stage = null, updated_at = now() where contract_id = v_row.id;
    else
      if v_state.available_stage is null then v_generation := v_generation + 1; end if;
      insert into public.material_contract_notification_events(notification_id,contract_id,contract_name,alert_kind,stage,generation,available_tons,available_ratio,effective_end_date)
      values ('raw-material-available-'||v_row.id||'-'||v_generation||'-'||v_available_stage,v_row.id,v_row.contract_name,'available_ratio',v_available_stage,v_generation,v_available,v_ratio,v_row.effective_end_date)
      on conflict do nothing;
      get diagnostics v_count = row_count; v_inserted := v_inserted + v_count;
      update public.material_contract_notification_states set available_generation=v_generation,available_stage=v_available_stage,updated_at=now() where contract_id=v_row.id;
    end if;
    if v_expiry_stage is not null then
      insert into public.material_contract_notification_events(notification_id,contract_id,contract_name,alert_kind,stage,generation,effective_end_date)
      values ('raw-material-expiry-'||v_row.id||'-'||v_expiry_stage,v_row.id,v_row.contract_name,'expiry',v_expiry_stage,1,v_row.effective_end_date)
      on conflict do nothing;
      get diagnostics v_count = row_count; v_inserted := v_inserted + v_count;
      update public.material_contract_notification_states set expiry_stage=v_expiry_stage,updated_at=now() where contract_id=v_row.id;
    end if;
  end loop;
  return v_inserted;
end;
$$;


--
-- Name: get_editing_lock_status(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_editing_lock_status(p_resource_type text, p_resource_id text) RETURNS TABLE(employee_id bigint, employee_name text, expires_at timestamp with time zone, is_mine boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_employee_id bigint;
begin
  v_employee_id := public.assert_editing_lock_permission(p_resource_type, p_resource_id);
  delete from public.editing_locks l where l.resource_type = p_resource_type and l.resource_id = p_resource_id and l.expires_at <= now();
  return query select l.employee_id, e.name, l.expires_at, l.employee_id = v_employee_id
    from public.editing_locks l join public.employees e on e.id = l.employee_id
    where l.resource_type = p_resource_type and l.resource_id = p_resource_id;
end;
$$;


--
-- Name: get_hierarchical_delete_locks(text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_hierarchical_delete_locks(p_resource_type text, p_resource_id bigint) RETURNS TABLE(resource_type text, resource_id text, resource_title text, employee_id bigint, employee_name text, expires_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
begin
  if p_resource_type = 'project' then
    if not public.is_approved_admin() then raise exception using message = 'permission denied', errcode = '42501'; end if;
    return query
      select l.resource_type, l.resource_id,
        case l.resource_type
          when 'project' then coalesce(p.project_name, '프로젝트 #' || l.resource_id)
          when 'task' then coalesce(t.task_name, '업무 #' || l.resource_id)
          when 'shipment' then concat('출고 #', l.resource_id, coalesce(' · ' || s.item_name, ''))
          else l.resource_type || ':' || l.resource_id
        end,
        l.employee_id, e.name, l.expires_at
      from public.editing_locks l
      join public.employees e on e.id = l.employee_id
      left join public.projects p on l.resource_type = 'project' and l.resource_id ~ '^[0-9]+$' and p.id = l.resource_id::bigint
      left join public.tasks t on l.resource_type = 'task' and l.resource_id ~ '^[0-9]+$' and t.id = l.resource_id::bigint
      left join public.shipments s on l.resource_type = 'shipment' and l.resource_id ~ '^[0-9]+$' and s.id = l.resource_id::bigint
      where l.expires_at > now() and (
        (l.resource_type = 'project' and l.resource_id = p_resource_id::text)
        or (l.resource_type = 'task' and l.resource_id ~ '^[0-9]+$' and exists (select 1 from public.tasks child where child.id = l.resource_id::bigint and child.project_id = p_resource_id))
        or (l.resource_type = 'shipment' and l.resource_id ~ '^[0-9]+$' and exists (
          select 1 from public.shipments child where child.id = l.resource_id::bigint and (
            child.project_id = p_resource_id or child.task_id in (select id from public.tasks where project_id = p_resource_id)
          )
        ))
      ) order by l.expires_at desc, l.resource_type, l.resource_id;
  elsif p_resource_type = 'task' then
    if not public.can_manage_projects() then raise exception using message = 'permission denied', errcode = '42501'; end if;
    return query
      select l.resource_type, l.resource_id,
        case l.resource_type when 'task' then coalesce(t.task_name, '업무 #' || l.resource_id)
          when 'shipment' then concat('출고 #', l.resource_id, coalesce(' · ' || s.item_name, ''))
          else l.resource_type || ':' || l.resource_id end,
        l.employee_id, e.name, l.expires_at
      from public.editing_locks l
      join public.employees e on e.id = l.employee_id
      left join public.tasks t on l.resource_type = 'task' and l.resource_id ~ '^[0-9]+$' and t.id = l.resource_id::bigint
      left join public.shipments s on l.resource_type = 'shipment' and l.resource_id ~ '^[0-9]+$' and s.id = l.resource_id::bigint
      where l.expires_at > now() and (
        (l.resource_type = 'task' and l.resource_id = p_resource_id::text)
        or (l.resource_type = 'shipment' and l.resource_id ~ '^[0-9]+$' and exists (select 1 from public.shipments child where child.id = l.resource_id::bigint and child.task_id = p_resource_id))
      ) order by l.expires_at desc, l.resource_type, l.resource_id;
  else
    raise exception using message = 'unsupported delete resource', errcode = '22023';
  end if;
end;
$_$;


--
-- Name: get_material_usage_request_history(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_material_usage_request_history(p_usage_request_id uuid) RETURNS TABLE(created_at timestamp with time zone, activity_type text, title text, description text, employee_name text, metadata jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select log.created_at,log.activity_type,log.title,log.description,log.employee_name,log.metadata
  from public.activity_logs log
  where public.is_approved_erp_user() and log.metadata->>'usage_request_id'=p_usage_request_id::text
  order by log.created_at desc,log.id desc
$$;


--
-- Name: get_material_usage_requests(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_material_usage_requests(p_project_id bigint DEFAULT NULL::bigint) RETURNS TABLE(id uuid, material_code text, allocation_type text, project_id bigint, destination_name text, quantity_tons numeric, purchase_order_no text, usage_date date, memo text, status text, allocated_tons numeric, unallocated_tons numeric, allocation_state text, created_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select r.id, r.material_code, r.allocation_type, r.project_id, r.destination_name,
    r.quantity_tons, r.purchase_order_no, r.usage_date, r.memo, r.status,
    coalesce(sum(a.quantity_tons) filter (where a.status in ('planned','confirmed')),0)::numeric,
    greatest(r.quantity_tons - coalesce(sum(a.quantity_tons) filter (where a.status in ('planned','confirmed')),0),0)::numeric,
    case when coalesce(sum(a.quantity_tons) filter (where a.status in ('planned','confirmed')),0) <= 0 then 'unallocated'
      when coalesce(sum(a.quantity_tons) filter (where a.status in ('planned','confirmed')),0) + 0.00005 < r.quantity_tons then 'partially_allocated'
      else 'fully_allocated' end,
    r.created_at
  from public.material_usage_requests r
  left join public.material_contract_allocations a on a.usage_request_id = r.id
  where public.is_approved_erp_user() and (p_project_id is null or r.project_id = p_project_id)
  group by r.id order by r.usage_date desc, r.created_at desc
$$;


--
-- Name: get_material_usage_requests_v2(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_material_usage_requests_v2(p_project_id bigint DEFAULT NULL::bigint) RETURNS TABLE(id uuid, material_code text, allocation_type text, project_id bigint, destination_name text, quantity_tons numeric, purchase_order_no text, usage_date date, memo text, status text, allocated_tons numeric, unallocated_tons numeric, allocation_state text, created_at timestamp with time zone, material_usage_group_id uuid, group_name text, group_category text, group_sequence integer, group_status text, group_planned_date date, group_is_active boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
select r.id,r.material_code,r.allocation_type,r.project_id,r.destination_name,r.quantity_tons,r.purchase_order_no,r.usage_date,r.memo,r.status,
coalesce(sum(a.quantity_tons) filter(where a.status in ('planned','confirmed')),0)::numeric,
greatest(r.quantity_tons-coalesce(sum(a.quantity_tons) filter(where a.status in ('planned','confirmed')),0),0)::numeric,
case when coalesce(sum(a.quantity_tons) filter(where a.status in ('planned','confirmed')),0)<=0 then 'unallocated' when coalesce(sum(a.quantity_tons) filter(where a.status in ('planned','confirmed')),0)+0.00005<r.quantity_tons then 'partially_allocated' else 'fully_allocated' end,
r.created_at,r.material_usage_group_id,g.name,g.category,g.sequence,g.status,g.planned_date,g.is_active
from public.material_usage_requests r left join public.material_contract_allocations a on a.usage_request_id=r.id left join public.material_usage_groups g on g.id=r.material_usage_group_id
where public.is_approved_erp_user() and (p_project_id is null or r.project_id=p_project_id) group by r.id,g.id order by r.usage_date desc,r.created_at desc $$;


--
-- Name: get_share_invitation_titles(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_share_invitation_titles(p_invitation_ids uuid[]) RETURNS TABLE(invitation_id uuid, item_title text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select invitation.id,
         coalesce(nullif(note.title, ''), nullif(note.content, ''), '제목 없음')
  from public.share_invitations invitation
  join public.shared_items shared_item on shared_item.id = invitation.shared_item_id
  join public.personal_notes note on note.id = shared_item.item_id
  where invitation.id = any(coalesce(p_invitation_ids, array[]::uuid[]))
    and (
      invitation.inviter_id = public.sharing_current_employee_id()
      or invitation.invitee_id = public.sharing_current_employee_id()
    );
$$;


--
-- Name: get_shared_comment_count_stats(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_shared_comment_count_stats(p_item_ids uuid[]) RETURNS TABLE(item_id uuid, comment_count bigint, unread_count bigint)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select
    si.item_id,
    count(sc.id)::bigint as comment_count,
    count(sc.id) filter (
      where sc.author_id <> public.sharing_current_employee_id()
        and sc.id > coalesce(scr.last_read_comment_id, 0)
    )::bigint as unread_count
  from public.shared_items si
  left join public.shared_comments sc on sc.shared_item_id = si.id
  left join public.shared_comment_reads scr
    on scr.shared_item_id = si.id
   and scr.employee_id = public.sharing_current_employee_id()
  where si.item_id = any(p_item_ids)
  group by si.item_id, scr.last_read_comment_id
$$;


--
-- Name: get_shared_comment_counts(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_shared_comment_counts(p_item_ids uuid[]) RETURNS TABLE(item_id uuid, comment_count bigint)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select si.item_id, count(sc.id)::bigint
  from public.shared_items si
  join public.shared_comments sc on sc.shared_item_id = si.id
  where si.item_id = any(p_item_ids)
  group by si.item_id
$$;


--
-- Name: guard_material_allocation_activity_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_material_allocation_activity_insert() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if new.target_type = 'material_contract_allocation'
     and coalesce(current_setting('app.material_allocation_audit_write', true), '') <> 'on' then
    raise exception '원자재 배정 Audit은 저장 RPC에서만 생성할 수 있습니다.' using errcode = '42501';
  end if;
  return new;
end;
$$;


--
-- Name: handle_new_signup_request(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_signup_request() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  linked_employee_id bigint;
begin
  update public.employees
  set
    auth_user_id = new.id,
    email = lower(new.email),
    approval_status = 'approved',
    active = true
  where id = (
    select id
    from public.employees
    where auth_user_id is null
      and email is not null
      and lower(email) = lower(new.email)
    order by id
    limit 1
  )
  returning id into linked_employee_id;

  if linked_employee_id is not null then
    return new;
  end if;

  insert into public.employees (
    auth_user_id,
    name,
    email,
    role,
    active,
    approval_status
  )
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), '이름 미입력'),
    lower(new.email),
    null,
    false,
    'pending'
  );
  return new;
exception
  when unique_violation then
    raise exception using
      errcode = '23505',
      message = 'duplicate signup request';
end;
$$;


--
-- Name: has_erp_role(text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_erp_role(p_roles text[]) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1
    from public.employees
    where auth_user_id = auth.uid()
      and active is true
      and approval_status = 'approved'
      and role = any(p_roles)
  );
$$;


--
-- Name: heartbeat_editing_lock(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.heartbeat_editing_lock(p_lock_token uuid) RETURNS TABLE(resource_type text, resource_id text, employee_id bigint, employee_name text, expires_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_employee_id bigint;
begin
  select id into v_employee_id from public.employees where auth_user_id = auth.uid() and active = true and approval_status = 'approved';
  return query update public.editing_locks l set heartbeat_at = now(), expires_at = now() + interval '60 seconds'
    from public.employees e where l.lock_token = p_lock_token and l.employee_id = v_employee_id and l.expires_at > now() and e.id = l.employee_id
    returning l.resource_type, l.resource_id, l.employee_id, e.name, l.expires_at;
end;
$$;


--
-- Name: import_lme_market_prices(jsonb, text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.import_lme_market_prices(rows_json jsonb, import_file_name text, import_created_by_name text, import_pre_skipped_rows integer) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  total_count integer := jsonb_array_length(rows_json);
  inserted_count integer := 0;
  skipped_count integer := 0;
begin
  if not public.is_approved_admin() then raise exception 'Admin permission is required.' using errcode = '42501'; end if;
  if total_count > 1000 then raise exception 'A maximum of 1000 rows can be imported at once.' using errcode = '22023'; end if;

  with source_rows as (
    select * from jsonb_to_recordset(rows_json) as row_data(
      reference_date date, reference_month date, round smallint, material_code text,
      lme_al_usd_per_ton numeric, exchange_rate_krw_per_usd numeric,
      domestic_lme_krw_per_kg numeric, source_url text, memo text
    )
  ), inserted as (
    insert into public.lme_market_prices (
      reference_date, reference_month, round, material_code, lme_al_usd_per_ton,
      exchange_rate_krw_per_usd, domestic_lme_krw_per_kg, source_url, memo,
      created_by, created_by_name
    )
    select reference_date, reference_month, round, material_code, lme_al_usd_per_ton,
      exchange_rate_krw_per_usd, domestic_lme_krw_per_kg, source_url, memo,
      auth.uid(), import_created_by_name
    from source_rows
    on conflict (reference_month, round, material_code) do nothing
    returning 1
  )
  select count(*) into inserted_count from inserted;

  skipped_count := import_pre_skipped_rows + total_count - inserted_count;
  insert into public.lme_import_logs (
    file_name, total_rows, inserted_rows, skipped_rows, failed_rows,
    created_by, created_by_name
  ) values (
    import_file_name, total_count + import_pre_skipped_rows, inserted_count, skipped_count, 0,
    auth.uid(), import_created_by_name
  );
  return jsonb_build_object('insertedRows', inserted_count, 'skippedRows', skipped_count, 'failedRows', 0);
end;
$$;


--
-- Name: import_project_cost_entries(text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.import_project_cost_entries(p_file_name text, p_rows jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $_$
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
end; $_$;


--
-- Name: is_approved_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_approved_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select public.has_erp_role(array['admin']);
$$;


--
-- Name: is_approved_erp_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_approved_erp_user() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select public.has_erp_role(array['admin', 'manager', 'staff', 'viewer']);
$$;


--
-- Name: is_calendar_only_staff(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_calendar_only_staff() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    SET row_security TO 'off'
    AS $$
  select exists (
    select 1
    from public.employees employee
    join public.organizations organization on organization.id = employee.organization_id
    where employee.auth_user_id = auth.uid()
      and employee.active = true
      and employee.approval_status = 'approved'
      and lower(btrim(coalesce(employee.role, ''))) = 'staff'
      and lower(btrim(coalesce(employee.position, ''))) = lower('스태프')
      and lower(btrim(organization.name)) = lower('기타')
  );
$$;


--
-- Name: FUNCTION is_calendar_only_staff(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.is_calendar_only_staff() IS 'Approved active staff assigned to organization 기타 with position 스태프; Calendar read/export only.';


--
-- Name: log_accessory_activity(text, bigint, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_accessory_activity(p_type text, p_project bigint, p_title text, p_metadata jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare e public.employees%rowtype; begin select * into e from public.employees where auth_user_id=auth.uid() and active=true and approval_status='approved';
 insert into public.activity_logs(activity_type,action_type,target_type,target_id,project_id,employee_id,employee_name,employee_email,title,metadata)
 values(p_type,p_type,'project_accessory_usage',null,p_project,e.id,e.name,e.email,p_title,coalesce(p_metadata,'{}')); end $$;


--
-- Name: log_coating_cost_activity(text, uuid, bigint, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_coating_cost_activity(p_type text, p_statement uuid, p_project bigint, p_title text, p_metadata jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare e public.employees%rowtype; begin select * into e from public.employees where auth_user_id=auth.uid() and active=true and approval_status='approved';
 insert into public.activity_logs(activity_type,action_type,target_type,target_id,project_id,employee_id,employee_name,employee_email,title,metadata)
 values(p_type,p_type,'coating_cost_statement',null,p_project,e.id,e.name,e.email,p_title,coalesce(p_metadata,'{}')||jsonb_build_object('statement_id',p_statement)); end $$;


--
-- Name: log_glass_cost_activity(text, uuid, bigint, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_glass_cost_activity(p_type text, p_statement uuid, p_project bigint, p_title text, p_metadata jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare e public.employees%rowtype; begin select * into e from public.employees where auth_user_id=auth.uid() and active=true and approval_status='approved';
 insert into public.activity_logs(activity_type,action_type,target_type,target_id,project_id,employee_id,employee_name,employee_email,title,metadata)
 values(p_type,p_type,'glass_cost_statement',null,p_project,e.id,e.name,e.email,p_title,coalesce(p_metadata,'{}')||jsonb_build_object('statement_id',p_statement)); end $$;


--
-- Name: log_material_usage_request_created(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_material_usage_request_created() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare v_employee public.employees%rowtype;
begin
  select * into v_employee from public.employees where auth_user_id=new.created_by;
  insert into public.activity_logs(activity_type,action_type,target_type,employee_id,employee_name,employee_email,title,description,metadata)
  values('material_usage_request_created','material_usage_request_created','material_usage_request',v_employee.id,v_employee.name,v_employee.email,'원자재 사용요청 생성',to_char(new.quantity_tons,'FM999999999990.0000')||'t',jsonb_build_object('usage_request_id',new.id,'quantity_tons',new.quantity_tons,'usage_date',new.usage_date));
  return new;
end; $$;


--
-- Name: log_personal_note_activity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_personal_note_activity() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if tg_op = 'INSERT' then
    perform public.record_shared_workspace_activity(new.id, 'personal_note_create', coalesce(nullif(new.title, ''), new.content), '{}'::jsonb);
    return new;
  elsif tg_op = 'UPDATE' then
    if old.due_date is distinct from new.due_date then
      perform public.record_shared_workspace_activity(new.id, 'personal_note_date_change', null, jsonb_build_object('before', old.due_date, 'after', new.due_date));
    end if;
    if (old.note_type, old.title, old.content, old.is_completed, old.is_pinned, old.color, old.sort_order)
       is distinct from
       (new.note_type, new.title, new.content, new.is_completed, new.is_pinned, new.color, new.sort_order) then
      perform public.record_shared_workspace_activity(new.id, 'personal_note_update', null, jsonb_build_object('before_title', old.title, 'after_title', new.title));
    end if;
    return new;
  else
    perform public.record_shared_workspace_activity(old.id, 'personal_note_delete', coalesce(nullif(old.title, ''), old.content), '{}'::jsonb);
    return old;
  end if;
end;
$$;


--
-- Name: log_share_invitation_activity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_share_invitation_activity() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_item_id uuid; v_type text;
begin
  select item_id into v_item_id from public.shared_items where id = new.shared_item_id;
  if tg_op = 'INSERT' then v_type := 'share_invitation_create';
  elsif old.status is not distinct from new.status then return new;
  elsif new.status = 'accepted' then v_type := 'share_invitation_accept';
  elsif new.status = 'rejected' then v_type := 'share_invitation_reject';
  elsif new.status = 'cancelled' then v_type := 'share_invitation_cancel';
  else return new; end if;
  perform public.record_shared_workspace_activity(v_item_id, v_type, null, jsonb_build_object('invitee_id', new.invitee_id, 'permission', new.permission, 'status', new.status));
  return new;
end;
$$;


--
-- Name: log_shared_comment_activity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_shared_comment_activity() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_item_id uuid;
begin
  select item_id into v_item_id from public.shared_items where id = coalesce(new.shared_item_id, old.shared_item_id);
  if not exists (select 1 from public.personal_notes where id = v_item_id) then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if tg_op = 'INSERT' then
    perform public.record_shared_workspace_activity(v_item_id, 'shared_comment_create', left(new.content, 120), jsonb_build_object('comment_id', new.id)); return new;
  elsif tg_op = 'UPDATE' then
    perform public.record_shared_workspace_activity(v_item_id, 'shared_comment_update', left(new.content, 120), jsonb_build_object('comment_id', new.id)); return new;
  else
    perform public.record_shared_workspace_activity(v_item_id, 'shared_comment_delete', left(old.content, 120), jsonb_build_object('comment_id', old.id)); return old;
  end if;
end;
$$;


--
-- Name: log_shared_member_activity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_shared_member_activity() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_item_id uuid;
begin
  select item_id into v_item_id from public.shared_items where id = coalesce(new.shared_item_id, old.shared_item_id);
  if not exists (select 1 from public.personal_notes where id = v_item_id) then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if tg_op = 'UPDATE' and old.permission is distinct from new.permission then
    perform public.record_shared_workspace_activity(v_item_id, 'share_member_permission_change', old.permission || ' → ' || new.permission, jsonb_build_object('employee_id', new.employee_id, 'before', old.permission, 'after', new.permission)); return new;
  elsif tg_op = 'DELETE' then
    perform public.record_shared_workspace_activity(v_item_id, 'share_member_remove', null, jsonb_build_object('employee_id', old.employee_id, 'permission', old.permission)); return old;
  end if;
  return new;
end;
$$;


--
-- Name: manage_settings_item(text, bigint, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.manage_settings_item(p_entity text, p_target_id bigint, p_execute boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_actor public.employees%rowtype;
  v_employee public.employees%rowtype;
  v_partner public.organizations%rowtype;
  v_template public.task_templates%rowtype;
  v_partner_category_id bigint;
  v_reference_count integer := 0;
  v_action text;
  v_name text;
begin
  if not public.is_approved_admin() then
    raise exception using message = '관리자 권한이 필요합니다.', errcode = '42501';
  end if;

  select * into v_actor
  from public.employees
  where auth_user_id = auth.uid()
    and active is true
    and approval_status = 'approved'
    and role = 'admin'
  limit 1;

  if p_entity = 'task_template' then
    select * into v_template
    from public.task_templates
    where id = p_target_id
    for update;

    if not found then
      return jsonb_build_object('success', false, 'action', 'blocked', 'message', '업무 템플릿을 찾을 수 없습니다.', 'referenceCount', 0);
    end if;

    v_action := 'deleted';
    v_name := v_template.task_name;

    if p_execute then
      delete from public.task_templates where id = p_target_id;
      insert into public.activity_logs (
        activity_type, action_type, target_type, target_id,
        employee_id, employee_name, employee_email,
        title, description, metadata
      ) values (
        'task_delete', 'task_delete', 'task_template', p_target_id,
        v_actor.id, v_actor.name, v_actor.email,
        '업무 템플릿 삭제',
        format('%s 템플릿을 삭제했습니다.', v_name),
        jsonb_build_object(
          'templateName', v_name,
          'processType', v_template.process_type,
          'taskType', v_template.task_type,
          'taskOrder', v_template.task_order,
          'deletedAt', now()
        )
      );
    end if;

  elsif p_entity = 'employee' then
    select * into v_employee
    from public.employees
    where id = p_target_id
    for update;

    if not found then
      return jsonb_build_object('success', false, 'action', 'blocked', 'message', '직원을 찾을 수 없습니다.', 'referenceCount', 0);
    end if;

    if v_employee.auth_user_id = auth.uid() then
      return jsonb_build_object('success', false, 'action', 'blocked', 'message', '현재 로그인한 관리자 계정은 삭제하거나 비활성화할 수 없습니다.', 'referenceCount', 1);
    end if;

    select
      (select count(*) from public.projects where salesperson = v_employee.name or task_manager = v_employee.name)
      + (select count(*) from public.project_sections where task_manager = v_employee.name)
      + (select count(*) from public.tasks where assignee = v_employee.name)
      + (select count(*) from public.shipments where driver_name = v_employee.name)
      + (select count(*) from public.activity_logs where employee_id = v_employee.id or employee_name = v_employee.name or (v_employee.email is not null and employee_email = v_employee.email))
      + (select count(*) from public.project_files where uploaded_by = v_employee.name or (v_employee.email is not null and uploaded_by_email = v_employee.email))
      + case when v_employee.auth_user_id is null then 0 else 1 end
    into v_reference_count;

    v_action := case when v_reference_count > 0 then 'deactivated' else 'deleted' end;
    v_name := v_employee.name;

    if p_execute then
      if v_action = 'deactivated' then
        update public.employees
        set active = false
        where id = p_target_id;
      else
        delete from public.employees where id = p_target_id;
      end if;

      insert into public.activity_logs (
        activity_type, action_type, target_type, target_id,
        employee_id, employee_name, employee_email,
        title, description, metadata
      ) values (
        case when v_action = 'deleted' then 'employee_update' else 'employee_deactivate' end,
        case when v_action = 'deleted' then 'employee_update' else 'employee_deactivate' end,
        'employee', p_target_id,
        v_actor.id, v_actor.name, v_actor.email,
        case when v_action = 'deleted' then '직원 삭제' else '직원 비활성화' end,
        case when v_action = 'deleted'
          then format('%s 직원을 삭제했습니다.', v_name)
          else format('%s 직원은 기존 업무 또는 기록에 사용 중이어서 비활성화했습니다.', v_name)
        end,
        jsonb_build_object('employeeName', v_name, 'action', v_action, 'referenceCount', v_reference_count, 'processedAt', now())
      );
    end if;

  elsif p_entity = 'partner' then
    select id into v_partner_category_id
    from public.organization_categories
    where code = 'partner';

    select * into v_partner
    from public.organizations
    where id = p_target_id
      and category_id = v_partner_category_id
    for update;

    if not found then
      return jsonb_build_object('success', false, 'action', 'blocked', 'message', '협력업체를 찾을 수 없습니다.', 'referenceCount', 0);
    end if;

    select
      (select count(*) from public.project_assembly_vendors where organization_id = v_partner.id)
      + (select count(*) from public.projects where assembly_vendor_organization_id = v_partner.id or lower(btrim(assembly_vendor)) = lower(btrim(v_partner.name)))
      + (select count(*) from public.project_sections where lower(btrim(assembly_vendor)) = lower(btrim(v_partner.name)))
      + (select count(*) from public.employees where organization_id = v_partner.id)
    into v_reference_count;

    v_action := case when v_reference_count > 0 then 'deactivated' else 'deleted' end;
    v_name := v_partner.name;

    if p_execute then
      if v_action = 'deactivated' then
        update public.organizations
        set is_active = false, updated_at = now()
        where id = p_target_id;
      else
        delete from public.organizations where id = p_target_id;
      end if;

      insert into public.activity_logs (
        activity_type, action_type, target_type, target_id,
        employee_id, employee_name, employee_email,
        title, description, metadata
      ) values (
        'project_update', 'project_update', 'partner_organization', p_target_id,
        v_actor.id, v_actor.name, v_actor.email,
        case when v_action = 'deleted' then '협력업체 삭제' else '협력업체 비활성화' end,
        case when v_action = 'deleted'
          then format('%s 협력업체를 삭제했습니다.', v_name)
          else format('%s 협력업체는 기존 프로젝트 또는 기록에 사용 중이어서 비활성화했습니다.', v_name)
        end,
        jsonb_build_object('partnerName', v_name, 'action', v_action, 'referenceCount', v_reference_count, 'processedAt', now())
      );
    end if;

  else
    raise exception using message = '지원하지 않는 설정 항목입니다.', errcode = '22023';
  end if;

  return jsonb_build_object(
    'success', true,
    'action', v_action,
    'message', case
      when v_action = 'deleted' then format('%s 항목이 삭제됩니다.', v_name)
      else format('%s 항목이 기존 기록에 사용 중이어서 비활성화됩니다.', v_name)
    end,
    'referenceCount', v_reference_count
  );
exception
  when foreign_key_violation then
    return jsonb_build_object('success', false, 'action', 'blocked', 'message', '연결된 데이터가 있어 완전 삭제할 수 없습니다.', 'referenceCount', greatest(v_reference_count, 1));
end;
$$;


--
-- Name: mark_shared_comments_read(uuid, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_shared_comments_read(p_item_id uuid, p_last_comment_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_employee_id bigint;
  v_shared_item_id uuid;
  v_last_comment_id bigint;
begin
  v_employee_id := public.sharing_current_employee_id();
  select id into v_shared_item_id from public.shared_items where item_id = p_item_id;
  if v_employee_id is null or v_shared_item_id is null or not public.can_comment_shared_item(v_shared_item_id) then
    raise exception 'comment_access_denied';
  end if;

  select coalesce(max(id), 0) into v_last_comment_id
  from public.shared_comments
  where shared_item_id = v_shared_item_id
    and id <= greatest(p_last_comment_id, 0);

  insert into public.shared_comment_reads(shared_item_id, employee_id, last_read_comment_id, read_at, updated_at)
  values (v_shared_item_id, v_employee_id, v_last_comment_id, now(), now())
  on conflict (shared_item_id, employee_id) do update
  set last_read_comment_id = greatest(public.shared_comment_reads.last_read_comment_id, excluded.last_read_comment_id),
      read_at = now(),
      updated_at = now();
end
$$;


--
-- Name: prepare_project_contract_entry(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prepare_project_contract_entry() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  current_supply bigint;
  current_total bigint;
begin
  perform pg_advisory_xact_lock(new.project_id);

  if tg_op = 'INSERT' then
    new.total_amount_krw := new.supply_amount_krw + new.vat_amount_krw;
    if new.status <> 'confirmed' then
      raise exception 'New contract entries must be confirmed.' using errcode = '23514';
    end if;
    if new.entry_type in ('increase', 'decrease') and not exists (
      select 1 from public.project_contract_entries
      where project_id = new.project_id and entry_type = 'original' and status = 'confirmed'
    ) then
      raise exception 'A confirmed original contract is required.' using errcode = '23514';
    end if;
    if new.entry_type = 'decrease' then
      select
        coalesce(sum(case entry_type when 'original' then supply_amount_krw when 'increase' then supply_amount_krw else -supply_amount_krw end), 0),
        coalesce(sum(case entry_type when 'original' then total_amount_krw when 'increase' then total_amount_krw else -total_amount_krw end), 0)
      into current_supply, current_total
      from public.project_contract_entries where project_id = new.project_id and status = 'confirmed';
      if current_supply - new.supply_amount_krw < 0 or current_total - new.total_amount_krw < 0 then
        raise exception 'Decrease would make the final contract amount negative.' using errcode = '23514';
      end if;
    end if;
    return new;
  end if;

  if new.project_id is distinct from old.project_id
    or new.entry_type is distinct from old.entry_type
    or new.supply_amount_krw is distinct from old.supply_amount_krw
    or new.vat_amount_krw is distinct from old.vat_amount_krw
    or new.total_amount_krw is distinct from old.total_amount_krw
    or new.contract_date is distinct from old.contract_date
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at then
    raise exception 'Core contract entry fields are immutable. Void and register a new entry.' using errcode = '55000';
  end if;
  if old.status = 'void' and new.status <> 'void' then
    raise exception 'A void entry cannot be restored.' using errcode = '55000';
  end if;
  if old.status = 'confirmed' and new.status = 'void' then
    select
      coalesce(sum(case entry_type when 'original' then supply_amount_krw when 'increase' then supply_amount_krw else -supply_amount_krw end), 0),
      coalesce(sum(case entry_type when 'original' then total_amount_krw when 'increase' then total_amount_krw else -total_amount_krw end), 0)
    into current_supply, current_total
    from public.project_contract_entries
    where project_id = old.project_id and status = 'confirmed' and id <> old.id;
    if current_supply < 0 or current_total < 0 then
      raise exception 'Voiding this entry would make the final contract amount negative.' using errcode = '23514';
    end if;
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;


--
-- Name: prepare_project_cost_category(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prepare_project_cost_category() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  if tg_op='UPDATE' then
    if new.code is distinct from old.code or new.is_system is distinct from old.is_system or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
      raise exception 'Category code and system identity are immutable.' using errcode='55000';
    end if;
    new.updated_by:=auth.uid(); new.updated_at:=now();
  end if;
  return new;
end; $$;


--
-- Name: prepare_project_cost_entry(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prepare_project_cost_entry() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  if tg_op='INSERT' then
    if not exists(select 1 from public.project_cost_categories where id=new.category_id and is_active) then
      raise exception 'Inactive or missing cost category cannot be used.' using errcode='23514';
    end if;
    new.total_amount_krw:=new.supply_amount_krw+new.vat_amount_krw;
    if new.status<>'confirmed' then raise exception 'New cost entries must be confirmed.' using errcode='23514'; end if;
    return new;
  end if;
  if new.project_id is distinct from old.project_id or new.category_id is distinct from old.category_id
    or new.cost_date is distinct from old.cost_date or new.supply_amount_krw is distinct from old.supply_amount_krw
    or new.vat_amount_krw is distinct from old.vat_amount_krw or new.total_amount_krw is distinct from old.total_amount_krw
    or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'Core cost entry fields are immutable. Void and register a new entry.' using errcode='55000';
  end if;
  if old.status='void' and new.status<>'void' then raise exception 'A void cost entry cannot be restored.' using errcode='55000'; end if;
  new.updated_by:=auth.uid(); new.updated_at:=now(); return new;
end; $$;


--
-- Name: prepare_project_material_usage(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prepare_project_material_usage() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  if tg_op = 'UPDATE' then
    new.project_id := old.project_id;
    new.material_code := old.material_code;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_by := auth.uid();
    new.updated_at := now();
  end if;
  return new;
end;
$$;


--
-- Name: prepare_raw_material_contract(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prepare_raw_material_contract() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if tg_op='INSERT' then new.remaining_quantity_ton:=new.contract_quantity_ton;
  else
    if new.supplier_id is distinct from old.supplier_id or new.material_code is distinct from old.material_code or new.contract_name is distinct from old.contract_name or new.contract_year is distinct from old.contract_year or new.contract_price_krw_per_kg is distinct from old.contract_price_krw_per_kg or new.processing_cost_krw_per_kg is distinct from old.processing_cost_krw_per_kg or new.effective_start_date is distinct from old.effective_start_date or new.effective_end_date is distinct from old.effective_end_date or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then raise exception 'Core contract terms are immutable. Register a new contract instead.' using errcode='55000'; end if;
    if new.contract_quantity_ton is distinct from old.contract_quantity_ton and coalesce(current_setting('app.material_contract_quantity_increase',true),'')<>'on' then raise exception '계약 물량은 증액 RPC로만 변경할 수 있습니다.' using errcode='55000'; end if;
    if new.contract_quantity_ton < old.contract_quantity_ton then raise exception '계약 물량은 감소시킬 수 없습니다.' using errcode='22023'; end if;
    new.updated_at:=now(); new.updated_by:=auth.uid();
  end if; return new;
end; $$;


--
-- Name: prevent_exchange_rate_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_exchange_rate_change() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin raise exception 'Exchange rate rows are immutable.' using errcode='55000'; end; $$;


--
-- Name: prevent_lme_market_history_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_lme_market_history_change() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  raise exception 'LME Market History rows are immutable.' using errcode = '55000';
end;
$$;


--
-- Name: project_assembly_vendors_sync_primary_cache(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.project_assembly_vendors_sync_primary_cache() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if tg_op = 'DELETE' then
    perform public.sync_project_primary_vendor(old.project_id);
    return old;
  end if;

  perform public.sync_project_primary_vendor(new.project_id);
  if tg_op = 'UPDATE' and old.project_id <> new.project_id then
    perform public.sync_project_primary_vendor(old.project_id);
  end if;
  return new;
end;
$$;


--
-- Name: protect_referenced_partner_type(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_referenced_partner_type() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if new.partner_type is distinct from old.partner_type and (
    exists (
      select 1 from public.project_assembly_vendors
      where organization_id = old.id
    )
    or exists (
      select 1 from public.suppliers
      where organization_id = old.id
    )
  ) then
    raise exception '사용 중인 협력업체의 타입은 변경할 수 없습니다.' using errcode = '55000';
  end if;
  return new;
end;
$$;


--
-- Name: record_material_allocation_activity(uuid, uuid, text, text, text, text, jsonb, jsonb, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_material_allocation_activity(p_material_contract_id uuid, p_allocation_id uuid, p_event_type text, p_title text, p_field text, p_field_label text, p_before jsonb, p_after jsonb, p_before_display text, p_after_display text) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_employee public.employees%rowtype;
  v_log_id bigint;
begin
  select * into v_employee from public.employees
  where auth_user_id = auth.uid() and active = true and approval_status = 'approved';
  if v_employee.id is null then raise exception '승인된 사용자를 찾을 수 없습니다.' using errcode = '42501'; end if;

  perform set_config('app.material_allocation_audit_write', 'on', true);
  insert into public.activity_logs (
    activity_type, action_type, target_type, target_id, project_id, employee_id,
    employee_name, employee_email, title, description, metadata
  ) values (
    p_event_type, p_event_type, 'material_contract_allocation', null, null, v_employee.id,
    v_employee.name, v_employee.email, p_title, null,
    jsonb_build_object(
      'material_contract_id', p_material_contract_id,
      'allocation_id', p_allocation_id,
      'field', p_field,
      'field_label', p_field_label,
      'before', p_before,
      'after', p_after,
      'before_display', p_before_display,
      'after_display', p_after_display
    )
  ) returning id into v_log_id;
  perform set_config('app.material_allocation_audit_write', 'off', true);
  return v_log_id;
end;
$$;


--
-- Name: record_shared_workspace_activity(uuid, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_shared_workspace_activity(p_item_id uuid, p_activity_type text, p_description text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_employee public.employees%rowtype; v_note public.personal_notes%rowtype; v_log_id bigint;
begin
  if p_activity_type not in (
    'personal_note_create','personal_note_update','personal_note_date_change','personal_note_delete',
    'share_invitation_create','share_invitation_accept','share_invitation_reject','share_invitation_cancel',
    'share_member_permission_change','share_member_remove',
    'shared_comment_create','shared_comment_update','shared_comment_delete'
  ) then raise exception 'invalid_activity_type'; end if;
  select * into v_employee from public.employees
  where auth_user_id = auth.uid() and active = true and approval_status = 'approved';
  if v_employee.id is null then raise exception 'not_authorized'; end if;
  select * into v_note from public.personal_notes where id = p_item_id;
  if v_note.id is null then raise exception 'item_not_found'; end if;
  if not (
    v_note.user_id = auth.uid()
    or exists (select 1 from public.shared_items si join public.shared_item_members sim on sim.shared_item_id = si.id where si.item_id = p_item_id and sim.employee_id = v_employee.id)
    or exists (select 1 from public.shared_items si join public.share_invitations inv on inv.shared_item_id = si.id where si.item_id = p_item_id and (inv.inviter_id = v_employee.id or inv.invitee_id = v_employee.id))
  ) then raise exception 'not_authorized'; end if;
  insert into public.activity_logs(
    activity_type, action_type, target_type, target_id, project_id, employee_id,
    employee_name, employee_email, title, description, metadata, source_item_id
  ) values (
    p_activity_type, p_activity_type, 'personal_note', null, null, v_employee.id,
    v_employee.name, v_employee.email,
    case p_activity_type
      when 'personal_note_create' then '일정 생성' when 'personal_note_update' then '일정 수정'
      when 'personal_note_date_change' then '날짜 변경' when 'personal_note_delete' then '원본 삭제'
      when 'share_invitation_create' then '공유 요청' when 'share_invitation_accept' then '공유 수락'
      when 'share_invitation_reject' then '공유 거절' when 'share_invitation_cancel' then '공유 요청 취소'
      when 'share_member_permission_change' then '참여자 권한 변경' when 'share_member_remove' then '공유 해제'
      when 'shared_comment_create' then '댓글 작성' when 'shared_comment_update' then '댓글 수정'
      when 'shared_comment_delete' then '댓글 삭제' else p_activity_type end,
    p_description, coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('personal_note_id', p_item_id), p_item_id
  ) returning id into v_log_id;
  return v_log_id;
end;
$$;


--
-- Name: refresh_lme_market_kpi_cache(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_lme_market_kpi_cache() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare latest_date date;
begin
  select max(reference_date) into latest_date from public.lme_market_prices where material_code = new.material_code and domestic_lme_krw_per_kg is not null;
  insert into public.lme_market_kpi_cache (material_code, latest_reference_date, average_1m, sample_count_1m, average_3m, sample_count_3m, average_6m, sample_count_6m, updated_at)
  select new.material_code, latest_date,
    avg(domestic_lme_krw_per_kg) filter (where reference_date >= latest_date - interval '1 month' and reference_date <= latest_date), count(domestic_lme_krw_per_kg) filter (where reference_date >= latest_date - interval '1 month' and reference_date <= latest_date),
    avg(domestic_lme_krw_per_kg) filter (where reference_date >= latest_date - interval '3 months' and reference_date <= latest_date), count(domestic_lme_krw_per_kg) filter (where reference_date >= latest_date - interval '3 months' and reference_date <= latest_date),
    avg(domestic_lme_krw_per_kg) filter (where reference_date >= latest_date - interval '6 months' and reference_date <= latest_date), count(domestic_lme_krw_per_kg) filter (where reference_date >= latest_date - interval '6 months' and reference_date <= latest_date), now()
  from public.lme_market_prices where material_code = new.material_code
  on conflict (material_code) do update set latest_reference_date = excluded.latest_reference_date, average_1m = excluded.average_1m, sample_count_1m = excluded.sample_count_1m, average_3m = excluded.average_3m, sample_count_3m = excluded.sample_count_3m, average_6m = excluded.average_6m, sample_count_6m = excluded.sample_count_6m, updated_at = excluded.updated_at;
  return new;
end;
$$;


--
-- Name: release_editing_lock(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.release_editing_lock(p_lock_token uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_employee_id bigint; v_deleted integer;
begin
  select id into v_employee_id from public.employees where auth_user_id = auth.uid() and active = true and approval_status = 'approved';
  delete from public.editing_locks where lock_token = p_lock_token and employee_id = v_employee_id;
  get diagnostics v_deleted = row_count;
  return v_deleted = 1;
end;
$$;


--
-- Name: remove_shared_member(uuid, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.remove_shared_member(p_shared_item_id uuid, p_employee_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not exists (select 1 from public.shared_items where id = p_shared_item_id and owner_id = public.sharing_current_employee_id()) then raise exception 'owner_only'; end if;
  delete from public.shared_item_members where shared_item_id = p_shared_item_id and employee_id = p_employee_id;
end;
$$;


--
-- Name: respond_share_invitation(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.respond_share_invitation(p_invitation_id uuid, p_accept boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_employee_id bigint; v_invitation public.share_invitations%rowtype;
begin
  v_employee_id := public.sharing_current_employee_id();
  update public.share_invitations set status = case when p_accept then 'accepted' else 'rejected' end, responded_at = now(), updated_at = now()
  where id = p_invitation_id and invitee_id = v_employee_id and status = 'pending'
  returning * into v_invitation;
  if v_invitation.id is null then raise exception 'invitation_not_pending'; end if;
  if p_accept then
    insert into public.shared_item_members(shared_item_id, employee_id, permission)
    values (v_invitation.shared_item_id, v_employee_id, v_invitation.permission)
    on conflict (shared_item_id, employee_id) do nothing;
  end if;
end;
$$;


--
-- Name: accessory_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accessory_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    specification text,
    unit text NOT NULL,
    origin_type text NOT NULL,
    price_basis text NOT NULL,
    currency text NOT NULL,
    current_unit_price numeric(18,4) NOT NULL,
    vendor_organization_id bigint,
    is_active boolean DEFAULT true NOT NULL,
    memo text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_by uuid NOT NULL,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT accessory_items_check CHECK ((((price_basis = 'KRW_DIRECT'::text) AND (currency = 'KRW'::text)) OR ((price_basis = 'FOREIGN_CURRENCY'::text) AND (currency = 'USD'::text)))),
    CONSTRAINT accessory_items_currency_check CHECK ((currency = ANY (ARRAY['KRW'::text, 'USD'::text]))),
    CONSTRAINT accessory_items_current_unit_price_check CHECK ((current_unit_price >= (0)::numeric)),
    CONSTRAINT accessory_items_memo_check CHECK (((memo IS NULL) OR (char_length(memo) <= 2000))),
    CONSTRAINT accessory_items_name_check CHECK (((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 200))),
    CONSTRAINT accessory_items_origin_type_check CHECK ((origin_type = ANY (ARRAY['domestic'::text, 'imported'::text]))),
    CONSTRAINT accessory_items_price_basis_check CHECK ((price_basis = ANY (ARRAY['KRW_DIRECT'::text, 'FOREIGN_CURRENCY'::text]))),
    CONSTRAINT accessory_items_sort_order_check CHECK ((sort_order >= 0)),
    CONSTRAINT accessory_items_unit_check CHECK ((unit = ANY (ARRAY['EA'::text, 'M'::text, 'SET'::text])))
);

ALTER TABLE ONLY public.accessory_items REPLICA IDENTITY FULL;


--
-- Name: save_accessory_item(uuid, text, text, text, text, text, text, text, numeric, bigint, boolean, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_accessory_item(p_id uuid, p_code text, p_name text, p_specification text, p_unit text, p_origin text, p_price_basis text, p_currency text, p_unit_price numeric, p_vendor bigint, p_active boolean, p_memo text, p_sort integer) RETURNS public.accessory_items
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare old public.accessory_items%rowtype; result public.accessory_items%rowtype; generated_code text; begin
 if not public.is_approved_admin() then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
 if p_name is null or btrim(p_name)='' or p_unit not in('EA','M','SET') or p_origin not in('domestic','imported') or p_price_basis not in('KRW_DIRECT','FOREIGN_CURRENCY') or p_unit_price is null or p_unit_price<0 then raise exception '부자재 정보를 확인해주세요.' using errcode='22023'; end if;
 if (p_price_basis='KRW_DIRECT' and p_currency<>'KRW') or (p_price_basis='FOREIGN_CURRENCY' and p_currency<>'USD') then raise exception '가격방식과 통화를 확인해주세요.' using errcode='22023'; end if;
 if p_vendor is not null and not exists(select 1 from public.organizations where id=p_vendor and partner_type='accessory' and is_active) then raise exception '활성 부자재업체를 선택해주세요.' using errcode='23514'; end if;
 if p_id is null then
  perform pg_advisory_xact_lock(hashtext('accessory_item_code'));
  generated_code:=coalesce(nullif(upper(btrim(p_code)),''),'ACC-'||lpad((coalesce((select max(substring(code from '[0-9]+$')::integer) from public.accessory_items where code~'^ACC-[0-9]+$'),0)+1)::text,4,'0'));
  insert into public.accessory_items(code,name,specification,unit,origin_type,price_basis,currency,current_unit_price,vendor_organization_id,is_active,memo,sort_order,created_by)
  values(generated_code,btrim(p_name),nullif(btrim(p_specification),''),p_unit,p_origin,p_price_basis,p_currency,p_unit_price,p_vendor,coalesce(p_active,true),nullif(btrim(p_memo),''),coalesce(p_sort,0),auth.uid()) returning * into result;
  insert into public.accessory_price_history(accessory_item_id,new_unit_price,new_currency,memo,changed_by) values(result.id,result.current_unit_price,result.currency,'최초 단가',auth.uid());
 else
  select * into old from public.accessory_items where id=p_id for update; if not found then raise exception '부자재를 찾을 수 없습니다.' using errcode='P0002'; end if;
  update public.accessory_items set code=coalesce(nullif(upper(btrim(p_code)),''),old.code),name=btrim(p_name),specification=nullif(btrim(p_specification),''),unit=p_unit,origin_type=p_origin,price_basis=p_price_basis,currency=p_currency,current_unit_price=p_unit_price,vendor_organization_id=p_vendor,is_active=p_active,memo=nullif(btrim(p_memo),''),sort_order=coalesce(p_sort,0),updated_by=auth.uid(),updated_at=now() where id=p_id returning * into result;
  if old.current_unit_price is distinct from result.current_unit_price or old.currency is distinct from result.currency then insert into public.accessory_price_history(accessory_item_id,old_unit_price,new_unit_price,old_currency,new_currency,memo,changed_by) values(result.id,old.current_unit_price,result.current_unit_price,old.currency,result.currency,result.memo,auth.uid()); end if;
 end if; return result; end $_$;


--
-- Name: coating_cost_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coating_cost_allocations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    statement_id uuid NOT NULL,
    project_id bigint NOT NULL,
    allocated_supply_amount_krw bigint NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    memo text,
    created_by uuid NOT NULL,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT coating_cost_allocations_allocated_supply_amount_krw_check CHECK ((allocated_supply_amount_krw > 0)),
    CONSTRAINT coating_cost_allocations_memo_check CHECK (((memo IS NULL) OR (char_length(memo) <= 2000))),
    CONSTRAINT coating_cost_allocations_status_check CHECK ((status = ANY (ARRAY['active'::text, 'void'::text])))
);

ALTER TABLE ONLY public.coating_cost_allocations REPLICA IDENTITY FULL;


--
-- Name: save_coating_cost_allocation(uuid, bigint, bigint, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_coating_cost_allocation(p_statement uuid, p_project bigint, p_amount bigint, p_memo text, p_action text DEFAULT 'save'::text) RETURNS public.coating_cost_allocations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare s public.coating_cost_statements%rowtype; old public.coating_cost_allocations%rowtype; result public.coating_cost_allocations%rowtype; other_total bigint; history_action text; begin
 if not public.is_approved_admin() then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
 select * into s from public.coating_cost_statements where id=p_statement for update; if not found or s.status<>'active' then raise exception '활성 계산서를 찾을 수 없습니다.' using errcode='P0002'; end if;
 if not exists(select 1 from public.projects where id=p_project) then raise exception '프로젝트를 찾을 수 없습니다.' using errcode='P0002'; end if;
 select * into old from public.coating_cost_allocations where statement_id=p_statement and project_id=p_project;
 if p_action='void' then if not found or old.status<>'active' then raise exception '무효 처리할 배분이 없습니다.' using errcode='P0002'; end if; update public.coating_cost_allocations set status='void',updated_by=auth.uid(),updated_at=now() where id=old.id returning * into result; history_action:='void';
 else if p_amount is null or p_amount<=0 then raise exception '배분금액은 0보다 커야 합니다.' using errcode='22023'; end if;
  select coalesce(sum(allocated_supply_amount_krw),0) into other_total from public.coating_cost_allocations where statement_id=p_statement and status='active' and (old.id is null or id<>old.id);
  if other_total+p_amount>s.supply_amount_krw then raise exception '배분합계는 공급가액을 초과할 수 없습니다.' using errcode='23514'; end if;
  if old.id is null then insert into public.coating_cost_allocations(statement_id,project_id,allocated_supply_amount_krw,memo,created_by) values(p_statement,p_project,p_amount,nullif(btrim(p_memo),''),auth.uid()) returning * into result; history_action:='create';
  else update public.coating_cost_allocations set allocated_supply_amount_krw=p_amount,memo=nullif(btrim(p_memo),''),status='active',updated_by=auth.uid(),updated_at=now() where id=old.id returning * into result; history_action:=case when old.status='void' then 'restore' else 'update' end; end if; end if;
 insert into public.coating_cost_allocation_history(allocation_id,statement_id,project_id,action,before_data,after_data,changed_by) values(result.id,p_statement,p_project,history_action,case when old.id is null then null else to_jsonb(old) end,to_jsonb(result),auth.uid());
 perform public.log_coating_cost_activity('coating_cost_allocation_'||history_action,p_statement,p_project,'도장 원가 배분 '||history_action,jsonb_build_object('allocation_id',result.id,'before',case when old.id is null then null else to_jsonb(old) end,'after',to_jsonb(result))); return result; end $$;


--
-- Name: coating_cost_statements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coating_cost_statements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vendor_organization_id bigint NOT NULL,
    accounting_month date NOT NULL,
    invoice_number text,
    supply_amount_krw bigint NOT NULL,
    vat_amount_krw bigint DEFAULT 0 NOT NULL,
    total_amount_krw bigint GENERATED ALWAYS AS ((supply_amount_krw + vat_amount_krw)) STORED,
    status text DEFAULT 'active'::text NOT NULL,
    memo text,
    created_by uuid NOT NULL,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT coating_cost_statements_accounting_month_check CHECK ((accounting_month = (date_trunc('month'::text, (accounting_month)::timestamp with time zone))::date)),
    CONSTRAINT coating_cost_statements_invoice_number_check CHECK (((invoice_number IS NULL) OR (char_length(invoice_number) <= 200))),
    CONSTRAINT coating_cost_statements_memo_check CHECK (((memo IS NULL) OR (char_length(memo) <= 2000))),
    CONSTRAINT coating_cost_statements_status_check CHECK ((status = ANY (ARRAY['active'::text, 'void'::text]))),
    CONSTRAINT coating_cost_statements_supply_amount_krw_check CHECK ((supply_amount_krw >= 0)),
    CONSTRAINT coating_cost_statements_vat_amount_krw_check CHECK ((vat_amount_krw >= 0))
);

ALTER TABLE ONLY public.coating_cost_statements REPLICA IDENTITY FULL;


--
-- Name: save_coating_cost_statement(uuid, bigint, date, text, bigint, bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_coating_cost_statement(p_id uuid, p_vendor bigint, p_month date, p_invoice text, p_supply bigint, p_vat bigint, p_memo text) RETURNS public.coating_cost_statements
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare old public.coating_cost_statements%rowtype; result public.coating_cost_statements%rowtype; allocated bigint; begin
 if not public.is_approved_admin() then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
 if p_month is null or p_month<>date_trunc('month',p_month)::date or p_supply is null or p_supply<0 or p_vat is null or p_vat<0 then raise exception '연월과 금액을 확인해주세요.' using errcode='22023'; end if;
 if p_id is null then
  if not exists(select 1 from public.organizations where id=p_vendor and partner_type='coating' and is_active) then raise exception '활성 도장업체를 선택해주세요.' using errcode='23514'; end if;
  insert into public.coating_cost_statements(vendor_organization_id,accounting_month,invoice_number,supply_amount_krw,vat_amount_krw,memo,created_by) values(p_vendor,p_month,nullif(btrim(p_invoice),''),p_supply,p_vat,nullif(btrim(p_memo),''),auth.uid()) returning * into result;
  perform public.log_coating_cost_activity('coating_cost_statement_create',result.id,null,'도장 계산서 등록',jsonb_build_object('after',to_jsonb(result)));
 else
  select * into old from public.coating_cost_statements where id=p_id for update; if not found or old.status<>'active' then raise exception '수정 가능한 계산서가 없습니다.' using errcode='P0002'; end if;
  select coalesce(sum(allocated_supply_amount_krw),0) into allocated from public.coating_cost_allocations where statement_id=p_id and status='active'; if p_supply<allocated then raise exception '공급가액은 배분합계보다 작을 수 없습니다.' using errcode='23514'; end if;
  if p_vendor<>old.vendor_organization_id and not exists(select 1 from public.organizations where id=p_vendor and partner_type='coating' and is_active) then raise exception '활성 도장업체를 선택해주세요.' using errcode='23514'; end if;
  update public.coating_cost_statements set vendor_organization_id=p_vendor,accounting_month=p_month,invoice_number=nullif(btrim(p_invoice),''),supply_amount_krw=p_supply,vat_amount_krw=p_vat,memo=nullif(btrim(p_memo),''),updated_by=auth.uid(),updated_at=now() where id=p_id returning * into result;
  perform public.log_coating_cost_activity('coating_cost_statement_update',result.id,null,'도장 계산서 수정',jsonb_build_object('before',to_jsonb(old),'after',to_jsonb(result)));
 end if; return result; end $$;


--
-- Name: glass_cost_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.glass_cost_allocations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    statement_id uuid NOT NULL,
    project_id bigint NOT NULL,
    allocated_supply_amount_krw bigint NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    memo text,
    created_by uuid NOT NULL,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT glass_cost_allocations_allocated_supply_amount_krw_check CHECK ((allocated_supply_amount_krw > 0)),
    CONSTRAINT glass_cost_allocations_memo_check CHECK (((memo IS NULL) OR (char_length(memo) <= 2000))),
    CONSTRAINT glass_cost_allocations_status_check CHECK ((status = ANY (ARRAY['active'::text, 'void'::text])))
);

ALTER TABLE ONLY public.glass_cost_allocations REPLICA IDENTITY FULL;


--
-- Name: save_glass_cost_allocation(uuid, bigint, bigint, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_glass_cost_allocation(p_statement uuid, p_project bigint, p_amount bigint, p_memo text, p_action text DEFAULT 'save'::text) RETURNS public.glass_cost_allocations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare s public.glass_cost_statements%rowtype; old public.glass_cost_allocations%rowtype; result public.glass_cost_allocations%rowtype; other_total bigint; history_action text; begin
 if not public.is_approved_admin() then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
 select * into s from public.glass_cost_statements where id=p_statement for update; if not found or s.status<>'active' then raise exception '활성 계산서를 찾을 수 없습니다.' using errcode='P0002'; end if;
 if not exists(select 1 from public.projects where id=p_project) then raise exception '프로젝트를 찾을 수 없습니다.' using errcode='P0002'; end if;
 select * into old from public.glass_cost_allocations where statement_id=p_statement and project_id=p_project;
 if p_action='void' then if not found or old.status<>'active' then raise exception '무효 처리할 배분이 없습니다.' using errcode='P0002'; end if; update public.glass_cost_allocations set status='void',updated_by=auth.uid(),updated_at=now() where id=old.id returning * into result; history_action:='void';
 else if p_amount is null or p_amount<=0 then raise exception '배분금액은 0보다 커야 합니다.' using errcode='22023'; end if;
  select coalesce(sum(allocated_supply_amount_krw),0) into other_total from public.glass_cost_allocations where statement_id=p_statement and status='active' and (old.id is null or id<>old.id);
  if other_total+p_amount>s.supply_amount_krw then raise exception '배분합계는 공급가액을 초과할 수 없습니다.' using errcode='23514'; end if;
  if old.id is null then insert into public.glass_cost_allocations(statement_id,project_id,allocated_supply_amount_krw,memo,created_by) values(p_statement,p_project,p_amount,nullif(btrim(p_memo),''),auth.uid()) returning * into result; history_action:='create';
  else update public.glass_cost_allocations set allocated_supply_amount_krw=p_amount,memo=nullif(btrim(p_memo),''),status='active',updated_by=auth.uid(),updated_at=now() where id=old.id returning * into result; history_action:=case when old.status='void' then 'restore' else 'update' end; end if; end if;
 insert into public.glass_cost_allocation_history(allocation_id,statement_id,project_id,action,before_data,after_data,changed_by) values(result.id,p_statement,p_project,history_action,case when old.id is null then null else to_jsonb(old) end,to_jsonb(result),auth.uid());
 perform public.log_glass_cost_activity('glass_cost_allocation_'||history_action,p_statement,p_project,'유리 원가 배분 '||history_action,jsonb_build_object('allocation_id',result.id,'before',case when old.id is null then null else to_jsonb(old) end,'after',to_jsonb(result))); return result; end $$;


--
-- Name: glass_cost_statements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.glass_cost_statements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vendor_organization_id bigint NOT NULL,
    accounting_month date NOT NULL,
    invoice_number text,
    supply_amount_krw bigint NOT NULL,
    vat_amount_krw bigint DEFAULT 0 NOT NULL,
    total_amount_krw bigint GENERATED ALWAYS AS ((supply_amount_krw + vat_amount_krw)) STORED,
    status text DEFAULT 'active'::text NOT NULL,
    memo text,
    created_by uuid NOT NULL,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT glass_cost_statements_accounting_month_check CHECK ((accounting_month = (date_trunc('month'::text, (accounting_month)::timestamp with time zone))::date)),
    CONSTRAINT glass_cost_statements_invoice_number_check CHECK (((invoice_number IS NULL) OR (char_length(invoice_number) <= 200))),
    CONSTRAINT glass_cost_statements_memo_check CHECK (((memo IS NULL) OR (char_length(memo) <= 2000))),
    CONSTRAINT glass_cost_statements_status_check CHECK ((status = ANY (ARRAY['active'::text, 'void'::text]))),
    CONSTRAINT glass_cost_statements_supply_amount_krw_check CHECK ((supply_amount_krw >= 0)),
    CONSTRAINT glass_cost_statements_vat_amount_krw_check CHECK ((vat_amount_krw >= 0))
);

ALTER TABLE ONLY public.glass_cost_statements REPLICA IDENTITY FULL;


--
-- Name: save_glass_cost_statement(uuid, bigint, date, text, bigint, bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_glass_cost_statement(p_id uuid, p_vendor bigint, p_month date, p_invoice text, p_supply bigint, p_vat bigint, p_memo text) RETURNS public.glass_cost_statements
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare old public.glass_cost_statements%rowtype; result public.glass_cost_statements%rowtype; allocated bigint; begin
 if not public.is_approved_admin() then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
 if p_month is null or p_month<>date_trunc('month',p_month)::date or p_supply is null or p_supply<0 or p_vat is null or p_vat<0 then raise exception '연월과 금액을 확인해주세요.' using errcode='22023'; end if;
 if p_id is null then
  if not exists(select 1 from public.organizations where id=p_vendor and partner_type='glass' and is_active) then raise exception '활성 유리업체를 선택해주세요.' using errcode='23514'; end if;
  insert into public.glass_cost_statements(vendor_organization_id,accounting_month,invoice_number,supply_amount_krw,vat_amount_krw,memo,created_by) values(p_vendor,p_month,nullif(btrim(p_invoice),''),p_supply,p_vat,nullif(btrim(p_memo),''),auth.uid()) returning * into result;
  perform public.log_glass_cost_activity('glass_cost_statement_create',result.id,null,'유리 계산서 등록',jsonb_build_object('after',to_jsonb(result)));
 else
  select * into old from public.glass_cost_statements where id=p_id for update; if not found or old.status<>'active' then raise exception '수정 가능한 계산서가 없습니다.' using errcode='P0002'; end if;
  select coalesce(sum(allocated_supply_amount_krw),0) into allocated from public.glass_cost_allocations where statement_id=p_id and status='active'; if p_supply<allocated then raise exception '공급가액은 배분합계보다 작을 수 없습니다.' using errcode='23514'; end if;
  if p_vendor<>old.vendor_organization_id and not exists(select 1 from public.organizations where id=p_vendor and partner_type='glass' and is_active) then raise exception '활성 유리업체를 선택해주세요.' using errcode='23514'; end if;
  update public.glass_cost_statements set vendor_organization_id=p_vendor,accounting_month=p_month,invoice_number=nullif(btrim(p_invoice),''),supply_amount_krw=p_supply,vat_amount_krw=p_vat,memo=nullif(btrim(p_memo),''),updated_by=auth.uid(),updated_at=now() where id=p_id returning * into result;
  perform public.log_glass_cost_activity('glass_cost_statement_update',result.id,null,'유리 계산서 수정',jsonb_build_object('before',to_jsonb(old),'after',to_jsonb(result)));
 end if; return result; end $$;


--
-- Name: save_material_contract_allocation(uuid, uuid, text, bigint, text, numeric, date, text, text, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_material_contract_allocation(p_contract_id uuid, p_allocation_id uuid, p_allocation_type text, p_project_id bigint, p_destination_name text, p_quantity_tons numeric, p_allocation_date date, p_status text, p_purchase_order_no text, p_memo text, p_cancel boolean DEFAULT false) RETURNS public.material_contract_allocations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_contract public.raw_material_contracts%rowtype;
  v_existing public.material_contract_allocations%rowtype;
  v_allocated numeric(16,4);
  v_result public.material_contract_allocations%rowtype;
begin
  if auth.uid() is null or not public.is_approved_admin() then
    raise exception '관리자 권한이 필요합니다.' using errcode = '42501';
  end if;

  select * into v_contract from public.raw_material_contracts where id = p_contract_id for update;
  if not found then raise exception '계약을 찾을 수 없습니다.' using errcode = 'P0002'; end if;

  if p_allocation_id is not null then
    select * into v_existing from public.material_contract_allocations
    where id = p_allocation_id and contract_id = p_contract_id;
    if not found then raise exception '해당 계약의 사용 이력을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  end if;

  if p_cancel then
    if p_allocation_id is null or v_existing.status = 'cancelled' then raise exception '취소할 수 없는 사용 이력입니다.' using errcode = '22023'; end if;
    update public.material_contract_allocations set status = 'cancelled'
    where id = p_allocation_id and contract_id = p_contract_id returning * into v_result;
    return v_result;
  end if;

  if p_allocation_type not in ('project', 'factory', 'as', 'sample', 'etc') then raise exception '사용 구분을 확인해주세요.' using errcode = '22023'; end if;
  if p_allocation_type = 'project' then
    if p_project_id is null or not exists (select 1 from public.projects where id = p_project_id) then raise exception '유효한 프로젝트가 필요합니다.' using errcode = 'P0002'; end if;
  elsif p_project_id is not null or (p_allocation_type <> 'factory' and nullif(btrim(p_destination_name), '') is null) then
    raise exception '비프로젝트 사용은 프로젝트를 지정할 수 없고 사용처명이 필요합니다.' using errcode = '22023';
  end if;
  if nullif(btrim(p_destination_name), '') is not null and char_length(btrim(p_destination_name)) > 200 then raise exception '사용처명은 200자 이하여야 합니다.' using errcode = '22023'; end if;
  if p_status not in ('planned', 'confirmed') then raise exception '상태는 planned 또는 confirmed여야 합니다.' using errcode = '22023'; end if;
  if p_quantity_tons is null or p_quantity_tons <= 0 or p_quantity_tons <> round(p_quantity_tons, 4) then raise exception '톤수는 0보다 큰 소수점 4자리 이하 값이어야 합니다.' using errcode = '22023'; end if;
  if p_allocation_date is null then raise exception '배정일이 필요합니다.' using errcode = '22023'; end if;
  if nullif(btrim(p_purchase_order_no), '') is not null and char_length(btrim(p_purchase_order_no)) > 100 then raise exception '발주번호는 100자 이하여야 합니다.' using errcode = '22023'; end if;
  if nullif(btrim(p_memo), '') is not null and char_length(btrim(p_memo)) > 2000 then raise exception '메모는 2000자 이하여야 합니다.' using errcode = '22023'; end if;

  select coalesce(sum(quantity_tons), 0) into v_allocated from public.material_contract_allocations
  where contract_id = p_contract_id and status in ('planned', 'confirmed') and (p_allocation_id is null or id <> p_allocation_id);
  if v_allocated + p_quantity_tons > v_contract.contract_quantity_ton + 0.00005 then
    raise exception '현재 배정 가능한 물량은 %t입니다. %t를 배정할 수 없습니다.',
      to_char(greatest(v_contract.contract_quantity_ton - v_allocated, 0), 'FM999999999990.0000'), to_char(p_quantity_tons, 'FM999999999990.0000') using errcode = '23514';
  end if;

  if p_allocation_id is null then
    insert into public.material_contract_allocations (
      contract_id, allocation_type, project_id, destination_name, quantity_tons, allocation_date, status, purchase_order_no, memo, created_by
    ) values (
      p_contract_id, p_allocation_type, case when p_allocation_type = 'project' then p_project_id else null end,
      case when p_allocation_type in ('project', 'factory') then null else nullif(btrim(p_destination_name), '') end,
      p_quantity_tons, p_allocation_date, p_status, nullif(btrim(p_purchase_order_no), ''), nullif(btrim(p_memo), ''), auth.uid()
    ) returning * into v_result;
  else
    if v_existing.status = 'cancelled' then raise exception '취소된 사용 이력은 수정할 수 없습니다.' using errcode = '22023'; end if;
    update public.material_contract_allocations set
      allocation_type = p_allocation_type,
      project_id = case when p_allocation_type = 'project' then p_project_id else null end,
      destination_name = case when p_allocation_type in ('project', 'factory') then null else nullif(btrim(p_destination_name), '') end,
      quantity_tons = p_quantity_tons, allocation_date = p_allocation_date, status = p_status,
      purchase_order_no = nullif(btrim(p_purchase_order_no), ''), memo = nullif(btrim(p_memo), '')
    where id = p_allocation_id and contract_id = p_contract_id returning * into v_result;
  end if;
  return v_result;
end;
$$;


--
-- Name: project_accessory_usages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_accessory_usages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id bigint NOT NULL,
    accessory_item_id uuid NOT NULL,
    usage_date date NOT NULL,
    quantity numeric(18,4) NOT NULL,
    snapshot_unit text NOT NULL,
    snapshot_origin_type text NOT NULL,
    snapshot_price_basis text NOT NULL,
    snapshot_currency text NOT NULL,
    snapshot_unit_price numeric(18,4) NOT NULL,
    snapshot_exchange_rate numeric(18,4),
    snapshot_krw_unit_price bigint NOT NULL,
    total_cost_krw bigint NOT NULL,
    memo text,
    status text DEFAULT 'active'::text NOT NULL,
    created_by uuid NOT NULL,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT project_accessory_usages_check CHECK ((((snapshot_price_basis = 'KRW_DIRECT'::text) AND (snapshot_currency = 'KRW'::text) AND (snapshot_exchange_rate IS NULL)) OR ((snapshot_price_basis = 'FOREIGN_CURRENCY'::text) AND (snapshot_currency = 'USD'::text) AND (snapshot_exchange_rate > (0)::numeric)))),
    CONSTRAINT project_accessory_usages_check1 CHECK (((snapshot_unit <> 'M'::text) OR (quantity = round(quantity, 4)))),
    CONSTRAINT project_accessory_usages_check2 CHECK (((snapshot_unit = 'M'::text) OR (quantity = trunc(quantity)))),
    CONSTRAINT project_accessory_usages_memo_check CHECK (((memo IS NULL) OR (char_length(memo) <= 2000))),
    CONSTRAINT project_accessory_usages_quantity_check CHECK ((quantity > (0)::numeric)),
    CONSTRAINT project_accessory_usages_snapshot_krw_unit_price_check CHECK ((snapshot_krw_unit_price >= 0)),
    CONSTRAINT project_accessory_usages_snapshot_unit_price_check CHECK ((snapshot_unit_price >= (0)::numeric)),
    CONSTRAINT project_accessory_usages_status_check CHECK ((status = ANY (ARRAY['active'::text, 'void'::text]))),
    CONSTRAINT project_accessory_usages_total_cost_krw_check CHECK ((total_cost_krw >= 0))
);

ALTER TABLE ONLY public.project_accessory_usages REPLICA IDENTITY FULL;


--
-- Name: save_project_accessory_usage(uuid, bigint, uuid, date, numeric, numeric, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_project_accessory_usage(p_id uuid, p_project bigint, p_item uuid, p_usage_date date, p_quantity numeric, p_unit_price numeric, p_exchange_rate numeric, p_memo text) RETURNS public.project_accessory_usages
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare item public.accessory_items%rowtype; old public.project_accessory_usages%rowtype; result public.project_accessory_usages%rowtype; krw_unit bigint; total bigint; begin
 if not public.is_approved_admin() then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
 if p_quantity is null or p_quantity<=0 or p_unit_price is null or p_unit_price<0 or p_usage_date is null then raise exception '사용일, 수량과 단가를 확인해주세요.' using errcode='22023'; end if;
 if not exists(select 1 from public.projects where id=p_project) then raise exception '프로젝트를 찾을 수 없습니다.' using errcode='P0002'; end if;
 if p_id is null then select * into item from public.accessory_items where id=p_item and is_active; else select * into old from public.project_accessory_usages where id=p_id for update; if not found or old.status<>'active' then raise exception '수정 가능한 사용내역이 없습니다.' using errcode='P0002'; end if; if old.project_id<>p_project or old.accessory_item_id<>p_item then raise exception '프로젝트와 부자재는 변경할 수 없습니다.' using errcode='23514'; end if; select * into item from public.accessory_items where id=old.accessory_item_id; item.unit:=old.snapshot_unit; item.origin_type:=old.snapshot_origin_type; item.price_basis:=old.snapshot_price_basis; item.currency:=old.snapshot_currency; end if;
 if not found then raise exception '사용 가능한 부자재를 찾을 수 없습니다.' using errcode='P0002'; end if;
 if item.unit in('EA','SET') and p_quantity<>trunc(p_quantity) then raise exception 'EA와 SET 수량은 정수여야 합니다.' using errcode='22023'; end if;
 if item.price_basis='FOREIGN_CURRENCY' then if p_exchange_rate is null or p_exchange_rate<=0 then raise exception '적용환율을 입력해주세요.' using errcode='22023'; end if; krw_unit:=round(p_unit_price*p_exchange_rate); else p_exchange_rate:=null; krw_unit:=round(p_unit_price); end if;
 total:=round(p_quantity*krw_unit); if total<0 then raise exception '총원가를 계산할 수 없습니다.' using errcode='22003'; end if;
 if p_id is null then insert into public.project_accessory_usages(project_id,accessory_item_id,usage_date,quantity,snapshot_unit,snapshot_origin_type,snapshot_price_basis,snapshot_currency,snapshot_unit_price,snapshot_exchange_rate,snapshot_krw_unit_price,total_cost_krw,memo,created_by) values(p_project,item.id,p_usage_date,p_quantity,item.unit,item.origin_type,item.price_basis,item.currency,p_unit_price,p_exchange_rate,krw_unit,total,nullif(btrim(p_memo),''),auth.uid()) returning * into result; perform public.log_accessory_activity('accessory_usage_create',p_project,'부자재 소진 등록',jsonb_build_object('usage_id',result.id,'after',to_jsonb(result)));
 else update public.project_accessory_usages set usage_date=p_usage_date,quantity=p_quantity,snapshot_unit_price=p_unit_price,snapshot_exchange_rate=p_exchange_rate,snapshot_krw_unit_price=krw_unit,total_cost_krw=total,memo=nullif(btrim(p_memo),''),updated_by=auth.uid(),updated_at=now() where id=p_id returning * into result; perform public.log_accessory_activity('accessory_usage_update',p_project,'부자재 소진 수정',jsonb_build_object('usage_id',result.id,'before',to_jsonb(old),'after',to_jsonb(result))); end if;
 return result; end $$;


--
-- Name: set_material_contract_allocations_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_material_contract_allocations_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


--
-- Name: set_material_usage_request_group(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_material_usage_request_group(p_usage_request_id uuid, p_group_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare v_employee public.employees%rowtype; v_request public.material_usage_requests%rowtype; v_group public.material_usage_groups%rowtype;
begin
  select * into v_employee from public.employees where auth_user_id=auth.uid() and active=true and approval_status='approved';
  if v_employee.id is null or v_employee.role<>'admin' then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
  select * into v_request from public.material_usage_requests where id=p_usage_request_id and status='active' for update;
  if not found then raise exception '활성 사용요청을 찾을 수 없습니다.' using errcode='P0002'; end if;
  if p_group_id is not null then
    select * into v_group from public.material_usage_groups where id=p_group_id;
    if not found or not v_group.is_active or v_request.allocation_type<>'project' or v_request.project_id<>v_group.project_id then raise exception '같은 프로젝트의 활성 사용구분만 선택할 수 있습니다.' using errcode='23514'; end if;
  end if;
  update public.material_usage_requests set material_usage_group_id=p_group_id,updated_by=auth.uid(),updated_at=now() where id=v_request.id;
  insert into public.activity_logs(activity_type,action_type,target_type,employee_id,employee_name,employee_email,title,description,metadata)
  values('material_usage_request_group_changed','material_usage_request_group_changed','material_usage_request',v_employee.id,v_employee.name,v_employee.email,'사용구분 변경',coalesce(v_group.name,'구분 없음'),jsonb_build_object('usage_request_id',v_request.id,'material_usage_group_id',p_group_id));
end $$;


--
-- Name: set_personal_notes_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_personal_notes_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: set_project_assembly_vendor_quantity(bigint, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_project_assembly_vendor_quantity(p_relation_id bigint, p_allocated_quantity numeric) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if not public.can_manage_projects() then
    raise exception using message = '프로젝트 수정 권한이 없습니다.', errcode = '42501';
  end if;
  if p_allocated_quantity is not null and p_allocated_quantity < 0 then
    raise exception using message = '업체 배정 수량은 0 이상이어야 합니다.', errcode = '22023';
  end if;

  update public.project_assembly_vendors pav
  set allocated_quantity = p_allocated_quantity
  where pav.id = p_relation_id;

  if not found then
    raise exception using message = '프로젝트 조립업체를 찾을 수 없습니다.', errcode = 'P0002';
  end if;
  return p_relation_id;
end;
$$;


--
-- Name: set_reference_task_status(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_reference_task_status(p_task_id uuid, p_completed boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_employee_id bigint;
begin
  v_employee_id := public.sharing_current_employee_id();
  update public.reference_tasks
  set status = case when p_completed then 'completed' else 'pending' end,
      completed_at = case when p_completed then now() else null end
  where id = p_task_id and assigned_to = v_employee_id;
  if not found then raise exception 'task_not_found'; end if;
end;
$$;


--
-- Name: set_shared_comments_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_shared_comments_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin new.updated_at = now(); return new; end;
$$;


--
-- Name: set_task_notes_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_task_notes_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: set_task_tags(bigint, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_task_tags(p_task_id bigint, p_tags text[]) RETURNS TABLE(task_id bigint, tag text)
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
#variable_conflict error
begin
  if not exists (
    select 1
    from public.employees as e
    where e.auth_user_id = auth.uid()
      and e.active is true
      and e.role in ('admin', 'manager', 'staff', 'member')
  ) then
    raise exception 'Task tag update permission is required.';
  end if;

  if not exists (
    select 1
    from public.tasks as t
    where t.id = p_task_id
  ) then
    raise exception 'Task % was not found.', p_task_id;
  end if;

  delete from public.task_tags as tt
  where tt.task_id = p_task_id
    and not (tt.tag = any(coalesce(p_tags, array[]::text[])));

  insert into public.task_tags as tt (task_id, tag, created_by)
  select
    p_task_id,
    normalized.tag_value,
    auth.uid()
  from (
    select distinct btrim(input_tag.value) as tag_value
    from unnest(coalesce(p_tags, array[]::text[])) as input_tag(value)
    where length(btrim(input_tag.value)) > 0
  ) as normalized
  on conflict on constraint task_tags_task_id_tag_key do nothing;

  return query
  select
    tt.task_id,
    tt.tag
  from public.task_tags as tt
  where tt.task_id = p_task_id
  order by tt.created_at, tt.tag;
end;
$$;


--
-- Name: sharing_can_access_item(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sharing_can_access_item(p_shared_item_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from public.shared_items where id = p_shared_item_id and owner_id = public.sharing_current_employee_id())
    or exists (select 1 from public.shared_item_members where shared_item_id = p_shared_item_id and employee_id = public.sharing_current_employee_id())
    or exists (select 1 from public.share_invitations where shared_item_id = p_shared_item_id and (inviter_id = public.sharing_current_employee_id() or invitee_id = public.sharing_current_employee_id()))
$$;


--
-- Name: sharing_current_employee_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sharing_current_employee_id() RETURNS bigint
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select id
  from public.employees
  where auth_user_id = auth.uid()
    and active = true
    and approval_status = 'approved'
  limit 1
$$;


--
-- Name: sync_project_primary_vendor(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_project_primary_vendor(p_project_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_organization_id bigint;
  v_organization_name text;
begin
  select relation.organization_id, organization.name
    into v_organization_id, v_organization_name
  from public.project_assembly_vendors relation
  join public.organizations organization on organization.id = relation.organization_id
  where relation.project_id = p_project_id
    and relation.is_primary
  order by relation.sort_order, relation.id
  limit 1;

  update public.projects
  set assembly_vendor_organization_id = v_organization_id,
      assembly_vendor = v_organization_name,
      updated_at = now()
  where id = p_project_id;
end;
$$;


--
-- Name: sync_supplier_from_organization(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_supplier_from_organization() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if new.partner_type = 'supplier' then
    insert into public.suppliers (name, is_active, organization_id, updated_at)
    values (new.name, new.is_active, new.id, now())
    on conflict (organization_id) do update set
      name = excluded.name,
      is_active = excluded.is_active,
      updated_at = now();
  end if;
  return new;
end;
$$;


--
-- Name: update_material_usage_group(uuid, date, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_material_usage_group(p_group_id uuid, p_planned_date date, p_status text, p_memo text) RETURNS public.material_usage_groups
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare v_employee public.employees%rowtype; v_result public.material_usage_groups%rowtype;
begin
  select * into v_employee from public.employees where auth_user_id=auth.uid() and active=true and approval_status='approved';
  if v_employee.id is null or v_employee.role<>'admin' then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
  if p_status not in ('planned','in_progress','completed') then raise exception '상태를 확인해 주세요.' using errcode='22023'; end if;
  update public.material_usage_groups set planned_date=p_planned_date,status=p_status,memo=nullif(btrim(p_memo),''),updated_by=auth.uid(),updated_at=now() where id=p_group_id and is_active=true returning * into v_result;
  if v_result.id is null then raise exception '활성 사용구분을 찾을 수 없습니다.' using errcode='P0002'; end if;
  insert into public.activity_logs(activity_type,action_type,target_type,employee_id,employee_name,employee_email,title,description,metadata)
  values('material_usage_group_updated','material_usage_group_updated','material_usage_group',v_employee.id,v_employee.name,v_employee.email,'자재 사용구분 수정',v_result.name,jsonb_build_object('material_usage_group_id',v_result.id,'status',v_result.status,'planned_date',v_result.planned_date));
  return v_result;
end $$;


--
-- Name: material_usage_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.material_usage_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    material_code text NOT NULL,
    allocation_type text NOT NULL,
    project_id bigint,
    destination_name text,
    quantity_tons numeric(16,4) NOT NULL,
    purchase_order_no text,
    usage_date date NOT NULL,
    memo text,
    status text DEFAULT 'active'::text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    material_usage_group_id uuid,
    CONSTRAINT material_usage_requests_allocation_type_check CHECK ((allocation_type = ANY (ARRAY['project'::text, 'factory'::text, 'as'::text, 'sample'::text, 'etc'::text]))),
    CONSTRAINT material_usage_requests_quantity_tons_check CHECK ((quantity_tons > (0)::numeric)),
    CONSTRAINT material_usage_requests_status_check CHECK ((status = ANY (ARRAY['active'::text, 'cancelled'::text]))),
    CONSTRAINT material_usage_requests_target_check CHECK ((((allocation_type = 'project'::text) AND (project_id IS NOT NULL) AND (destination_name IS NULL)) OR ((allocation_type = 'factory'::text) AND (project_id IS NULL) AND (destination_name IS NULL)) OR ((allocation_type = ANY (ARRAY['as'::text, 'sample'::text, 'etc'::text])) AND (project_id IS NULL) AND (NULLIF(btrim(destination_name), ''::text) IS NOT NULL)))),
    CONSTRAINT material_usage_requests_text_check CHECK ((((destination_name IS NULL) OR (char_length(destination_name) <= 200)) AND ((purchase_order_no IS NULL) OR (char_length(purchase_order_no) <= 100)) AND ((memo IS NULL) OR (char_length(memo) <= 2000))))
);

ALTER TABLE ONLY public.material_usage_requests REPLICA IDENTITY FULL;


--
-- Name: update_material_usage_request(uuid, numeric, text, date, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_material_usage_request(p_usage_request_id uuid, p_quantity_tons numeric, p_purchase_order_no text, p_usage_date date, p_memo text) RETURNS public.material_usage_requests
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_employee public.employees%rowtype;
  v_request public.material_usage_requests%rowtype;
  v_allocated numeric(16,4);
begin
  select * into v_employee from public.employees where auth_user_id=auth.uid() and active=true and approval_status='approved';
  if v_employee.id is null or v_employee.role <> 'admin' then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
  select * into v_request from public.material_usage_requests where id=p_usage_request_id and status='active' for update;
  if not found then raise exception '활성 사용요청을 찾을 수 없습니다.' using errcode='P0002'; end if;
  if p_quantity_tons is null or p_quantity_tons<=0 or p_quantity_tons<>round(p_quantity_tons,4) or p_usage_date is null then raise exception '사용요청 입력값을 확인해주세요.' using errcode='22023'; end if;
  if char_length(coalesce(nullif(btrim(p_purchase_order_no),''),''))>100 or char_length(coalesce(nullif(btrim(p_memo),''),''))>2000 then raise exception '발주번호 또는 메모 길이를 확인해주세요.' using errcode='22023'; end if;
  select coalesce(sum(quantity_tons) filter(where status in ('planned','confirmed')),0) into v_allocated
  from public.material_contract_allocations where usage_request_id=v_request.id;
  if p_quantity_tons+0.00005 < v_allocated then raise exception '현재 %.3ft가 계약에 배정되어 있어 요청량을 그보다 작게 줄일 수 없습니다.',v_allocated using errcode='23514'; end if;
  update public.material_usage_requests set quantity_tons=p_quantity_tons,
    purchase_order_no=nullif(btrim(p_purchase_order_no),''), usage_date=p_usage_date,
    memo=nullif(btrim(p_memo),''), updated_by=auth.uid(), updated_at=now()
  where id=v_request.id returning * into v_request;
  insert into public.activity_logs(activity_type,action_type,target_type,employee_id,employee_name,employee_email,title,description,metadata)
  values('material_usage_request_updated','material_usage_request_updated','material_usage_request',v_employee.id,v_employee.name,v_employee.email,'원자재 사용요청 수정',to_char(p_quantity_tons,'FM999999999990.0000')||'t',jsonb_build_object('usage_request_id',v_request.id,'after_quantity_tons',p_quantity_tons,'allocated_tons',v_allocated,'purchase_order_no',v_request.purchase_order_no,'usage_date',v_request.usage_date));
  return v_request;
end; $$;


--
-- Name: update_material_usage_request_details(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_material_usage_request_details(p_usage_request_id uuid, p_purchase_order_no text, p_memo text) RETURNS public.material_usage_requests
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_request public.material_usage_requests;
begin
  if not public.is_approved_admin() then
    raise exception '관리자 권한이 필요합니다.' using errcode = '42501';
  end if;

  update public.material_usage_requests
  set purchase_order_no = nullif(btrim(p_purchase_order_no), ''),
      memo = nullif(btrim(p_memo), ''),
      updated_at = now()
  where id = p_usage_request_id
  returning * into v_request;

  if v_request.id is null then
    raise exception '사용요청을 찾을 수 없습니다.';
  end if;
  return v_request;
end;
$$;


--
-- Name: update_material_usage_request_quantity(uuid, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_material_usage_request_quantity(p_usage_request_id uuid, p_quantity_tons numeric) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare v_request public.material_usage_requests%rowtype; v_allocated numeric(16,4); begin
  if not public.is_approved_admin() then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
  select * into v_request from public.material_usage_requests where id=p_usage_request_id and status='active' for update;
  if not found or p_quantity_tons is null or p_quantity_tons<=0 or p_quantity_tons<>round(p_quantity_tons,4) then raise exception '요청량을 확인해주세요.' using errcode='22023'; end if;
  select coalesce(sum(quantity_tons) filter(where status in ('planned','confirmed')),0) into v_allocated from public.material_contract_allocations where usage_request_id=v_request.id;
  if p_quantity_tons+0.00005<v_allocated then raise exception '요청량은 현재 유효 배정량보다 작을 수 없습니다.' using errcode='23514'; end if;
  update public.material_usage_requests set quantity_tons=p_quantity_tons,updated_by=auth.uid(),updated_at=now() where id=v_request.id;
end; $$;


--
-- Name: update_project_coating_cost_entry(uuid, bigint, bigint, date, bigint, bigint, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_project_coating_cost_entry(p_statement_id uuid, p_project_id bigint, p_vendor_organization_id bigint, p_accounting_month date, p_supply_amount_krw bigint, p_vat_amount_krw bigint, p_invoice_number text DEFAULT NULL::text, p_memo text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare s public.coating_cost_statements%rowtype; a public.coating_cost_allocations%rowtype; active_count integer; active_amount bigint; active_project bigint;
begin
 if not public.is_approved_admin() then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
 select * into s from public.coating_cost_statements where id=p_statement_id for update;
 if not found or s.status<>'active' then raise exception '수정 가능한 계산서를 찾을 수 없습니다.' using errcode='P0002'; end if;
 select count(*),coalesce(sum(allocated_supply_amount_krw),0),min(project_id) into active_count,active_amount,active_project from public.coating_cost_allocations where statement_id=p_statement_id and status='active';
 if active_count<>1 or active_project<>p_project_id or active_amount<>s.supply_amount_krw then raise exception '공동 계산서는 전체 도장 원가관리에서 수정해주세요.' using errcode='23514'; end if;
 if p_supply_amount_krw<s.supply_amount_krw then
  a:=public.save_coating_cost_allocation(p_statement_id,p_project_id,p_supply_amount_krw,p_memo,'save');
  s:=public.save_coating_cost_statement(p_statement_id,p_vendor_organization_id,p_accounting_month,p_invoice_number,p_supply_amount_krw,p_vat_amount_krw,p_memo);
 else
  s:=public.save_coating_cost_statement(p_statement_id,p_vendor_organization_id,p_accounting_month,p_invoice_number,p_supply_amount_krw,p_vat_amount_krw,p_memo);
  a:=public.save_coating_cost_allocation(p_statement_id,p_project_id,p_supply_amount_krw,p_memo,'save');
 end if;
 return jsonb_build_object('statement',to_jsonb(s),'allocation',to_jsonb(a));
end $$;


--
-- Name: update_project_glass_cost_entry(uuid, bigint, bigint, date, bigint, bigint, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_project_glass_cost_entry(p_statement_id uuid, p_project_id bigint, p_vendor_organization_id bigint, p_accounting_month date, p_supply_amount_krw bigint, p_vat_amount_krw bigint, p_invoice_number text DEFAULT NULL::text, p_memo text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: update_project_with_vendors(bigint, jsonb, bigint[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_project_with_vendors(p_project_id bigint, p_project jsonb, p_assembly_vendor_ids bigint[]) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if not public.can_manage_projects() then
    raise exception using message = '프로젝트 수정 권한이 없습니다.', errcode = '42501';
  end if;
  if nullif(p_project->>'quantity', '')::numeric < 0 then
    raise exception using message = '프로젝트 수량은 0 이상이어야 합니다.', errcode = '22023';
  end if;
  perform public.assert_valid_assembly_vendor_ids(p_assembly_vendor_ids);

  update public.projects set
    project_code = btrim(p_project->>'project_code'),
    project_name = btrim(p_project->>'project_name'),
    client_name = nullif(btrim(p_project->>'client_name'), ''),
    site_address = nullif(btrim(p_project->>'site_address'), ''),
    salesperson = nullif(btrim(p_project->>'salesperson'), ''),
    task_manager = nullif(btrim(p_project->>'task_manager'), ''),
    process_type = btrim(p_project->>'process_type'),
    start_date = nullif(p_project->>'start_date', '')::date,
    end_date = nullif(p_project->>'end_date', '')::date,
    memo = nullif(btrim(p_project->>'memo'), ''),
    quantity = nullif(p_project->>'quantity', '')::numeric,
    quantity_unit = nullif(btrim(p_project->>'quantity_unit'), ''),
    updated_at = now()
  where id = p_project_id;

  if not found then
    raise exception using message = '프로젝트를 찾을 수 없습니다.', errcode = 'P0002';
  end if;

  update public.project_assembly_vendors pav set is_primary = false
  where pav.project_id = p_project_id;

  insert into public.project_assembly_vendors (project_id, organization_id, sort_order, is_primary)
  select p_project_id, vendor.id, vendor.ordinality::integer, vendor.ordinality = 1
  from unnest(coalesce(p_assembly_vendor_ids, array[]::bigint[])) with ordinality vendor(id, ordinality)
  on conflict (project_id, organization_id) do update set
    sort_order = excluded.sort_order,
    is_primary = excluded.is_primary;

  delete from public.project_assembly_vendors pav
  where pav.project_id = p_project_id
    and not (pav.organization_id = any(coalesce(p_assembly_vendor_ids, array[]::bigint[])));

  perform public.sync_project_primary_vendor(p_project_id);
  return p_project_id;
end;
$$;


--
-- Name: update_reference_task(uuid, text, date, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_reference_task(p_task_id uuid, p_title text, p_due_date date, p_priority text, p_completed boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_employee_id bigint;
begin
  v_employee_id := public.sharing_current_employee_id();
  if v_employee_id is null then raise exception 'not_authorized'; end if;
  if nullif(btrim(p_title), '') is null or char_length(btrim(p_title)) > 200 then raise exception 'invalid_title'; end if;
  if p_priority not in ('low', 'normal', 'high') then raise exception 'invalid_priority'; end if;
  update public.reference_tasks set
    title = btrim(p_title), due_date = p_due_date, priority = p_priority,
    status = case when p_completed then 'completed' else 'pending' end,
    completed_at = case when p_completed then coalesce(completed_at, now()) else null end
  where id = p_task_id and assigned_to = v_employee_id;
  if not found then raise exception 'task_not_found'; end if;
end;
$$;


--
-- Name: update_shared_member_permission(uuid, bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_shared_member_permission(p_shared_item_id uuid, p_employee_id bigint, p_permission text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if p_permission not in ('view', 'edit') then raise exception 'invalid_permission'; end if;
  if not exists (select 1 from public.shared_items where id = p_shared_item_id and owner_id = public.sharing_current_employee_id()) then raise exception 'owner_only'; end if;
  update public.shared_item_members set permission = p_permission where shared_item_id = p_shared_item_id and employee_id = p_employee_id;
  if not found then raise exception 'member_not_found'; end if;
end;
$$;


--
-- Name: void_coating_cost_statement(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.void_coating_cost_statement(p_id uuid) RETURNS public.coating_cost_statements
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$ declare result public.coating_cost_statements%rowtype; begin
 if not public.is_approved_admin() then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
 update public.coating_cost_statements set status='void',updated_by=auth.uid(),updated_at=now() where id=p_id and status='active' returning * into result; if not found then raise exception '계산서를 찾을 수 없습니다.' using errcode='P0002'; end if;
 perform public.log_coating_cost_activity('coating_cost_statement_void',result.id,null,'도장 계산서 무효','{}'); return result; end $$;


--
-- Name: void_glass_cost_statement(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.void_glass_cost_statement(p_id uuid) RETURNS public.glass_cost_statements
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$ declare result public.glass_cost_statements%rowtype; begin
 if not public.is_approved_admin() then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
 update public.glass_cost_statements set status='void',updated_by=auth.uid(),updated_at=now() where id=p_id and status='active' returning * into result; if not found then raise exception '계산서를 찾을 수 없습니다.' using errcode='P0002'; end if;
 perform public.log_glass_cost_activity('glass_cost_statement_void',result.id,null,'유리 계산서 무효','{}'); return result; end $$;


--
-- Name: void_project_accessory_usage(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.void_project_accessory_usage(p_id uuid) RETURNS public.project_accessory_usages
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$ declare old public.project_accessory_usages%rowtype; result public.project_accessory_usages%rowtype; begin
 if not public.is_approved_admin() then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if; select * into old from public.project_accessory_usages where id=p_id for update; if not found or old.status<>'active' then raise exception '무효 처리할 사용내역이 없습니다.' using errcode='P0002'; end if; update public.project_accessory_usages set status='void',updated_by=auth.uid(),updated_at=now() where id=p_id returning * into result; perform public.log_accessory_activity('accessory_usage_void',result.project_id,'부자재 소진 무효',jsonb_build_object('usage_id',result.id,'before',to_jsonb(old),'after',to_jsonb(result))); return result; end $$;


--
-- Name: void_project_coating_cost_entry(uuid, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.void_project_coating_cost_entry(p_statement_id uuid, p_project_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare s public.coating_cost_statements%rowtype; a public.coating_cost_allocations%rowtype; active_count integer; active_amount bigint; active_project bigint;
begin
 if not public.is_approved_admin() then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
 select * into s from public.coating_cost_statements where id=p_statement_id for update;
 if not found or s.status<>'active' then raise exception '무효 처리할 계산서를 찾을 수 없습니다.' using errcode='P0002'; end if;
 select count(*),coalesce(sum(allocated_supply_amount_krw),0),min(project_id) into active_count,active_amount,active_project from public.coating_cost_allocations where statement_id=p_statement_id and status='active';
 if active_count<>1 or active_project<>p_project_id or active_amount<>s.supply_amount_krw then raise exception '공동 계산서는 전체 도장 원가관리에서 수정해주세요.' using errcode='23514'; end if;
 a:=public.save_coating_cost_allocation(p_statement_id,p_project_id,1,null,'void');
 s:=public.void_coating_cost_statement(p_statement_id);
 return jsonb_build_object('statement',to_jsonb(s),'allocation',to_jsonb(a));
end $$;


--
-- Name: void_project_glass_cost_entry(uuid, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.void_project_glass_cost_entry(p_statement_id uuid, p_project_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: accessory_price_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accessory_price_history (
    id bigint NOT NULL,
    accessory_item_id uuid NOT NULL,
    old_unit_price numeric(18,4),
    new_unit_price numeric(18,4) NOT NULL,
    old_currency text,
    new_currency text NOT NULL,
    memo text,
    changed_by uuid NOT NULL,
    changed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: accessory_price_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.accessory_price_history ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.accessory_price_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: activity_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_logs (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    employee_name text,
    employee_email text,
    action_type text NOT NULL,
    target_type text,
    target_id bigint,
    project_id bigint,
    title text NOT NULL,
    description text,
    activity_type text NOT NULL,
    employee_id bigint,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    source_item_id uuid
);


--
-- Name: activity_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.activity_logs ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.activity_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_settings (
    key text NOT NULL,
    value jsonb NOT NULL,
    description text,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: coating_cost_allocation_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coating_cost_allocation_history (
    id bigint NOT NULL,
    allocation_id uuid NOT NULL,
    statement_id uuid NOT NULL,
    project_id bigint NOT NULL,
    action text NOT NULL,
    before_data jsonb,
    after_data jsonb,
    changed_by uuid NOT NULL,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT coating_cost_allocation_history_action_check CHECK ((action = ANY (ARRAY['create'::text, 'update'::text, 'void'::text, 'restore'::text])))
);


--
-- Name: coating_cost_allocation_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.coating_cost_allocation_history ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.coating_cost_allocation_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: dashboard_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dashboard_preferences (
    employee_id bigint NOT NULL,
    cards jsonb DEFAULT '[]'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT dashboard_preferences_cards_array_check CHECK ((jsonb_typeof(cards) = 'array'::text))
);


--
-- Name: editing_locks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.editing_locks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    resource_type text NOT NULL,
    resource_id text NOT NULL,
    employee_id bigint NOT NULL,
    lock_token uuid DEFAULT gen_random_uuid() NOT NULL,
    acquired_at timestamp with time zone DEFAULT now() NOT NULL,
    heartbeat_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:01:00'::interval) NOT NULL,
    CONSTRAINT editing_locks_resource_type_check CHECK ((resource_type = ANY (ARRAY['project'::text, 'task'::text, 'personal_note'::text, 'shipment'::text, 'employee'::text, 'comment'::text, 'setting'::text, 'material_usage_request'::text, 'material_usage_group'::text, 'glass_cost_statement'::text, 'coating_cost_statement'::text, 'accessory_item'::text, 'project_accessory_usage'::text])))
);


--
-- Name: employees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employees (
    id bigint NOT NULL,
    name text NOT NULL,
    "position" text,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    email text,
    auth_user_id uuid,
    role text,
    approval_status text DEFAULT 'pending'::text NOT NULL,
    approved_at timestamp with time zone,
    approved_by text,
    rejected_at timestamp with time zone,
    organization_id bigint,
    phone text,
    memo text,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT employees_approval_status_check CHECK ((approval_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))),
    CONSTRAINT employees_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'manager'::text, 'staff'::text, 'viewer'::text])))
);


--
-- Name: COLUMN employees.email; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employees.email IS 'Optional employee email. It may be populated before or after Auth account creation.';


--
-- Name: COLUMN employees.auth_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employees.auth_user_id IS 'Optional Supabase Auth user link. NULL means the employee is not linked to an Auth account.';


--
-- Name: employees_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.employees ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.employees_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: exchange_rate_sync_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exchange_rate_sync_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mode text NOT NULL,
    trigger_source text NOT NULL,
    status text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    requested_ranges integer DEFAULT 0 NOT NULL,
    parsed_rows integer DEFAULT 0 NOT NULL,
    inserted_rows integer DEFAULT 0 NOT NULL,
    skipped_rows integer DEFAULT 0 NOT NULL,
    invalid_rows integer DEFAULT 0 NOT NULL,
    conflict_rows jsonb DEFAULT '[]'::jsonb NOT NULL,
    latest_source_date date,
    stopped_reason text,
    message text,
    created_by uuid,
    created_by_name text,
    CONSTRAINT exchange_rate_sync_runs_mode_check CHECK ((mode = ANY (ARRAY['initial'::text, 'incremental'::text]))),
    CONSTRAINT exchange_rate_sync_runs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'success'::text, 'failed'::text]))),
    CONSTRAINT exchange_rate_sync_runs_trigger_source_check CHECK ((trigger_source = ANY (ARRAY['admin'::text, 'cron'::text])))
);


--
-- Name: exchange_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exchange_rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reference_date date NOT NULL,
    base_currency text DEFAULT 'USD'::text NOT NULL,
    quote_currency text DEFAULT 'KRW'::text NOT NULL,
    rate numeric(16,6) NOT NULL,
    rate_type text NOT NULL,
    source_name text NOT NULL,
    source_url text,
    fetched_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT exchange_rates_pair_check CHECK (((base_currency = 'USD'::text) AND (quote_currency = 'KRW'::text))),
    CONSTRAINT exchange_rates_rate_check CHECK ((rate > (0)::numeric)),
    CONSTRAINT exchange_rates_source_url_check CHECK (((source_url IS NULL) OR (source_url ~* '^https?://[^[:space:]]+$'::text))),
    CONSTRAINT exchange_rates_type_check CHECK ((rate_type = 'usd_krw_deal_base_rate'::text))
);


--
-- Name: glass_cost_allocation_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.glass_cost_allocation_history (
    id bigint NOT NULL,
    allocation_id uuid NOT NULL,
    statement_id uuid NOT NULL,
    project_id bigint NOT NULL,
    action text NOT NULL,
    before_data jsonb,
    after_data jsonb,
    changed_by uuid NOT NULL,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT glass_cost_allocation_history_action_check CHECK ((action = ANY (ARRAY['create'::text, 'update'::text, 'void'::text, 'restore'::text])))
);


--
-- Name: glass_cost_allocation_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.glass_cost_allocation_history ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.glass_cost_allocation_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: lme_import_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lme_import_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    file_name text NOT NULL,
    total_rows integer NOT NULL,
    inserted_rows integer NOT NULL,
    skipped_rows integer NOT NULL,
    failed_rows integer NOT NULL,
    created_by uuid NOT NULL,
    created_by_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lme_import_logs_counts_check CHECK (((total_rows >= 0) AND (inserted_rows >= 0) AND (skipped_rows >= 0) AND (failed_rows >= 0)))
);


--
-- Name: lme_market_kpi_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lme_market_kpi_cache (
    material_code text NOT NULL,
    latest_reference_date date,
    average_1m numeric(16,4),
    sample_count_1m integer DEFAULT 0 NOT NULL,
    average_3m numeric(16,4),
    sample_count_3m integer DEFAULT 0 NOT NULL,
    average_6m numeric(16,4),
    sample_count_6m integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: lme_market_prices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lme_market_prices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reference_date date NOT NULL,
    reference_month date NOT NULL,
    round smallint,
    material_code text NOT NULL,
    lme_al_usd_per_ton numeric(16,4) NOT NULL,
    exchange_rate_krw_per_usd numeric(16,4),
    domestic_lme_krw_per_kg numeric(16,4),
    source_url text NOT NULL,
    memo text,
    created_by uuid,
    created_by_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    price_type text DEFAULT 'manual_reference'::text NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    unit text DEFAULT 'metric_ton'::text NOT NULL,
    source_name text DEFAULT '수기 입력'::text NOT NULL,
    fetched_at timestamp with time zone,
    CONSTRAINT lme_market_prices_currency_check CHECK ((currency = 'USD'::text)),
    CONSTRAINT lme_market_prices_date_month_check CHECK (((date_trunc('month'::text, (reference_date)::timestamp with time zone))::date = reference_month)),
    CONSTRAINT lme_market_prices_month_check CHECK ((reference_month = (date_trunc('month'::text, (reference_month)::timestamp with time zone))::date)),
    CONSTRAINT lme_market_prices_price_type_check CHECK ((price_type = ANY (ARRAY['spot'::text, 'manual_reference'::text]))),
    CONSTRAINT lme_market_prices_round_check CHECK (((round IS NULL) OR (round = ANY (ARRAY[1, 2])))),
    CONSTRAINT lme_market_prices_source_check CHECK ((btrim(source_url) <> ''::text)),
    CONSTRAINT lme_market_prices_unit_check CHECK ((unit = 'metric_ton'::text)),
    CONSTRAINT lme_market_prices_values_check CHECK (((lme_al_usd_per_ton > (0)::numeric) AND ((exchange_rate_krw_per_usd IS NULL) OR (exchange_rate_krw_per_usd > (0)::numeric)) AND ((domestic_lme_krw_per_kg IS NULL) OR (domestic_lme_krw_per_kg > (0)::numeric))))
);


--
-- Name: lme_materials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lme_materials (
    code text NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lme_materials_code_check CHECK ((code ~ '^[A-Z]{2,10}$'::text))
);


--
-- Name: lme_price_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lme_price_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reference_date date NOT NULL,
    reference_month date NOT NULL,
    round smallint NOT NULL,
    supplier_name text,
    lme_al_usd_per_ton numeric NOT NULL,
    exchange_rate_krw_per_usd numeric NOT NULL,
    domestic_lme_krw_per_kg numeric NOT NULL,
    processing_cost_krw_per_kg numeric DEFAULT 0 NOT NULL,
    standard_cost_krw_per_kg numeric NOT NULL,
    applied_price_krw_per_kg numeric NOT NULL,
    difference_krw_per_kg numeric NOT NULL,
    difference_rate numeric NOT NULL,
    status text NOT NULL,
    effective_start_date date,
    effective_end_date date,
    quantity_ton numeric,
    source_url text DEFAULT 'https://www.nonferrous.or.kr/stats/?act=sub3'::text NOT NULL,
    memo text,
    created_by uuid DEFAULT auth.uid() NOT NULL,
    created_by_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    supplier_id uuid NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    supersedes_id uuid,
    is_current boolean DEFAULT true NOT NULL,
    CONSTRAINT lme_price_records_applied_price_krw_per_kg_check CHECK ((applied_price_krw_per_kg >= (0)::numeric)),
    CONSTRAINT lme_price_records_check CHECK (((effective_end_date IS NULL) OR (effective_start_date IS NULL) OR (effective_end_date >= effective_start_date))),
    CONSTRAINT lme_price_records_effective_dates_check CHECK (((effective_end_date IS NULL) OR (effective_start_date IS NULL) OR (effective_end_date >= effective_start_date))),
    CONSTRAINT lme_price_records_exchange_rate_krw_per_usd_check CHECK ((exchange_rate_krw_per_usd >= (0)::numeric)),
    CONSTRAINT lme_price_records_lme_al_usd_per_ton_check CHECK ((lme_al_usd_per_ton >= (0)::numeric)),
    CONSTRAINT lme_price_records_processing_cost_krw_per_kg_check CHECK ((processing_cost_krw_per_kg >= (0)::numeric)),
    CONSTRAINT lme_price_records_quantity_ton_check CHECK (((quantity_ton IS NULL) OR (quantity_ton >= (0)::numeric))),
    CONSTRAINT lme_price_records_revision_check CHECK ((revision > 0)),
    CONSTRAINT lme_price_records_round_check CHECK ((round = ANY (ARRAY[1, 2]))),
    CONSTRAINT lme_price_records_status_check CHECK ((status = ANY (ARRAY['favorable'::text, 'normal'::text, 'caution'::text, 'high'::text])))
);


--
-- Name: lme_status_thresholds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lme_status_thresholds (
    id smallint DEFAULT 1 NOT NULL,
    normal_max_rate numeric DEFAULT 3 NOT NULL,
    caution_max_rate numeric DEFAULT 7 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    CONSTRAINT lme_status_thresholds_check CHECK ((caution_max_rate > normal_max_rate)),
    CONSTRAINT lme_status_thresholds_id_check CHECK ((id = 1)),
    CONSTRAINT lme_status_thresholds_normal_max_rate_check CHECK ((normal_max_rate >= (0)::numeric))
);


--
-- Name: lme_sync_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lme_sync_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mode text NOT NULL,
    trigger_source text NOT NULL,
    status text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    scanned_pages integer DEFAULT 0 NOT NULL,
    parsed_rows integer DEFAULT 0 NOT NULL,
    inserted_rows integer DEFAULT 0 NOT NULL,
    skipped_rows integer DEFAULT 0 NOT NULL,
    invalid_rows integer DEFAULT 0 NOT NULL,
    conflict_rows jsonb DEFAULT '[]'::jsonb NOT NULL,
    latest_source_date date,
    stopped_reason text,
    message text,
    created_by uuid,
    created_by_name text,
    CONSTRAINT lme_sync_runs_mode_check CHECK ((mode = ANY (ARRAY['initial'::text, 'incremental'::text]))),
    CONSTRAINT lme_sync_runs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'success'::text, 'failed'::text]))),
    CONSTRAINT lme_sync_runs_trigger_source_check CHECK ((trigger_source = ANY (ARRAY['admin'::text, 'cron'::text])))
);


--
-- Name: material_contract_notification_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.material_contract_notification_events (
    notification_id text NOT NULL,
    contract_id uuid NOT NULL,
    contract_name text NOT NULL,
    alert_kind text NOT NULL,
    stage text NOT NULL,
    generation integer DEFAULT 1 NOT NULL,
    available_tons numeric(16,4),
    available_ratio numeric(12,8),
    effective_end_date date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT material_contract_notification_events_alert_kind_check CHECK ((alert_kind = ANY (ARRAY['available_ratio'::text, 'expiry'::text]))),
    CONSTRAINT material_contract_notification_events_stage_check CHECK ((stage = ANY (ARRAY['20'::text, '10'::text, '5'::text, '30d'::text, '7d'::text, 'today'::text, 'expired'::text])))
);

ALTER TABLE ONLY public.material_contract_notification_events REPLICA IDENTITY FULL;


--
-- Name: material_contract_notification_states; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.material_contract_notification_states (
    contract_id uuid NOT NULL,
    available_generation integer DEFAULT 0 NOT NULL,
    available_stage text,
    expiry_stage text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT material_contract_notification_states_available_stage_check CHECK (((available_stage IS NULL) OR (available_stage = ANY (ARRAY['20'::text, '10'::text, '5'::text])))),
    CONSTRAINT material_contract_notification_states_expiry_stage_check CHECK (((expiry_stage IS NULL) OR (expiry_stage = ANY (ARRAY['30d'::text, '7d'::text, 'today'::text, 'expired'::text]))))
);


--
-- Name: notification_reads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_reads (
    auth_user_id uuid NOT NULL,
    notification_id text NOT NULL,
    is_read boolean DEFAULT true NOT NULL,
    read_at timestamp with time zone DEFAULT now(),
    is_pinned boolean DEFAULT false NOT NULL,
    is_hidden boolean DEFAULT false NOT NULL,
    archived_at timestamp with time zone
);


--
-- Name: organization_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_categories (
    id bigint NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: organization_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.organization_categories ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.organization_categories_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id bigint NOT NULL,
    category_id bigint NOT NULL,
    name text NOT NULL,
    function_code text,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    partner_type public.partner_type,
    memo text,
    CONSTRAINT organizations_memo_check CHECK (((memo IS NULL) OR (char_length(memo) <= 2000)))
);


--
-- Name: organizations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.organizations ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.organizations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: personal_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.personal_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    note_type text NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    content text DEFAULT ''::text NOT NULL,
    is_completed boolean DEFAULT false NOT NULL,
    is_pinned boolean DEFAULT false NOT NULL,
    color text DEFAULT 'default'::text NOT NULL,
    due_date date,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT personal_notes_body_check CHECK (((char_length(TRIM(BOTH FROM title)) > 0) OR (char_length(TRIM(BOTH FROM content)) > 0))),
    CONSTRAINT personal_notes_color_check CHECK ((color = ANY (ARRAY['default'::text, 'yellow'::text, 'green'::text, 'red'::text, 'blue'::text]))),
    CONSTRAINT personal_notes_content_check CHECK ((char_length(content) <= 5000)),
    CONSTRAINT personal_notes_title_check CHECK ((char_length(title) <= 200)),
    CONSTRAINT personal_notes_type_check CHECK ((note_type = ANY (ARRAY['memo'::text, 'todo'::text, 'sticky'::text, 'reminder'::text])))
);


--
-- Name: process_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.process_types (
    id bigint NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    color text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    icon text
);


--
-- Name: process_types_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.process_types ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.process_types_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: project_assembly_vendors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_assembly_vendors (
    id bigint NOT NULL,
    project_id bigint NOT NULL,
    organization_id bigint NOT NULL,
    sort_order integer NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    allocated_quantity numeric,
    CONSTRAINT project_assembly_vendors_allocated_quantity_check CHECK (((allocated_quantity IS NULL) OR (allocated_quantity >= (0)::numeric))),
    CONSTRAINT project_assembly_vendors_sort_order_check CHECK ((sort_order > 0))
);


--
-- Name: project_assembly_vendors_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.project_assembly_vendors ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.project_assembly_vendors_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: project_contract_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_contract_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id bigint NOT NULL,
    entry_type text NOT NULL,
    contract_title text NOT NULL,
    contract_date date NOT NULL,
    effective_date date NOT NULL,
    document_number text,
    supply_amount_krw bigint NOT NULL,
    vat_amount_krw bigint NOT NULL,
    total_amount_krw bigint NOT NULL,
    status text DEFAULT 'confirmed'::text NOT NULL,
    memo text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT project_contract_entries_amount_check CHECK (((supply_amount_krw >= 0) AND (vat_amount_krw >= 0) AND (total_amount_krw = (supply_amount_krw + vat_amount_krw)))),
    CONSTRAINT project_contract_entries_document_check CHECK (((document_number IS NULL) OR (char_length(document_number) <= 100))),
    CONSTRAINT project_contract_entries_memo_check CHECK (((memo IS NULL) OR (char_length(memo) <= 2000))),
    CONSTRAINT project_contract_entries_original_amount_check CHECK (((NOT ((entry_type = 'original'::text) AND (status = 'confirmed'::text))) OR (supply_amount_krw > 0))),
    CONSTRAINT project_contract_entries_status_check CHECK ((status = ANY (ARRAY['confirmed'::text, 'void'::text]))),
    CONSTRAINT project_contract_entries_title_check CHECK (((btrim(contract_title) <> ''::text) AND (char_length(contract_title) <= 200))),
    CONSTRAINT project_contract_entries_type_check CHECK ((entry_type = ANY (ARRAY['original'::text, 'increase'::text, 'decrease'::text])))
);


--
-- Name: project_cost_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_cost_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT project_cost_categories_code_check CHECK (((code ~ '^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$'::text) AND (char_length(code) <= 50))),
    CONSTRAINT project_cost_categories_description_check CHECK (((description IS NULL) OR (char_length(description) <= 500))),
    CONSTRAINT project_cost_categories_name_check CHECK (((btrim(name) <> ''::text) AND (char_length(name) <= 100)))
);


--
-- Name: project_cost_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_cost_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id bigint NOT NULL,
    category_id uuid NOT NULL,
    cost_title text NOT NULL,
    cost_date date NOT NULL,
    recognition_date date,
    vendor_name text,
    document_number text,
    supply_amount_krw bigint NOT NULL,
    vat_amount_krw bigint NOT NULL,
    total_amount_krw bigint NOT NULL,
    status text DEFAULT 'confirmed'::text NOT NULL,
    payment_status text DEFAULT 'unpaid'::text NOT NULL,
    memo text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    import_batch_id uuid,
    CONSTRAINT project_cost_entries_amount_check CHECK (((supply_amount_krw >= 0) AND (vat_amount_krw >= 0) AND (total_amount_krw = (supply_amount_krw + vat_amount_krw)) AND ((status <> 'confirmed'::text) OR (total_amount_krw > 0)))),
    CONSTRAINT project_cost_entries_document_check CHECK (((document_number IS NULL) OR (char_length(document_number) <= 100))),
    CONSTRAINT project_cost_entries_memo_check CHECK (((memo IS NULL) OR (char_length(memo) <= 2000))),
    CONSTRAINT project_cost_entries_payment_check CHECK ((payment_status = ANY (ARRAY['unpaid'::text, 'partial'::text, 'paid'::text, 'not_applicable'::text]))),
    CONSTRAINT project_cost_entries_status_check CHECK ((status = ANY (ARRAY['confirmed'::text, 'void'::text]))),
    CONSTRAINT project_cost_entries_title_check CHECK (((btrim(cost_title) <> ''::text) AND (char_length(cost_title) <= 200))),
    CONSTRAINT project_cost_entries_vendor_check CHECK (((vendor_name IS NULL) OR (char_length(vendor_name) <= 200)))
);


--
-- Name: project_cost_import_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_cost_import_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    file_name text NOT NULL,
    row_count integer NOT NULL,
    supply_total_krw bigint NOT NULL,
    vat_total_krw bigint NOT NULL,
    grand_total_krw bigint NOT NULL,
    CONSTRAINT project_cost_import_batches_amount_check CHECK (((supply_total_krw >= 0) AND (vat_total_krw >= 0) AND (grand_total_krw = (supply_total_krw + vat_total_krw)))),
    CONSTRAINT project_cost_import_batches_count_check CHECK (((row_count >= 1) AND (row_count <= 1000))),
    CONSTRAINT project_cost_import_batches_file_check CHECK (((btrim(file_name) <> ''::text) AND (char_length(file_name) <= 255)))
);


--
-- Name: project_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id bigint NOT NULL,
    file_name text NOT NULL,
    file_type text NOT NULL,
    storage_path text NOT NULL,
    file_size bigint,
    mime_type text,
    description text,
    uploaded_by text,
    uploaded_by_email text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT project_files_file_type_check CHECK ((file_type = ANY (ARRAY['drawing'::text, 'site_photo'::text, 'contract'::text, 'estimate'::text, 'completion_document'::text, 'other'::text])))
);


--
-- Name: project_material_usages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_material_usages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id bigint NOT NULL,
    material_code text NOT NULL,
    raw_material_contract_id uuid,
    lme_market_price_id uuid,
    pricing_basis text NOT NULL,
    cost_reference_date date NOT NULL,
    expected_quantity_kg numeric(18,3) NOT NULL,
    input_quantity numeric(18,3) NOT NULL,
    input_unit text NOT NULL,
    applied_unit_price_krw_per_kg numeric(16,4) NOT NULL,
    processing_cost_snapshot numeric(16,4),
    domestic_lme_snapshot numeric(16,4),
    contract_price_snapshot numeric(16,4),
    expected_cost_krw bigint NOT NULL,
    memo text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT project_material_usages_basis_check CHECK ((pricing_basis = ANY (ARRAY['contract'::text, 'market'::text]))),
    CONSTRAINT project_material_usages_basis_snapshot_check CHECK ((((pricing_basis = 'contract'::text) AND (raw_material_contract_id IS NOT NULL) AND (lme_market_price_id IS NULL) AND (contract_price_snapshot IS NOT NULL) AND (contract_price_snapshot > (0)::numeric) AND (processing_cost_snapshot IS NULL) AND (domestic_lme_snapshot IS NULL)) OR ((pricing_basis = 'market'::text) AND (raw_material_contract_id IS NULL) AND (lme_market_price_id IS NOT NULL) AND (contract_price_snapshot IS NULL) AND (processing_cost_snapshot IS NOT NULL) AND (processing_cost_snapshot >= (0)::numeric) AND (domestic_lme_snapshot IS NOT NULL) AND (domestic_lme_snapshot > (0)::numeric)))),
    CONSTRAINT project_material_usages_memo_check CHECK (((memo IS NULL) OR (char_length(memo) <= 2000))),
    CONSTRAINT project_material_usages_price_check CHECK (((applied_unit_price_krw_per_kg > (0)::numeric) AND (expected_cost_krw >= 0))),
    CONSTRAINT project_material_usages_quantity_check CHECK (((expected_quantity_kg > (0)::numeric) AND (input_quantity > (0)::numeric))),
    CONSTRAINT project_material_usages_unit_check CHECK ((input_unit = ANY (ARRAY['kg'::text, 'ton'::text])))
);


--
-- Name: project_schedule_memos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_schedule_memos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id bigint NOT NULL,
    memo_date date NOT NULL,
    content text NOT NULL,
    created_by uuid DEFAULT auth.uid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT project_schedule_memos_content_check CHECK ((length(btrim(content)) > 0))
);


--
-- Name: project_sections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_sections (
    id bigint NOT NULL,
    project_id bigint NOT NULL,
    process_type text NOT NULL,
    assembly_vendor text,
    task_manager text,
    quantity integer,
    start_date date,
    end_date date,
    status text DEFAULT 'pending'::text NOT NULL,
    memo text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: project_sections_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.project_sections ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.project_sections_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    project_name text NOT NULL,
    process_type text NOT NULL,
    salesperson text,
    task_manager text,
    status text,
    start_date date,
    completion_due_date date,
    created_at timestamp with time zone DEFAULT now(),
    id bigint NOT NULL,
    project_code text,
    client_name text,
    site_address text,
    manager_id uuid,
    end_date date,
    memo text,
    updated_at timestamp with time zone DEFAULT now(),
    assembly_vendor text,
    assembly_vendor_organization_id bigint,
    quantity numeric,
    quantity_unit text,
    CONSTRAINT projects_quantity_non_negative CHECK (((quantity IS NULL) OR (quantity >= (0)::numeric)))
);


--
-- Name: projects_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.projects ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.projects_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: raw_material_contracts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.raw_material_contracts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    supplier_id uuid NOT NULL,
    material_code text NOT NULL,
    contract_name text NOT NULL,
    contract_year integer NOT NULL,
    contract_price_krw_per_kg numeric(16,4) NOT NULL,
    processing_cost_krw_per_kg numeric(16,4) NOT NULL,
    effective_start_date date NOT NULL,
    effective_end_date date NOT NULL,
    contract_quantity_ton numeric(16,4) NOT NULL,
    remaining_quantity_ton numeric(16,4) NOT NULL,
    status text NOT NULL,
    memo text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT raw_material_contracts_dates_check CHECK ((effective_end_date >= effective_start_date)),
    CONSTRAINT raw_material_contracts_memo_check CHECK (((memo IS NULL) OR (char_length(memo) <= 2000))),
    CONSTRAINT raw_material_contracts_name_check CHECK (((btrim(contract_name) <> ''::text) AND (char_length(contract_name) <= 200))),
    CONSTRAINT raw_material_contracts_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'active'::text, 'completed'::text, 'cancelled'::text]))),
    CONSTRAINT raw_material_contracts_values_check CHECK (((contract_price_krw_per_kg > (0)::numeric) AND (processing_cost_krw_per_kg >= (0)::numeric) AND (contract_quantity_ton > (0)::numeric) AND (remaining_quantity_ton >= (0)::numeric) AND (remaining_quantity_ton <= contract_quantity_ton))),
    CONSTRAINT raw_material_contracts_year_check CHECK (((contract_year >= 2000) AND (contract_year <= 2200)))
);


--
-- Name: reference_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reference_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    comment_id bigint,
    shared_item_id uuid,
    created_by bigint NOT NULL,
    assigned_to bigint NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    title text DEFAULT '요청받은 작업'::text NOT NULL,
    due_date date,
    priority text DEFAULT 'normal'::text NOT NULL,
    CONSTRAINT reference_tasks_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text]))),
    CONSTRAINT reference_tasks_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text]))),
    CONSTRAINT reference_tasks_title_check CHECK (((char_length(btrim(title)) >= 1) AND (char_length(btrim(title)) <= 200)))
);

ALTER TABLE ONLY public.reference_tasks REPLICA IDENTITY FULL;


--
-- Name: rls_policy_backups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rls_policy_backups (
    captured_for text NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    schemaname text NOT NULL,
    tablename text NOT NULL,
    policyname text NOT NULL,
    permissive text NOT NULL,
    roles name[] NOT NULL,
    cmd text NOT NULL,
    qual text,
    with_check text
);


--
-- Name: share_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.share_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    shared_item_id uuid NOT NULL,
    inviter_id bigint NOT NULL,
    invitee_id bigint NOT NULL,
    permission text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    responded_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT share_invitations_check CHECK ((inviter_id <> invitee_id)),
    CONSTRAINT share_invitations_permission_check CHECK ((permission = ANY (ARRAY['view'::text, 'edit'::text]))),
    CONSTRAINT share_invitations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'cancelled'::text])))
);


--
-- Name: shared_comment_mentions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shared_comment_mentions (
    comment_id bigint NOT NULL,
    employee_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.shared_comment_mentions REPLICA IDENTITY FULL;


--
-- Name: shared_comment_reads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shared_comment_reads (
    shared_item_id uuid NOT NULL,
    employee_id bigint NOT NULL,
    last_read_comment_id bigint DEFAULT 0 NOT NULL,
    read_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT shared_comment_reads_last_read_comment_id_check CHECK ((last_read_comment_id >= 0))
);


--
-- Name: shared_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shared_comments (
    id bigint NOT NULL,
    shared_item_id uuid NOT NULL,
    author_id bigint NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT shared_comments_content_check CHECK (((char_length(TRIM(BOTH FROM content)) >= 1) AND (char_length(TRIM(BOTH FROM content)) <= 2000)))
);


--
-- Name: shared_comments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.shared_comments ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.shared_comments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: shared_item_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shared_item_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    shared_item_id uuid NOT NULL,
    employee_id bigint NOT NULL,
    permission text NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT shared_item_members_permission_check CHECK ((permission = ANY (ARRAY['view'::text, 'edit'::text])))
);


--
-- Name: shared_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shared_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    item_type text NOT NULL,
    item_id uuid NOT NULL,
    owner_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT shared_items_item_type_check CHECK ((item_type = ANY (ARRAY['schedule'::text, 'todo'::text, 'memo'::text])))
);


--
-- Name: shipments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shipments (
    id bigint NOT NULL,
    project_id bigint NOT NULL,
    shipment_round bigint,
    planned_date date,
    actual_date date,
    memo text,
    created_at timestamp with time zone DEFAULT now(),
    task_id bigint,
    destination text,
    receiver text,
    driver_phone text,
    site_name text,
    item_name text,
    quantity integer,
    shipment_date date,
    vehicle_number text,
    driver_name text,
    status text DEFAULT '출고대기'::text
);


--
-- Name: shipments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.shipments ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.shipments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suppliers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id bigint NOT NULL
);


--
-- Name: task_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id bigint NOT NULL,
    note text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid DEFAULT auth.uid() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_name text,
    is_important boolean DEFAULT false NOT NULL,
    check_date date,
    CONSTRAINT task_notes_note_check CHECK ((length(btrim(note)) > 0))
);


--
-- Name: task_schedule_memos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_schedule_memos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id bigint NOT NULL,
    content text NOT NULL,
    created_by uuid DEFAULT auth.uid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT task_schedule_memos_content_check CHECK ((length(btrim(content)) > 0))
);


--
-- Name: task_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id bigint NOT NULL,
    tag text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid DEFAULT auth.uid() NOT NULL,
    CONSTRAINT task_tags_tag_check CHECK ((length(btrim(tag)) > 0))
);


--
-- Name: task_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_templates (
    id bigint NOT NULL,
    process_type text NOT NULL,
    task_order integer NOT NULL,
    task_name text NOT NULL,
    task_type text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: task_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.task_templates ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.task_templates_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasks (
    id bigint NOT NULL,
    project_id bigint NOT NULL,
    task_type text,
    task_name text,
    assignee text,
    status text,
    due_date date,
    completed_date date,
    created_at timestamp with time zone DEFAULT now(),
    task_order integer,
    start_date date,
    project_section_id bigint,
    project_assembly_vendor_id bigint,
    quantity integer,
    CONSTRAINT tasks_quantity_positive CHECK (((quantity IS NULL) OR (quantity > 0)))
);


--
-- Name: tasks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.tasks ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.tasks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: accessory_items accessory_items_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accessory_items
    ADD CONSTRAINT accessory_items_code_key UNIQUE (code);


--
-- Name: accessory_items accessory_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accessory_items
    ADD CONSTRAINT accessory_items_pkey PRIMARY KEY (id);


--
-- Name: accessory_price_history accessory_price_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accessory_price_history
    ADD CONSTRAINT accessory_price_history_pkey PRIMARY KEY (id);


--
-- Name: activity_logs activity_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_pkey PRIMARY KEY (id);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (key);


--
-- Name: coating_cost_allocation_history coating_cost_allocation_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coating_cost_allocation_history
    ADD CONSTRAINT coating_cost_allocation_history_pkey PRIMARY KEY (id);


--
-- Name: coating_cost_allocations coating_cost_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coating_cost_allocations
    ADD CONSTRAINT coating_cost_allocations_pkey PRIMARY KEY (id);


--
-- Name: coating_cost_allocations coating_cost_allocations_statement_id_project_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coating_cost_allocations
    ADD CONSTRAINT coating_cost_allocations_statement_id_project_id_key UNIQUE (statement_id, project_id);


--
-- Name: coating_cost_statements coating_cost_statements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coating_cost_statements
    ADD CONSTRAINT coating_cost_statements_pkey PRIMARY KEY (id);


--
-- Name: dashboard_preferences dashboard_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dashboard_preferences
    ADD CONSTRAINT dashboard_preferences_pkey PRIMARY KEY (employee_id);


--
-- Name: editing_locks editing_locks_lock_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.editing_locks
    ADD CONSTRAINT editing_locks_lock_token_key UNIQUE (lock_token);


--
-- Name: editing_locks editing_locks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.editing_locks
    ADD CONSTRAINT editing_locks_pkey PRIMARY KEY (id);


--
-- Name: editing_locks editing_locks_resource_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.editing_locks
    ADD CONSTRAINT editing_locks_resource_key_unique UNIQUE (resource_type, resource_id);


--
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);


--
-- Name: exchange_rate_sync_runs exchange_rate_sync_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_rate_sync_runs
    ADD CONSTRAINT exchange_rate_sync_runs_pkey PRIMARY KEY (id);


--
-- Name: exchange_rates exchange_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_rates
    ADD CONSTRAINT exchange_rates_pkey PRIMARY KEY (id);


--
-- Name: exchange_rates exchange_rates_unique_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_rates
    ADD CONSTRAINT exchange_rates_unique_key UNIQUE (reference_date, base_currency, quote_currency, rate_type);


--
-- Name: glass_cost_allocation_history glass_cost_allocation_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.glass_cost_allocation_history
    ADD CONSTRAINT glass_cost_allocation_history_pkey PRIMARY KEY (id);


--
-- Name: glass_cost_allocations glass_cost_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.glass_cost_allocations
    ADD CONSTRAINT glass_cost_allocations_pkey PRIMARY KEY (id);


--
-- Name: glass_cost_allocations glass_cost_allocations_statement_id_project_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.glass_cost_allocations
    ADD CONSTRAINT glass_cost_allocations_statement_id_project_id_key UNIQUE (statement_id, project_id);


--
-- Name: glass_cost_statements glass_cost_statements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.glass_cost_statements
    ADD CONSTRAINT glass_cost_statements_pkey PRIMARY KEY (id);


--
-- Name: lme_import_logs lme_import_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lme_import_logs
    ADD CONSTRAINT lme_import_logs_pkey PRIMARY KEY (id);


--
-- Name: lme_market_kpi_cache lme_market_kpi_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lme_market_kpi_cache
    ADD CONSTRAINT lme_market_kpi_cache_pkey PRIMARY KEY (material_code);


--
-- Name: lme_market_prices lme_market_prices_month_round_material_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lme_market_prices
    ADD CONSTRAINT lme_market_prices_month_round_material_key UNIQUE (reference_month, round, material_code);


--
-- Name: lme_market_prices lme_market_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lme_market_prices
    ADD CONSTRAINT lme_market_prices_pkey PRIMARY KEY (id);


--
-- Name: lme_materials lme_materials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lme_materials
    ADD CONSTRAINT lme_materials_pkey PRIMARY KEY (code);


--
-- Name: lme_price_records lme_price_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lme_price_records
    ADD CONSTRAINT lme_price_records_pkey PRIMARY KEY (id);


--
-- Name: lme_status_thresholds lme_status_thresholds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lme_status_thresholds
    ADD CONSTRAINT lme_status_thresholds_pkey PRIMARY KEY (id);


--
-- Name: lme_sync_runs lme_sync_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lme_sync_runs
    ADD CONSTRAINT lme_sync_runs_pkey PRIMARY KEY (id);


--
-- Name: material_contract_allocations material_contract_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_contract_allocations
    ADD CONSTRAINT material_contract_allocations_pkey PRIMARY KEY (id);


--
-- Name: material_contract_notification_events material_contract_notificatio_contract_id_alert_kind_genera_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_contract_notification_events
    ADD CONSTRAINT material_contract_notificatio_contract_id_alert_kind_genera_key UNIQUE (contract_id, alert_kind, generation, stage);


--
-- Name: material_contract_notification_events material_contract_notification_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_contract_notification_events
    ADD CONSTRAINT material_contract_notification_events_pkey PRIMARY KEY (notification_id);


--
-- Name: material_contract_notification_states material_contract_notification_states_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_contract_notification_states
    ADD CONSTRAINT material_contract_notification_states_pkey PRIMARY KEY (contract_id);


--
-- Name: material_usage_groups material_usage_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_usage_groups
    ADD CONSTRAINT material_usage_groups_pkey PRIMARY KEY (id);


--
-- Name: material_usage_groups material_usage_groups_project_id_category_sequence_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_usage_groups
    ADD CONSTRAINT material_usage_groups_project_id_category_sequence_key UNIQUE (project_id, category, sequence);


--
-- Name: material_usage_requests material_usage_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_usage_requests
    ADD CONSTRAINT material_usage_requests_pkey PRIMARY KEY (id);


--
-- Name: notification_reads notification_reads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_reads
    ADD CONSTRAINT notification_reads_pkey PRIMARY KEY (auth_user_id, notification_id);


--
-- Name: organization_categories organization_categories_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_categories
    ADD CONSTRAINT organization_categories_code_key UNIQUE (code);


--
-- Name: organization_categories organization_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_categories
    ADD CONSTRAINT organization_categories_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: personal_notes personal_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personal_notes
    ADD CONSTRAINT personal_notes_pkey PRIMARY KEY (id);


--
-- Name: process_types process_types_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.process_types
    ADD CONSTRAINT process_types_code_key UNIQUE (code);


--
-- Name: process_types process_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.process_types
    ADD CONSTRAINT process_types_pkey PRIMARY KEY (id);


--
-- Name: project_accessory_usages project_accessory_usages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_accessory_usages
    ADD CONSTRAINT project_accessory_usages_pkey PRIMARY KEY (id);


--
-- Name: project_assembly_vendors project_assembly_vendors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_assembly_vendors
    ADD CONSTRAINT project_assembly_vendors_pkey PRIMARY KEY (id);


--
-- Name: project_assembly_vendors project_assembly_vendors_project_organization_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_assembly_vendors
    ADD CONSTRAINT project_assembly_vendors_project_organization_key UNIQUE (project_id, organization_id);


--
-- Name: project_contract_entries project_contract_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_contract_entries
    ADD CONSTRAINT project_contract_entries_pkey PRIMARY KEY (id);


--
-- Name: project_cost_categories project_cost_categories_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_cost_categories
    ADD CONSTRAINT project_cost_categories_code_key UNIQUE (code);


--
-- Name: project_cost_categories project_cost_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_cost_categories
    ADD CONSTRAINT project_cost_categories_pkey PRIMARY KEY (id);


--
-- Name: project_cost_entries project_cost_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_cost_entries
    ADD CONSTRAINT project_cost_entries_pkey PRIMARY KEY (id);


--
-- Name: project_cost_import_batches project_cost_import_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_cost_import_batches
    ADD CONSTRAINT project_cost_import_batches_pkey PRIMARY KEY (id);


--
-- Name: project_files project_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_files
    ADD CONSTRAINT project_files_pkey PRIMARY KEY (id);


--
-- Name: project_files project_files_storage_path_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_files
    ADD CONSTRAINT project_files_storage_path_key UNIQUE (storage_path);


--
-- Name: project_material_usages project_material_usages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_material_usages
    ADD CONSTRAINT project_material_usages_pkey PRIMARY KEY (id);


--
-- Name: project_schedule_memos project_schedule_memos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_schedule_memos
    ADD CONSTRAINT project_schedule_memos_pkey PRIMARY KEY (id);


--
-- Name: project_schedule_memos project_schedule_memos_project_id_memo_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_schedule_memos
    ADD CONSTRAINT project_schedule_memos_project_id_memo_date_key UNIQUE (project_id, memo_date);


--
-- Name: project_sections project_sections_id_project_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_sections
    ADD CONSTRAINT project_sections_id_project_id_key UNIQUE (id, project_id);


--
-- Name: project_sections project_sections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_sections
    ADD CONSTRAINT project_sections_pkey PRIMARY KEY (id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: raw_material_contracts raw_material_contracts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.raw_material_contracts
    ADD CONSTRAINT raw_material_contracts_pkey PRIMARY KEY (id);


--
-- Name: reference_tasks reference_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_tasks
    ADD CONSTRAINT reference_tasks_pkey PRIMARY KEY (id);


--
-- Name: rls_policy_backups rls_policy_backups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rls_policy_backups
    ADD CONSTRAINT rls_policy_backups_pkey PRIMARY KEY (captured_for, schemaname, tablename, policyname);


--
-- Name: share_invitations share_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_invitations
    ADD CONSTRAINT share_invitations_pkey PRIMARY KEY (id);


--
-- Name: shared_comment_mentions shared_comment_mentions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_comment_mentions
    ADD CONSTRAINT shared_comment_mentions_pkey PRIMARY KEY (comment_id, employee_id);


--
-- Name: shared_comment_reads shared_comment_reads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_comment_reads
    ADD CONSTRAINT shared_comment_reads_pkey PRIMARY KEY (shared_item_id, employee_id);


--
-- Name: shared_comments shared_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_comments
    ADD CONSTRAINT shared_comments_pkey PRIMARY KEY (id);


--
-- Name: shared_item_members shared_item_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_item_members
    ADD CONSTRAINT shared_item_members_pkey PRIMARY KEY (id);


--
-- Name: shared_item_members shared_item_members_shared_item_id_employee_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_item_members
    ADD CONSTRAINT shared_item_members_shared_item_id_employee_id_key UNIQUE (shared_item_id, employee_id);


--
-- Name: shared_items shared_items_item_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_items
    ADD CONSTRAINT shared_items_item_id_key UNIQUE (item_id);


--
-- Name: shared_items shared_items_item_type_item_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_items
    ADD CONSTRAINT shared_items_item_type_item_id_key UNIQUE (item_type, item_id);


--
-- Name: shared_items shared_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_items
    ADD CONSTRAINT shared_items_pkey PRIMARY KEY (id);


--
-- Name: shipments shipments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipments
    ADD CONSTRAINT shipments_pkey PRIMARY KEY (id);


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);


--
-- Name: task_dependencies task_dependencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT task_dependencies_pkey PRIMARY KEY (id);


--
-- Name: task_dependencies task_dependencies_unique_fs; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT task_dependencies_unique_fs UNIQUE (predecessor_task_id, successor_task_id, dependency_type);


--
-- Name: task_notes task_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_notes
    ADD CONSTRAINT task_notes_pkey PRIMARY KEY (id);


--
-- Name: task_schedule_memos task_schedule_memos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_schedule_memos
    ADD CONSTRAINT task_schedule_memos_pkey PRIMARY KEY (id);


--
-- Name: task_schedule_memos task_schedule_memos_task_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_schedule_memos
    ADD CONSTRAINT task_schedule_memos_task_id_key UNIQUE (task_id);


--
-- Name: task_tags task_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_tags
    ADD CONSTRAINT task_tags_pkey PRIMARY KEY (id);


--
-- Name: task_tags task_tags_task_id_tag_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_tags
    ADD CONSTRAINT task_tags_task_id_tag_key UNIQUE (task_id, tag);


--
-- Name: task_templates task_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_templates
    ADD CONSTRAINT task_templates_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: accessory_items_active_sort_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX accessory_items_active_sort_idx ON public.accessory_items USING btree (is_active, sort_order, code);


--
-- Name: accessory_items_vendor_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX accessory_items_vendor_active_idx ON public.accessory_items USING btree (vendor_organization_id, is_active);


--
-- Name: accessory_price_history_item_changed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX accessory_price_history_item_changed_idx ON public.accessory_price_history USING btree (accessory_item_id, changed_at DESC);


--
-- Name: activity_logs_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_logs_created_at_idx ON public.activity_logs USING btree (created_at DESC);


--
-- Name: activity_logs_material_allocation_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_logs_material_allocation_created_idx ON public.activity_logs USING btree (((metadata ->> 'allocation_id'::text)), created_at DESC) WHERE (target_type = 'material_contract_allocation'::text);


--
-- Name: activity_logs_project_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_logs_project_created_at_idx ON public.activity_logs USING btree (project_id, created_at DESC) WHERE (project_id IS NOT NULL);


--
-- Name: activity_logs_source_item_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_logs_source_item_created_at_idx ON public.activity_logs USING btree (source_item_id, created_at) WHERE (source_item_id IS NOT NULL);


--
-- Name: coating_cost_allocations_project_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX coating_cost_allocations_project_created_idx ON public.coating_cost_allocations USING btree (project_id, created_at DESC);


--
-- Name: coating_cost_allocations_project_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX coating_cost_allocations_project_status_idx ON public.coating_cost_allocations USING btree (project_id, status);


--
-- Name: coating_cost_allocations_statement_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX coating_cost_allocations_statement_idx ON public.coating_cost_allocations USING btree (statement_id);


--
-- Name: coating_cost_history_allocation_changed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX coating_cost_history_allocation_changed_idx ON public.coating_cost_allocation_history USING btree (allocation_id, changed_at DESC);


--
-- Name: coating_cost_statements_month_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX coating_cost_statements_month_idx ON public.coating_cost_statements USING btree (accounting_month);


--
-- Name: coating_cost_statements_status_month_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX coating_cost_statements_status_month_idx ON public.coating_cost_statements USING btree (status, accounting_month);


--
-- Name: coating_cost_statements_vendor_month_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX coating_cost_statements_vendor_month_idx ON public.coating_cost_statements USING btree (vendor_organization_id, accounting_month);


--
-- Name: employees_approval_status_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employees_approval_status_created_at_idx ON public.employees USING btree (approval_status, created_at DESC);


--
-- Name: employees_auth_user_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX employees_auth_user_id_unique ON public.employees USING btree (auth_user_id) WHERE (auth_user_id IS NOT NULL);


--
-- Name: employees_email_lower_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX employees_email_lower_unique ON public.employees USING btree (lower(email)) WHERE (email IS NOT NULL);


--
-- Name: employees_organization_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employees_organization_id_idx ON public.employees USING btree (organization_id);


--
-- Name: exchange_rate_sync_single_running_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX exchange_rate_sync_single_running_idx ON public.exchange_rate_sync_runs USING btree (status) WHERE (status = 'running'::text);


--
-- Name: exchange_rate_sync_started_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exchange_rate_sync_started_idx ON public.exchange_rate_sync_runs USING btree (started_at DESC);


--
-- Name: exchange_rates_pair_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exchange_rates_pair_date_idx ON public.exchange_rates USING btree (base_currency, quote_currency, rate_type, reference_date DESC);


--
-- Name: glass_cost_allocations_project_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX glass_cost_allocations_project_created_idx ON public.glass_cost_allocations USING btree (project_id, created_at DESC);


--
-- Name: glass_cost_allocations_project_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX glass_cost_allocations_project_status_idx ON public.glass_cost_allocations USING btree (project_id, status);


--
-- Name: glass_cost_allocations_statement_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX glass_cost_allocations_statement_idx ON public.glass_cost_allocations USING btree (statement_id);


--
-- Name: glass_cost_history_allocation_changed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX glass_cost_history_allocation_changed_idx ON public.glass_cost_allocation_history USING btree (allocation_id, changed_at DESC);


--
-- Name: glass_cost_statements_month_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX glass_cost_statements_month_idx ON public.glass_cost_statements USING btree (accounting_month);


--
-- Name: glass_cost_statements_status_month_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX glass_cost_statements_status_month_idx ON public.glass_cost_statements USING btree (status, accounting_month);


--
-- Name: glass_cost_statements_vendor_month_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX glass_cost_statements_vendor_month_idx ON public.glass_cost_statements USING btree (vendor_organization_id, accounting_month);


--
-- Name: lme_market_prices_daily_source_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX lme_market_prices_daily_source_key ON public.lme_market_prices USING btree (reference_date, material_code, price_type) WHERE (price_type = 'spot'::text);


--
-- Name: lme_market_prices_material_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lme_market_prices_material_date_idx ON public.lme_market_prices USING btree (material_code, reference_date DESC);


--
-- Name: lme_price_records_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lme_price_records_created_at_idx ON public.lme_price_records USING btree (created_at);


--
-- Name: lme_price_records_current_month_round_supplier_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX lme_price_records_current_month_round_supplier_uidx ON public.lme_price_records USING btree (reference_month, round, supplier_id) WHERE is_current;


--
-- Name: lme_price_records_reference_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lme_price_records_reference_date_idx ON public.lme_price_records USING btree (reference_date);


--
-- Name: lme_price_records_reference_month_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lme_price_records_reference_month_idx ON public.lme_price_records USING btree (reference_month);


--
-- Name: lme_price_records_supplier_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lme_price_records_supplier_id_idx ON public.lme_price_records USING btree (supplier_id);


--
-- Name: lme_price_records_supplier_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lme_price_records_supplier_name_idx ON public.lme_price_records USING btree (supplier_name);


--
-- Name: lme_sync_runs_single_running_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX lme_sync_runs_single_running_idx ON public.lme_sync_runs USING btree (status) WHERE (status = 'running'::text);


--
-- Name: lme_sync_runs_started_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lme_sync_runs_started_idx ON public.lme_sync_runs USING btree (started_at DESC);


--
-- Name: material_contract_allocations_contract_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX material_contract_allocations_contract_status_idx ON public.material_contract_allocations USING btree (contract_id, status);


--
-- Name: material_contract_allocations_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX material_contract_allocations_date_idx ON public.material_contract_allocations USING btree (allocation_date);


--
-- Name: material_contract_allocations_project_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX material_contract_allocations_project_idx ON public.material_contract_allocations USING btree (project_id);


--
-- Name: material_contract_allocations_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX material_contract_allocations_type_idx ON public.material_contract_allocations USING btree (allocation_type, allocation_date DESC);


--
-- Name: material_contract_allocations_usage_request_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX material_contract_allocations_usage_request_idx ON public.material_contract_allocations USING btree (usage_request_id, status) WHERE (usage_request_id IS NOT NULL);


--
-- Name: material_contract_notification_events_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX material_contract_notification_events_created_idx ON public.material_contract_notification_events USING btree (created_at DESC);


--
-- Name: material_usage_groups_project_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX material_usage_groups_project_idx ON public.material_usage_groups USING btree (project_id, is_active, category, sequence);


--
-- Name: material_usage_requests_group_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX material_usage_requests_group_idx ON public.material_usage_requests USING btree (material_usage_group_id) WHERE (material_usage_group_id IS NOT NULL);


--
-- Name: material_usage_requests_material_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX material_usage_requests_material_status_idx ON public.material_usage_requests USING btree (material_code, status, usage_date DESC);


--
-- Name: material_usage_requests_project_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX material_usage_requests_project_idx ON public.material_usage_requests USING btree (project_id) WHERE (project_id IS NOT NULL);


--
-- Name: notification_reads_user_archived_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_reads_user_archived_at_idx ON public.notification_reads USING btree (auth_user_id, archived_at DESC) WHERE (archived_at IS NOT NULL);


--
-- Name: notification_reads_user_pinned_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_reads_user_pinned_idx ON public.notification_reads USING btree (auth_user_id, is_pinned DESC, read_at DESC);


--
-- Name: notification_reads_user_read_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_reads_user_read_at_idx ON public.notification_reads USING btree (auth_user_id, read_at DESC);


--
-- Name: organizations_internal_normalized_name_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX organizations_internal_normalized_name_uidx ON public.organizations USING btree (category_id, lower(btrim(name))) WHERE (partner_type IS NULL);


--
-- Name: organizations_partner_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organizations_partner_type_idx ON public.organizations USING btree (partner_type, is_active, sort_order, name) WHERE (partner_type IS NOT NULL);


--
-- Name: organizations_partner_type_normalized_name_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX organizations_partner_type_normalized_name_uidx ON public.organizations USING btree (category_id, partner_type, lower(btrim(name))) WHERE (partner_type IS NOT NULL);


--
-- Name: personal_notes_user_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX personal_notes_user_due_idx ON public.personal_notes USING btree (user_id, due_date) WHERE (due_date IS NOT NULL);


--
-- Name: personal_notes_user_sort_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX personal_notes_user_sort_idx ON public.personal_notes USING btree (user_id, is_pinned DESC, is_completed, sort_order, created_at DESC);


--
-- Name: process_types_code_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX process_types_code_uidx ON public.process_types USING btree (code);


--
-- Name: project_accessory_usages_item_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX project_accessory_usages_item_status_idx ON public.project_accessory_usages USING btree (accessory_item_id, status);


--
-- Name: project_accessory_usages_project_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX project_accessory_usages_project_date_idx ON public.project_accessory_usages USING btree (project_id, usage_date DESC);


--
-- Name: project_accessory_usages_project_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX project_accessory_usages_project_status_idx ON public.project_accessory_usages USING btree (project_id, status);


--
-- Name: project_assembly_vendors_is_primary_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX project_assembly_vendors_is_primary_idx ON public.project_assembly_vendors USING btree (is_primary) WHERE is_primary;


--
-- Name: project_assembly_vendors_one_primary_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX project_assembly_vendors_one_primary_uidx ON public.project_assembly_vendors USING btree (project_id) WHERE is_primary;


--
-- Name: project_assembly_vendors_organization_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX project_assembly_vendors_organization_id_idx ON public.project_assembly_vendors USING btree (organization_id);


--
-- Name: project_assembly_vendors_project_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX project_assembly_vendors_project_id_idx ON public.project_assembly_vendors USING btree (project_id);


--
-- Name: project_contract_entries_one_original_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX project_contract_entries_one_original_idx ON public.project_contract_entries USING btree (project_id) WHERE ((entry_type = 'original'::text) AND (status = 'confirmed'::text));


--
-- Name: project_contract_entries_project_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX project_contract_entries_project_date_idx ON public.project_contract_entries USING btree (project_id, contract_date DESC, created_at DESC);


--
-- Name: project_cost_entries_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX project_cost_entries_category_idx ON public.project_cost_entries USING btree (category_id, status);


--
-- Name: project_cost_entries_import_batch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX project_cost_entries_import_batch_idx ON public.project_cost_entries USING btree (import_batch_id) WHERE (import_batch_id IS NOT NULL);


--
-- Name: project_cost_entries_project_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX project_cost_entries_project_date_idx ON public.project_cost_entries USING btree (project_id, cost_date DESC, created_at DESC);


--
-- Name: project_files_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX project_files_created_at_idx ON public.project_files USING btree (created_at DESC);


--
-- Name: project_files_file_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX project_files_file_type_idx ON public.project_files USING btree (file_type);


--
-- Name: project_files_project_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX project_files_project_id_idx ON public.project_files USING btree (project_id);


--
-- Name: project_material_usages_contract_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX project_material_usages_contract_idx ON public.project_material_usages USING btree (raw_material_contract_id) WHERE (raw_material_contract_id IS NOT NULL);


--
-- Name: project_material_usages_material_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX project_material_usages_material_idx ON public.project_material_usages USING btree (material_code, cost_reference_date DESC);


--
-- Name: project_material_usages_project_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX project_material_usages_project_idx ON public.project_material_usages USING btree (project_id, created_at DESC);


--
-- Name: project_schedule_memos_project_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX project_schedule_memos_project_id_idx ON public.project_schedule_memos USING btree (project_id, memo_date);


--
-- Name: project_sections_project_process_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX project_sections_project_process_uidx ON public.project_sections USING btree (project_id, process_type);


--
-- Name: project_sections_project_sort_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX project_sections_project_sort_idx ON public.project_sections USING btree (project_id, sort_order, id);


--
-- Name: project_sections_project_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX project_sections_project_type_idx ON public.project_sections USING btree (project_id, process_type);


--
-- Name: projects_assembly_vendor_organization_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX projects_assembly_vendor_organization_id_idx ON public.projects USING btree (assembly_vendor_organization_id);


--
-- Name: raw_material_contracts_material_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX raw_material_contracts_material_idx ON public.raw_material_contracts USING btree (material_code);


--
-- Name: raw_material_contracts_status_end_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX raw_material_contracts_status_end_idx ON public.raw_material_contracts USING btree (status, effective_end_date);


--
-- Name: raw_material_contracts_supplier_start_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX raw_material_contracts_supplier_start_idx ON public.raw_material_contracts USING btree (supplier_id, effective_start_date DESC);


--
-- Name: reference_tasks_assignee_comment_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX reference_tasks_assignee_comment_unique ON public.reference_tasks USING btree (assigned_to, comment_id) WHERE (comment_id IS NOT NULL);


--
-- Name: reference_tasks_assignee_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reference_tasks_assignee_status_created_idx ON public.reference_tasks USING btree (assigned_to, status, created_at DESC);


--
-- Name: share_invitations_invitee_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX share_invitations_invitee_status_idx ON public.share_invitations USING btree (invitee_id, status, created_at DESC);


--
-- Name: share_invitations_inviter_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX share_invitations_inviter_status_idx ON public.share_invitations USING btree (inviter_id, status, created_at DESC);


--
-- Name: share_invitations_pending_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX share_invitations_pending_unique ON public.share_invitations USING btree (shared_item_id, invitee_id) WHERE (status = 'pending'::text);


--
-- Name: shared_comment_mentions_employee_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shared_comment_mentions_employee_created_idx ON public.shared_comment_mentions USING btree (employee_id, created_at DESC);


--
-- Name: shared_comment_reads_employee_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shared_comment_reads_employee_idx ON public.shared_comment_reads USING btree (employee_id, updated_at DESC);


--
-- Name: shared_comments_author_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shared_comments_author_id_idx ON public.shared_comments USING btree (author_id);


--
-- Name: shared_comments_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shared_comments_created_at_idx ON public.shared_comments USING btree (created_at);


--
-- Name: shared_comments_shared_item_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shared_comments_shared_item_id_idx ON public.shared_comments USING btree (shared_item_id, created_at);


--
-- Name: suppliers_normalized_name_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX suppliers_normalized_name_uidx ON public.suppliers USING btree (lower(btrim(name)));


--
-- Name: suppliers_organization_id_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX suppliers_organization_id_uidx ON public.suppliers USING btree (organization_id);


--
-- Name: task_dependencies_predecessor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_dependencies_predecessor_idx ON public.task_dependencies USING btree (predecessor_task_id);


--
-- Name: task_dependencies_successor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_dependencies_successor_idx ON public.task_dependencies USING btree (successor_task_id);


--
-- Name: task_notes_check_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_notes_check_date_idx ON public.task_notes USING btree (check_date) WHERE (check_date IS NOT NULL);


--
-- Name: task_notes_task_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_notes_task_id_created_at_idx ON public.task_notes USING btree (task_id, created_at);


--
-- Name: task_schedule_memos_task_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_schedule_memos_task_id_idx ON public.task_schedule_memos USING btree (task_id);


--
-- Name: task_tags_tag_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_tags_tag_idx ON public.task_tags USING btree (tag);


--
-- Name: task_tags_task_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_tags_task_id_idx ON public.task_tags USING btree (task_id);


--
-- Name: tasks_project_assembly_vendor_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_project_assembly_vendor_id_idx ON public.tasks USING btree (project_assembly_vendor_id);


--
-- Name: tasks_project_section_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_project_section_id_idx ON public.tasks USING btree (project_section_id);


--
-- Name: accessory_items accessory_items_assert_vendor; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER accessory_items_assert_vendor BEFORE INSERT OR UPDATE OF vendor_organization_id ON public.accessory_items FOR EACH ROW EXECUTE FUNCTION public.assert_accessory_vendor();


--
-- Name: lme_market_prices calculate_lme_market_price; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER calculate_lme_market_price BEFORE INSERT ON public.lme_market_prices FOR EACH ROW EXECUTE FUNCTION public.calculate_lme_market_price();


--
-- Name: lme_price_records calculate_lme_price_record; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER calculate_lme_price_record BEFORE INSERT ON public.lme_price_records FOR EACH ROW EXECUTE FUNCTION public.calculate_lme_price_record();


--
-- Name: coating_cost_statements coating_cost_statements_assert_vendor; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER coating_cost_statements_assert_vendor BEFORE INSERT OR UPDATE OF vendor_organization_id ON public.coating_cost_statements FOR EACH ROW EXECUTE FUNCTION public.assert_coating_vendor();


--
-- Name: glass_cost_statements glass_cost_statements_assert_vendor; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER glass_cost_statements_assert_vendor BEFORE INSERT OR UPDATE OF vendor_organization_id ON public.glass_cost_statements FOR EACH ROW EXECUTE FUNCTION public.assert_glass_vendor();


--
-- Name: activity_logs guard_material_allocation_activity_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_material_allocation_activity_insert BEFORE INSERT ON public.activity_logs FOR EACH ROW EXECUTE FUNCTION public.guard_material_allocation_activity_insert();


--
-- Name: material_usage_requests log_material_usage_request_created; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER log_material_usage_request_created AFTER INSERT ON public.material_usage_requests FOR EACH ROW EXECUTE FUNCTION public.log_material_usage_request_created();


--
-- Name: personal_notes log_personal_note_activity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER log_personal_note_activity AFTER INSERT OR UPDATE ON public.personal_notes FOR EACH ROW EXECUTE FUNCTION public.log_personal_note_activity();


--
-- Name: personal_notes log_personal_note_delete_activity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER log_personal_note_delete_activity BEFORE DELETE ON public.personal_notes FOR EACH ROW EXECUTE FUNCTION public.log_personal_note_activity();


--
-- Name: share_invitations log_share_invitation_activity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER log_share_invitation_activity AFTER INSERT OR UPDATE ON public.share_invitations FOR EACH ROW EXECUTE FUNCTION public.log_share_invitation_activity();


--
-- Name: shared_comments log_shared_comment_activity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER log_shared_comment_activity AFTER INSERT OR UPDATE ON public.shared_comments FOR EACH ROW EXECUTE FUNCTION public.log_shared_comment_activity();


--
-- Name: shared_comments log_shared_comment_delete_activity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER log_shared_comment_delete_activity BEFORE DELETE ON public.shared_comments FOR EACH ROW EXECUTE FUNCTION public.log_shared_comment_activity();


--
-- Name: shared_item_members log_shared_member_activity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER log_shared_member_activity AFTER UPDATE ON public.shared_item_members FOR EACH ROW EXECUTE FUNCTION public.log_shared_member_activity();


--
-- Name: shared_item_members log_shared_member_remove_activity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER log_shared_member_remove_activity BEFORE DELETE ON public.shared_item_members FOR EACH ROW EXECUTE FUNCTION public.log_shared_member_activity();


--
-- Name: organizations organizations_protect_referenced_partner_type; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER organizations_protect_referenced_partner_type BEFORE UPDATE OF partner_type ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.protect_referenced_partner_type();


--
-- Name: organizations organizations_sync_supplier_master; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER organizations_sync_supplier_master AFTER INSERT OR UPDATE OF name, is_active, partner_type ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.sync_supplier_from_organization();


--
-- Name: project_contract_entries prepare_project_contract_entry; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER prepare_project_contract_entry BEFORE INSERT OR UPDATE ON public.project_contract_entries FOR EACH ROW EXECUTE FUNCTION public.prepare_project_contract_entry();


--
-- Name: project_cost_categories prepare_project_cost_category; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER prepare_project_cost_category BEFORE UPDATE ON public.project_cost_categories FOR EACH ROW EXECUTE FUNCTION public.prepare_project_cost_category();


--
-- Name: project_cost_entries prepare_project_cost_entry; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER prepare_project_cost_entry BEFORE INSERT OR UPDATE ON public.project_cost_entries FOR EACH ROW EXECUTE FUNCTION public.prepare_project_cost_entry();


--
-- Name: project_material_usages prepare_project_material_usage; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER prepare_project_material_usage BEFORE UPDATE ON public.project_material_usages FOR EACH ROW EXECUTE FUNCTION public.prepare_project_material_usage();


--
-- Name: raw_material_contracts prepare_raw_material_contract; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER prepare_raw_material_contract BEFORE INSERT OR UPDATE ON public.raw_material_contracts FOR EACH ROW EXECUTE FUNCTION public.prepare_raw_material_contract();


--
-- Name: exchange_rates prevent_exchange_rate_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER prevent_exchange_rate_change BEFORE DELETE OR UPDATE ON public.exchange_rates FOR EACH ROW EXECUTE FUNCTION public.prevent_exchange_rate_change();


--
-- Name: lme_market_prices prevent_lme_market_history_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER prevent_lme_market_history_change BEFORE DELETE OR UPDATE ON public.lme_market_prices FOR EACH ROW EXECUTE FUNCTION public.prevent_lme_market_history_change();


--
-- Name: project_assembly_vendors project_assembly_vendors_assert_assembly; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER project_assembly_vendors_assert_assembly BEFORE INSERT OR UPDATE OF organization_id ON public.project_assembly_vendors FOR EACH ROW EXECUTE FUNCTION public.assert_project_assembly_organization();


--
-- Name: project_assembly_vendors project_assembly_vendors_sync_primary_cache; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER project_assembly_vendors_sync_primary_cache AFTER INSERT OR DELETE OR UPDATE ON public.project_assembly_vendors FOR EACH ROW EXECUTE FUNCTION public.project_assembly_vendors_sync_primary_cache();


--
-- Name: lme_market_prices refresh_lme_market_kpi_cache; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER refresh_lme_market_kpi_cache AFTER INSERT ON public.lme_market_prices FOR EACH ROW EXECUTE FUNCTION public.refresh_lme_market_kpi_cache();


--
-- Name: material_contract_allocations set_material_contract_allocations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_material_contract_allocations_updated_at BEFORE UPDATE ON public.material_contract_allocations FOR EACH ROW EXECUTE FUNCTION public.set_material_contract_allocations_updated_at();


--
-- Name: personal_notes set_personal_notes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_personal_notes_updated_at BEFORE UPDATE ON public.personal_notes FOR EACH ROW EXECUTE FUNCTION public.set_personal_notes_updated_at();


--
-- Name: shared_comments set_shared_comments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_shared_comments_updated_at BEFORE UPDATE ON public.shared_comments FOR EACH ROW EXECUTE FUNCTION public.set_shared_comments_updated_at();


--
-- Name: task_notes set_task_notes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_task_notes_updated_at BEFORE UPDATE ON public.task_notes FOR EACH ROW EXECUTE FUNCTION public.set_task_notes_updated_at();


--
-- Name: suppliers suppliers_assert_supplier_organization; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER suppliers_assert_supplier_organization BEFORE INSERT OR UPDATE OF organization_id ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.assert_supplier_organization();


--
-- Name: accessory_items accessory_items_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accessory_items
    ADD CONSTRAINT accessory_items_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;


--
-- Name: accessory_items accessory_items_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accessory_items
    ADD CONSTRAINT accessory_items_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE RESTRICT;


--
-- Name: accessory_items accessory_items_vendor_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accessory_items
    ADD CONSTRAINT accessory_items_vendor_organization_id_fkey FOREIGN KEY (vendor_organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: accessory_price_history accessory_price_history_accessory_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accessory_price_history
    ADD CONSTRAINT accessory_price_history_accessory_item_id_fkey FOREIGN KEY (accessory_item_id) REFERENCES public.accessory_items(id) ON DELETE RESTRICT;


--
-- Name: accessory_price_history accessory_price_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accessory_price_history
    ADD CONSTRAINT accessory_price_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id) ON DELETE RESTRICT;


--
-- Name: coating_cost_allocation_history coating_cost_allocation_history_allocation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coating_cost_allocation_history
    ADD CONSTRAINT coating_cost_allocation_history_allocation_id_fkey FOREIGN KEY (allocation_id) REFERENCES public.coating_cost_allocations(id) ON DELETE RESTRICT;


--
-- Name: coating_cost_allocation_history coating_cost_allocation_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coating_cost_allocation_history
    ADD CONSTRAINT coating_cost_allocation_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id) ON DELETE RESTRICT;


--
-- Name: coating_cost_allocation_history coating_cost_allocation_history_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coating_cost_allocation_history
    ADD CONSTRAINT coating_cost_allocation_history_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE RESTRICT;


--
-- Name: coating_cost_allocation_history coating_cost_allocation_history_statement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coating_cost_allocation_history
    ADD CONSTRAINT coating_cost_allocation_history_statement_id_fkey FOREIGN KEY (statement_id) REFERENCES public.coating_cost_statements(id) ON DELETE RESTRICT;


--
-- Name: coating_cost_allocations coating_cost_allocations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coating_cost_allocations
    ADD CONSTRAINT coating_cost_allocations_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;


--
-- Name: coating_cost_allocations coating_cost_allocations_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coating_cost_allocations
    ADD CONSTRAINT coating_cost_allocations_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE RESTRICT;


--
-- Name: coating_cost_allocations coating_cost_allocations_statement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coating_cost_allocations
    ADD CONSTRAINT coating_cost_allocations_statement_id_fkey FOREIGN KEY (statement_id) REFERENCES public.coating_cost_statements(id) ON DELETE RESTRICT;


--
-- Name: coating_cost_allocations coating_cost_allocations_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coating_cost_allocations
    ADD CONSTRAINT coating_cost_allocations_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE RESTRICT;


--
-- Name: coating_cost_statements coating_cost_statements_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coating_cost_statements
    ADD CONSTRAINT coating_cost_statements_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;


--
-- Name: coating_cost_statements coating_cost_statements_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coating_cost_statements
    ADD CONSTRAINT coating_cost_statements_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE RESTRICT;


--
-- Name: coating_cost_statements coating_cost_statements_vendor_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coating_cost_statements
    ADD CONSTRAINT coating_cost_statements_vendor_organization_id_fkey FOREIGN KEY (vendor_organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: dashboard_preferences dashboard_preferences_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dashboard_preferences
    ADD CONSTRAINT dashboard_preferences_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: editing_locks editing_locks_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.editing_locks
    ADD CONSTRAINT editing_locks_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: employees employees_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: glass_cost_allocation_history glass_cost_allocation_history_allocation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.glass_cost_allocation_history
    ADD CONSTRAINT glass_cost_allocation_history_allocation_id_fkey FOREIGN KEY (allocation_id) REFERENCES public.glass_cost_allocations(id) ON DELETE RESTRICT;


--
-- Name: glass_cost_allocation_history glass_cost_allocation_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.glass_cost_allocation_history
    ADD CONSTRAINT glass_cost_allocation_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id) ON DELETE RESTRICT;


--
-- Name: glass_cost_allocation_history glass_cost_allocation_history_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.glass_cost_allocation_history
    ADD CONSTRAINT glass_cost_allocation_history_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE RESTRICT;


--
-- Name: glass_cost_allocation_history glass_cost_allocation_history_statement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.glass_cost_allocation_history
    ADD CONSTRAINT glass_cost_allocation_history_statement_id_fkey FOREIGN KEY (statement_id) REFERENCES public.glass_cost_statements(id) ON DELETE RESTRICT;


--
-- Name: glass_cost_allocations glass_cost_allocations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.glass_cost_allocations
    ADD CONSTRAINT glass_cost_allocations_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;


--
-- Name: glass_cost_allocations glass_cost_allocations_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.glass_cost_allocations
    ADD CONSTRAINT glass_cost_allocations_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE RESTRICT;


--
-- Name: glass_cost_allocations glass_cost_allocations_statement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.glass_cost_allocations
    ADD CONSTRAINT glass_cost_allocations_statement_id_fkey FOREIGN KEY (statement_id) REFERENCES public.glass_cost_statements(id) ON DELETE RESTRICT;


--
-- Name: glass_cost_allocations glass_cost_allocations_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.glass_cost_allocations
    ADD CONSTRAINT glass_cost_allocations_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE RESTRICT;


--
-- Name: glass_cost_statements glass_cost_statements_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.glass_cost_statements
    ADD CONSTRAINT glass_cost_statements_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;


--
-- Name: glass_cost_statements glass_cost_statements_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.glass_cost_statements
    ADD CONSTRAINT glass_cost_statements_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE RESTRICT;


--
-- Name: glass_cost_statements glass_cost_statements_vendor_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.glass_cost_statements
    ADD CONSTRAINT glass_cost_statements_vendor_organization_id_fkey FOREIGN KEY (vendor_organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: lme_market_kpi_cache lme_market_kpi_cache_material_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lme_market_kpi_cache
    ADD CONSTRAINT lme_market_kpi_cache_material_code_fkey FOREIGN KEY (material_code) REFERENCES public.lme_materials(code) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: lme_market_prices lme_market_prices_material_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lme_market_prices
    ADD CONSTRAINT lme_market_prices_material_fkey FOREIGN KEY (material_code) REFERENCES public.lme_materials(code) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: lme_price_records lme_price_records_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lme_price_records
    ADD CONSTRAINT lme_price_records_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;


--
-- Name: lme_price_records lme_price_records_supersedes_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lme_price_records
    ADD CONSTRAINT lme_price_records_supersedes_id_fkey FOREIGN KEY (supersedes_id) REFERENCES public.lme_price_records(id) ON DELETE RESTRICT;


--
-- Name: lme_price_records lme_price_records_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lme_price_records
    ADD CONSTRAINT lme_price_records_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: lme_price_records lme_price_records_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lme_price_records
    ADD CONSTRAINT lme_price_records_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: lme_status_thresholds lme_status_thresholds_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lme_status_thresholds
    ADD CONSTRAINT lme_status_thresholds_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: material_contract_allocations material_contract_allocations_contract_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_contract_allocations
    ADD CONSTRAINT material_contract_allocations_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.raw_material_contracts(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: material_contract_allocations material_contract_allocations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_contract_allocations
    ADD CONSTRAINT material_contract_allocations_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: material_contract_allocations material_contract_allocations_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_contract_allocations
    ADD CONSTRAINT material_contract_allocations_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: material_contract_allocations material_contract_allocations_usage_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_contract_allocations
    ADD CONSTRAINT material_contract_allocations_usage_request_id_fkey FOREIGN KEY (usage_request_id) REFERENCES public.material_usage_requests(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: material_contract_notification_events material_contract_notification_events_contract_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_contract_notification_events
    ADD CONSTRAINT material_contract_notification_events_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.raw_material_contracts(id) ON DELETE CASCADE;


--
-- Name: material_contract_notification_states material_contract_notification_states_contract_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_contract_notification_states
    ADD CONSTRAINT material_contract_notification_states_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.raw_material_contracts(id) ON DELETE CASCADE;


--
-- Name: material_usage_groups material_usage_groups_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_usage_groups
    ADD CONSTRAINT material_usage_groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;


--
-- Name: material_usage_groups material_usage_groups_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_usage_groups
    ADD CONSTRAINT material_usage_groups_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE RESTRICT;


--
-- Name: material_usage_groups material_usage_groups_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_usage_groups
    ADD CONSTRAINT material_usage_groups_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE RESTRICT;


--
-- Name: material_usage_requests material_usage_requests_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_usage_requests
    ADD CONSTRAINT material_usage_requests_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: material_usage_requests material_usage_requests_material_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_usage_requests
    ADD CONSTRAINT material_usage_requests_material_code_fkey FOREIGN KEY (material_code) REFERENCES public.lme_materials(code) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: material_usage_requests material_usage_requests_material_usage_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_usage_requests
    ADD CONSTRAINT material_usage_requests_material_usage_group_id_fkey FOREIGN KEY (material_usage_group_id) REFERENCES public.material_usage_groups(id) ON DELETE RESTRICT;


--
-- Name: material_usage_requests material_usage_requests_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_usage_requests
    ADD CONSTRAINT material_usage_requests_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: material_usage_requests material_usage_requests_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_usage_requests
    ADD CONSTRAINT material_usage_requests_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: notification_reads notification_reads_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_reads
    ADD CONSTRAINT notification_reads_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: organizations organizations_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.organization_categories(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: personal_notes personal_notes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personal_notes
    ADD CONSTRAINT personal_notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: project_accessory_usages project_accessory_usages_accessory_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_accessory_usages
    ADD CONSTRAINT project_accessory_usages_accessory_item_id_fkey FOREIGN KEY (accessory_item_id) REFERENCES public.accessory_items(id) ON DELETE RESTRICT;


--
-- Name: project_accessory_usages project_accessory_usages_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_accessory_usages
    ADD CONSTRAINT project_accessory_usages_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;


--
-- Name: project_accessory_usages project_accessory_usages_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_accessory_usages
    ADD CONSTRAINT project_accessory_usages_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE RESTRICT;


--
-- Name: project_accessory_usages project_accessory_usages_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_accessory_usages
    ADD CONSTRAINT project_accessory_usages_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE RESTRICT;


--
-- Name: project_assembly_vendors project_assembly_vendors_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_assembly_vendors
    ADD CONSTRAINT project_assembly_vendors_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: project_assembly_vendors project_assembly_vendors_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_assembly_vendors
    ADD CONSTRAINT project_assembly_vendors_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: project_contract_entries project_contract_entries_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_contract_entries
    ADD CONSTRAINT project_contract_entries_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: project_cost_entries project_cost_entries_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_cost_entries
    ADD CONSTRAINT project_cost_entries_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.project_cost_categories(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: project_cost_entries project_cost_entries_import_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_cost_entries
    ADD CONSTRAINT project_cost_entries_import_batch_id_fkey FOREIGN KEY (import_batch_id) REFERENCES public.project_cost_import_batches(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: project_cost_entries project_cost_entries_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_cost_entries
    ADD CONSTRAINT project_cost_entries_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: project_files project_files_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_files
    ADD CONSTRAINT project_files_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: project_material_usages project_material_usages_lme_market_price_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_material_usages
    ADD CONSTRAINT project_material_usages_lme_market_price_id_fkey FOREIGN KEY (lme_market_price_id) REFERENCES public.lme_market_prices(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: project_material_usages project_material_usages_material_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_material_usages
    ADD CONSTRAINT project_material_usages_material_code_fkey FOREIGN KEY (material_code) REFERENCES public.lme_materials(code) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: project_material_usages project_material_usages_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_material_usages
    ADD CONSTRAINT project_material_usages_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: project_material_usages project_material_usages_raw_material_contract_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_material_usages
    ADD CONSTRAINT project_material_usages_raw_material_contract_id_fkey FOREIGN KEY (raw_material_contract_id) REFERENCES public.raw_material_contracts(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: project_schedule_memos project_schedule_memos_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_schedule_memos
    ADD CONSTRAINT project_schedule_memos_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;


--
-- Name: project_schedule_memos project_schedule_memos_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_schedule_memos
    ADD CONSTRAINT project_schedule_memos_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: project_sections project_sections_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_sections
    ADD CONSTRAINT project_sections_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: projects projects_assembly_vendor_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_assembly_vendor_organization_id_fkey FOREIGN KEY (assembly_vendor_organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: raw_material_contracts raw_material_contracts_material_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.raw_material_contracts
    ADD CONSTRAINT raw_material_contracts_material_fkey FOREIGN KEY (material_code) REFERENCES public.lme_materials(code) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: raw_material_contracts raw_material_contracts_supplier_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.raw_material_contracts
    ADD CONSTRAINT raw_material_contracts_supplier_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: reference_tasks reference_tasks_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_tasks
    ADD CONSTRAINT reference_tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: reference_tasks reference_tasks_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_tasks
    ADD CONSTRAINT reference_tasks_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.shared_comments(id) ON DELETE SET NULL;


--
-- Name: reference_tasks reference_tasks_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_tasks
    ADD CONSTRAINT reference_tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.employees(id) ON DELETE RESTRICT;


--
-- Name: reference_tasks reference_tasks_shared_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_tasks
    ADD CONSTRAINT reference_tasks_shared_item_id_fkey FOREIGN KEY (shared_item_id) REFERENCES public.shared_items(id) ON DELETE SET NULL;


--
-- Name: share_invitations share_invitations_invitee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_invitations
    ADD CONSTRAINT share_invitations_invitee_id_fkey FOREIGN KEY (invitee_id) REFERENCES public.employees(id) ON DELETE RESTRICT;


--
-- Name: share_invitations share_invitations_inviter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_invitations
    ADD CONSTRAINT share_invitations_inviter_id_fkey FOREIGN KEY (inviter_id) REFERENCES public.employees(id) ON DELETE RESTRICT;


--
-- Name: share_invitations share_invitations_shared_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_invitations
    ADD CONSTRAINT share_invitations_shared_item_id_fkey FOREIGN KEY (shared_item_id) REFERENCES public.shared_items(id) ON DELETE CASCADE;


--
-- Name: shared_comment_mentions shared_comment_mentions_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_comment_mentions
    ADD CONSTRAINT shared_comment_mentions_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.shared_comments(id) ON DELETE CASCADE;


--
-- Name: shared_comment_mentions shared_comment_mentions_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_comment_mentions
    ADD CONSTRAINT shared_comment_mentions_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: shared_comment_reads shared_comment_reads_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_comment_reads
    ADD CONSTRAINT shared_comment_reads_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: shared_comment_reads shared_comment_reads_shared_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_comment_reads
    ADD CONSTRAINT shared_comment_reads_shared_item_id_fkey FOREIGN KEY (shared_item_id) REFERENCES public.shared_items(id) ON DELETE CASCADE;


--
-- Name: shared_comments shared_comments_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_comments
    ADD CONSTRAINT shared_comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.employees(id) ON DELETE RESTRICT;


--
-- Name: shared_comments shared_comments_shared_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_comments
    ADD CONSTRAINT shared_comments_shared_item_id_fkey FOREIGN KEY (shared_item_id) REFERENCES public.shared_items(id) ON DELETE CASCADE;


--
-- Name: shared_item_members shared_item_members_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_item_members
    ADD CONSTRAINT shared_item_members_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE RESTRICT;


--
-- Name: shared_item_members shared_item_members_shared_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_item_members
    ADD CONSTRAINT shared_item_members_shared_item_id_fkey FOREIGN KEY (shared_item_id) REFERENCES public.shared_items(id) ON DELETE CASCADE;


--
-- Name: shared_items shared_items_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_items
    ADD CONSTRAINT shared_items_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.personal_notes(id) ON DELETE CASCADE;


--
-- Name: shared_items shared_items_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_items
    ADD CONSTRAINT shared_items_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.employees(id) ON DELETE RESTRICT;


--
-- Name: suppliers suppliers_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: task_dependencies task_dependencies_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT task_dependencies_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;


--
-- Name: task_dependencies task_dependencies_predecessor_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT task_dependencies_predecessor_task_id_fkey FOREIGN KEY (predecessor_task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: task_dependencies task_dependencies_successor_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT task_dependencies_successor_task_id_fkey FOREIGN KEY (successor_task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: task_notes task_notes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_notes
    ADD CONSTRAINT task_notes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;


--
-- Name: task_notes task_notes_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_notes
    ADD CONSTRAINT task_notes_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: task_schedule_memos task_schedule_memos_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_schedule_memos
    ADD CONSTRAINT task_schedule_memos_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;


--
-- Name: task_schedule_memos task_schedule_memos_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_schedule_memos
    ADD CONSTRAINT task_schedule_memos_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: task_tags task_tags_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_tags
    ADD CONSTRAINT task_tags_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;


--
-- Name: task_tags task_tags_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_tags
    ADD CONSTRAINT task_tags_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_project_assembly_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_project_assembly_vendor_id_fkey FOREIGN KEY (project_assembly_vendor_id) REFERENCES public.project_assembly_vendors(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: tasks tasks_project_section_project_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_project_section_project_fkey FOREIGN KEY (project_section_id, project_id) REFERENCES public.project_sections(id, project_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: project_sections Authenticated users can delete project sections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can delete project sections" ON public.project_sections FOR DELETE TO authenticated USING (true);


--
-- Name: project_sections Authenticated users can insert project sections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert project sections" ON public.project_sections FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: project_sections Authenticated users can select project sections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can select project sections" ON public.project_sections FOR SELECT TO authenticated USING (true);


--
-- Name: project_sections Authenticated users can update project sections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update project sections" ON public.project_sections FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: accessory_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.accessory_items ENABLE ROW LEVEL SECURITY;

--
-- Name: accessory_items accessory_items_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accessory_items_read ON public.accessory_items FOR SELECT TO authenticated USING (public.is_approved_erp_user());


--
-- Name: accessory_price_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.accessory_price_history ENABLE ROW LEVEL SECURITY;

--
-- Name: accessory_price_history accessory_price_history_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accessory_price_history_read ON public.accessory_price_history FOR SELECT TO authenticated USING (public.is_approved_erp_user());


--
-- Name: activity_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_logs activity_logs_insert_editor; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY activity_logs_insert_editor ON public.activity_logs FOR INSERT TO authenticated WITH CHECK (public.can_edit_tasks());


--
-- Name: activity_logs activity_logs_select_erp_user; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY activity_logs_select_erp_user ON public.activity_logs FOR SELECT TO authenticated USING ((public.is_approved_erp_user() AND ((source_item_id IS NULL) OR public.can_view_shared_activity(source_item_id))));


--
-- Name: app_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: app_settings app_settings_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_settings_insert_admin ON public.app_settings FOR INSERT TO authenticated WITH CHECK ((public.is_approved_admin() AND (updated_by = auth.uid())));


--
-- Name: app_settings app_settings_select_erp_user; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_settings_select_erp_user ON public.app_settings FOR SELECT TO authenticated USING (public.is_approved_erp_user());


--
-- Name: app_settings app_settings_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_settings_update_admin ON public.app_settings FOR UPDATE TO authenticated USING (public.is_approved_admin()) WITH CHECK ((public.is_approved_admin() AND (updated_by = auth.uid())));


--
-- Name: employees approved admins insert employees; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "approved admins insert employees" ON public.employees FOR INSERT TO authenticated WITH CHECK (public.is_approved_admin());


--
-- Name: employees approved admins update employees; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "approved admins update employees" ON public.employees FOR UPDATE TO authenticated USING (public.is_approved_admin()) WITH CHECK (public.is_approved_admin());


--
-- Name: activity_logs calendar_only_staff_block_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_delete ON public.activity_logs AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_calendar_only_staff()));


--
-- Name: app_settings calendar_only_staff_block_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_delete ON public.app_settings AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_calendar_only_staff()));


--
-- Name: dashboard_preferences calendar_only_staff_block_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_delete ON public.dashboard_preferences AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_calendar_only_staff()));


--
-- Name: editing_locks calendar_only_staff_block_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_delete ON public.editing_locks AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_calendar_only_staff()));


--
-- Name: employees calendar_only_staff_block_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_delete ON public.employees AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_calendar_only_staff()));


--
-- Name: exchange_rate_sync_runs calendar_only_staff_block_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_delete ON public.exchange_rate_sync_runs AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_calendar_only_staff()));


--
-- Name: exchange_rates calendar_only_staff_block_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_delete ON public.exchange_rates AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_calendar_only_staff()));


--
-- Name: lme_import_logs calendar_only_staff_block_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_delete ON public.lme_import_logs AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_calendar_only_staff()));


--
-- Name: lme_market_kpi_cache calendar_only_staff_block_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_delete ON public.lme_market_kpi_cache AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_calendar_only_staff()));


--
-- Name: lme_market_prices calendar_only_staff_block_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_delete ON public.lme_market_prices AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_calendar_only_staff()));


--
-- Name: lme_materials calendar_only_staff_block_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_delete ON public.lme_materials AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_calendar_only_staff()));


--
-- Name: lme_price_records calendar_only_staff_block_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_delete ON public.lme_price_records AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_calendar_only_staff()));


--
-- Name: lme_status_thresholds calendar_only_staff_block_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_delete ON public.lme_status_thresholds AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_calendar_only_staff()));


--
-- Name: lme_sync_runs calendar_only_staff_block_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_delete ON public.lme_sync_runs AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_calendar_only_staff()));


--
-- Name: material_contract_allocations calendar_only_staff_block_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_delete ON public.material_contract_allocations AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_calendar_only_staff()));


--
-- Name: material_contract_notification_events calendar_only_staff_block_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_delete ON public.material_contract_notification_events AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_calendar_only_staff()));


--
-- Name: material_contract_notification_states calendar_only_staff_block_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_delete ON public.material_contract_notification_states AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_calendar_only_staff()));


--
-- Name: notification_reads calendar_only_staff_block_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_delete ON public.notification_reads AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_calendar_only_staff()));


--
-- Name: organization_categories calendar_only_staff_block_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_delete ON public.organization_categories AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_calendar_only_staff()));


--
-- Name: organizations calendar_only_staff_block_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_delete ON public.organizations AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_calendar_only_staff()));


--
-- Name: personal_notes calendar_only_staff_block_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_delete ON public.personal_notes AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_calendar_only_staff()));


--
-- Name: process_types calendar_only_staff_block_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_delete ON public.process_types AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_calendar_only_staff()));


--
-- Name: project_assembly_vendors calendar_only_staff_block_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_delete ON public.project_assembly_vendors AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_calendar_only_staff()));


--
-- Name: project_contract_entries calendar_only_staff_block_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_delete ON public.project_contract_entries AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_calendar_only_staff()));


--
-- Name: project_cost_categories calendar_only_staff_block_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_delete ON public.project_cost_categories AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_calendar_only_staff()));


--
-- Name: project_cost_entries calendar_only_staff_block_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_delete ON public.project_cost_entries AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_calendar_only_staff()));


--
-- Name: project_files calendar_only_staff_block_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_delete ON public.project_files AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_calendar_only_staff()));


--
-- Name: project_material_usages calendar_only_staff_block_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_delete ON public.project_material_usages AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_calendar_only_staff()));


--
-- Name: project_schedule_memos calendar_only_staff_block_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_delete ON public.project_schedule_memos AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_calendar_only_staff()));


--
-- Name: project_sections calendar_only_staff_block_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_delete ON public.project_sections AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_calendar_only_staff()));


--
-- Name: projects calendar_only_staff_block_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_delete ON public.projects AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_calendar_only_staff()));


--
-- Name: raw_material_contracts calendar_only_staff_block_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_delete ON public.raw_material_contracts AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_calendar_only_staff()));


--
-- Name: reference_tasks calendar_only_staff_block_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_delete ON public.reference_tasks AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_calendar_only_staff()));


--
-- Name: rls_policy_backups calendar_only_staff_block_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_delete ON public.rls_policy_backups AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_calendar_only_staff()));


--
-- Name: share_invitations calendar_only_staff_block_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_delete ON public.share_invitations AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_calendar_only_staff()));


--
-- Name: shared_comment_mentions calendar_only_staff_block_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_delete ON public.shared_comment_mentions AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_calendar_only_staff()));


--
-- Name: shared_comment_reads calendar_only_staff_block_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_delete ON public.shared_comment_reads AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_calendar_only_staff()));


--
-- Name: shared_comments calendar_only_staff_block_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_delete ON public.shared_comments AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_calendar_only_staff()));


--
-- Name: shared_item_members calendar_only_staff_block_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_delete ON public.shared_item_members AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_calendar_only_staff()));


--
-- Name: shared_items calendar_only_staff_block_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_delete ON public.shared_items AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_calendar_only_staff()));


--
-- Name: shipments calendar_only_staff_block_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_delete ON public.shipments AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_calendar_only_staff()));


--
-- Name: suppliers calendar_only_staff_block_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_delete ON public.suppliers AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_calendar_only_staff()));


--
-- Name: task_dependencies calendar_only_staff_block_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_delete ON public.task_dependencies AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_calendar_only_staff()));


--
-- Name: task_notes calendar_only_staff_block_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_delete ON public.task_notes AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_calendar_only_staff()));


--
-- Name: task_schedule_memos calendar_only_staff_block_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_delete ON public.task_schedule_memos AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_calendar_only_staff()));


--
-- Name: task_tags calendar_only_staff_block_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_delete ON public.task_tags AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_calendar_only_staff()));


--
-- Name: task_templates calendar_only_staff_block_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_delete ON public.task_templates AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_calendar_only_staff()));


--
-- Name: tasks calendar_only_staff_block_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_delete ON public.tasks AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_calendar_only_staff()));


--
-- Name: activity_logs calendar_only_staff_block_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_insert ON public.activity_logs AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: app_settings calendar_only_staff_block_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_insert ON public.app_settings AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: dashboard_preferences calendar_only_staff_block_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_insert ON public.dashboard_preferences AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: editing_locks calendar_only_staff_block_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_insert ON public.editing_locks AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: employees calendar_only_staff_block_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_insert ON public.employees AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: exchange_rate_sync_runs calendar_only_staff_block_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_insert ON public.exchange_rate_sync_runs AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: exchange_rates calendar_only_staff_block_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_insert ON public.exchange_rates AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: lme_import_logs calendar_only_staff_block_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_insert ON public.lme_import_logs AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: lme_market_kpi_cache calendar_only_staff_block_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_insert ON public.lme_market_kpi_cache AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: lme_market_prices calendar_only_staff_block_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_insert ON public.lme_market_prices AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: lme_materials calendar_only_staff_block_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_insert ON public.lme_materials AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: lme_price_records calendar_only_staff_block_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_insert ON public.lme_price_records AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: lme_status_thresholds calendar_only_staff_block_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_insert ON public.lme_status_thresholds AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: lme_sync_runs calendar_only_staff_block_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_insert ON public.lme_sync_runs AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: material_contract_allocations calendar_only_staff_block_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_insert ON public.material_contract_allocations AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: material_contract_notification_events calendar_only_staff_block_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_insert ON public.material_contract_notification_events AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: material_contract_notification_states calendar_only_staff_block_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_insert ON public.material_contract_notification_states AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: notification_reads calendar_only_staff_block_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_insert ON public.notification_reads AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: organization_categories calendar_only_staff_block_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_insert ON public.organization_categories AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: organizations calendar_only_staff_block_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_insert ON public.organizations AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: personal_notes calendar_only_staff_block_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_insert ON public.personal_notes AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: process_types calendar_only_staff_block_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_insert ON public.process_types AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: project_assembly_vendors calendar_only_staff_block_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_insert ON public.project_assembly_vendors AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: project_contract_entries calendar_only_staff_block_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_insert ON public.project_contract_entries AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: project_cost_categories calendar_only_staff_block_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_insert ON public.project_cost_categories AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: project_cost_entries calendar_only_staff_block_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_insert ON public.project_cost_entries AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: project_files calendar_only_staff_block_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_insert ON public.project_files AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: project_material_usages calendar_only_staff_block_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_insert ON public.project_material_usages AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: project_schedule_memos calendar_only_staff_block_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_insert ON public.project_schedule_memos AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: project_sections calendar_only_staff_block_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_insert ON public.project_sections AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: projects calendar_only_staff_block_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_insert ON public.projects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: raw_material_contracts calendar_only_staff_block_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_insert ON public.raw_material_contracts AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: reference_tasks calendar_only_staff_block_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_insert ON public.reference_tasks AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: rls_policy_backups calendar_only_staff_block_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_insert ON public.rls_policy_backups AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: share_invitations calendar_only_staff_block_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_insert ON public.share_invitations AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: shared_comment_mentions calendar_only_staff_block_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_insert ON public.shared_comment_mentions AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: shared_comment_reads calendar_only_staff_block_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_insert ON public.shared_comment_reads AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: shared_comments calendar_only_staff_block_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_insert ON public.shared_comments AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: shared_item_members calendar_only_staff_block_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_insert ON public.shared_item_members AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: shared_items calendar_only_staff_block_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_insert ON public.shared_items AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: shipments calendar_only_staff_block_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_insert ON public.shipments AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: suppliers calendar_only_staff_block_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_insert ON public.suppliers AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: task_dependencies calendar_only_staff_block_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_insert ON public.task_dependencies AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: task_notes calendar_only_staff_block_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_insert ON public.task_notes AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: task_schedule_memos calendar_only_staff_block_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_insert ON public.task_schedule_memos AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: task_tags calendar_only_staff_block_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_insert ON public.task_tags AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: task_templates calendar_only_staff_block_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_insert ON public.task_templates AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: tasks calendar_only_staff_block_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_insert ON public.tasks AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: activity_logs calendar_only_staff_block_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_update ON public.activity_logs AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_calendar_only_staff())) WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: app_settings calendar_only_staff_block_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_update ON public.app_settings AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_calendar_only_staff())) WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: dashboard_preferences calendar_only_staff_block_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_update ON public.dashboard_preferences AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_calendar_only_staff())) WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: editing_locks calendar_only_staff_block_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_update ON public.editing_locks AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_calendar_only_staff())) WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: employees calendar_only_staff_block_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_update ON public.employees AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_calendar_only_staff())) WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: exchange_rate_sync_runs calendar_only_staff_block_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_update ON public.exchange_rate_sync_runs AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_calendar_only_staff())) WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: exchange_rates calendar_only_staff_block_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_update ON public.exchange_rates AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_calendar_only_staff())) WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: lme_import_logs calendar_only_staff_block_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_update ON public.lme_import_logs AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_calendar_only_staff())) WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: lme_market_kpi_cache calendar_only_staff_block_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_update ON public.lme_market_kpi_cache AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_calendar_only_staff())) WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: lme_market_prices calendar_only_staff_block_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_update ON public.lme_market_prices AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_calendar_only_staff())) WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: lme_materials calendar_only_staff_block_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_update ON public.lme_materials AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_calendar_only_staff())) WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: lme_price_records calendar_only_staff_block_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_update ON public.lme_price_records AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_calendar_only_staff())) WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: lme_status_thresholds calendar_only_staff_block_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_update ON public.lme_status_thresholds AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_calendar_only_staff())) WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: lme_sync_runs calendar_only_staff_block_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_update ON public.lme_sync_runs AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_calendar_only_staff())) WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: material_contract_allocations calendar_only_staff_block_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_update ON public.material_contract_allocations AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_calendar_only_staff())) WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: material_contract_notification_events calendar_only_staff_block_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_update ON public.material_contract_notification_events AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_calendar_only_staff())) WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: material_contract_notification_states calendar_only_staff_block_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_update ON public.material_contract_notification_states AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_calendar_only_staff())) WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: notification_reads calendar_only_staff_block_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_update ON public.notification_reads AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_calendar_only_staff())) WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: organization_categories calendar_only_staff_block_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_update ON public.organization_categories AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_calendar_only_staff())) WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: organizations calendar_only_staff_block_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_update ON public.organizations AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_calendar_only_staff())) WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: personal_notes calendar_only_staff_block_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_update ON public.personal_notes AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_calendar_only_staff())) WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: process_types calendar_only_staff_block_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_update ON public.process_types AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_calendar_only_staff())) WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: project_assembly_vendors calendar_only_staff_block_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_update ON public.project_assembly_vendors AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_calendar_only_staff())) WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: project_contract_entries calendar_only_staff_block_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_update ON public.project_contract_entries AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_calendar_only_staff())) WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: project_cost_categories calendar_only_staff_block_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_update ON public.project_cost_categories AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_calendar_only_staff())) WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: project_cost_entries calendar_only_staff_block_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_update ON public.project_cost_entries AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_calendar_only_staff())) WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: project_files calendar_only_staff_block_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_update ON public.project_files AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_calendar_only_staff())) WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: project_material_usages calendar_only_staff_block_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_update ON public.project_material_usages AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_calendar_only_staff())) WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: project_schedule_memos calendar_only_staff_block_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_update ON public.project_schedule_memos AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_calendar_only_staff())) WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: project_sections calendar_only_staff_block_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_update ON public.project_sections AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_calendar_only_staff())) WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: projects calendar_only_staff_block_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_update ON public.projects AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_calendar_only_staff())) WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: raw_material_contracts calendar_only_staff_block_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_update ON public.raw_material_contracts AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_calendar_only_staff())) WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: reference_tasks calendar_only_staff_block_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_update ON public.reference_tasks AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_calendar_only_staff())) WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: rls_policy_backups calendar_only_staff_block_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_update ON public.rls_policy_backups AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_calendar_only_staff())) WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: share_invitations calendar_only_staff_block_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_update ON public.share_invitations AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_calendar_only_staff())) WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: shared_comment_mentions calendar_only_staff_block_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_update ON public.shared_comment_mentions AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_calendar_only_staff())) WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: shared_comment_reads calendar_only_staff_block_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_update ON public.shared_comment_reads AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_calendar_only_staff())) WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: shared_comments calendar_only_staff_block_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_update ON public.shared_comments AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_calendar_only_staff())) WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: shared_item_members calendar_only_staff_block_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_update ON public.shared_item_members AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_calendar_only_staff())) WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: shared_items calendar_only_staff_block_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_update ON public.shared_items AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_calendar_only_staff())) WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: shipments calendar_only_staff_block_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_update ON public.shipments AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_calendar_only_staff())) WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: suppliers calendar_only_staff_block_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_update ON public.suppliers AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_calendar_only_staff())) WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: task_dependencies calendar_only_staff_block_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_update ON public.task_dependencies AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_calendar_only_staff())) WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: task_notes calendar_only_staff_block_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_update ON public.task_notes AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_calendar_only_staff())) WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: task_schedule_memos calendar_only_staff_block_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_update ON public.task_schedule_memos AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_calendar_only_staff())) WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: task_tags calendar_only_staff_block_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_update ON public.task_tags AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_calendar_only_staff())) WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: task_templates calendar_only_staff_block_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_update ON public.task_templates AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_calendar_only_staff())) WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: tasks calendar_only_staff_block_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_only_staff_block_update ON public.tasks AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_calendar_only_staff())) WITH CHECK ((NOT public.is_calendar_only_staff()));


--
-- Name: coating_cost_allocations coating_allocations_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coating_allocations_read ON public.coating_cost_allocations FOR SELECT TO authenticated USING (public.is_approved_erp_user());


--
-- Name: coating_cost_allocation_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.coating_cost_allocation_history ENABLE ROW LEVEL SECURITY;

--
-- Name: coating_cost_allocations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.coating_cost_allocations ENABLE ROW LEVEL SECURITY;

--
-- Name: coating_cost_statements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.coating_cost_statements ENABLE ROW LEVEL SECURITY;

--
-- Name: coating_cost_allocation_history coating_history_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coating_history_read ON public.coating_cost_allocation_history FOR SELECT TO authenticated USING (public.is_approved_erp_user());


--
-- Name: coating_cost_statements coating_statements_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coating_statements_read ON public.coating_cost_statements FOR SELECT TO authenticated USING (public.is_approved_erp_user());


--
-- Name: dashboard_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dashboard_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: dashboard_preferences dashboard_preferences_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dashboard_preferences_delete_own ON public.dashboard_preferences FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = dashboard_preferences.employee_id) AND (e.auth_user_id = auth.uid()) AND (e.active IS TRUE) AND (e.approval_status = 'approved'::text)))));


--
-- Name: dashboard_preferences dashboard_preferences_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dashboard_preferences_insert_own ON public.dashboard_preferences FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = dashboard_preferences.employee_id) AND (e.auth_user_id = auth.uid()) AND (e.active IS TRUE) AND (e.approval_status = 'approved'::text)))));


--
-- Name: dashboard_preferences dashboard_preferences_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dashboard_preferences_select_own ON public.dashboard_preferences FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = dashboard_preferences.employee_id) AND (e.auth_user_id = auth.uid()) AND (e.active IS TRUE) AND (e.approval_status = 'approved'::text)))));


--
-- Name: dashboard_preferences dashboard_preferences_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dashboard_preferences_update_own ON public.dashboard_preferences FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = dashboard_preferences.employee_id) AND (e.auth_user_id = auth.uid()) AND (e.active IS TRUE) AND (e.approval_status = 'approved'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = dashboard_preferences.employee_id) AND (e.auth_user_id = auth.uid()) AND (e.active IS TRUE) AND (e.approval_status = 'approved'::text)))));


--
-- Name: editing_locks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.editing_locks ENABLE ROW LEVEL SECURITY;

--
-- Name: employees; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

--
-- Name: employees employees select policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "employees select policy" ON public.employees FOR SELECT TO authenticated USING (((auth.uid() = auth_user_id) OR public.is_approved_admin()));


--
-- Name: employees employees_insert_approved_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employees_insert_approved_admin ON public.employees FOR INSERT TO authenticated WITH CHECK (public.is_approved_admin());


--
-- Name: employees employees_select_active_approved; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employees_select_active_approved ON public.employees FOR SELECT TO authenticated USING (((active IS TRUE) AND (approval_status = 'approved'::text)));


--
-- Name: employees employees_select_approved_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employees_select_approved_admin ON public.employees FOR SELECT TO authenticated USING (public.is_approved_admin());


--
-- Name: employees employees_update_approved_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employees_update_approved_admin ON public.employees FOR UPDATE TO authenticated USING (public.is_approved_admin()) WITH CHECK (public.is_approved_admin());


--
-- Name: exchange_rate_sync_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exchange_rate_sync_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: exchange_rate_sync_runs exchange_rate_sync_runs_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY exchange_rate_sync_runs_select_admin ON public.exchange_rate_sync_runs FOR SELECT TO authenticated USING (public.is_approved_admin());


--
-- Name: exchange_rates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;

--
-- Name: exchange_rates exchange_rates_select_approved; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY exchange_rates_select_approved ON public.exchange_rates FOR SELECT TO authenticated USING (public.is_approved_erp_user());


--
-- Name: glass_cost_allocations glass_allocations_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY glass_allocations_read ON public.glass_cost_allocations FOR SELECT TO authenticated USING (public.is_approved_erp_user());


--
-- Name: glass_cost_allocation_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.glass_cost_allocation_history ENABLE ROW LEVEL SECURITY;

--
-- Name: glass_cost_allocations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.glass_cost_allocations ENABLE ROW LEVEL SECURITY;

--
-- Name: glass_cost_statements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.glass_cost_statements ENABLE ROW LEVEL SECURITY;

--
-- Name: glass_cost_allocation_history glass_history_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY glass_history_read ON public.glass_cost_allocation_history FOR SELECT TO authenticated USING (public.is_approved_erp_user());


--
-- Name: glass_cost_statements glass_statements_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY glass_statements_read ON public.glass_cost_statements FOR SELECT TO authenticated USING (public.is_approved_erp_user());


--
-- Name: lme_import_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lme_import_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: lme_import_logs lme_import_logs_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lme_import_logs_insert_admin ON public.lme_import_logs FOR INSERT TO authenticated WITH CHECK ((public.is_approved_admin() AND (created_by = auth.uid())));


--
-- Name: lme_import_logs lme_import_logs_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lme_import_logs_select_admin ON public.lme_import_logs FOR SELECT TO authenticated USING (public.is_approved_admin());


--
-- Name: lme_market_kpi_cache; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lme_market_kpi_cache ENABLE ROW LEVEL SECURITY;

--
-- Name: lme_market_kpi_cache lme_market_kpi_cache_select_approved; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lme_market_kpi_cache_select_approved ON public.lme_market_kpi_cache FOR SELECT TO authenticated USING (public.is_approved_erp_user());


--
-- Name: lme_market_prices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lme_market_prices ENABLE ROW LEVEL SECURITY;

--
-- Name: lme_market_prices lme_market_prices_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lme_market_prices_insert_admin ON public.lme_market_prices FOR INSERT TO authenticated WITH CHECK ((public.is_approved_admin() AND (created_by = auth.uid())));


--
-- Name: lme_market_prices lme_market_prices_select_approved; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lme_market_prices_select_approved ON public.lme_market_prices FOR SELECT TO authenticated USING (public.is_approved_erp_user());


--
-- Name: lme_materials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lme_materials ENABLE ROW LEVEL SECURITY;

--
-- Name: lme_materials lme_materials_select_approved; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lme_materials_select_approved ON public.lme_materials FOR SELECT TO authenticated USING (public.is_approved_erp_user());


--
-- Name: lme_price_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lme_price_records ENABLE ROW LEVEL SECURITY;

--
-- Name: lme_price_records lme_records_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lme_records_delete_admin ON public.lme_price_records FOR DELETE TO authenticated USING (public.is_approved_admin());


--
-- Name: lme_price_records lme_records_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lme_records_insert_admin ON public.lme_price_records FOR INSERT TO authenticated WITH CHECK ((public.is_approved_admin() AND (created_by = auth.uid())));


--
-- Name: lme_price_records lme_records_select_approved; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lme_records_select_approved ON public.lme_price_records FOR SELECT TO authenticated USING (public.is_approved_erp_user());


--
-- Name: lme_status_thresholds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lme_status_thresholds ENABLE ROW LEVEL SECURITY;

--
-- Name: lme_sync_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lme_sync_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: lme_sync_runs lme_sync_runs_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lme_sync_runs_insert_admin ON public.lme_sync_runs FOR INSERT TO authenticated WITH CHECK ((public.is_approved_admin() AND (created_by = auth.uid())));


--
-- Name: lme_sync_runs lme_sync_runs_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lme_sync_runs_select_admin ON public.lme_sync_runs FOR SELECT TO authenticated USING (public.is_approved_admin());


--
-- Name: lme_sync_runs lme_sync_runs_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lme_sync_runs_update_admin ON public.lme_sync_runs FOR UPDATE TO authenticated USING (public.is_approved_admin()) WITH CHECK (public.is_approved_admin());


--
-- Name: lme_status_thresholds lme_thresholds_select_approved; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lme_thresholds_select_approved ON public.lme_status_thresholds FOR SELECT TO authenticated USING (public.is_approved_erp_user());


--
-- Name: lme_status_thresholds lme_thresholds_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lme_thresholds_update_admin ON public.lme_status_thresholds FOR UPDATE TO authenticated USING (public.is_approved_admin()) WITH CHECK (public.is_approved_admin());


--
-- Name: material_contract_allocations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.material_contract_allocations ENABLE ROW LEVEL SECURITY;

--
-- Name: material_contract_allocations material_contract_allocations_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY material_contract_allocations_insert_admin ON public.material_contract_allocations FOR INSERT TO authenticated WITH CHECK ((public.is_approved_admin() AND (created_by = auth.uid())));


--
-- Name: material_contract_allocations material_contract_allocations_select_approved; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY material_contract_allocations_select_approved ON public.material_contract_allocations FOR SELECT TO authenticated USING (public.is_approved_erp_user());


--
-- Name: material_contract_allocations material_contract_allocations_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY material_contract_allocations_update_admin ON public.material_contract_allocations FOR UPDATE TO authenticated USING (public.is_approved_admin()) WITH CHECK ((public.is_approved_admin() AND (created_by = auth.uid())));


--
-- Name: material_contract_notification_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.material_contract_notification_events ENABLE ROW LEVEL SECURITY;

--
-- Name: material_contract_notification_events material_contract_notification_events_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY material_contract_notification_events_admin_select ON public.material_contract_notification_events FOR SELECT TO authenticated USING (public.is_approved_admin());


--
-- Name: material_contract_notification_states; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.material_contract_notification_states ENABLE ROW LEVEL SECURITY;

--
-- Name: material_usage_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.material_usage_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: material_usage_groups material_usage_groups_select_approved; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY material_usage_groups_select_approved ON public.material_usage_groups FOR SELECT TO authenticated USING (public.is_approved_erp_user());


--
-- Name: material_usage_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.material_usage_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: material_usage_requests material_usage_requests_select_approved; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY material_usage_requests_select_approved ON public.material_usage_requests FOR SELECT TO authenticated USING (public.is_approved_erp_user());


--
-- Name: notification_reads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_reads notification_reads_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notification_reads_delete_own ON public.notification_reads FOR DELETE TO authenticated USING ((auth_user_id = auth.uid()));


--
-- Name: notification_reads notification_reads_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notification_reads_insert_own ON public.notification_reads FOR INSERT TO authenticated WITH CHECK ((auth_user_id = auth.uid()));


--
-- Name: notification_reads notification_reads_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notification_reads_select_own ON public.notification_reads FOR SELECT TO authenticated USING ((auth_user_id = auth.uid()));


--
-- Name: notification_reads notification_reads_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notification_reads_update_own ON public.notification_reads FOR UPDATE TO authenticated USING ((auth_user_id = auth.uid())) WITH CHECK ((auth_user_id = auth.uid()));


--
-- Name: organization_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_categories organization_categories_select_erp_user; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_categories_select_erp_user ON public.organization_categories FOR SELECT TO authenticated USING (public.is_approved_erp_user());


--
-- Name: organizations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

--
-- Name: organizations organizations_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organizations_insert_admin ON public.organizations FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.auth_user_id = auth.uid()) AND (e.role = 'admin'::text) AND (e.active = true) AND (e.approval_status = 'approved'::text)))));


--
-- Name: organizations organizations_insert_settings_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organizations_insert_settings_manager ON public.organizations FOR INSERT TO authenticated WITH CHECK (public.can_manage_settings());


--
-- Name: organizations organizations_select_erp_user; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organizations_select_erp_user ON public.organizations FOR SELECT TO authenticated USING (public.is_approved_erp_user());


--
-- Name: organizations organizations_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organizations_update_admin ON public.organizations FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.auth_user_id = auth.uid()) AND (e.role = 'admin'::text) AND (e.active = true) AND (e.approval_status = 'approved'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.auth_user_id = auth.uid()) AND (e.role = 'admin'::text) AND (e.active = true) AND (e.approval_status = 'approved'::text)))));


--
-- Name: organizations organizations_update_settings_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organizations_update_settings_manager ON public.organizations FOR UPDATE TO authenticated USING (public.can_manage_settings()) WITH CHECK (public.can_manage_settings());


--
-- Name: personal_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.personal_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: personal_notes personal_notes_delete_owner_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY personal_notes_delete_owner_only ON public.personal_notes FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: personal_notes personal_notes_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY personal_notes_insert_own ON public.personal_notes FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: personal_notes personal_notes_select_owner_or_member; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY personal_notes_select_owner_or_member ON public.personal_notes FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.can_view_shared_note(id)));


--
-- Name: personal_notes personal_notes_update_owner_or_editor; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY personal_notes_update_owner_or_editor ON public.personal_notes FOR UPDATE TO authenticated USING (((user_id = auth.uid()) OR public.can_edit_shared_note(id))) WITH CHECK (((user_id = auth.uid()) OR public.can_edit_shared_note(id)));


--
-- Name: process_types; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.process_types ENABLE ROW LEVEL SECURITY;

--
-- Name: process_types process_types_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY process_types_select_authenticated ON public.process_types FOR SELECT TO authenticated USING (true);


--
-- Name: project_accessory_usages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_accessory_usages ENABLE ROW LEVEL SECURITY;

--
-- Name: project_accessory_usages project_accessory_usages_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_accessory_usages_read ON public.project_accessory_usages FOR SELECT TO authenticated USING (public.is_approved_erp_user());


--
-- Name: project_assembly_vendors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_assembly_vendors ENABLE ROW LEVEL SECURITY;

--
-- Name: project_assembly_vendors project_assembly_vendors_select_approved; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_assembly_vendors_select_approved ON public.project_assembly_vendors FOR SELECT TO authenticated USING (public.is_approved_erp_user());


--
-- Name: project_contract_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_contract_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: project_contract_entries project_contract_entries_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_contract_entries_insert_admin ON public.project_contract_entries FOR INSERT TO authenticated WITH CHECK ((public.is_approved_admin() AND (created_by = auth.uid())));


--
-- Name: project_contract_entries project_contract_entries_select_approved; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_contract_entries_select_approved ON public.project_contract_entries FOR SELECT TO authenticated USING (public.is_approved_erp_user());


--
-- Name: project_contract_entries project_contract_entries_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_contract_entries_update_admin ON public.project_contract_entries FOR UPDATE TO authenticated USING (public.is_approved_admin()) WITH CHECK (public.is_approved_admin());


--
-- Name: project_cost_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_cost_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: project_cost_categories project_cost_categories_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_cost_categories_insert_admin ON public.project_cost_categories FOR INSERT TO authenticated WITH CHECK ((public.is_approved_admin() AND ((created_by = auth.uid()) OR (created_by IS NULL))));


--
-- Name: project_cost_categories project_cost_categories_select_approved; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_cost_categories_select_approved ON public.project_cost_categories FOR SELECT TO authenticated USING (public.is_approved_erp_user());


--
-- Name: project_cost_categories project_cost_categories_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_cost_categories_update_admin ON public.project_cost_categories FOR UPDATE TO authenticated USING (public.is_approved_admin()) WITH CHECK (public.is_approved_admin());


--
-- Name: project_cost_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_cost_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: project_cost_entries project_cost_entries_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_cost_entries_insert_admin ON public.project_cost_entries FOR INSERT TO authenticated WITH CHECK ((public.is_approved_admin() AND (created_by = auth.uid())));


--
-- Name: project_cost_entries project_cost_entries_select_approved; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_cost_entries_select_approved ON public.project_cost_entries FOR SELECT TO authenticated USING (public.is_approved_erp_user());


--
-- Name: project_cost_entries project_cost_entries_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_cost_entries_update_admin ON public.project_cost_entries FOR UPDATE TO authenticated USING (public.is_approved_admin()) WITH CHECK (public.is_approved_admin());


--
-- Name: project_cost_import_batches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_cost_import_batches ENABLE ROW LEVEL SECURITY;

--
-- Name: project_cost_import_batches project_cost_import_batches_select_approved; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_cost_import_batches_select_approved ON public.project_cost_import_batches FOR SELECT TO authenticated USING (public.is_approved_erp_user());


--
-- Name: project_files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;

--
-- Name: project_files project_files_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_files_delete_admin ON public.project_files FOR DELETE TO authenticated USING (( SELECT public.current_user_is_admin() AS current_user_is_admin));


--
-- Name: project_files project_files_insert_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_files_insert_authenticated ON public.project_files FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE (p.id = project_files.project_id))) AND (storage_path ~~ (('projects/'::text || (project_id)::text) || '/%'::text)) AND (lower(COALESCE(uploaded_by_email, ''::text)) = lower(COALESCE(( SELECT (auth.jwt() ->> 'email'::text)), ''::text)))));


--
-- Name: project_files project_files_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_files_select_authenticated ON public.project_files FOR SELECT TO authenticated USING (true);


--
-- Name: project_material_usages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_material_usages ENABLE ROW LEVEL SECURITY;

--
-- Name: project_material_usages project_material_usages_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_material_usages_insert_admin ON public.project_material_usages FOR INSERT TO authenticated WITH CHECK ((public.is_approved_admin() AND (created_by = auth.uid())));


--
-- Name: project_material_usages project_material_usages_select_approved; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_material_usages_select_approved ON public.project_material_usages FOR SELECT TO authenticated USING (public.is_approved_erp_user());


--
-- Name: project_material_usages project_material_usages_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_material_usages_update_admin ON public.project_material_usages FOR UPDATE TO authenticated USING (public.is_approved_admin()) WITH CHECK (public.is_approved_admin());


--
-- Name: project_schedule_memos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_schedule_memos ENABLE ROW LEVEL SECURITY;

--
-- Name: project_schedule_memos project_schedule_memos_delete_editor; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_schedule_memos_delete_editor ON public.project_schedule_memos FOR DELETE TO authenticated USING (public.can_edit_tasks());


--
-- Name: project_schedule_memos project_schedule_memos_insert_editor; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_schedule_memos_insert_editor ON public.project_schedule_memos FOR INSERT TO authenticated WITH CHECK (((created_by = auth.uid()) AND public.can_edit_tasks()));


--
-- Name: project_schedule_memos project_schedule_memos_select_erp_user; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_schedule_memos_select_erp_user ON public.project_schedule_memos FOR SELECT TO authenticated USING (public.is_approved_erp_user());


--
-- Name: project_schedule_memos project_schedule_memos_update_editor; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_schedule_memos_update_editor ON public.project_schedule_memos FOR UPDATE TO authenticated USING (public.can_edit_tasks()) WITH CHECK (public.can_edit_tasks());


--
-- Name: project_sections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_sections ENABLE ROW LEVEL SECURITY;

--
-- Name: project_sections project_sections_delete_project_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_sections_delete_project_manager ON public.project_sections FOR DELETE TO authenticated USING (public.can_manage_projects());


--
-- Name: project_sections project_sections_insert_project_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_sections_insert_project_manager ON public.project_sections FOR INSERT TO authenticated WITH CHECK (public.can_manage_projects());


--
-- Name: project_sections project_sections_select_erp_user; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_sections_select_erp_user ON public.project_sections FOR SELECT TO authenticated USING (public.is_approved_erp_user());


--
-- Name: project_sections project_sections_update_project_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_sections_update_project_manager ON public.project_sections FOR UPDATE TO authenticated USING (public.can_manage_projects()) WITH CHECK (public.can_manage_projects());


--
-- Name: projects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

--
-- Name: projects projects_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_delete_admin ON public.projects FOR DELETE TO authenticated USING (public.is_approved_admin());


--
-- Name: projects projects_insert_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_insert_manager ON public.projects FOR INSERT TO authenticated WITH CHECK (public.can_manage_projects());


--
-- Name: projects projects_select_erp_user; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_select_erp_user ON public.projects FOR SELECT TO authenticated USING (public.is_approved_erp_user());


--
-- Name: projects projects_update_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_update_manager ON public.projects FOR UPDATE TO authenticated USING (public.can_manage_projects()) WITH CHECK (public.can_manage_projects());


--
-- Name: raw_material_contracts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.raw_material_contracts ENABLE ROW LEVEL SECURITY;

--
-- Name: raw_material_contracts raw_material_contracts_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY raw_material_contracts_insert_admin ON public.raw_material_contracts FOR INSERT TO authenticated WITH CHECK ((public.is_approved_admin() AND (created_by = auth.uid())));


--
-- Name: raw_material_contracts raw_material_contracts_select_approved; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY raw_material_contracts_select_approved ON public.raw_material_contracts FOR SELECT TO authenticated USING (public.is_approved_erp_user());


--
-- Name: raw_material_contracts raw_material_contracts_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY raw_material_contracts_update_admin ON public.raw_material_contracts FOR UPDATE TO authenticated USING (public.is_approved_admin()) WITH CHECK (public.is_approved_admin());


--
-- Name: reference_tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reference_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: reference_tasks reference_tasks_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reference_tasks_select_own ON public.reference_tasks FOR SELECT TO authenticated USING ((assigned_to = public.sharing_current_employee_id()));


--
-- Name: rls_policy_backups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rls_policy_backups ENABLE ROW LEVEL SECURITY;

--
-- Name: share_invitations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.share_invitations ENABLE ROW LEVEL SECURITY;

--
-- Name: share_invitations share_invitations_select_related; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY share_invitations_select_related ON public.share_invitations FOR SELECT TO authenticated USING (((inviter_id = public.sharing_current_employee_id()) OR (invitee_id = public.sharing_current_employee_id())));


--
-- Name: shared_comment_mentions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shared_comment_mentions ENABLE ROW LEVEL SECURITY;

--
-- Name: shared_comment_mentions shared_comment_mentions_select_participant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shared_comment_mentions_select_participant ON public.shared_comment_mentions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.shared_comments comment
  WHERE ((comment.id = shared_comment_mentions.comment_id) AND public.can_comment_shared_item(comment.shared_item_id)))));


--
-- Name: shared_comment_reads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shared_comment_reads ENABLE ROW LEVEL SECURITY;

--
-- Name: shared_comment_reads shared_comment_reads_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shared_comment_reads_select_own ON public.shared_comment_reads FOR SELECT TO authenticated USING (((employee_id = public.sharing_current_employee_id()) AND public.can_comment_shared_item(shared_item_id)));


--
-- Name: shared_comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shared_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: shared_comments shared_comments_delete_author_or_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shared_comments_delete_author_or_owner ON public.shared_comments FOR DELETE TO authenticated USING (((author_id = public.sharing_current_employee_id()) OR (EXISTS ( SELECT 1
   FROM public.shared_items
  WHERE ((shared_items.id = shared_comments.shared_item_id) AND (shared_items.owner_id = public.sharing_current_employee_id()))))));


--
-- Name: shared_comments shared_comments_insert_participant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shared_comments_insert_participant ON public.shared_comments FOR INSERT TO authenticated WITH CHECK (((author_id = public.sharing_current_employee_id()) AND public.can_comment_shared_item(shared_item_id)));


--
-- Name: shared_comments shared_comments_select_participant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shared_comments_select_participant ON public.shared_comments FOR SELECT TO authenticated USING (public.can_comment_shared_item(shared_item_id));


--
-- Name: shared_comments shared_comments_update_author; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shared_comments_update_author ON public.shared_comments FOR UPDATE TO authenticated USING (((author_id = public.sharing_current_employee_id()) AND public.can_comment_shared_item(shared_item_id))) WITH CHECK (((author_id = public.sharing_current_employee_id()) AND public.can_comment_shared_item(shared_item_id)));


--
-- Name: shared_item_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shared_item_members ENABLE ROW LEVEL SECURITY;

--
-- Name: shared_item_members shared_item_members_select_related; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shared_item_members_select_related ON public.shared_item_members FOR SELECT TO authenticated USING (public.sharing_can_access_item(shared_item_id));


--
-- Name: shared_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shared_items ENABLE ROW LEVEL SECURITY;

--
-- Name: shared_items shared_items_select_related; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shared_items_select_related ON public.shared_items FOR SELECT TO authenticated USING (public.sharing_can_access_item(id));


--
-- Name: shipments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;

--
-- Name: shipments shipments_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shipments_delete_admin ON public.shipments FOR DELETE TO authenticated USING (public.is_approved_admin());


--
-- Name: shipments shipments_insert_editor; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shipments_insert_editor ON public.shipments FOR INSERT TO authenticated WITH CHECK (public.can_edit_tasks());


--
-- Name: shipments shipments_select_erp_user; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shipments_select_erp_user ON public.shipments FOR SELECT TO authenticated USING (public.is_approved_erp_user());


--
-- Name: shipments shipments_update_editor; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shipments_update_editor ON public.shipments FOR UPDATE TO authenticated USING (public.can_edit_tasks()) WITH CHECK (public.can_edit_tasks());


--
-- Name: employees signup employees insert own pending row; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "signup employees insert own pending row" ON public.employees FOR INSERT TO authenticated WITH CHECK (((auth.uid() = auth_user_id) AND (approval_status = 'pending'::text) AND (active IS FALSE) AND (role IS NULL)));


--
-- Name: suppliers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

--
-- Name: suppliers suppliers_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY suppliers_insert_admin ON public.suppliers FOR INSERT TO authenticated WITH CHECK (public.is_approved_admin());


--
-- Name: suppliers suppliers_select_approved; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY suppliers_select_approved ON public.suppliers FOR SELECT TO authenticated USING (public.is_approved_erp_user());


--
-- Name: suppliers suppliers_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY suppliers_update_admin ON public.suppliers FOR UPDATE TO authenticated USING (public.is_approved_admin()) WITH CHECK (public.is_approved_admin());


--
-- Name: task_dependencies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.task_dependencies ENABLE ROW LEVEL SECURITY;

--
-- Name: task_dependencies task_dependencies_delete_editor; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY task_dependencies_delete_editor ON public.task_dependencies FOR DELETE TO authenticated USING (public.can_edit_tasks());


--
-- Name: task_dependencies task_dependencies_insert_editor; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY task_dependencies_insert_editor ON public.task_dependencies FOR INSERT TO authenticated WITH CHECK (((created_by = auth.uid()) AND public.can_edit_tasks()));


--
-- Name: task_dependencies task_dependencies_select_erp_user; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY task_dependencies_select_erp_user ON public.task_dependencies FOR SELECT TO authenticated USING (public.is_approved_erp_user());


--
-- Name: task_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.task_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: task_notes task_notes_delete_owner_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY task_notes_delete_owner_or_admin ON public.task_notes FOR DELETE TO authenticated USING ((public.is_approved_admin() OR ((created_by = auth.uid()) AND public.can_edit_tasks())));


--
-- Name: task_notes task_notes_insert_editor; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY task_notes_insert_editor ON public.task_notes FOR INSERT TO authenticated WITH CHECK (((created_by = auth.uid()) AND public.can_edit_tasks()));


--
-- Name: task_notes task_notes_select_erp_user; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY task_notes_select_erp_user ON public.task_notes FOR SELECT TO authenticated USING (public.is_approved_erp_user());


--
-- Name: task_notes task_notes_update_owner_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY task_notes_update_owner_or_admin ON public.task_notes FOR UPDATE TO authenticated USING ((public.is_approved_admin() OR ((created_by = auth.uid()) AND public.can_edit_tasks()))) WITH CHECK ((public.is_approved_admin() OR ((created_by = auth.uid()) AND public.can_edit_tasks())));


--
-- Name: task_schedule_memos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.task_schedule_memos ENABLE ROW LEVEL SECURITY;

--
-- Name: task_schedule_memos task_schedule_memos_delete_editor; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY task_schedule_memos_delete_editor ON public.task_schedule_memos FOR DELETE TO authenticated USING (public.can_edit_tasks());


--
-- Name: task_schedule_memos task_schedule_memos_insert_editor; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY task_schedule_memos_insert_editor ON public.task_schedule_memos FOR INSERT TO authenticated WITH CHECK (((created_by = auth.uid()) AND public.can_edit_tasks()));


--
-- Name: task_schedule_memos task_schedule_memos_select_erp_user; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY task_schedule_memos_select_erp_user ON public.task_schedule_memos FOR SELECT TO authenticated USING (public.is_approved_erp_user());


--
-- Name: task_schedule_memos task_schedule_memos_update_editor; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY task_schedule_memos_update_editor ON public.task_schedule_memos FOR UPDATE TO authenticated USING (public.can_edit_tasks()) WITH CHECK (public.can_edit_tasks());


--
-- Name: task_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.task_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: task_tags task_tags_delete_editor; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY task_tags_delete_editor ON public.task_tags FOR DELETE TO authenticated USING (public.can_edit_tasks());


--
-- Name: task_tags task_tags_insert_editor; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY task_tags_insert_editor ON public.task_tags FOR INSERT TO authenticated WITH CHECK (((created_by = auth.uid()) AND public.can_edit_tasks()));


--
-- Name: task_tags task_tags_select_erp_user; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY task_tags_select_erp_user ON public.task_tags FOR SELECT TO authenticated USING (public.is_approved_erp_user());


--
-- Name: task_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.task_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: task_templates task_templates_insert_settings_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY task_templates_insert_settings_manager ON public.task_templates FOR INSERT TO authenticated WITH CHECK (public.can_manage_settings());


--
-- Name: task_templates task_templates_select_erp_user; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY task_templates_select_erp_user ON public.task_templates FOR SELECT TO authenticated USING (public.is_approved_erp_user());


--
-- Name: task_templates task_templates_update_settings_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY task_templates_update_settings_manager ON public.task_templates FOR UPDATE TO authenticated USING (public.can_manage_settings()) WITH CHECK (public.can_manage_settings());


--
-- Name: tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: tasks tasks_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tasks_delete_admin ON public.tasks FOR DELETE TO authenticated USING (public.is_approved_admin());


--
-- Name: tasks tasks_insert_editor; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tasks_insert_editor ON public.tasks FOR INSERT TO authenticated WITH CHECK (public.can_edit_tasks());


--
-- Name: tasks tasks_select_erp_user; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tasks_select_erp_user ON public.tasks FOR SELECT TO authenticated USING (public.is_approved_erp_user());


--
-- Name: tasks tasks_update_editor; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tasks_update_editor ON public.tasks FOR UPDATE TO authenticated USING (public.can_edit_tasks()) WITH CHECK (public.can_edit_tasks());


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION accept_all_share_invitations(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.accept_all_share_invitations() FROM PUBLIC;
GRANT ALL ON FUNCTION public.accept_all_share_invitations() TO authenticated;
GRANT ALL ON FUNCTION public.accept_all_share_invitations() TO service_role;


--
-- Name: FUNCTION acquire_editing_lock(p_resource_type text, p_resource_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.acquire_editing_lock(p_resource_type text, p_resource_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.acquire_editing_lock(p_resource_type text, p_resource_id text) TO anon;
GRANT ALL ON FUNCTION public.acquire_editing_lock(p_resource_type text, p_resource_id text) TO authenticated;
GRANT ALL ON FUNCTION public.acquire_editing_lock(p_resource_type text, p_resource_id text) TO service_role;


--
-- Name: TABLE material_contract_allocations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.material_contract_allocations TO service_role;
GRANT SELECT,INSERT,UPDATE ON TABLE public.material_contract_allocations TO authenticated;


--
-- Name: FUNCTION allocate_material_usage_request(p_usage_request_id uuid, p_contract_id uuid, p_quantity_tons numeric, p_status text, p_expected_available numeric); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.allocate_material_usage_request(p_usage_request_id uuid, p_contract_id uuid, p_quantity_tons numeric, p_status text, p_expected_available numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION public.allocate_material_usage_request(p_usage_request_id uuid, p_contract_id uuid, p_quantity_tons numeric, p_status text, p_expected_available numeric) TO authenticated;
GRANT ALL ON FUNCTION public.allocate_material_usage_request(p_usage_request_id uuid, p_contract_id uuid, p_quantity_tons numeric, p_status text, p_expected_available numeric) TO service_role;


--
-- Name: FUNCTION archive_material_usage_group(p_group_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.archive_material_usage_group(p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.archive_material_usage_group(p_group_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.archive_material_usage_group(p_group_id uuid) TO service_role;


--
-- Name: FUNCTION assert_accessory_vendor(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.assert_accessory_vendor() TO anon;
GRANT ALL ON FUNCTION public.assert_accessory_vendor() TO authenticated;
GRANT ALL ON FUNCTION public.assert_accessory_vendor() TO service_role;


--
-- Name: FUNCTION assert_coating_vendor(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.assert_coating_vendor() TO anon;
GRANT ALL ON FUNCTION public.assert_coating_vendor() TO authenticated;
GRANT ALL ON FUNCTION public.assert_coating_vendor() TO service_role;


--
-- Name: FUNCTION assert_editing_lock_permission(p_resource_type text, p_resource_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.assert_editing_lock_permission(p_resource_type text, p_resource_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.assert_editing_lock_permission(p_resource_type text, p_resource_id text) TO anon;
GRANT ALL ON FUNCTION public.assert_editing_lock_permission(p_resource_type text, p_resource_id text) TO authenticated;
GRANT ALL ON FUNCTION public.assert_editing_lock_permission(p_resource_type text, p_resource_id text) TO service_role;


--
-- Name: FUNCTION assert_glass_vendor(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.assert_glass_vendor() TO anon;
GRANT ALL ON FUNCTION public.assert_glass_vendor() TO authenticated;
GRANT ALL ON FUNCTION public.assert_glass_vendor() TO service_role;


--
-- Name: FUNCTION assert_project_assembly_organization(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.assert_project_assembly_organization() TO anon;
GRANT ALL ON FUNCTION public.assert_project_assembly_organization() TO authenticated;
GRANT ALL ON FUNCTION public.assert_project_assembly_organization() TO service_role;


--
-- Name: FUNCTION assert_supplier_organization(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.assert_supplier_organization() TO anon;
GRANT ALL ON FUNCTION public.assert_supplier_organization() TO authenticated;
GRANT ALL ON FUNCTION public.assert_supplier_organization() TO service_role;


--
-- Name: FUNCTION assert_valid_assembly_vendor_ids(p_vendor_ids bigint[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.assert_valid_assembly_vendor_ids(p_vendor_ids bigint[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.assert_valid_assembly_vendor_ids(p_vendor_ids bigint[]) TO service_role;


--
-- Name: FUNCTION calculate_lme_market_price(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.calculate_lme_market_price() TO anon;
GRANT ALL ON FUNCTION public.calculate_lme_market_price() TO authenticated;
GRANT ALL ON FUNCTION public.calculate_lme_market_price() TO service_role;


--
-- Name: FUNCTION calculate_lme_price_record(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.calculate_lme_price_record() TO anon;
GRANT ALL ON FUNCTION public.calculate_lme_price_record() TO authenticated;
GRANT ALL ON FUNCTION public.calculate_lme_price_record() TO service_role;


--
-- Name: FUNCTION can_comment_shared_item(p_shared_item_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.can_comment_shared_item(p_shared_item_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_comment_shared_item(p_shared_item_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_comment_shared_item(p_shared_item_id uuid) TO service_role;


--
-- Name: FUNCTION can_edit_shared_note(note_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.can_edit_shared_note(note_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_edit_shared_note(note_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_edit_shared_note(note_id uuid) TO service_role;


--
-- Name: FUNCTION can_edit_tasks(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.can_edit_tasks() FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_edit_tasks() TO authenticated;
GRANT ALL ON FUNCTION public.can_edit_tasks() TO service_role;


--
-- Name: FUNCTION can_manage_projects(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.can_manage_projects() FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_manage_projects() TO authenticated;
GRANT ALL ON FUNCTION public.can_manage_projects() TO service_role;


--
-- Name: FUNCTION can_manage_settings(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.can_manage_settings() FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_manage_settings() TO authenticated;
GRANT ALL ON FUNCTION public.can_manage_settings() TO service_role;


--
-- Name: FUNCTION can_view_shared_activity(p_item_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.can_view_shared_activity(p_item_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_view_shared_activity(p_item_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_view_shared_activity(p_item_id uuid) TO service_role;


--
-- Name: FUNCTION can_view_shared_note(note_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.can_view_shared_note(note_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_view_shared_note(note_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_view_shared_note(note_id uuid) TO service_role;


--
-- Name: FUNCTION cancel_material_usage_request(p_usage_request_id uuid, p_reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cancel_material_usage_request(p_usage_request_id uuid, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cancel_material_usage_request(p_usage_request_id uuid, p_reason text) TO authenticated;
GRANT ALL ON FUNCTION public.cancel_material_usage_request(p_usage_request_id uuid, p_reason text) TO service_role;


--
-- Name: FUNCTION cancel_share_invitation(p_invitation_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.cancel_share_invitation(p_invitation_id uuid) TO anon;
GRANT ALL ON FUNCTION public.cancel_share_invitation(p_invitation_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.cancel_share_invitation(p_invitation_id uuid) TO service_role;


--
-- Name: TABLE material_usage_groups; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.material_usage_groups TO service_role;
GRANT SELECT ON TABLE public.material_usage_groups TO authenticated;


--
-- Name: FUNCTION create_material_usage_group(p_project_id bigint, p_category text, p_planned_date date, p_memo text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_material_usage_group(p_project_id bigint, p_category text, p_planned_date date, p_memo text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_material_usage_group(p_project_id bigint, p_category text, p_planned_date date, p_memo text) TO authenticated;
GRANT ALL ON FUNCTION public.create_material_usage_group(p_project_id bigint, p_category text, p_planned_date date, p_memo text) TO service_role;


--
-- Name: FUNCTION create_material_usage_request(p_starting_contract_id uuid, p_allocation_type text, p_project_id bigint, p_destination_name text, p_quantity_tons numeric, p_usage_date date, p_status text, p_purchase_order_no text, p_memo text, p_strategy text, p_expected_starting_available numeric, p_increase_reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_material_usage_request(p_starting_contract_id uuid, p_allocation_type text, p_project_id bigint, p_destination_name text, p_quantity_tons numeric, p_usage_date date, p_status text, p_purchase_order_no text, p_memo text, p_strategy text, p_expected_starting_available numeric, p_increase_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_material_usage_request(p_starting_contract_id uuid, p_allocation_type text, p_project_id bigint, p_destination_name text, p_quantity_tons numeric, p_usage_date date, p_status text, p_purchase_order_no text, p_memo text, p_strategy text, p_expected_starting_available numeric, p_increase_reason text) TO authenticated;
GRANT ALL ON FUNCTION public.create_material_usage_request(p_starting_contract_id uuid, p_allocation_type text, p_project_id bigint, p_destination_name text, p_quantity_tons numeric, p_usage_date date, p_status text, p_purchase_order_no text, p_memo text, p_strategy text, p_expected_starting_available numeric, p_increase_reason text) TO service_role;


--
-- Name: FUNCTION create_project_coating_cost_entry(p_project_id bigint, p_vendor_organization_id bigint, p_accounting_month date, p_supply_amount_krw bigint, p_vat_amount_krw bigint, p_invoice_number text, p_memo text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_project_coating_cost_entry(p_project_id bigint, p_vendor_organization_id bigint, p_accounting_month date, p_supply_amount_krw bigint, p_vat_amount_krw bigint, p_invoice_number text, p_memo text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_project_coating_cost_entry(p_project_id bigint, p_vendor_organization_id bigint, p_accounting_month date, p_supply_amount_krw bigint, p_vat_amount_krw bigint, p_invoice_number text, p_memo text) TO authenticated;
GRANT ALL ON FUNCTION public.create_project_coating_cost_entry(p_project_id bigint, p_vendor_organization_id bigint, p_accounting_month date, p_supply_amount_krw bigint, p_vat_amount_krw bigint, p_invoice_number text, p_memo text) TO service_role;


--
-- Name: FUNCTION create_project_glass_cost_entry(p_project_id bigint, p_vendor_organization_id bigint, p_accounting_month date, p_supply_amount_krw bigint, p_vat_amount_krw bigint, p_invoice_number text, p_memo text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_project_glass_cost_entry(p_project_id bigint, p_vendor_organization_id bigint, p_accounting_month date, p_supply_amount_krw bigint, p_vat_amount_krw bigint, p_invoice_number text, p_memo text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_project_glass_cost_entry(p_project_id bigint, p_vendor_organization_id bigint, p_accounting_month date, p_supply_amount_krw bigint, p_vat_amount_krw bigint, p_invoice_number text, p_memo text) TO authenticated;
GRANT ALL ON FUNCTION public.create_project_glass_cost_entry(p_project_id bigint, p_vendor_organization_id bigint, p_accounting_month date, p_supply_amount_krw bigint, p_vat_amount_krw bigint, p_invoice_number text, p_memo text) TO service_role;


--
-- Name: FUNCTION create_project_section_with_tasks(p_project_id bigint, p_process_type text, p_assembly_vendor text, p_task_manager text, p_quantity integer, p_start_date date, p_end_date date, p_memo text, p_source_section_id bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_project_section_with_tasks(p_project_id bigint, p_process_type text, p_assembly_vendor text, p_task_manager text, p_quantity integer, p_start_date date, p_end_date date, p_memo text, p_source_section_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_project_section_with_tasks(p_project_id bigint, p_process_type text, p_assembly_vendor text, p_task_manager text, p_quantity integer, p_start_date date, p_end_date date, p_memo text, p_source_section_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.create_project_section_with_tasks(p_project_id bigint, p_process_type text, p_assembly_vendor text, p_task_manager text, p_quantity integer, p_start_date date, p_end_date date, p_memo text, p_source_section_id bigint) TO service_role;


--
-- Name: FUNCTION create_project_section_with_vendor_tasks(p_project_id bigint, p_process_type text, p_assembly_vendor text, p_task_manager text, p_quantity integer, p_start_date date, p_end_date date, p_memo text, p_source_section_id bigint, p_target_project_assembly_vendor_ids bigint[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_project_section_with_vendor_tasks(p_project_id bigint, p_process_type text, p_assembly_vendor text, p_task_manager text, p_quantity integer, p_start_date date, p_end_date date, p_memo text, p_source_section_id bigint, p_target_project_assembly_vendor_ids bigint[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_project_section_with_vendor_tasks(p_project_id bigint, p_process_type text, p_assembly_vendor text, p_task_manager text, p_quantity integer, p_start_date date, p_end_date date, p_memo text, p_source_section_id bigint, p_target_project_assembly_vendor_ids bigint[]) TO authenticated;
GRANT ALL ON FUNCTION public.create_project_section_with_vendor_tasks(p_project_id bigint, p_process_type text, p_assembly_vendor text, p_task_manager text, p_quantity integer, p_start_date date, p_end_date date, p_memo text, p_source_section_id bigint, p_target_project_assembly_vendor_ids bigint[]) TO service_role;


--
-- Name: FUNCTION create_project_with_sections(p_project jsonb, p_sections jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_project_with_sections(p_project jsonb, p_sections jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_project_with_sections(p_project jsonb, p_sections jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.create_project_with_sections(p_project jsonb, p_sections jsonb) TO service_role;


--
-- Name: FUNCTION create_project_with_sections_and_vendors(p_project jsonb, p_sections jsonb, p_assembly_vendor_ids bigint[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_project_with_sections_and_vendors(p_project jsonb, p_sections jsonb, p_assembly_vendor_ids bigint[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_project_with_sections_and_vendors(p_project jsonb, p_sections jsonb, p_assembly_vendor_ids bigint[]) TO authenticated;
GRANT ALL ON FUNCTION public.create_project_with_sections_and_vendors(p_project jsonb, p_sections jsonb, p_assembly_vendor_ids bigint[]) TO service_role;


--
-- Name: FUNCTION create_project_with_vendors(p_project jsonb, p_assembly_vendor_ids bigint[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_project_with_vendors(p_project jsonb, p_assembly_vendor_ids bigint[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_project_with_vendors(p_project jsonb, p_assembly_vendor_ids bigint[]) TO authenticated;
GRANT ALL ON FUNCTION public.create_project_with_vendors(p_project jsonb, p_assembly_vendor_ids bigint[]) TO service_role;


--
-- Name: FUNCTION create_reference_task(p_comment_id bigint, p_title text, p_due_date date, p_priority text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_reference_task(p_comment_id bigint, p_title text, p_due_date date, p_priority text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_reference_task(p_comment_id bigint, p_title text, p_due_date date, p_priority text) TO authenticated;
GRANT ALL ON FUNCTION public.create_reference_task(p_comment_id bigint, p_title text, p_due_date date, p_priority text) TO service_role;


--
-- Name: FUNCTION create_share_invitation(p_item_id uuid, p_invitee_id bigint, p_permission text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.create_share_invitation(p_item_id uuid, p_invitee_id bigint, p_permission text) TO anon;
GRANT ALL ON FUNCTION public.create_share_invitation(p_item_id uuid, p_invitee_id bigint, p_permission text) TO authenticated;
GRANT ALL ON FUNCTION public.create_share_invitation(p_item_id uuid, p_invitee_id bigint, p_permission text) TO service_role;


--
-- Name: FUNCTION create_shared_comment_with_mentions(p_shared_item_id uuid, p_content text, p_mention_employee_ids bigint[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_shared_comment_with_mentions(p_shared_item_id uuid, p_content text, p_mention_employee_ids bigint[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_shared_comment_with_mentions(p_shared_item_id uuid, p_content text, p_mention_employee_ids bigint[]) TO authenticated;
GRANT ALL ON FUNCTION public.create_shared_comment_with_mentions(p_shared_item_id uuid, p_content text, p_mention_employee_ids bigint[]) TO service_role;


--
-- Name: TABLE task_dependencies; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.task_dependencies TO anon;
GRANT ALL ON TABLE public.task_dependencies TO authenticated;
GRANT ALL ON TABLE public.task_dependencies TO service_role;


--
-- Name: FUNCTION create_task_dependency(p_predecessor_task_id bigint, p_successor_task_id bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_task_dependency(p_predecessor_task_id bigint, p_successor_task_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_task_dependency(p_predecessor_task_id bigint, p_successor_task_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.create_task_dependency(p_predecessor_task_id bigint, p_successor_task_id bigint) TO service_role;


--
-- Name: FUNCTION current_user_is_admin(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.current_user_is_admin() FROM PUBLIC;
GRANT ALL ON FUNCTION public.current_user_is_admin() TO anon;
GRANT ALL ON FUNCTION public.current_user_is_admin() TO authenticated;
GRANT ALL ON FUNCTION public.current_user_is_admin() TO service_role;


--
-- Name: FUNCTION delete_project_section_with_tasks(p_section_id bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.delete_project_section_with_tasks(p_section_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_project_section_with_tasks(p_section_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.delete_project_section_with_tasks(p_section_id bigint) TO service_role;


--
-- Name: FUNCTION delete_project_task(p_task_id bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.delete_project_task(p_task_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_project_task(p_task_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.delete_project_task(p_task_id bigint) TO service_role;


--
-- Name: FUNCTION delete_project_with_lock_check(p_project_id bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.delete_project_with_lock_check(p_project_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_project_with_lock_check(p_project_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.delete_project_with_lock_check(p_project_id bigint) TO service_role;


--
-- Name: FUNCTION delete_reference_task(p_task_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.delete_reference_task(p_task_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_reference_task(p_task_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.delete_reference_task(p_task_id uuid) TO service_role;


--
-- Name: FUNCTION ensure_shared_item_for_comment(p_item_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.ensure_shared_item_for_comment(p_item_id uuid) TO anon;
GRANT ALL ON FUNCTION public.ensure_shared_item_for_comment(p_item_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.ensure_shared_item_for_comment(p_item_id uuid) TO service_role;


--
-- Name: FUNCTION evaluate_material_contract_notifications(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.evaluate_material_contract_notifications() FROM PUBLIC;
GRANT ALL ON FUNCTION public.evaluate_material_contract_notifications() TO authenticated;
GRANT ALL ON FUNCTION public.evaluate_material_contract_notifications() TO service_role;


--
-- Name: FUNCTION get_editing_lock_status(p_resource_type text, p_resource_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_editing_lock_status(p_resource_type text, p_resource_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_editing_lock_status(p_resource_type text, p_resource_id text) TO anon;
GRANT ALL ON FUNCTION public.get_editing_lock_status(p_resource_type text, p_resource_id text) TO authenticated;
GRANT ALL ON FUNCTION public.get_editing_lock_status(p_resource_type text, p_resource_id text) TO service_role;


--
-- Name: FUNCTION get_hierarchical_delete_locks(p_resource_type text, p_resource_id bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_hierarchical_delete_locks(p_resource_type text, p_resource_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_hierarchical_delete_locks(p_resource_type text, p_resource_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.get_hierarchical_delete_locks(p_resource_type text, p_resource_id bigint) TO service_role;


--
-- Name: FUNCTION get_material_usage_request_history(p_usage_request_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_material_usage_request_history(p_usage_request_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_material_usage_request_history(p_usage_request_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_material_usage_request_history(p_usage_request_id uuid) TO service_role;


--
-- Name: FUNCTION get_material_usage_requests(p_project_id bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_material_usage_requests(p_project_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_material_usage_requests(p_project_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.get_material_usage_requests(p_project_id bigint) TO service_role;


--
-- Name: FUNCTION get_material_usage_requests_v2(p_project_id bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_material_usage_requests_v2(p_project_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_material_usage_requests_v2(p_project_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.get_material_usage_requests_v2(p_project_id bigint) TO service_role;


--
-- Name: FUNCTION get_share_invitation_titles(p_invitation_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_share_invitation_titles(p_invitation_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_share_invitation_titles(p_invitation_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.get_share_invitation_titles(p_invitation_ids uuid[]) TO service_role;


--
-- Name: FUNCTION get_shared_comment_count_stats(p_item_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_shared_comment_count_stats(p_item_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_shared_comment_count_stats(p_item_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.get_shared_comment_count_stats(p_item_ids uuid[]) TO service_role;


--
-- Name: FUNCTION get_shared_comment_counts(p_item_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_shared_comment_counts(p_item_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_shared_comment_counts(p_item_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.get_shared_comment_counts(p_item_ids uuid[]) TO service_role;


--
-- Name: FUNCTION guard_material_allocation_activity_insert(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_material_allocation_activity_insert() TO anon;
GRANT ALL ON FUNCTION public.guard_material_allocation_activity_insert() TO authenticated;
GRANT ALL ON FUNCTION public.guard_material_allocation_activity_insert() TO service_role;


--
-- Name: FUNCTION handle_new_signup_request(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_new_signup_request() TO anon;
GRANT ALL ON FUNCTION public.handle_new_signup_request() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_signup_request() TO service_role;


--
-- Name: FUNCTION has_erp_role(p_roles text[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.has_erp_role(p_roles text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.has_erp_role(p_roles text[]) TO authenticated;
GRANT ALL ON FUNCTION public.has_erp_role(p_roles text[]) TO service_role;


--
-- Name: FUNCTION heartbeat_editing_lock(p_lock_token uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.heartbeat_editing_lock(p_lock_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.heartbeat_editing_lock(p_lock_token uuid) TO anon;
GRANT ALL ON FUNCTION public.heartbeat_editing_lock(p_lock_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.heartbeat_editing_lock(p_lock_token uuid) TO service_role;


--
-- Name: FUNCTION import_lme_market_prices(rows_json jsonb, import_file_name text, import_created_by_name text, import_pre_skipped_rows integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.import_lme_market_prices(rows_json jsonb, import_file_name text, import_created_by_name text, import_pre_skipped_rows integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.import_lme_market_prices(rows_json jsonb, import_file_name text, import_created_by_name text, import_pre_skipped_rows integer) TO authenticated;
GRANT ALL ON FUNCTION public.import_lme_market_prices(rows_json jsonb, import_file_name text, import_created_by_name text, import_pre_skipped_rows integer) TO service_role;


--
-- Name: FUNCTION import_project_cost_entries(p_file_name text, p_rows jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.import_project_cost_entries(p_file_name text, p_rows jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.import_project_cost_entries(p_file_name text, p_rows jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.import_project_cost_entries(p_file_name text, p_rows jsonb) TO service_role;


--
-- Name: FUNCTION is_approved_admin(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_approved_admin() FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_approved_admin() TO authenticated;
GRANT ALL ON FUNCTION public.is_approved_admin() TO service_role;


--
-- Name: FUNCTION is_approved_erp_user(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_approved_erp_user() FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_approved_erp_user() TO authenticated;
GRANT ALL ON FUNCTION public.is_approved_erp_user() TO service_role;


--
-- Name: FUNCTION is_calendar_only_staff(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_calendar_only_staff() FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_calendar_only_staff() TO authenticated;
GRANT ALL ON FUNCTION public.is_calendar_only_staff() TO service_role;


--
-- Name: FUNCTION log_accessory_activity(p_type text, p_project bigint, p_title text, p_metadata jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.log_accessory_activity(p_type text, p_project bigint, p_title text, p_metadata jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.log_accessory_activity(p_type text, p_project bigint, p_title text, p_metadata jsonb) TO service_role;


--
-- Name: FUNCTION log_coating_cost_activity(p_type text, p_statement uuid, p_project bigint, p_title text, p_metadata jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.log_coating_cost_activity(p_type text, p_statement uuid, p_project bigint, p_title text, p_metadata jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.log_coating_cost_activity(p_type text, p_statement uuid, p_project bigint, p_title text, p_metadata jsonb) TO service_role;


--
-- Name: FUNCTION log_glass_cost_activity(p_type text, p_statement uuid, p_project bigint, p_title text, p_metadata jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.log_glass_cost_activity(p_type text, p_statement uuid, p_project bigint, p_title text, p_metadata jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.log_glass_cost_activity(p_type text, p_statement uuid, p_project bigint, p_title text, p_metadata jsonb) TO service_role;


--
-- Name: FUNCTION log_material_usage_request_created(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.log_material_usage_request_created() TO anon;
GRANT ALL ON FUNCTION public.log_material_usage_request_created() TO authenticated;
GRANT ALL ON FUNCTION public.log_material_usage_request_created() TO service_role;


--
-- Name: FUNCTION log_personal_note_activity(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.log_personal_note_activity() TO anon;
GRANT ALL ON FUNCTION public.log_personal_note_activity() TO authenticated;
GRANT ALL ON FUNCTION public.log_personal_note_activity() TO service_role;


--
-- Name: FUNCTION log_share_invitation_activity(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.log_share_invitation_activity() TO anon;
GRANT ALL ON FUNCTION public.log_share_invitation_activity() TO authenticated;
GRANT ALL ON FUNCTION public.log_share_invitation_activity() TO service_role;


--
-- Name: FUNCTION log_shared_comment_activity(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.log_shared_comment_activity() TO anon;
GRANT ALL ON FUNCTION public.log_shared_comment_activity() TO authenticated;
GRANT ALL ON FUNCTION public.log_shared_comment_activity() TO service_role;


--
-- Name: FUNCTION log_shared_member_activity(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.log_shared_member_activity() TO anon;
GRANT ALL ON FUNCTION public.log_shared_member_activity() TO authenticated;
GRANT ALL ON FUNCTION public.log_shared_member_activity() TO service_role;


--
-- Name: FUNCTION manage_settings_item(p_entity text, p_target_id bigint, p_execute boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.manage_settings_item(p_entity text, p_target_id bigint, p_execute boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.manage_settings_item(p_entity text, p_target_id bigint, p_execute boolean) TO authenticated;
GRANT ALL ON FUNCTION public.manage_settings_item(p_entity text, p_target_id bigint, p_execute boolean) TO service_role;


--
-- Name: FUNCTION mark_shared_comments_read(p_item_id uuid, p_last_comment_id bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mark_shared_comments_read(p_item_id uuid, p_last_comment_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mark_shared_comments_read(p_item_id uuid, p_last_comment_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.mark_shared_comments_read(p_item_id uuid, p_last_comment_id bigint) TO service_role;


--
-- Name: FUNCTION prepare_project_contract_entry(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.prepare_project_contract_entry() TO anon;
GRANT ALL ON FUNCTION public.prepare_project_contract_entry() TO authenticated;
GRANT ALL ON FUNCTION public.prepare_project_contract_entry() TO service_role;


--
-- Name: FUNCTION prepare_project_cost_category(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.prepare_project_cost_category() TO anon;
GRANT ALL ON FUNCTION public.prepare_project_cost_category() TO authenticated;
GRANT ALL ON FUNCTION public.prepare_project_cost_category() TO service_role;


--
-- Name: FUNCTION prepare_project_cost_entry(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.prepare_project_cost_entry() TO anon;
GRANT ALL ON FUNCTION public.prepare_project_cost_entry() TO authenticated;
GRANT ALL ON FUNCTION public.prepare_project_cost_entry() TO service_role;


--
-- Name: FUNCTION prepare_project_material_usage(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.prepare_project_material_usage() TO anon;
GRANT ALL ON FUNCTION public.prepare_project_material_usage() TO authenticated;
GRANT ALL ON FUNCTION public.prepare_project_material_usage() TO service_role;


--
-- Name: FUNCTION prepare_raw_material_contract(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.prepare_raw_material_contract() TO anon;
GRANT ALL ON FUNCTION public.prepare_raw_material_contract() TO authenticated;
GRANT ALL ON FUNCTION public.prepare_raw_material_contract() TO service_role;


--
-- Name: FUNCTION prevent_exchange_rate_change(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.prevent_exchange_rate_change() TO anon;
GRANT ALL ON FUNCTION public.prevent_exchange_rate_change() TO authenticated;
GRANT ALL ON FUNCTION public.prevent_exchange_rate_change() TO service_role;


--
-- Name: FUNCTION prevent_lme_market_history_change(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.prevent_lme_market_history_change() TO anon;
GRANT ALL ON FUNCTION public.prevent_lme_market_history_change() TO authenticated;
GRANT ALL ON FUNCTION public.prevent_lme_market_history_change() TO service_role;


--
-- Name: FUNCTION project_assembly_vendors_sync_primary_cache(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.project_assembly_vendors_sync_primary_cache() TO anon;
GRANT ALL ON FUNCTION public.project_assembly_vendors_sync_primary_cache() TO authenticated;
GRANT ALL ON FUNCTION public.project_assembly_vendors_sync_primary_cache() TO service_role;


--
-- Name: FUNCTION protect_referenced_partner_type(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.protect_referenced_partner_type() TO anon;
GRANT ALL ON FUNCTION public.protect_referenced_partner_type() TO authenticated;
GRANT ALL ON FUNCTION public.protect_referenced_partner_type() TO service_role;


--
-- Name: FUNCTION record_material_allocation_activity(p_material_contract_id uuid, p_allocation_id uuid, p_event_type text, p_title text, p_field text, p_field_label text, p_before jsonb, p_after jsonb, p_before_display text, p_after_display text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_material_allocation_activity(p_material_contract_id uuid, p_allocation_id uuid, p_event_type text, p_title text, p_field text, p_field_label text, p_before jsonb, p_after jsonb, p_before_display text, p_after_display text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_material_allocation_activity(p_material_contract_id uuid, p_allocation_id uuid, p_event_type text, p_title text, p_field text, p_field_label text, p_before jsonb, p_after jsonb, p_before_display text, p_after_display text) TO service_role;


--
-- Name: FUNCTION record_shared_workspace_activity(p_item_id uuid, p_activity_type text, p_description text, p_metadata jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.record_shared_workspace_activity(p_item_id uuid, p_activity_type text, p_description text, p_metadata jsonb) TO anon;
GRANT ALL ON FUNCTION public.record_shared_workspace_activity(p_item_id uuid, p_activity_type text, p_description text, p_metadata jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.record_shared_workspace_activity(p_item_id uuid, p_activity_type text, p_description text, p_metadata jsonb) TO service_role;


--
-- Name: FUNCTION refresh_lme_market_kpi_cache(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.refresh_lme_market_kpi_cache() TO anon;
GRANT ALL ON FUNCTION public.refresh_lme_market_kpi_cache() TO authenticated;
GRANT ALL ON FUNCTION public.refresh_lme_market_kpi_cache() TO service_role;


--
-- Name: FUNCTION release_editing_lock(p_lock_token uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.release_editing_lock(p_lock_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.release_editing_lock(p_lock_token uuid) TO anon;
GRANT ALL ON FUNCTION public.release_editing_lock(p_lock_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.release_editing_lock(p_lock_token uuid) TO service_role;


--
-- Name: FUNCTION remove_shared_member(p_shared_item_id uuid, p_employee_id bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.remove_shared_member(p_shared_item_id uuid, p_employee_id bigint) TO anon;
GRANT ALL ON FUNCTION public.remove_shared_member(p_shared_item_id uuid, p_employee_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.remove_shared_member(p_shared_item_id uuid, p_employee_id bigint) TO service_role;


--
-- Name: FUNCTION respond_share_invitation(p_invitation_id uuid, p_accept boolean); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.respond_share_invitation(p_invitation_id uuid, p_accept boolean) TO anon;
GRANT ALL ON FUNCTION public.respond_share_invitation(p_invitation_id uuid, p_accept boolean) TO authenticated;
GRANT ALL ON FUNCTION public.respond_share_invitation(p_invitation_id uuid, p_accept boolean) TO service_role;


--
-- Name: TABLE accessory_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.accessory_items TO service_role;
GRANT SELECT ON TABLE public.accessory_items TO authenticated;


--
-- Name: FUNCTION save_accessory_item(p_id uuid, p_code text, p_name text, p_specification text, p_unit text, p_origin text, p_price_basis text, p_currency text, p_unit_price numeric, p_vendor bigint, p_active boolean, p_memo text, p_sort integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.save_accessory_item(p_id uuid, p_code text, p_name text, p_specification text, p_unit text, p_origin text, p_price_basis text, p_currency text, p_unit_price numeric, p_vendor bigint, p_active boolean, p_memo text, p_sort integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_accessory_item(p_id uuid, p_code text, p_name text, p_specification text, p_unit text, p_origin text, p_price_basis text, p_currency text, p_unit_price numeric, p_vendor bigint, p_active boolean, p_memo text, p_sort integer) TO authenticated;
GRANT ALL ON FUNCTION public.save_accessory_item(p_id uuid, p_code text, p_name text, p_specification text, p_unit text, p_origin text, p_price_basis text, p_currency text, p_unit_price numeric, p_vendor bigint, p_active boolean, p_memo text, p_sort integer) TO service_role;


--
-- Name: TABLE coating_cost_allocations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.coating_cost_allocations TO service_role;
GRANT SELECT ON TABLE public.coating_cost_allocations TO authenticated;


--
-- Name: FUNCTION save_coating_cost_allocation(p_statement uuid, p_project bigint, p_amount bigint, p_memo text, p_action text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.save_coating_cost_allocation(p_statement uuid, p_project bigint, p_amount bigint, p_memo text, p_action text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_coating_cost_allocation(p_statement uuid, p_project bigint, p_amount bigint, p_memo text, p_action text) TO authenticated;
GRANT ALL ON FUNCTION public.save_coating_cost_allocation(p_statement uuid, p_project bigint, p_amount bigint, p_memo text, p_action text) TO service_role;


--
-- Name: TABLE coating_cost_statements; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.coating_cost_statements TO service_role;
GRANT SELECT ON TABLE public.coating_cost_statements TO authenticated;


--
-- Name: FUNCTION save_coating_cost_statement(p_id uuid, p_vendor bigint, p_month date, p_invoice text, p_supply bigint, p_vat bigint, p_memo text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.save_coating_cost_statement(p_id uuid, p_vendor bigint, p_month date, p_invoice text, p_supply bigint, p_vat bigint, p_memo text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_coating_cost_statement(p_id uuid, p_vendor bigint, p_month date, p_invoice text, p_supply bigint, p_vat bigint, p_memo text) TO authenticated;
GRANT ALL ON FUNCTION public.save_coating_cost_statement(p_id uuid, p_vendor bigint, p_month date, p_invoice text, p_supply bigint, p_vat bigint, p_memo text) TO service_role;


--
-- Name: TABLE glass_cost_allocations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.glass_cost_allocations TO service_role;
GRANT SELECT ON TABLE public.glass_cost_allocations TO authenticated;


--
-- Name: FUNCTION save_glass_cost_allocation(p_statement uuid, p_project bigint, p_amount bigint, p_memo text, p_action text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.save_glass_cost_allocation(p_statement uuid, p_project bigint, p_amount bigint, p_memo text, p_action text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_glass_cost_allocation(p_statement uuid, p_project bigint, p_amount bigint, p_memo text, p_action text) TO authenticated;
GRANT ALL ON FUNCTION public.save_glass_cost_allocation(p_statement uuid, p_project bigint, p_amount bigint, p_memo text, p_action text) TO service_role;


--
-- Name: TABLE glass_cost_statements; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.glass_cost_statements TO service_role;
GRANT SELECT ON TABLE public.glass_cost_statements TO authenticated;


--
-- Name: FUNCTION save_glass_cost_statement(p_id uuid, p_vendor bigint, p_month date, p_invoice text, p_supply bigint, p_vat bigint, p_memo text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.save_glass_cost_statement(p_id uuid, p_vendor bigint, p_month date, p_invoice text, p_supply bigint, p_vat bigint, p_memo text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_glass_cost_statement(p_id uuid, p_vendor bigint, p_month date, p_invoice text, p_supply bigint, p_vat bigint, p_memo text) TO authenticated;
GRANT ALL ON FUNCTION public.save_glass_cost_statement(p_id uuid, p_vendor bigint, p_month date, p_invoice text, p_supply bigint, p_vat bigint, p_memo text) TO service_role;


--
-- Name: FUNCTION save_material_contract_allocation(p_contract_id uuid, p_allocation_id uuid, p_allocation_type text, p_project_id bigint, p_destination_name text, p_quantity_tons numeric, p_allocation_date date, p_status text, p_purchase_order_no text, p_memo text, p_cancel boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.save_material_contract_allocation(p_contract_id uuid, p_allocation_id uuid, p_allocation_type text, p_project_id bigint, p_destination_name text, p_quantity_tons numeric, p_allocation_date date, p_status text, p_purchase_order_no text, p_memo text, p_cancel boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_material_contract_allocation(p_contract_id uuid, p_allocation_id uuid, p_allocation_type text, p_project_id bigint, p_destination_name text, p_quantity_tons numeric, p_allocation_date date, p_status text, p_purchase_order_no text, p_memo text, p_cancel boolean) TO authenticated;
GRANT ALL ON FUNCTION public.save_material_contract_allocation(p_contract_id uuid, p_allocation_id uuid, p_allocation_type text, p_project_id bigint, p_destination_name text, p_quantity_tons numeric, p_allocation_date date, p_status text, p_purchase_order_no text, p_memo text, p_cancel boolean) TO service_role;


--
-- Name: TABLE project_accessory_usages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.project_accessory_usages TO service_role;
GRANT SELECT ON TABLE public.project_accessory_usages TO authenticated;


--
-- Name: FUNCTION save_project_accessory_usage(p_id uuid, p_project bigint, p_item uuid, p_usage_date date, p_quantity numeric, p_unit_price numeric, p_exchange_rate numeric, p_memo text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.save_project_accessory_usage(p_id uuid, p_project bigint, p_item uuid, p_usage_date date, p_quantity numeric, p_unit_price numeric, p_exchange_rate numeric, p_memo text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_project_accessory_usage(p_id uuid, p_project bigint, p_item uuid, p_usage_date date, p_quantity numeric, p_unit_price numeric, p_exchange_rate numeric, p_memo text) TO authenticated;
GRANT ALL ON FUNCTION public.save_project_accessory_usage(p_id uuid, p_project bigint, p_item uuid, p_usage_date date, p_quantity numeric, p_unit_price numeric, p_exchange_rate numeric, p_memo text) TO service_role;


--
-- Name: FUNCTION set_material_contract_allocations_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_material_contract_allocations_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_material_contract_allocations_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_material_contract_allocations_updated_at() TO service_role;


--
-- Name: FUNCTION set_material_usage_request_group(p_usage_request_id uuid, p_group_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_material_usage_request_group(p_usage_request_id uuid, p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_material_usage_request_group(p_usage_request_id uuid, p_group_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.set_material_usage_request_group(p_usage_request_id uuid, p_group_id uuid) TO service_role;


--
-- Name: FUNCTION set_personal_notes_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_personal_notes_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_personal_notes_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_personal_notes_updated_at() TO service_role;


--
-- Name: FUNCTION set_project_assembly_vendor_quantity(p_relation_id bigint, p_allocated_quantity numeric); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_project_assembly_vendor_quantity(p_relation_id bigint, p_allocated_quantity numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_project_assembly_vendor_quantity(p_relation_id bigint, p_allocated_quantity numeric) TO authenticated;
GRANT ALL ON FUNCTION public.set_project_assembly_vendor_quantity(p_relation_id bigint, p_allocated_quantity numeric) TO service_role;


--
-- Name: FUNCTION set_reference_task_status(p_task_id uuid, p_completed boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_reference_task_status(p_task_id uuid, p_completed boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_reference_task_status(p_task_id uuid, p_completed boolean) TO authenticated;
GRANT ALL ON FUNCTION public.set_reference_task_status(p_task_id uuid, p_completed boolean) TO service_role;


--
-- Name: FUNCTION set_shared_comments_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_shared_comments_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_shared_comments_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_shared_comments_updated_at() TO service_role;


--
-- Name: FUNCTION set_task_notes_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_task_notes_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_task_notes_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_task_notes_updated_at() TO service_role;


--
-- Name: FUNCTION set_task_tags(p_task_id bigint, p_tags text[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_task_tags(p_task_id bigint, p_tags text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_task_tags(p_task_id bigint, p_tags text[]) TO authenticated;
GRANT ALL ON FUNCTION public.set_task_tags(p_task_id bigint, p_tags text[]) TO service_role;


--
-- Name: FUNCTION sharing_can_access_item(p_shared_item_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sharing_can_access_item(p_shared_item_id uuid) TO anon;
GRANT ALL ON FUNCTION public.sharing_can_access_item(p_shared_item_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.sharing_can_access_item(p_shared_item_id uuid) TO service_role;


--
-- Name: FUNCTION sharing_current_employee_id(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sharing_current_employee_id() TO anon;
GRANT ALL ON FUNCTION public.sharing_current_employee_id() TO authenticated;
GRANT ALL ON FUNCTION public.sharing_current_employee_id() TO service_role;


--
-- Name: FUNCTION sync_project_primary_vendor(p_project_id bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.sync_project_primary_vendor(p_project_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.sync_project_primary_vendor(p_project_id bigint) TO service_role;


--
-- Name: FUNCTION sync_supplier_from_organization(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_supplier_from_organization() TO anon;
GRANT ALL ON FUNCTION public.sync_supplier_from_organization() TO authenticated;
GRANT ALL ON FUNCTION public.sync_supplier_from_organization() TO service_role;


--
-- Name: FUNCTION update_material_usage_group(p_group_id uuid, p_planned_date date, p_status text, p_memo text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_material_usage_group(p_group_id uuid, p_planned_date date, p_status text, p_memo text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_material_usage_group(p_group_id uuid, p_planned_date date, p_status text, p_memo text) TO authenticated;
GRANT ALL ON FUNCTION public.update_material_usage_group(p_group_id uuid, p_planned_date date, p_status text, p_memo text) TO service_role;


--
-- Name: TABLE material_usage_requests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.material_usage_requests TO service_role;
GRANT SELECT ON TABLE public.material_usage_requests TO authenticated;


--
-- Name: FUNCTION update_material_usage_request(p_usage_request_id uuid, p_quantity_tons numeric, p_purchase_order_no text, p_usage_date date, p_memo text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_material_usage_request(p_usage_request_id uuid, p_quantity_tons numeric, p_purchase_order_no text, p_usage_date date, p_memo text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_material_usage_request(p_usage_request_id uuid, p_quantity_tons numeric, p_purchase_order_no text, p_usage_date date, p_memo text) TO authenticated;
GRANT ALL ON FUNCTION public.update_material_usage_request(p_usage_request_id uuid, p_quantity_tons numeric, p_purchase_order_no text, p_usage_date date, p_memo text) TO service_role;


--
-- Name: FUNCTION update_material_usage_request_details(p_usage_request_id uuid, p_purchase_order_no text, p_memo text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_material_usage_request_details(p_usage_request_id uuid, p_purchase_order_no text, p_memo text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_material_usage_request_details(p_usage_request_id uuid, p_purchase_order_no text, p_memo text) TO authenticated;
GRANT ALL ON FUNCTION public.update_material_usage_request_details(p_usage_request_id uuid, p_purchase_order_no text, p_memo text) TO service_role;


--
-- Name: FUNCTION update_material_usage_request_quantity(p_usage_request_id uuid, p_quantity_tons numeric); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_material_usage_request_quantity(p_usage_request_id uuid, p_quantity_tons numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_material_usage_request_quantity(p_usage_request_id uuid, p_quantity_tons numeric) TO authenticated;
GRANT ALL ON FUNCTION public.update_material_usage_request_quantity(p_usage_request_id uuid, p_quantity_tons numeric) TO service_role;


--
-- Name: FUNCTION update_project_coating_cost_entry(p_statement_id uuid, p_project_id bigint, p_vendor_organization_id bigint, p_accounting_month date, p_supply_amount_krw bigint, p_vat_amount_krw bigint, p_invoice_number text, p_memo text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_project_coating_cost_entry(p_statement_id uuid, p_project_id bigint, p_vendor_organization_id bigint, p_accounting_month date, p_supply_amount_krw bigint, p_vat_amount_krw bigint, p_invoice_number text, p_memo text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_project_coating_cost_entry(p_statement_id uuid, p_project_id bigint, p_vendor_organization_id bigint, p_accounting_month date, p_supply_amount_krw bigint, p_vat_amount_krw bigint, p_invoice_number text, p_memo text) TO authenticated;
GRANT ALL ON FUNCTION public.update_project_coating_cost_entry(p_statement_id uuid, p_project_id bigint, p_vendor_organization_id bigint, p_accounting_month date, p_supply_amount_krw bigint, p_vat_amount_krw bigint, p_invoice_number text, p_memo text) TO service_role;


--
-- Name: FUNCTION update_project_glass_cost_entry(p_statement_id uuid, p_project_id bigint, p_vendor_organization_id bigint, p_accounting_month date, p_supply_amount_krw bigint, p_vat_amount_krw bigint, p_invoice_number text, p_memo text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_project_glass_cost_entry(p_statement_id uuid, p_project_id bigint, p_vendor_organization_id bigint, p_accounting_month date, p_supply_amount_krw bigint, p_vat_amount_krw bigint, p_invoice_number text, p_memo text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_project_glass_cost_entry(p_statement_id uuid, p_project_id bigint, p_vendor_organization_id bigint, p_accounting_month date, p_supply_amount_krw bigint, p_vat_amount_krw bigint, p_invoice_number text, p_memo text) TO authenticated;
GRANT ALL ON FUNCTION public.update_project_glass_cost_entry(p_statement_id uuid, p_project_id bigint, p_vendor_organization_id bigint, p_accounting_month date, p_supply_amount_krw bigint, p_vat_amount_krw bigint, p_invoice_number text, p_memo text) TO service_role;


--
-- Name: FUNCTION update_project_with_vendors(p_project_id bigint, p_project jsonb, p_assembly_vendor_ids bigint[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_project_with_vendors(p_project_id bigint, p_project jsonb, p_assembly_vendor_ids bigint[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_project_with_vendors(p_project_id bigint, p_project jsonb, p_assembly_vendor_ids bigint[]) TO authenticated;
GRANT ALL ON FUNCTION public.update_project_with_vendors(p_project_id bigint, p_project jsonb, p_assembly_vendor_ids bigint[]) TO service_role;


--
-- Name: FUNCTION update_reference_task(p_task_id uuid, p_title text, p_due_date date, p_priority text, p_completed boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_reference_task(p_task_id uuid, p_title text, p_due_date date, p_priority text, p_completed boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_reference_task(p_task_id uuid, p_title text, p_due_date date, p_priority text, p_completed boolean) TO authenticated;
GRANT ALL ON FUNCTION public.update_reference_task(p_task_id uuid, p_title text, p_due_date date, p_priority text, p_completed boolean) TO service_role;


--
-- Name: FUNCTION update_shared_member_permission(p_shared_item_id uuid, p_employee_id bigint, p_permission text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_shared_member_permission(p_shared_item_id uuid, p_employee_id bigint, p_permission text) TO anon;
GRANT ALL ON FUNCTION public.update_shared_member_permission(p_shared_item_id uuid, p_employee_id bigint, p_permission text) TO authenticated;
GRANT ALL ON FUNCTION public.update_shared_member_permission(p_shared_item_id uuid, p_employee_id bigint, p_permission text) TO service_role;


--
-- Name: FUNCTION void_coating_cost_statement(p_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.void_coating_cost_statement(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.void_coating_cost_statement(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.void_coating_cost_statement(p_id uuid) TO service_role;


--
-- Name: FUNCTION void_glass_cost_statement(p_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.void_glass_cost_statement(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.void_glass_cost_statement(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.void_glass_cost_statement(p_id uuid) TO service_role;


--
-- Name: FUNCTION void_project_accessory_usage(p_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.void_project_accessory_usage(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.void_project_accessory_usage(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.void_project_accessory_usage(p_id uuid) TO service_role;


--
-- Name: FUNCTION void_project_coating_cost_entry(p_statement_id uuid, p_project_id bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.void_project_coating_cost_entry(p_statement_id uuid, p_project_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.void_project_coating_cost_entry(p_statement_id uuid, p_project_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.void_project_coating_cost_entry(p_statement_id uuid, p_project_id bigint) TO service_role;


--
-- Name: FUNCTION void_project_glass_cost_entry(p_statement_id uuid, p_project_id bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.void_project_glass_cost_entry(p_statement_id uuid, p_project_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.void_project_glass_cost_entry(p_statement_id uuid, p_project_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.void_project_glass_cost_entry(p_statement_id uuid, p_project_id bigint) TO service_role;


--
-- Name: TABLE accessory_price_history; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.accessory_price_history TO service_role;
GRANT SELECT ON TABLE public.accessory_price_history TO authenticated;


--
-- Name: SEQUENCE accessory_price_history_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.accessory_price_history_id_seq TO anon;
GRANT ALL ON SEQUENCE public.accessory_price_history_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.accessory_price_history_id_seq TO service_role;


--
-- Name: TABLE activity_logs; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,MAINTAIN ON TABLE public.activity_logs TO authenticated;
GRANT ALL ON TABLE public.activity_logs TO service_role;


--
-- Name: SEQUENCE activity_logs_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.activity_logs_id_seq TO anon;
GRANT ALL ON SEQUENCE public.activity_logs_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.activity_logs_id_seq TO service_role;


--
-- Name: TABLE app_settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.app_settings TO anon;
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.app_settings TO authenticated;
GRANT ALL ON TABLE public.app_settings TO service_role;


--
-- Name: TABLE coating_cost_allocation_history; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.coating_cost_allocation_history TO service_role;
GRANT SELECT ON TABLE public.coating_cost_allocation_history TO authenticated;


--
-- Name: SEQUENCE coating_cost_allocation_history_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.coating_cost_allocation_history_id_seq TO anon;
GRANT ALL ON SEQUENCE public.coating_cost_allocation_history_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.coating_cost_allocation_history_id_seq TO service_role;


--
-- Name: TABLE dashboard_preferences; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.dashboard_preferences TO anon;
GRANT ALL ON TABLE public.dashboard_preferences TO authenticated;
GRANT ALL ON TABLE public.dashboard_preferences TO service_role;


--
-- Name: TABLE editing_locks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.editing_locks TO service_role;


--
-- Name: TABLE employees; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.employees TO authenticated;
GRANT ALL ON TABLE public.employees TO service_role;


--
-- Name: SEQUENCE employees_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.employees_id_seq TO anon;
GRANT ALL ON SEQUENCE public.employees_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.employees_id_seq TO service_role;


--
-- Name: TABLE exchange_rate_sync_runs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.exchange_rate_sync_runs TO service_role;
GRANT SELECT ON TABLE public.exchange_rate_sync_runs TO authenticated;


--
-- Name: TABLE exchange_rates; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.exchange_rates TO service_role;
GRANT SELECT ON TABLE public.exchange_rates TO authenticated;


--
-- Name: TABLE glass_cost_allocation_history; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.glass_cost_allocation_history TO service_role;
GRANT SELECT ON TABLE public.glass_cost_allocation_history TO authenticated;


--
-- Name: SEQUENCE glass_cost_allocation_history_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.glass_cost_allocation_history_id_seq TO anon;
GRANT ALL ON SEQUENCE public.glass_cost_allocation_history_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.glass_cost_allocation_history_id_seq TO service_role;


--
-- Name: TABLE lme_import_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.lme_import_logs TO service_role;
GRANT SELECT,INSERT ON TABLE public.lme_import_logs TO authenticated;


--
-- Name: TABLE lme_market_kpi_cache; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.lme_market_kpi_cache TO service_role;
GRANT SELECT ON TABLE public.lme_market_kpi_cache TO authenticated;


--
-- Name: TABLE lme_market_prices; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.lme_market_prices TO service_role;
GRANT SELECT,INSERT ON TABLE public.lme_market_prices TO authenticated;


--
-- Name: TABLE lme_materials; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.lme_materials TO service_role;
GRANT SELECT ON TABLE public.lme_materials TO authenticated;


--
-- Name: TABLE lme_price_records; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.lme_price_records TO service_role;
GRANT SELECT,INSERT,DELETE ON TABLE public.lme_price_records TO authenticated;


--
-- Name: TABLE lme_status_thresholds; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.lme_status_thresholds TO service_role;
GRANT SELECT,UPDATE ON TABLE public.lme_status_thresholds TO authenticated;


--
-- Name: TABLE lme_sync_runs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.lme_sync_runs TO service_role;
GRANT SELECT,INSERT,UPDATE ON TABLE public.lme_sync_runs TO authenticated;


--
-- Name: TABLE material_contract_notification_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.material_contract_notification_events TO service_role;
GRANT SELECT ON TABLE public.material_contract_notification_events TO authenticated;


--
-- Name: TABLE material_contract_notification_states; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.material_contract_notification_states TO service_role;


--
-- Name: TABLE notification_reads; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notification_reads TO anon;
GRANT ALL ON TABLE public.notification_reads TO authenticated;
GRANT ALL ON TABLE public.notification_reads TO service_role;


--
-- Name: TABLE organization_categories; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.organization_categories TO authenticated;
GRANT ALL ON TABLE public.organization_categories TO service_role;


--
-- Name: SEQUENCE organization_categories_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.organization_categories_id_seq TO anon;
GRANT ALL ON SEQUENCE public.organization_categories_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.organization_categories_id_seq TO service_role;


--
-- Name: TABLE organizations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.organizations TO authenticated;
GRANT ALL ON TABLE public.organizations TO service_role;


--
-- Name: SEQUENCE organizations_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.organizations_id_seq TO anon;
GRANT ALL ON SEQUENCE public.organizations_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.organizations_id_seq TO service_role;


--
-- Name: TABLE personal_notes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.personal_notes TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.personal_notes TO authenticated;


--
-- Name: TABLE process_types; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.process_types TO authenticated;
GRANT ALL ON TABLE public.process_types TO service_role;


--
-- Name: SEQUENCE process_types_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.process_types_id_seq TO anon;
GRANT ALL ON SEQUENCE public.process_types_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.process_types_id_seq TO service_role;


--
-- Name: TABLE project_assembly_vendors; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.project_assembly_vendors TO authenticated;
GRANT ALL ON TABLE public.project_assembly_vendors TO service_role;


--
-- Name: SEQUENCE project_assembly_vendors_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.project_assembly_vendors_id_seq TO anon;
GRANT ALL ON SEQUENCE public.project_assembly_vendors_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.project_assembly_vendors_id_seq TO service_role;


--
-- Name: TABLE project_contract_entries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.project_contract_entries TO service_role;
GRANT SELECT,INSERT,UPDATE ON TABLE public.project_contract_entries TO authenticated;


--
-- Name: TABLE project_cost_categories; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.project_cost_categories TO service_role;
GRANT SELECT,INSERT,UPDATE ON TABLE public.project_cost_categories TO authenticated;


--
-- Name: TABLE project_cost_entries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.project_cost_entries TO service_role;
GRANT SELECT,INSERT,UPDATE ON TABLE public.project_cost_entries TO authenticated;


--
-- Name: TABLE project_cost_import_batches; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.project_cost_import_batches TO service_role;
GRANT SELECT ON TABLE public.project_cost_import_batches TO authenticated;


--
-- Name: TABLE project_files; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.project_files TO anon;
GRANT ALL ON TABLE public.project_files TO authenticated;
GRANT ALL ON TABLE public.project_files TO service_role;


--
-- Name: TABLE project_material_usages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.project_material_usages TO service_role;
GRANT SELECT,INSERT,UPDATE ON TABLE public.project_material_usages TO authenticated;


--
-- Name: TABLE project_schedule_memos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.project_schedule_memos TO anon;
GRANT ALL ON TABLE public.project_schedule_memos TO authenticated;
GRANT ALL ON TABLE public.project_schedule_memos TO service_role;


--
-- Name: TABLE project_sections; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.project_sections TO authenticated;
GRANT ALL ON TABLE public.project_sections TO service_role;


--
-- Name: SEQUENCE project_sections_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.project_sections_id_seq TO anon;
GRANT ALL ON SEQUENCE public.project_sections_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.project_sections_id_seq TO service_role;


--
-- Name: TABLE projects; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.projects TO authenticated;
GRANT ALL ON TABLE public.projects TO service_role;


--
-- Name: SEQUENCE projects_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.projects_id_seq TO anon;
GRANT ALL ON SEQUENCE public.projects_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.projects_id_seq TO service_role;


--
-- Name: TABLE raw_material_contracts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.raw_material_contracts TO service_role;
GRANT SELECT,INSERT,UPDATE ON TABLE public.raw_material_contracts TO authenticated;


--
-- Name: TABLE reference_tasks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.reference_tasks TO service_role;
GRANT SELECT ON TABLE public.reference_tasks TO authenticated;


--
-- Name: TABLE rls_policy_backups; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.rls_policy_backups TO service_role;


--
-- Name: TABLE share_invitations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.share_invitations TO service_role;
GRANT SELECT ON TABLE public.share_invitations TO authenticated;


--
-- Name: TABLE shared_comment_mentions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.shared_comment_mentions TO service_role;
GRANT SELECT ON TABLE public.shared_comment_mentions TO authenticated;


--
-- Name: TABLE shared_comment_reads; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.shared_comment_reads TO service_role;
GRANT SELECT ON TABLE public.shared_comment_reads TO authenticated;


--
-- Name: TABLE shared_comments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.shared_comments TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.shared_comments TO authenticated;


--
-- Name: SEQUENCE shared_comments_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.shared_comments_id_seq TO anon;
GRANT ALL ON SEQUENCE public.shared_comments_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.shared_comments_id_seq TO service_role;


--
-- Name: TABLE shared_item_members; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.shared_item_members TO service_role;
GRANT SELECT ON TABLE public.shared_item_members TO authenticated;


--
-- Name: TABLE shared_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.shared_items TO service_role;
GRANT SELECT ON TABLE public.shared_items TO authenticated;


--
-- Name: TABLE shipments; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.shipments TO authenticated;
GRANT ALL ON TABLE public.shipments TO service_role;


--
-- Name: SEQUENCE shipments_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.shipments_id_seq TO anon;
GRANT ALL ON SEQUENCE public.shipments_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.shipments_id_seq TO service_role;


--
-- Name: TABLE suppliers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.suppliers TO service_role;
GRANT SELECT,INSERT,UPDATE ON TABLE public.suppliers TO authenticated;


--
-- Name: TABLE task_notes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.task_notes TO anon;
GRANT ALL ON TABLE public.task_notes TO authenticated;
GRANT ALL ON TABLE public.task_notes TO service_role;


--
-- Name: TABLE task_schedule_memos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.task_schedule_memos TO anon;
GRANT ALL ON TABLE public.task_schedule_memos TO authenticated;
GRANT ALL ON TABLE public.task_schedule_memos TO service_role;


--
-- Name: TABLE task_tags; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.task_tags TO anon;
GRANT ALL ON TABLE public.task_tags TO authenticated;
GRANT ALL ON TABLE public.task_tags TO service_role;


--
-- Name: TABLE task_templates; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.task_templates TO authenticated;
GRANT ALL ON TABLE public.task_templates TO service_role;


--
-- Name: SEQUENCE task_templates_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.task_templates_id_seq TO anon;
GRANT ALL ON SEQUENCE public.task_templates_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.task_templates_id_seq TO service_role;


--
-- Name: TABLE tasks; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.tasks TO authenticated;
GRANT ALL ON TABLE public.tasks TO service_role;


--
-- Name: SEQUENCE tasks_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.tasks_id_seq TO anon;
GRANT ALL ON SEQUENCE public.tasks_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.tasks_id_seq TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

-- Default privileges owned by supabase_admin are platform-managed.


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

-- Default privileges owned by supabase_admin are platform-managed.


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

-- Default privileges owned by supabase_admin are platform-managed.


--
-- PostgreSQL database dump complete
--

-- End of public schema-only dump content.

-- Application-managed Supabase integration objects omitted by the public-only
-- logical dump. Platform schemas, roles, and internal objects are not recreated.

do $$
begin
  if to_regclass('auth.users') is null then
    raise exception 'Supabase platform object auth.users is required';
  end if;

  if not exists (
    select 1
    from pg_trigger t
    where t.tgrelid = 'auth.users'::regclass
      and t.tgname = 'on_auth_user_created_create_signup_request'
      and not t.tgisinternal
  ) then
    create trigger on_auth_user_created_create_signup_request
      after insert on auth.users
      for each row
      execute function public.handle_new_signup_request();
  end if;
end;
$$;

do $$
begin
  if to_regclass('storage.objects') is null then
    raise exception 'Supabase platform object storage.objects is required';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'project_files_storage_select'
  ) then
    create policy project_files_storage_select
      on storage.objects
      for select
      to authenticated
      using (bucket_id = 'project-files');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'project_files_storage_insert'
  ) then
    create policy project_files_storage_insert
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'project-files'
        and (storage.foldername(name))[1] = 'projects'
        and case
          when coalesce((storage.foldername(name))[2], '') ~ '^[0-9]+$'
            then exists (
              select 1
              from public.projects p
              where p.id = ((storage.foldername(storage.objects.name))[2])::bigint
            )
          else false
        end
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'project_files_storage_delete_admin'
  ) then
    create policy project_files_storage_delete_admin
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'project-files'
        and (select public.current_user_is_admin())
      );
  end if;
end;
$$;

do $$
declare
  target_table_name text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise exception 'Supabase platform publication supabase_realtime is required';
  end if;

  foreach target_table_name in array array[
    'accessory_items',
    'activity_logs',
    'coating_cost_allocations',
    'coating_cost_statements',
    'glass_cost_allocations',
    'glass_cost_statements',
    'material_contract_notification_events',
    'material_usage_groups',
    'material_usage_requests',
    'notification_reads',
    'personal_notes',
    'project_accessory_usages',
    'reference_tasks',
    'share_invitations',
    'shared_comment_mentions',
    'shared_comment_reads',
    'shared_comments',
    'shared_item_members',
    'task_notes'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = target_table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', target_table_name);
    end if;
  end loop;
end;
$$;
