-- Preserve the Mobile Money details collected for Pay on Delivery orders.
alter table public.orders
  add column if not exists momo_number text,
  add column if not exists momo_network text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_momo_number_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_momo_number_check
      check (
        momo_number is null
        or char_length(momo_number) <= 30
        and momo_number ~ '^[+0-9() -]+$'
        and char_length(regexp_replace(momo_number, '\D', '', 'g')) between 9 and 15
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_momo_network_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_momo_network_check
      check (momo_network is null or momo_network in ('MTN', 'Telecel', 'AirtelTigo'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_momo_pair_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_momo_pair_check
      check ((momo_number is null) = (momo_network is null));
  end if;
end
$$;

create or replace function public.create_order_with_momo(
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_delivery_address text,
  p_latitude numeric,
  p_longitude numeric,
  p_payment_method text,
  p_items jsonb,
  p_whatsapp_number text,
  p_delivery_instructions text,
  p_delivery_region text,
  p_notes text,
  p_momo_number text,
  p_momo_network text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order jsonb;
  v_order_id uuid;
  v_momo_number text;
  v_momo_network text;
  v_store_open boolean;
  v_maintenance_mode boolean;
  v_moolre_enabled boolean;
  v_cod_enabled boolean;
begin
  select store_open, maintenance_mode, moolre_enabled, cod_enabled
  into v_store_open, v_maintenance_mode, v_moolre_enabled, v_cod_enabled
  from public.store_settings
  where id = true
  for share;

  if not found then
    raise exception 'Checkout settings are temporarily unavailable';
  end if;

  if not coalesce(v_store_open, false) or coalesce(v_maintenance_mode, true) then
    raise exception 'The store is currently closed and cannot accept orders';
  end if;

  if lower(btrim(coalesce(p_payment_method, ''))) = 'moolre'
    and not coalesce(v_moolre_enabled, false) then
    raise exception 'Online payment is currently unavailable';
  end if;

  if lower(btrim(coalesce(p_payment_method, ''))) = 'cash_on_delivery'
    and not coalesce(v_cod_enabled, false) then
    raise exception 'Cash on delivery is currently unavailable';
  end if;

  if lower(btrim(coalesce(p_payment_method, ''))) = 'cash_on_delivery' then
    v_momo_number := btrim(coalesce(p_momo_number, ''));
    v_momo_network := btrim(coalesce(p_momo_network, ''));

    if char_length(regexp_replace(v_momo_number, '\D', '', 'g')) not between 9 and 15
      or char_length(v_momo_number) > 30
      or v_momo_number !~ '^[+0-9() -]+$' then
      raise exception 'Please enter a valid Mobile Money number';
    end if;

    if v_momo_network not in ('MTN', 'Telecel', 'AirtelTigo') then
      raise exception 'Please select a valid Mobile Money network';
    end if;
  else
    v_momo_number := null;
    v_momo_network := null;
  end if;

  v_order := public.create_order(
    p_customer_name,
    p_customer_email,
    p_customer_phone,
    p_delivery_address,
    p_latitude,
    p_longitude,
    p_payment_method,
    p_items,
    p_whatsapp_number,
    p_delivery_instructions,
    p_delivery_region,
    p_notes
  );

  if v_order->>'order_id' is null then
    raise exception 'Order could not be saved';
  end if;

  v_order_id := (v_order->>'order_id')::uuid;
  update public.orders
  set momo_number = nullif(v_momo_number, ''),
      momo_network = nullif(v_momo_network, '')
  where id = v_order_id;

  if not found then
    raise exception 'Order details could not be saved';
  end if;

  return v_order;
end;
$$;

revoke all on function public.create_order_with_momo(
  text, text, text, text, numeric, numeric, text, jsonb,
  text, text, text, text, text, text
) from public, anon, authenticated;

grant execute on function public.create_order_with_momo(
  text, text, text, text, numeric, numeric, text, jsonb,
  text, text, text, text, text, text
) to service_role;
