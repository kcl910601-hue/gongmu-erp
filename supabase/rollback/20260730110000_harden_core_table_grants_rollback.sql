-- Emergency rollback for 20260730110000_harden_core_table_grants.sql.
-- This restores the exact extra grants observed before Sprint 5-11D.

begin;

grant truncate, references, trigger
on table
  public.projects,
  public.tasks,
  public.shipments,
  public.activity_logs
to authenticated;

commit;
