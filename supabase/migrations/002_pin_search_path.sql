-- pgcrypto lives in the extensions schema on Supabase — the security-definer
-- PIN functions must see it in search_path or crypt() can't be found.

create or replace function public.set_household_pin(hid uuid, pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
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
set search_path = public, extensions
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
