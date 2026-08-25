-- Sprint 5-11D: remove table-level privileges that bypass or are unrelated to Core RLS.

begin;

revoke truncate, references, trigger
on table
  public.projects,
  public.tasks,
  public.shipments,
  public.activity_logs
from authenticated;

commit;
