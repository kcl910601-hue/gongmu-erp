begin;

create table if not exists public.personal_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  note_type text not null,
  title text not null default '',
  content text not null default '',
  is_completed boolean not null default false,
  is_pinned boolean not null default false,
  color text not null default 'default',
  due_date date,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint personal_notes_type_check check (note_type in ('memo','todo','sticky','reminder')),
  constraint personal_notes_color_check check (color in ('default','yellow','red','green')),
  constraint personal_notes_title_check check (char_length(title) <= 200),
  constraint personal_notes_content_check check (char_length(content) <= 5000),
  constraint personal_notes_body_check check (char_length(trim(title)) > 0 or char_length(trim(content)) > 0)
);

create index if not exists personal_notes_user_sort_idx
  on public.personal_notes(user_id, is_pinned desc, is_completed, sort_order, created_at desc);
create index if not exists personal_notes_user_due_idx
  on public.personal_notes(user_id, due_date) where due_date is not null;

create or replace function public.set_personal_notes_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_personal_notes_updated_at on public.personal_notes;
create trigger set_personal_notes_updated_at
before update on public.personal_notes
for each row execute function public.set_personal_notes_updated_at();

alter table public.personal_notes enable row level security;
create policy personal_notes_select_own on public.personal_notes for select to authenticated using (user_id = auth.uid());
create policy personal_notes_insert_own on public.personal_notes for insert to authenticated with check (user_id = auth.uid());
create policy personal_notes_update_own on public.personal_notes for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy personal_notes_delete_own on public.personal_notes for delete to authenticated using (user_id = auth.uid());

revoke all on public.personal_notes from anon, authenticated;
grant select, insert, update, delete on public.personal_notes to authenticated;
notify pgrst, 'reload schema';
commit;
