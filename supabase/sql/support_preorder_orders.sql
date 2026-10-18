-- Allow checkout to save out-of-stock cart lines as preorder order items.
-- This RPC is service-role-only; the create-order Edge Function validates the
-- preorder flag against live stock and enforces the five-unit preorder limit.
alter table public.order_items
  add column if not exists is_preorder boolean not null default false;
alter table public.order_items
  add column if not exists preorder_status text not null default 'pending'
  check (preorder_status in ('pending', 'confirmed', 'sourcing', 'shipped', 'received', 'delivered', 'cancelled'));

-- Staff update a preorder line independently from the delivery status of any
-- in-stock products in the same checkout.
create or replace function public.update_staff_preorder_status(
  p_order_item_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_role text;
  v_item public.order_items%rowtype;
begin
  select au.role into v_role
  from public.admin_users au
  where au.user_id = (select auth.uid());
  if v_role is null or v_role not in ('admin', 'assistant') then
    raise exception 'Store staff access is required' using errcode = '42501';
  end if;
  if p_status is null or p_status not in (
    'pending', 'confirmed', 'sourcing', 'shipped', 'received', 'delivered', 'cancelled'
  ) then
    raise exception 'Invalid pre-order status' using errcode = '22023';
  end if;
  update public.order_items
    set preorder_status = p_status
    where id = p_order_item_id and is_preorder is true
    returning * into v_item;
  if not found then
    raise exception 'Pre-order item not found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'ok', true,
    'id', v_item.id,
    'status', v_item.preorder_status,
    'updated_at', now()
  );
end;
$function$;
revoke all on function public.update_staff_preorder_status(uuid, text) from public, anon;
grant execute on function public.update_staff_preorder_status(uuid, text) to authenticated;

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
as $function$
declare
  v_method text := lower(btrim(coalesce(p_payment_method, '')));
  v_order jsonb;
  v_order_id uuid;
  v_momo_number text;
  v_momo_network text;
  v_moolre_reference text;
  v_store_open boolean;
  v_maintenance_mode boolean;
  v_moolre_enabled boolean;
  v_cod_enabled boolean;
  v_item jsonb;
  v_product_id uuid;
  v_quantity integer;
  v_preorder_ids uuid[] := array[]::uuid[];
begin
  if v_method not in ('moolre', 'cash_on_delivery') then
    raise exception 'Invalid payment method';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Your cart is empty or invalid';
  end if;

  select store_open, maintenance_mode, moolre_enabled, cod_enabled
  into v_store_open, v_maintenance_mode, v_moolre_enabled, v_cod_enabled
  from public.store_settings where id = true for share;
  if not found then raise exception 'Checkout settings are temporarily unavailable'; end if;
  if not coalesce(v_store_open, false) or coalesce(v_maintenance_mode, true) then
    raise exception 'The store is currently closed and cannot accept orders';
  end if;
  if v_method = 'moolre' and not coalesce(v_moolre_enabled, false) then
    raise exception 'Online payment is currently unavailable';
  end if;
  if v_method = 'cash_on_delivery' and not coalesce(v_cod_enabled, false) then
    raise exception 'Cash on delivery is currently unavailable';
  end if;

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

  -- The legacy order RPC has no preorder flag and rejects zero stock. Lock only
  -- verified zero-stock products, temporarily provide the requested quantity
  -- while it creates the order, then restore their true zero stock in the same
  -- transaction. The row locks serialize this with other order operations.
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if coalesce((v_item->>'preorder')::boolean, false) then
      v_product_id := (v_item->>'product_id')::uuid;
      v_quantity := (v_item->>'quantity')::integer;
      if v_quantity not between 1 and 5 then
        raise exception 'Pre-orders are limited to 5 of each out-of-stock product';
      end if;
      update public.products
      set stock_quantity = v_quantity
      where id = v_product_id and active is true and coalesce(stock_quantity, 0) = 0;
      if not found then
        raise exception 'Pre-order availability changed. Refresh your cart and try again';
      end if;
      v_preorder_ids := array_append(v_preorder_ids, v_product_id);
    end if;
  end loop;

  v_order := public.create_order(
    p_customer_name, p_customer_email, p_customer_phone, p_delivery_address,
    p_latitude, p_longitude,
    case when v_method = 'moolre' then 'paystack' else v_method end,
    p_items, p_whatsapp_number,
    p_delivery_instructions, p_delivery_region, p_notes
  );
  v_order_id := nullif(v_order->>'order_id', '')::uuid;
  if v_order_id is null then raise exception 'Order could not be saved'; end if;

  if cardinality(v_preorder_ids) > 0 then
    update public.products set stock_quantity = 0 where id = any(v_preorder_ids);
    update public.order_items
    set is_preorder = true
    where order_id = v_order_id and product_id = any(v_preorder_ids);
  end if;

  update public.orders
  set payment_method = v_method,
      paystack_reference = case when v_method = 'moolre' then null else paystack_reference end,
      momo_number = nullif(v_momo_number, ''),
      momo_network = nullif(v_momo_network, '')
  where id = v_order_id
  returning moolre_reference into v_moolre_reference;
  if not found then raise exception 'Order details could not be saved'; end if;

  return v_order || jsonb_build_object(
    'payment_method', v_method,
    'paystack_reference', null,
    'moolre_reference', v_moolre_reference,
    'momo_number', nullif(v_momo_number, ''),
    'momo_network', nullif(v_momo_network, ''),
    'has_preorder', cardinality(v_preorder_ids) > 0,
    'preorder_product_ids', to_jsonb(v_preorder_ids)
  );
end;
$function$;

revoke all on function public.create_order_with_momo(
  text, text, text, text, numeric, numeric, text, jsonb,
  text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.create_order_with_momo(
  text, text, text, text, numeric, numeric, text, jsonb,
  text, text, text, text, text, text
) to service_role;
