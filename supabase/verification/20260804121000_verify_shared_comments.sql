select to_regclass('public.shared_comments') as shared_comments_table;

select column_name, data_type, udt_name, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'shared_comments'
order by ordinal_position;

select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.shared_comments'::regclass
order by conname;

select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'shared_comments'
order by indexname;

select relrowsecurity
from pg_class
where oid = 'public.shared_comments'::regclass;

select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'shared_comments'
order by policyname;

select count(*) as orphan_comment_count
from public.shared_comments c
left join public.shared_items i on i.id = c.shared_item_id
where i.id is null;
