-- Use the PBA order number as a high-entropy bearer code for shipment status.
-- Keep exact address, coordinates, payment amounts, and item details behind the
-- verified email flow in My Orders.

create or replace function public.generate_order_number()
returns text
language sql
set search_path to 'public', 'pg_temp'
as $function$
  select 'PBA-' || upper(substr(h, 1, 8)) || '-' || upper(substr(h, 9, 8))
  from (select replace(gen_random_uuid()::text, '-', '') as h) s;
$function$;

create or replace function public.track_order(p_order_number text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_order public.orders%rowtype;
  v_key text := upper(btrim(coalesce(p_order_number, '')));
  v_att public.track_order_attempts%rowtype;
begin
  if v_key !~ '^PBA-([0-9A-F]{5}-[0-9A-F]{5}|[0-9A-F]{8}-[0-9A-F]{8})$' then
    return null;
  end if;

  if random() < 0.02 then
    delete from public.track_order_attempts
    where window_started_at < now() - interval '1 day';
  end if;

  select * into v_att
  from public.track_order_attempts
  where order_key = v_key;

  if found
     and v_att.window_started_at > now() - interval '15 minutes'
     and v_att.failures >= 8 then
    raise exception 'Too many attempts. Please wait a few minutes and try again.';
  end if;

  if (select coalesce(sum(failures), 0)
      from public.track_order_attempts
      where window_started_at > now() - interval '10 minutes') >= 300 then
    raise exception 'Tracking is busy right now. Please try again in a few minutes.';
  end if;

  select * into v_order
  from public.orders
  where order_number = v_key;

  if not found then
    insert into public.track_order_attempts as t (
      order_key,
      window_started_at,
      failures
    ) values (v_key, now(), 1)
    on conflict (order_key) do update
      set window_started_at = case
            when t.window_started_at < now() - interval '15 minutes' then now()
            else t.window_started_at
          end,
          failures = case
            when t.window_started_at < now() - interval '15 minutes' then 1
            else t.failures + 1
          end;
    return null;
  end if;

  delete from public.track_order_attempts where order_key = v_key;

  return jsonb_build_object(
    'order_number', v_order.order_number,
    'order_status', v_order.order_status,
    'created_at', v_order.created_at,
    'delivery_region', v_order.delivery_region
  );
end;
$function$;

-- The Edge Function is the only caller. It uses the service role key and enforces
-- the public request limits before calling this SECURITY DEFINER function.
revoke execute on function public.track_order(text) from public, anon, authenticated;
grant execute on function public.track_order(text) to service_role;

-- Keep the old Edge Function working during rollout, but remove direct client
-- access to the contact-checking overload now that it is no longer the public API.
revoke execute on function public.track_order(text, text) from public, anon, authenticated;
grant execute on function public.track_order(text, text) to service_role;

-- New order numbers carry 64 random bits. The lookup accepts the prior 40-bit
-- PBA format as well so existing order confirmations continue to work.
