-- Review submission and moderation permissions.
alter table public.reviews enable row level security;
grant select on table public.reviews to anon, authenticated;
grant insert (product_id, customer_name, rating, review_text, approved)
  on table public.reviews to anon, authenticated;
grant update (approved) on table public.reviews to authenticated;
grant delete on table public.reviews to authenticated;

drop policy if exists customers_read_approved_reviews on public.reviews;
create policy customers_read_approved_reviews
  on public.reviews for select to anon, authenticated
  using (approved is true);

drop policy if exists customers_submit_pending_reviews on public.reviews;
create policy customers_submit_pending_reviews
  on public.reviews for insert to anon, authenticated
  with check (
    approved is false
    and rating between 1 and 5
    and length(trim(customer_name)) between 2 and 100
    and length(trim(review_text)) between 3 and 2000
    and exists (
      select 1 from public.products p
      where p.id = product_id and p.active is true
    )
  );

drop policy if exists admins_manage_reviews on public.reviews;
create policy admins_manage_reviews
  on public.reviews for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Store settings remain publicly readable through their existing read policy.
-- Only administrators can update the customer-facing settings fields.
alter table public.store_settings enable row level security;
grant select on table public.store_settings to anon, authenticated;
drop policy if exists customers_read_store_settings on public.store_settings;
create policy customers_read_store_settings
  on public.store_settings for select to anon, authenticated
  using (true);
revoke update on table public.store_settings from public, anon, authenticated;
grant update (
  store_name, tagline, email, phone, whatsapp, domain, address,
  snapchat, instagram, facebook, tiktok,
  business_latitude, business_longitude, delivery_rate,
  delivery_distance_unit, distance_multiplier, max_delivery_distance_km,
  low_stock_default, cod_enabled, moolre_enabled, cod_accra_only,
  cod_hold_minutes,
  store_open, maintenance_mode, updated_at
) on table public.store_settings to authenticated;

drop policy if exists admins_update_store_settings on public.store_settings;
create policy admins_update_store_settings
  on public.store_settings for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Staff status changes go through a role-checked RPC. Assistants cannot cancel
-- orders; cancellation stays available to administrators and keeps using the
-- existing stock-restock routine.
create or replace function public.is_assistant()
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid()) and au.role = 'assistant'
  );
$$;

revoke all on function public.is_assistant() from public, anon;
grant execute on function public.is_assistant() to authenticated;

alter table public.admin_users enable row level security;
grant select (user_id, role) on table public.admin_users to authenticated;
drop policy if exists staff_can_read_own_role on public.admin_users;
create policy staff_can_read_own_role
  on public.admin_users for select to authenticated
  using (user_id = (select auth.uid()));

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
grant select on table public.orders, public.order_items to authenticated;
drop policy if exists admins_can_read_orders on public.orders;
create policy admins_can_read_orders
  on public.orders for select to authenticated
  using (public.is_admin());
drop policy if exists admins_can_read_order_items on public.order_items;
create policy admins_can_read_order_items
  on public.order_items for select to authenticated
  using (public.is_admin());
drop policy if exists assistants_can_read_orders on public.orders;
create policy assistants_can_read_orders
  on public.orders for select to authenticated
  using (public.is_assistant());
drop policy if exists assistants_can_read_order_items on public.order_items;
create policy assistants_can_read_order_items
  on public.order_items for select to authenticated
  using (public.is_assistant());

revoke update on table public.orders from public, anon, authenticated;
create or replace function public.update_staff_order_status(
  p_order_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_order public.orders%rowtype;
  v_cancel_result jsonb;
begin
  select au.role into v_role
  from public.admin_users au
  where au.user_id = (select auth.uid());

  if v_role is null or v_role not in ('admin', 'assistant') then
    raise exception 'Store staff access is required' using errcode = '42501';
  end if;

  if p_status is null or p_status not in (
    'pending', 'confirmed', 'processing', 'preparing',
    'out_for_delivery', 'shipped', 'delivered', 'cancelled'
  ) then
    raise exception 'Invalid order status' using errcode = '22023';
  end if;

  if p_status = 'cancelled' then
    if v_role <> 'admin' then
      raise exception 'Only an administrator can cancel an order' using errcode = '42501';
    end if;
    v_cancel_result := public.admin_cancel_order(p_order_id, true);
    if coalesce((v_cancel_result ->> 'ok')::boolean, false) is not true then
      raise exception 'The order could not be cancelled' using errcode = '40001';
    end if;
    select * into v_order from public.orders where id = p_order_id;
  else
    update public.orders
    set order_status = p_status,
        updated_at = now()
    where id = p_order_id
    returning * into v_order;
  end if;

  if not found or v_order.id is null then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', v_order.id,
    'status', v_order.order_status,
    'updated_at', v_order.updated_at
  );
end;
$$;

revoke all on function public.update_staff_order_status(uuid, text) from public, anon;
grant execute on function public.update_staff_order_status(uuid, text) to authenticated;

-- The assistant workspace handles orders only. Contacts and wholesale enquiries
-- now go directly to WhatsApp from the public site.
drop policy if exists assistants_can_read_contact_messages on public.contact_messages;
drop policy if exists assistants_can_read_wholesale_inquiries on public.wholesale_inquiries;
revoke select on table public.contact_messages, public.wholesale_inquiries from authenticated;

-- Rate limit customer email lookups without storing the email address or IP.
create table if not exists public.customer_order_lookup_attempts (
  key_hash text not null,
  attempted_at timestamptz not null default now()
);

create index if not exists customer_order_lookup_attempts_key_time_idx
  on public.customer_order_lookup_attempts (key_hash, attempted_at desc);

alter table public.customer_order_lookup_attempts enable row level security;
revoke all on table public.customer_order_lookup_attempts from public, anon, authenticated;
grant select, insert, delete on table public.customer_order_lookup_attempts to service_role;

create or replace function public.consume_customer_order_lookup(
  p_keys text[],
  p_max_attempts integer default 8,
  p_window_seconds integer default 900
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limited boolean;
  v_lock_key text;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Service role access is required' using errcode = '42501';
  end if;
  if p_keys is null or cardinality(p_keys) < 1 or cardinality(p_keys) > 4
    or p_max_attempts < 1 or p_window_seconds < 60 or p_window_seconds > 3600 then
    raise exception 'Invalid rate limit parameters' using errcode = '22023';
  end if;

  select string_agg(k, '|' order by k) into v_lock_key
  from (select distinct unnest(p_keys) as k) keys;
  perform pg_advisory_xact_lock(hashtext('customer-order-lookup:' || coalesce(v_lock_key, '')));

  delete from public.customer_order_lookup_attempts
  where attempted_at < now() - interval '1 day';

  select exists (
    select 1
    from (select distinct unnest(p_keys) as k) keys
    where (select count(*)
      from public.customer_order_lookup_attempts a
      where a.key_hash = keys.k
        and a.attempted_at > now() - make_interval(secs => p_window_seconds)
    ) >= p_max_attempts
  ) into v_limited;

  if v_limited then
    return false;
  end if;

  insert into public.customer_order_lookup_attempts (key_hash)
  select distinct input.key_hash from unnest(p_keys) as input(key_hash);
  return true;
end;
$$;

revoke all on function public.consume_customer_order_lookup(text[], integer, integer) from public, anon, authenticated;
grant execute on function public.consume_customer_order_lookup(text[], integer, integer) to service_role;
