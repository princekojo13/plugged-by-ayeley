-- Enable the storefront's Moolre online option. Checkout cannot start a
-- payment until the required Edge Function secrets are configured.
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
  if v_method not in ('moolre', 'paystack', 'cash_on_delivery') then
    raise exception 'Invalid payment method';
  end if;
  if v_method = 'moolre' and not coalesce((select moolre_enabled from public.store_settings where id = true), false) then
    raise exception 'Online payment is currently unavailable';
  end if;

  if v_method in ('moolre', 'cash_on_delivery') then
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
    'paystack_reference', case when v_method = 'moolre' then null else v_order->>'paystack_reference' end,
    'moolre_reference', v_reference,
    'momo_number', v_momo_number,
    'momo_network', v_momo_network
  );
end;
$function$;
