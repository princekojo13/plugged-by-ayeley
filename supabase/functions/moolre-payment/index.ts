import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const origins = new Set(["https://pluggedbyayeley.com", "https://www.pluggedbyayeley.com", "https://plugged-by-ayeley.onrender.com", "http://localhost:5173", "http://localhost:5174", "http://localhost:4173"]);
const json = (body: Record<string, unknown>, status = 200, origin: string | null = null) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin && origins.has(origin) ? origin : "null", "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", Vary: "Origin" } });
const record = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, max = 160) => typeof value === "string" ? value.trim().slice(0, max) : "";
const digits = (value: string) => value.replace(/\D/g, "");
const hashRateKey = async (salt: string, orderNumber: string, phone: string) => {
  const bytes = new TextEncoder().encode(`${salt}:${orderNumber.toUpperCase()}:${digits(phone)}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": origin && origins.has(origin) ? origin : "null", "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", Vary: "Origin" } });
  if (req.method !== "POST" || origin && !origins.has(origin)) return json({ success: false, error: "Forbidden request." }, 403, origin);
  try {
    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).length > 8_192) return json({ success: false, error: "Request is too large." }, 413, origin);
    let body: Record<string, unknown>;
    try {
      body = record(JSON.parse(rawBody));
    } catch {
      return json({ success: false, error: "Invalid request body." }, 400, origin);
    }
    const action = text(body.action, 16);
    const orderNumber = text(body.order_number, 80);
    const phone = text(body.phone, 30);
    if (!orderNumber || digits(phone).length < 9) return json({ success: false, error: "A valid order number and Mobile Money number are required." }, 400, origin);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const apiUser = Deno.env.get("MOOLRE_API_USER");
    const apiKey = Deno.env.get("MOOLRE_API_PUBKEY");
    const account = Deno.env.get("MOOLRE_ACCOUNT_NUMBER");
    if (!supabaseUrl || !serviceRoleKey || !apiUser || !apiKey || !account) return json({ success: false, error: "Moolre payment service is not configured." }, 503, origin);

    const db = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: order, error } = await db.from("orders")
      .select("id,order_number,total,payment_method,payment_status,order_status,moolre_reference,momo_number,momo_network")
      .eq("order_number", orderNumber).maybeSingle();
    if (error || !order || order.payment_method !== "moolre" || digits(order.momo_number || "") !== digits(phone)) {
      return json({ success: false, error: "Order could not be matched to that Mobile Money number." }, 404, origin);
    }
    if (!order.moolre_reference) return json({ success: false, error: "This order has no Moolre payment reference." }, 409, origin);
    if (order.payment_status === "paid") return json({ success: true, payment_status: "paid", order_number: order.order_number }, 200, origin);
    if (order.order_status === "cancelled") return json({ success: false, error: "This order was cancelled. Contact the store if you need help." }, 409, origin);

    const rateKey = await hashRateKey(serviceRoleKey, order.order_number, phone);
    const { data: allowed, error: rateError } = await db.rpc("consume_customer_order_lookup", {
      p_keys: [rateKey],
      p_max_attempts: 15,
      p_window_seconds: 900,
    });
    if (rateError) {
      console.error("Moolre payment rate check failed:", rateError.message);
      return json({ success: false, error: "Payment status is temporarily unavailable. Please try again later." }, 503, origin);
    }
    if (allowed !== true) return json({ success: false, error: "Too many payment checks. Please wait 15 minutes and try again." }, 429, origin);

    const base = Deno.env.get("MOOLRE_BASE_URL")?.replace(/\/$/, "") || "https://api.moolre.com";
    const headers = { "X-API-USER": apiUser, "X-API-PUBKEY": apiKey, "Content-Type": "application/json" };

    if (action === "otp") {
      const otpcode = text(body.otpcode, 12);
      if (!/^\d{4,12}$/.test(otpcode)) return json({ success: false, error: "Enter the verification code sent to your phone." }, 400, origin);
      const channel = ({ MTN: "13", Telecel: "6", AirtelTigo: "7" } as Record<string, string>)[order.momo_network || ""];
      if (!channel) return json({ success: false, error: "The Mobile Money network is invalid." }, 409, origin);
      const response = await fetch(`${base}/open/transact/payment`, {
        method: "POST", headers,
        body: JSON.stringify({ type: 1, channel, currency: "GHS", amount: String(order.total), payer: digits(order.momo_number || "").startsWith("233") ? `0${digits(order.momo_number || "").slice(3)}` : digits(order.momo_number || ""), externalref: order.moolre_reference, accountnumber: account, otpcode }),
        signal: AbortSignal.timeout(15_000),
      });
      const result = record(await response.json());
      const code = text(result.code, 20);
      if (!response.ok || Number(result.status) !== 1 || !["TP14", "TR099"].includes(code)) return json({ success: false, error: "Moolre could not verify that code. Check it and try again." }, 502, origin);
      return json({ success: true, otp_required: code === "TP14", payment_pending: true }, 200, origin);
    }

    if (action !== "status") return json({ success: false, error: "Unknown payment action." }, 400, origin);
    const response = await fetch(`${base}/open/transact/status`, {
      method: "POST", headers,
      body: JSON.stringify({ type: 1, idtype: 1, id: order.moolre_reference, accountnumber: account }),
      signal: AbortSignal.timeout(15_000),
    });
    const result = record(await response.json());
    const transaction = record(result.data);
    if (!response.ok || Number(result.status) !== 1 || !transaction.txstatus) {
      return json({ success: true, payment_status: "pending", order_number: order.order_number }, 200, origin);
    }
    const gatewayStatus = String(transaction.txstatus);
    const amount = Number(transaction.amount ?? transaction.value);
    const transactionId = text(transaction.transactionid, 120);
    const { data: confirmed, error: confirmError } = await db.rpc("confirm_moolre_order", {
      p_reference: order.moolre_reference,
      p_amount: Number.isFinite(amount) ? amount : null,
      p_currency: text(transaction.currency, 3) || "GHS",
      p_gateway_status: gatewayStatus,
      p_transaction_id: transactionId || null,
      p_metadata: { source: "moolre_status_api", code: text(result.code, 20), accountnumber: text(transaction.accountnumber, 40) },
    });
    if (confirmError) {
      console.error("Moolre payment could not be confirmed:", confirmError.message);
      return json({ success: false, error: "Payment was checked, but the order could not be updated. Contact the store with your order number." }, 500, origin);
    }
    const confirmation = record(confirmed);
    return json({ success: true, payment_status: confirmation.ok ? "paid" : "pending", order_number: order.order_number }, 200, origin);
  } catch (error) {
    console.error("Moolre payment action failed:", error);
    return json({ success: false, error: "Moolre payment could not be checked. Please try again." }, 500, origin);
  }
});
