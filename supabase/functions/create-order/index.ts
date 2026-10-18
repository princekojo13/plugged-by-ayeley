import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://pluggedbyayeley.com",
  "https://www.pluggedbyayeley.com",
  "https://plugged-by-ayeley.onrender.com",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:4173",
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, apikey, x-client-info, content-type",
    "Content-Type": "application/json",
    "Vary": "Origin",
  };

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

function respond(
  body: Record<string, unknown>,
  status: number,
  headers: Record<string, string>,
) {
  return new Response(JSON.stringify(body), { status, headers });
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown, limit: number): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function number(value: unknown): number {
  if (value === null || value === undefined || value === "") return NaN;
  return Number(value);
}

function isCustomerError(message: string): boolean {
  return [
    "Please enter a valid name",
    "Please enter a valid email address",
    "Please enter a valid phone number",
    "Please enter a valid delivery address",
    "Invalid payment method",
    "Online payment is currently unavailable",
    "Cash on delivery is currently unavailable",
    "Your cart is empty or invalid",
    "Invalid cart item",
    "Quantity must be between 1 and 100 per product",
    "Too many recent orders. Please try again later",
    "One or more products are no longer available",
    "Sorry, this address is outside our delivery range",
    "The store is currently closed and cannot accept orders",
    "Cash on delivery is only available within Greater Accra",
    "Please enter a valid Mobile Money number",
    "Please select a valid Mobile Money network",
  ].some((known) => message.includes(known)) ||
    message.startsWith("Insufficient stock for ");
}

