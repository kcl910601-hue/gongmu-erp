-- Sprint F-2: Project files storage and metadata foundation
-- Apply manually in Supabase. This migration does not modify existing tables
-- except for adding references from the new project_files table.

create extension if not exists pgcrypto;

do $$
declare
  projects_id_type text;
begin
  select udt_name
    into projects_id_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'projects'
    and column_name = 'id';

  if projects_id_type is null then
    raise exception 'public.projects.id column was not found.';
  end if;

  if projects_id_type <> 'int8' then
    raise exception 'public.projects.id type is %, but project_files.project_id migration expects int8(bigint). Adjust project_id type before applying.', projects_id_type;
  end if;
end $$;

create table if not exists public.project_files (
  id uuid primary key default gen_random_uuid(),
  project_id bigint not null references public.projects(id) on delete cascade,
  file_name text not null,
  file_type text not null,
  storage_path text not null unique,
  file_size bigint,
  mime_type text,
  description text,
  uploaded_by text,
  uploaded_by_email text,
  created_at timestamptz not null default now(),
  constraint project_files_file_type_check
    check (
      file_type in (
        'drawing',
        'site_photo',
        'contract',
        'estimate',
        'completion_document',
        'other'
      )
    )
);

create index if not exists project_files_project_id_idx
  on public.project_files(project_id);

create index if not exists project_files_created_at_idx
  on public.project_files(created_at desc);

create index if not exists project_files_file_type_idx
  on public.project_files(file_type);

alter table public.project_files enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'project_files'
      and policyname = 'project_files_select_authenticated'
  ) then
    execute 'create policy project_files_select_authenticated
      on public.project_files
      for select
      to authenticated
      using (true)';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'project_files'
      and policyname = 'project_files_insert_authenticated'
  ) then
    execute 'create policy project_files_insert_authenticated
      on public.project_files
      for insert
      to authenticated
      with check (
        storage_path like (''projects/'' || project_id::text || ''/%'')
      )';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'project_files'
      and policyname = 'project_files_delete_admin'
  ) then
    execute 'create policy project_files_delete_admin
      on public.project_files
      for delete
      to authenticated
      using (
        exists (
          select 1
          from public.employees
          where employees.email = auth.jwt() ->> ''email''
            and employees.role = ''admin''
        )
      )';
  end if;
end $$;

insert into storage.buckets (id, name, public)
values ('project-files', 'project-files', false)
on conflict (id) do update
set public = false;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'project_files_objects_select_authenticated'
  ) then
    execute 'create policy project_files_objects_select_authenticated
      on storage.objects
      for select
      to authenticated
      using (bucket_id = ''project-files'')';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'project_files_objects_insert_authenticated'
  ) then
    execute 'create policy project_files_objects_insert_authenticated
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = ''project-files''
        and name like ''projects/%''
      )';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'project_files_objects_delete_admin'
  ) then
    execute 'create policy project_files_objects_delete_admin
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = ''project-files''
        and exists (
          select 1
          from public.employees
          where employees.email = auth.jwt() ->> ''email''
            and employees.role = ''admin''
        )
      )';
  end if;
end $$;
