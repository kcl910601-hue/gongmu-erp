-- Sprint DB-2 Foreign Key Audit & Integrity
-- Draft only. Do not run against remote Supabase until the validation queries
-- below return no orphan rows and delete policy is approved.

-- 1. Preflight validation

-- tasks.project_id must point to an existing projects.id.
-- select tasks.id, tasks.project_id
-- from public.tasks
-- left join public.projects on projects.id = tasks.project_id
-- where projects.id is null;

-- shipments.project_id is currently nullable in code paths but NOT NULL in CSV.
-- Every non-null value must point to an existing projects.id.
-- select shipments.id, shipments.project_id
-- from public.shipments
-- left join public.projects on projects.id = shipments.project_id
-- where shipments.project_id is not null
--   and projects.id is null;

-- shipments.task_id is nullable and should remain optional.
-- Every non-null value must point to an existing tasks.id.
-- select shipments.id, shipments.task_id
-- from public.shipments
-- left join public.tasks on tasks.id = shipments.task_id
-- where shipments.task_id is not null
--   and tasks.id is null;

-- activity_logs.project_id is nullable and should preserve history.
-- Every non-null value should point to an existing projects.id before FK apply.
-- select activity_logs.id, activity_logs.project_id
-- from public.activity_logs
-- left join public.projects on projects.id = activity_logs.project_id
-- where activity_logs.project_id is not null
--   and projects.id is null;

-- 2. Draft FK statements

-- alter table public.tasks
-- add constraint tasks_project_id_fkey
-- foreign key (project_id)
-- references public.projects(id)
-- on update cascade
-- on delete restrict
-- not valid;

-- alter table public.shipments
-- add constraint shipments_project_id_fkey
-- foreign key (project_id)
-- references public.projects(id)
-- on update cascade
-- on delete restrict
-- not valid;

-- alter table public.shipments
-- add constraint shipments_task_id_fkey
-- foreign key (task_id)
-- references public.tasks(id)
-- on update cascade
-- on delete set null
-- not valid;

-- alter table public.activity_logs
-- add constraint activity_logs_project_id_fkey
-- foreign key (project_id)
-- references public.projects(id)
-- on update cascade
-- on delete set null
-- not valid;

-- 3. Validation after cleanup and approval

-- alter table public.tasks validate constraint tasks_project_id_fkey;
-- alter table public.shipments validate constraint shipments_project_id_fkey;
-- alter table public.shipments validate constraint shipments_task_id_fkey;
-- alter table public.activity_logs validate constraint activity_logs_project_id_fkey;
