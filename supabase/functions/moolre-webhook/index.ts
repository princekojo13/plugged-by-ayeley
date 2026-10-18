import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const response = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const record = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, max = 160) => typeof value === "string" ? value.trim().slice(0, max) : "";
const constantTimeEqual = (left: string, right: string) => {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return difference === 0;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return response({ received: false }, 405);
  try {
    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).length > 65_536) return response({ received: false }, 413);
    let payload: Record<string, unknown>;
    try {
      payload = record(JSON.parse(rawBody));
    } catch {
      return response({ received: false }, 400);
    }
    const webhookSecret = Deno.env.get("MOOLRE_WEBHOOK_SECRET");
    if (!webhookSecret || !constantTimeEqual(text(payload.secret, 500), webhookSecret)) return response({ received: false, error: "Invalid webhook secret." }, 401);
    const reference = text(payload.externalref ?? payload.external_ref ?? payload.reference, 100);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const apiUser = Deno.env.get("MOOLRE_API_USER");
    const apiKey = Deno.env.get("MOOLRE_API_PUBKEY");
    const account = Deno.env.get("MOOLRE_ACCOUNT_NUMBER");
    if (!reference || !supabaseUrl || !serviceRoleKey || !apiUser || !apiKey || !account) return response({ received: false }, 400);

    const base = Deno.env.get("MOOLRE_BASE_URL")?.replace(/\/$/, "") || "https://api.moolre.com";
    const statusResponse = await fetch(`${base}/open/transact/status`, {
      method: "POST",
      headers: { "X-API-USER": apiUser, "X-API-PUBKEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ type: 1, idtype: 1, id: reference, accountnumber: account }),
      signal: AbortSignal.timeout(15_000),
    });
    const statusResult = record(await statusResponse.json());
    const transaction = record(statusResult.data);
    if (!statusResponse.ok || Number(statusResult.status) !== 1 || !transaction.txstatus) return response({ received: true, confirmed: false }, 202);
    const transactionAccount = text(transaction.accountnumber, 40);
    if (transactionAccount && transactionAccount !== account) return response({ received: false, error: "Transaction account did not match." }, 400);
    const transactionReference = text(transaction.externalref ?? transaction.external_ref, 100);
    if (transactionReference && transactionReference !== reference) return response({ received: false, error: "Transaction reference did not match." }, 400);

    const db = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: confirmed, error } = await db.rpc("confirm_moolre_order", {
      p_reference: reference,
      p_amount: Number(transaction.amount ?? transaction.value),
      p_currency: text(transaction.currency, 3) || "GHS",
      p_gateway_status: String(transaction.txstatus),
      p_transaction_id: text(transaction.transactionid, 120) || null,
      p_metadata: { source: "moolre_webhook", code: text(statusResult.code, 20), accountnumber: transactionAccount },
    });
    if (error) {
      console.error("Moolre webhook confirmation failed:", error.message);
      return response({ received: true, confirmed: false }, 500);
    }
    return response({ received: true, confirmed: Boolean(record(confirmed).ok) });
  } catch (error) {
    console.error("Moolre webhook processing failed:", error);
    return response({ received: false }, 500);
  }
});
