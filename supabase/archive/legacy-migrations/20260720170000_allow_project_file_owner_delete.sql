-- File Center: allow an administrator or the original uploader to delete a file.
-- The storage object is deleted before its project_files metadata row, so the
-- storage policy can verify ownership against project_files.

drop policy if exists project_files_delete_admin on public.project_files;

create policy project_files_delete_admin_or_uploader
  on public.project_files
  for delete
  to authenticated
  using (
    uploaded_by_email = auth.jwt() ->> 'email'
    or exists (
      select 1
      from public.employees
      where employees.email = auth.jwt() ->> 'email'
        and employees.role = 'admin'
    )
  );

drop policy if exists project_files_objects_delete_admin on storage.objects;

create policy project_files_objects_delete_admin_or_uploader
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'project-files'
    and (
      exists (
        select 1
        from public.project_files
        where project_files.storage_path = storage.objects.name
          and project_files.uploaded_by_email = auth.jwt() ->> 'email'
      )
      or exists (
        select 1
        from public.employees
        where employees.email = auth.jwt() ->> 'email'
          and employees.role = 'admin'
      )
    )
  );
