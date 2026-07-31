begin;
alter table public.personal_notes drop constraint if exists personal_notes_color_check;
alter table public.personal_notes add constraint personal_notes_color_check
  check (color in ('default','yellow','green','red','blue'));
notify pgrst, 'reload schema';
commit;
