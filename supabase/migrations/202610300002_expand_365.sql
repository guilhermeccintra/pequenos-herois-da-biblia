-- Expand the existing collection without changing IDs, user progress or billing.
-- Apply after 202610300001_initial.sql, including on existing installations.
begin;
alter table public.stories drop constraint if exists stories_id_check;
alter table public.stories add constraint stories_id_check check (id between 1 and 365);
commit;
