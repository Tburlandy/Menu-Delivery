-- Public menu and WhatsApp Delivery availability use this helper. A grace entitlement
-- is effective only until its explicit deadline.

create or replace function menus.has_entitlement(p_unit_id uuid,p_product text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from core.entitlements e
    where e.unit_id=p_unit_id
      and e.product_code=p_product
      and (
        e.status='ACTIVE'
        or (e.status='GRACE_PERIOD' and e.grace_until>now())
      )
  )
$$;

revoke all on function menus.has_entitlement(uuid,text) from public,anon,authenticated;
grant execute on function menus.has_entitlement(uuid,text) to service_role;