async function createOrderQuote(
  db: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Response> {
  const latitude = number(body.delivery_lat ?? body.latitude);
  const longitude = number(body.delivery_lng ?? body.longitude);
  if (
    !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
    !Number.isFinite(longitude) || longitude < -180 || longitude > 180
  ) {
    return respond({ success: false, error: "Select a valid delivery location on the map." }, 400, headers);
  }

  const incomingItems = body.items ?? body.cartItems;
  if (!Array.isArray(incomingItems) || incomingItems.length === 0 || incomingItems.length > 50) {
    return respond({ success: false, error: "Your cart is empty or invalid." }, 400, headers);
  }

  const quantities = new Map<string, number>();
  for (const value of incomingItems) {
    const item = record(value);
    const productId = text(item.product_id ?? item.productId ?? item.id, 40).toLowerCase();
    const quantity = number(item.quantity ?? item.qty);
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId) ||
      !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100
    ) {
      return respond({ success: false, error: "One or more cart items are invalid." }, 400, headers);
    }
    const totalQuantity = (quantities.get(productId) || 0) + quantity;
    if (totalQuantity > 100) {
      return respond({ success: false, error: "Quantity must be between 1 and 100 per product." }, 400, headers);
    }
    quantities.set(productId, totalQuantity);
  }

  const productIds = [...quantities.keys()];
  const [productsResult, settingsResult] = await Promise.all([
    db.from("products").select("id,price,stock_quantity").in("id", productIds).eq("active", true),
    db.from("store_settings").select("max_delivery_distance_km").eq("id", true).maybeSingle(),
  ]);

  if (productsResult.error || settingsResult.error || !settingsResult.data) {
    console.error("Order quote settings or products could not be loaded.");
    return respond({ success: false, error: "We couldn't calculate your order total. Please try again." }, 503, headers);
  }

  const products = productsResult.data || [];
  if (products.length !== productIds.length) {
    return respond({ success: false, error: "One or more items are no longer available. Refresh your cart and try again." }, 409, headers);
  }

  for (const product of products) {
    const quantity = quantities.get(product.id) || 0;
    const stock = Math.max(0, Number(product.stock_quantity) || 0);
    if (quantity > stock) {
      return respond({ success: false, error: "Your cart quantity exceeds the available stock. Please update your cart." }, 409, headers);
    }
  }

  const priceById = new Map(products.map((product) => [product.id, Number(product.price)]));
  if ([...priceById.values()].some((price) => !Number.isFinite(price) || price < 0)) {
    console.error("Order quote product prices are invalid.");
    return respond({ success: false, error: "We couldn't calculate your order total. Please try again." }, 503, headers);
  }
  const subtotalValue = [...quantities.entries()].reduce(
    (sum, [productId, quantity]) => sum + (priceById.get(productId) ?? 0) * quantity,
    0,
  );
  if (!Number.isFinite(subtotalValue) || subtotalValue < 0) {
    return respond({ success: false, error: "We couldn't calculate your order total. Please try again." }, 503, headers);
  }
  const subtotal = Math.round((subtotalValue + Number.EPSILON) * 100) / 100;

  const { data: distance, error: distanceError } = await db.rpc("calculate_distance_km", {
    p_latitude: latitude,
    p_longitude: longitude,
  });
  const distanceKm = Number(distance);
  if (distanceError || distance === null || distance === undefined || !Number.isFinite(distanceKm)) {
    console.error("Order quote distance could not be calculated.");
    return respond({ success: false, error: "We couldn't calculate delivery for this location. Please try again." }, 503, headers);
  }

  const maxDistance = settingsResult.data.max_delivery_distance_km;
  if (maxDistance !== null && maxDistance !== undefined && distanceKm > Number(maxDistance)) {
    return respond({ success: false, error: "Sorry, this address is outside our delivery range." }, 400, headers);
  }

  const { data: deliveryFee, error: feeError } = await db.rpc("calculate_delivery_fee", {
    distance_km: distanceKm,
  });
  const deliveryFeeValue = Number(deliveryFee);
  if (feeError || deliveryFee === null || deliveryFee === undefined || !Number.isFinite(deliveryFeeValue) || deliveryFeeValue < 0) {
    console.error("Order quote delivery fee could not be calculated.");
    return respond({ success: false, error: "We couldn't calculate delivery for this location. Please try again." }, 503, headers);
  }

  const total = Math.round((subtotal + deliveryFeeValue + Number.EPSILON) * 100) / 100;
  return respond({
    success: true,
    quote: {
      subtotal,
      delivery_fee: deliveryFeeValue,
      total,
      distance_km: distanceKm,
      currency: "GHS",
      items: [...quantities.entries()].map(([productId, quantity]) => {
        const unitPrice = priceById.get(productId) ?? 0;
        return {
          product_id: productId,
          quantity,
          unit_price: unitPrice,
          line_total: Math.round((unitPrice * quantity + Number.EPSILON) * 100) / 100,
        };
      }),
    },
  }, 200, headers);
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return respond({ success: false, error: "Forbidden origin." }, 403, headers);
    }
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== "POST") {
    return respond({ success: false, error: "Method not allowed." }, 405, headers);
  }

  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return respond({ success: false, error: "Forbidden origin." }, 403, headers);
  }

  try {
    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).length > 65_536) {
      return respond({ success: false, error: "Request is too large." }, 413, headers);
    }

    let body: Record<string, unknown>;
    try {
      body = record(JSON.parse(rawBody));
    } catch {
      return respond({ success: false, error: "Invalid request body." }, 400, headers);
    }

    if (text(body.action, 20).toLowerCase() === "quote") {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!supabaseUrl || !serviceRoleKey) {
        console.error("create-order: Supabase server configuration is missing.");
        return respond({ success: false, error: "Checkout is temporarily unavailable." }, 503, headers);
      }
      const db = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      return await createOrderQuote(db, body, headers);
    }

    const fullName = text(body.full_name ?? body.fullName, 120);
    const email = text(body.email, 254).toLowerCase();
    const phone = text(body.phone, 30);
    const address = text(body.delivery_address ?? body.address, 500);
    const region = text(body.delivery_region ?? body.region ?? body.city, 100);
    const orderNote = text(body.order_note ?? body.notes, 1200);
    const latitude = number(body.delivery_lat ?? body.latitude);
    const longitude = number(body.delivery_lng ?? body.longitude);
    const paymentInput = text(body.payment_method ?? body.paymentMethod, 40)
      .toLowerCase().replaceAll(" ", "_").replaceAll("-", "_");

    const paymentMethod = paymentInput === "pay_on_delivery" ||
        paymentInput === "cod" || paymentInput === "cash_on_delivery"
      ? "cash_on_delivery"
      : paymentInput === "moolre" || paymentInput === "online"
      ? "moolre"
      : "";
    const momoNumber = text(body.momo_number, 254);
    const momoNetwork = text(body.momo_network, 20);

    if (fullName.length < 2 || fullName.length > 120) {
      return respond({ success: false, error: "Please enter a valid name." }, 400, headers);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return respond({ success: false, error: "Please enter a valid email address." }, 400, headers);
    }
    if (phone.replace(/\D/g, "").length < 9 || phone.replace(/\D/g, "").length > 15) {
      return respond({ success: false, error: "Please enter a valid phone number." }, 400, headers);
    }
    if (address.length < 5 || address.length > 500 || !region) {
      return respond({ success: false, error: "Please enter a valid delivery address and region." }, 400, headers);
    }
    if (!paymentMethod) {
      return respond({ success: false, error: "Select a valid payment method." }, 400, headers);
    }
    if (paymentMethod === "cash_on_delivery" || paymentMethod === "moolre") {
      const momoDigits = momoNumber.replace(/\D/g, "");
      if (
        momoDigits.length < 9 ||
        momoDigits.length > 15 ||
        momoNumber.length > 30 ||
        !/^[+0-9()\s-]+$/.test(momoNumber)
      ) {
        return respond({ success: false, error: "Please enter a valid Mobile Money number." }, 400, headers);
      }
      if (!["MTN", "Telecel", "AirtelTigo"].includes(momoNetwork)) {
        return respond({ success: false, error: "Please select a valid Mobile Money network." }, 400, headers);
      }
    }
    if (
      !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180
    ) {
      return respond({ success: false, error: "Select a valid delivery location on the map." }, 400, headers);
    }

    const incomingItems = body.items ?? body.cartItems;
    if (!Array.isArray(incomingItems) || incomingItems.length === 0 || incomingItems.length > 50) {
      return respond({ success: false, error: "Your cart is empty or invalid." }, 400, headers);
    }

    const items = incomingItems.map((value: unknown) => {
      const item = record(value);
      return {
        product_id: text(item.product_id ?? item.productId ?? item.id, 40),
        quantity: number(item.quantity ?? item.qty),
      };
    });

    if (items.some((item) => !item.product_id || !Number.isSafeInteger(item.quantity))) {
      return respond({ success: false, error: "One or more cart items are invalid." }, 400, headers);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      console.error("create-order: Supabase server configuration is missing.");
      return respond({ success: false, error: "Checkout is temporarily unavailable." }, 503, headers);
    }

    const moolreUser = Deno.env.get("MOOLRE_API_USER");
    const moolrePubkey = Deno.env.get("MOOLRE_API_PUBKEY");
    const moolreAccount = Deno.env.get("MOOLRE_ACCOUNT_NUMBER");
    if (paymentMethod === "moolre" && (!moolreUser || !moolrePubkey || !moolreAccount)) {
      return respond({ success: false, error: "Moolre Mobile Money is not configured yet." }, 503, headers);
    }

    const db = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const requestedProductIds = [...new Set(items.map((item) => item.product_id))];
    const { data: activeProducts, error: productError } = await db
      .from("products")
      .select("id,stock_quantity")
      .in("id", requestedProductIds)
      .eq("active", true);
    if (productError) {
      console.error("create-order: Product availability could not be checked.");
      return respond({ success: false, error: "Product availability could not be checked. Please try again." }, 503, headers);
    }

    const activeProductIds = new Set((activeProducts || []).map((product) => product.id));
    if (requestedProductIds.some((productId) => !activeProductIds.has(productId))) {
      return respond(
        { success: false, error: "One or more items are no longer available. Remove them from your cart before checking out." },
        409,
        headers,
      );
    }

    const productsById = new Map((activeProducts || []).map((product) => [product.id, product]));
    for (const item of items) {
      const stock = Math.max(0, Number(productsById.get(item.product_id)?.stock_quantity) || 0);
      if (item.quantity > stock) {
        return respond({ success: false, error: "Your cart quantity exceeds the available stock. Please update your cart." }, 409, headers);
      }
    }

    const { data: settings, error: settingsError } = await db
      .from("store_settings")
      .select("store_open,maintenance_mode,moolre_enabled,cod_enabled,cod_accra_only")
      .eq("id", true)
      .maybeSingle();
    if (settingsError || !settings) {
      console.error("create-order: Store settings could not be loaded.");
      return respond({ success: false, error: "Checkout settings are temporarily unavailable." }, 503, headers);
    }
    if (!settings.store_open || settings.maintenance_mode) {
      return respond({ success: false, error: "The store is currently closed and cannot accept orders." }, 409, headers);
    }
    if (paymentMethod === "moolre" && !settings.moolre_enabled) {
      return respond({ success: false, error: "Online payment is currently unavailable." }, 409, headers);
    }
    if (paymentMethod === "cash_on_delivery" && !settings.cod_enabled) {
      return respond({ success: false, error: "Cash on delivery is currently unavailable." }, 409, headers);
    }
    if (paymentMethod === "cash_on_delivery") {
      if (settings.cod_accra_only && region.toLowerCase() !== "greater accra") {
        return respond({ success: false, error: "Cash on delivery is only available within Greater Accra." }, 400, headers);
      }
    }

    // Keep the Edge Function contract aligned with the secure order RPC wrapper.
    const { data: orderData, error: createError } = await db.rpc("create_order_with_momo", {
      p_customer_name: fullName,
      p_customer_email: email,
      p_customer_phone: phone,
      p_delivery_address: address,
      p_latitude: latitude,
      p_longitude: longitude,
      p_payment_method: paymentMethod,
      p_items: items,
      p_whatsapp_number: text(body.whatsapp_number, 30) || null,
      p_delivery_instructions: orderNote || null,
      p_delivery_region: region,
      p_notes: null,
      p_momo_number: paymentMethod === "cash_on_delivery" || paymentMethod === "moolre" ? momoNumber : null,
      p_momo_network: paymentMethod === "cash_on_delivery" || paymentMethod === "moolre" ? momoNetwork : null,
    });

    if (createError) {
      console.error("create_order RPC failed:", createError.message);
      const customerError = isCustomerError(createError.message);
      return respond(
        {
          success: false,
          error: customerError
            ? createError.message
            : "We couldn't place your order. Please try again or contact the store.",
        },
        customerError ? 400 : 500,
        headers,
      );
    }

    const created = record(orderData);
    const orderId = text(created.order_id, 40);
    const orderNumber = text(created.order_number, 80);
    if (!orderId || !orderNumber) {
      console.error("create_order RPC did not return an order ID and number.");
      return respond({ success: false, error: "We couldn't confirm the new order." }, 500, headers);
    }

    if (paymentMethod === "cash_on_delivery") {
      const { error: confirmError } = await db.rpc("confirm_cod_order", {
        p_order_id: orderId,
      });
      if (confirmError) {
        console.error("confirm_cod_order RPC failed:", confirmError.message);
        return respond({ success: false, error: "We couldn't confirm your order. Please contact the store." }, 500, headers);
      }

      const { data: savedOrder, error: readError } = await db
        .from("orders")
        .select("id,order_number,subtotal,delivery_fee,total,payment_method,payment_status,order_status,momo_number,momo_network")
        .eq("id", orderId)
        .maybeSingle();

      if (readError || !savedOrder) {
        console.error("Could not load the confirmed order:", readError?.message);
        return respond({ success: false, error: "Your order was placed, but we couldn't load its confirmation." }, 500, headers);
      }

      return respond({
        success: true,
        message: "Your order has been placed.",
        order: savedOrder,
        distance_km: Number(created.distance_km),
      }, 200, headers);
    }

    if (paymentMethod === "moolre") {
      const reference = text(created.moolre_reference, 100);
      const channel = ({ MTN: "13", Telecel: "6", AirtelTigo: "7" } as Record<string, string>)[momoNetwork];
      if (!reference || !channel) {
        console.error("create_order RPC returned invalid Moolre details.");
        return respond({ success: false, error: "Mobile Money payment could not be prepared." }, 500, headers);
      }
      const moolreBaseUrl = Deno.env.get("MOOLRE_BASE_URL")?.replace(/\/$/, "") || "https://api.moolre.com";
      const payerDigits = momoNumber.replace(/\D/g, "");
      const payer = payerDigits.startsWith("233") ? `0${payerDigits.slice(3)}` : payerDigits;
      const payload: Record<string, unknown> = {
        type: 1,
        channel,
        currency: text(created.currency, 3) || "GHS",
        amount: String(number(created.total)),
        payer,
        externalref: reference,
        accountnumber: moolreAccount,
      };
      if (Deno.env.get("MOOLRE_SKIP_OTP") === "true" && moolreBaseUrl.includes("sandbox")) payload.skipotp = true;
      let gatewayResponse: Response;
      let gatewayResult: Record<string, unknown>;
      try {
        gatewayResponse = await fetch(`${moolreBaseUrl}/open/transact/payment`, {
          method: "POST",
          headers: { "X-API-USER": moolreUser, "X-API-PUBKEY": moolrePubkey, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(15_000),
        });
        gatewayResult = record(await gatewayResponse.json());
      } catch (error) {
        console.error("Moolre payment initialization failed:", error);
        return respond({ success: false, error: "Mobile Money payment could not be started. Please contact the store before retrying." }, 502, headers);
      }
      const code = text(gatewayResult.code, 20);
      const otpRequired = code === "TP14";
      const initiated = gatewayResponse.ok && Number(gatewayResult.status) === 1 && (otpRequired || code === "TR099");
      if (!initiated) {
        console.error("Moolre rejected payment initialization:", gatewayResponse.status, code);
        return respond({ success: false, error: "Moolre could not start the Mobile Money request. Please try again or contact the store." }, 502, headers);
      }
      const { data: savedOrder, error: orderError } = await db.from("orders")
        .select("id,order_number,subtotal,delivery_fee,total,payment_method,payment_status,order_status,moolre_reference,momo_number,momo_network")
        .eq("id", orderId).maybeSingle();
      if (orderError || !savedOrder) {
        console.error("Could not load the Moolre order:", orderError?.message);
        return respond({ success: false, error: "The payment request started, but the order confirmation could not be loaded. Contact the store with reference " + reference }, 500, headers);
      }
      return respond({ success: true, payment_pending: true, otp_required: otpRequired, order: savedOrder }, 200, headers);
    }

    return respond({ success: false, error: "Invalid payment method." }, 400, headers);
  } catch (error) {
    console.error("create-order failed:", error);
    return respond({ success: false, error: "Checkout is temporarily unavailable." }, 500, headers);
  }
});
