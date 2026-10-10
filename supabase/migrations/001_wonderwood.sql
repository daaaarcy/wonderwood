-- Wonderwood household sync: one versioned JSON state doc per household.

create extension if not exists pgcrypto;

create table public.households (
  id uuid primary key default gen_random_uuid(),
  state jsonb not null,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null check (role in ('grown_up','device')),
  label text,
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table public.household_secrets (
  household_id uuid primary key references public.households on delete cascade,
  pin_hash text,
  failed_attempts int not null default 0,
  locked_until timestamptz
);

create table public.pairing_codes (
  code text primary key,
  household_id uuid not null references public.households on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz
);

-- rate limiting for pairing attempts
create table public.pairing_attempts (
  user_id uuid not null references auth.users on delete cascade,
  attempted_at timestamptz not null default now()
);
create index pairing_attempts_user_idx on public.pairing_attempts (user_id, attempted_at);

-- ---------------- PIN functions (service_role only) ----------------

create or replace function public.set_household_pin(hid uuid, pin text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into household_secrets (household_id, pin_hash, failed_attempts, locked_until)
  values (hid, crypt(pin, gen_salt('bf')), 0, null)
  on conflict (household_id)
  do update set pin_hash = crypt(pin, gen_salt('bf')), failed_attempts = 0, locked_until = null;
end;
$$;

create or replace function public.check_household_pin(hid uuid, pin text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
begin
  select * into s from household_secrets where household_id = hid for update;
  if not found or s.pin_hash is null then
    return false;
  end if;
  if s.locked_until is not null and s.locked_until > now() then
    return false;
  end if;
  if crypt(pin, s.pin_hash) = s.pin_hash then
    update household_secrets set failed_attempts = 0, locked_until = null where household_id = hid;
    return true;
  end if;
  update household_secrets
  set failed_attempts = s.failed_attempts + 1,
      locked_until = case when s.failed_attempts + 1 >= 5 then now() + interval '5 minutes' else null end
  where household_id = hid;
  return false;
end;
$$;

revoke all on function public.set_household_pin(uuid, text) from public, anon, authenticated;
revoke all on function public.check_household_pin(uuid, text) from public, anon, authenticated;
grant execute on function public.set_household_pin(uuid, text) to service_role;
grant execute on function public.check_household_pin(uuid, text) to service_role;

-- ---------------- RLS ----------------

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_secrets enable row level security;
alter table public.pairing_codes enable row level security;
alter table public.pairing_attempts enable row level security;

create policy households_select_member on public.households
  for select using (
    exists (
      select 1 from household_members m
      where m.household_id = id and m.user_id = auth.uid()
    )
  );

create policy household_members_select_own on public.household_members
  for select using (user_id = auth.uid());
-- plus: members can see who else is in their household
create policy household_members_select_household on public.household_members
  for select using (
    exists (
      select 1 from household_members m
      where m.household_id = household_members.household_id and m.user_id = auth.uid()
    )
  );

-- No insert/update/delete policies: all writes go through the game function
-- (service role bypasses RLS). household_secrets / pairing_codes /
-- pairing_attempts / _wonderwood_migrations get no policies at all.

-- realtime: household state rows broadcast updates
alter publication supabase_realtime add table public.households;
