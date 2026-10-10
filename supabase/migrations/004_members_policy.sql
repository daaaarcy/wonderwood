-- The household-scoped member policy recursed into its own table (PostgREST
-- 500). Clients only read their own row; member listing goes through the
-- game function with the service role.
drop policy if exists household_members_select_household on public.household_members;
