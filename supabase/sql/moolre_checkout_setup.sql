-- Moolre checkout schema and secure payment confirmation setup.
alter table public.store_settings
  add column if not exists moolre_enabled boolean not null default false;

alter table public.orders
  add column if not exists moolre_reference text not null
    default ('PBA-' || upper(replace(gen_random_uuid()::text, '-', '')));

create unique index if not exists orders_moolre_reference_key
  on public.orders (moolre_reference);

alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check
  check (payment_method = any (array['paystack', 'moolre', 'cash_on_delivery']));

alter table public.orders drop constraint if exists orders_moolre_ref_check;
alter table public.orders add constraint orders_moolre_ref_check
  check (payment_method <> 'moolre' or moolre_reference is not null);

grant update (moolre_enabled) on table public.store_settings to authenticated;

-- This storefront uses Moolre as its online payment option. The Edge Function
-- still rejects checkout until its server-side Moolre credentials are present.
update public.store_settings
set moolre_enabled = true
where id = true;

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
  v_base_method text;
  v_order jsonb;
  v_order_id uuid;
  v_momo_number text;
  v_momo_network text;
  v_reference text;
begin
  if v_method not in ('moolre', 'cash_on_delivery') then
    raise exception 'Invalid payment method';
  end if;

  if v_method = 'moolre' and not coalesce((select moolre_enabled from public.store_settings where id = true), false) then
    raise exception 'Online payment is currently unavailable';
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

  -- Reuse the existing, hardened order-creation RPC. Moolre is mapped to its
  -- existing online stock-hold path, then relabelled before this transaction commits.
  v_base_method := case when v_method = 'moolre' then 'paystack' else v_method end;
  v_order := public.create_order(
    p_customer_name, p_customer_email, p_customer_phone, p_delivery_address,
    p_latitude, p_longitude, v_base_method, p_items, p_whatsapp_number,
    p_delivery_instructions, p_delivery_region, p_notes
  );
  v_order_id := (v_order->>'order_id')::uuid;

  update public.orders
  set payment_method = v_method,
      paystack_reference = case when v_method = 'moolre' then null else paystack_reference end,
      momo_number = v_momo_number,
      momo_network = v_momo_network
  where id = v_order_id
  returning moolre_reference into v_reference;

  if not found then raise exception 'Order details could not be saved'; end if;
  return v_order || jsonb_build_object(
    'payment_method', v_method,
    'paystack_reference', null,
    'moolre_reference', v_reference,
    'momo_number', v_momo_number,
    'momo_network', v_momo_network
  );
end;
$function$;

create or replace function public.confirm_moolre_order(
  p_reference text,
  p_amount numeric,
  p_currency text,
  p_gateway_status text,
  p_transaction_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_order public.orders%rowtype;
  v_currency text;
  v_meta jsonb := case when jsonb_typeof(p_metadata) = 'object' then p_metadata else '{}'::jsonb end;
  v_status text := lower(coalesce(p_gateway_status, ''));
begin
  if not public.is_backend_caller() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select * into v_order from public.orders where moolre_reference = btrim(p_reference) for update;
  if not found or v_order.payment_method <> 'moolre' then raise exception 'Unknown Moolre payment reference'; end if;
  select currency into v_currency from public.store_settings where id = true;

  if v_order.payment_status = 'paid' then
    return jsonb_build_object('ok', true, 'already_confirmed', true, 'order_id', v_order.id, 'order_number', v_order.order_number);
  end if;
  if v_order.payment_status = 'refunded' then return jsonb_build_object('ok', false, 'reason', 'order_refunded'); end if;

  if v_status not in ('1', 'success', 'successful', 'paid') then
    if v_status in ('2', 'failed', 'failure') then update public.orders set payment_status = 'failed' where id = v_order.id; end if;
    return jsonb_build_object('ok', false, 'reason', 'payment_not_successful', 'gateway_status', p_gateway_status);
  end if;
  if upper(coalesce(p_currency, '')) <> upper(v_currency)
     or round(coalesce(p_amount, -1), 2) is distinct from round(v_order.total, 2) then
    update public.orders
      set attention_required = true,
          attention_reason = 'amount_mismatch',
          payment_metadata = payment_metadata || jsonb_build_object('last_mismatch', jsonb_build_object('amount', p_amount, 'currency', p_currency, 'at', now()))
      where id = v_order.id;
    return jsonb_build_object('ok', false, 'reason', 'amount_mismatch');
  end if;

  update public.orders
  set payment_status = 'paid', paid_at = now(), amount_paid = round(p_amount, 2),
      payment_metadata = v_meta || jsonb_build_object('moolre_transaction_id', p_transaction_id)
  where id = v_order.id;
  if v_order.order_status = 'cancelled' then
    update public.orders set attention_required = true, attention_reason = 'paid_after_cancellation' where id = v_order.id;
    return jsonb_build_object('ok', true, 'order_id', v_order.id, 'warning', 'paid_after_cancellation');
  end if;
  begin
    perform public._deduct_order_stock_impl(v_order.id);
    update public.orders set order_status = 'confirmed' where id = v_order.id and order_status = 'pending';
  exception when others then
    update public.orders set attention_required = true, attention_reason = 'stock_unavailable',
      admin_notes = concat_ws(E'\n', admin_notes, '[system] Moolre payment was verified, but stock deduction failed: ' || sqlerrm)
      where id = v_order.id;
  end;
  select * into v_order from public.orders where id = v_order.id;
  return jsonb_build_object('ok', true, 'order_id', v_order.id, 'order_number', v_order.order_number,
    'payment_status', v_order.payment_status, 'order_status', v_order.order_status,
    'stock_deducted', v_order.stock_deducted, 'attention_required', v_order.attention_required);
end;
$function$;

revoke all on function public.confirm_moolre_order(text, numeric, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.confirm_moolre_order(text, numeric, text, text, text, jsonb) to service_role;
