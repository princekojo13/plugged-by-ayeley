import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "http://localhost:4173",
  "http://localhost:5173",
  "http://localhost:5174",
  "https://pluggedbyayeley.com",
  "https://www.pluggedbyayeley.com",
  "https://plugged-by-ayeley.onrender.com",
]);

const MAX_MESSAGES = 8;
const MAX_MESSAGE_LENGTH = 800;
const MAX_TOTAL_CHARS = 3500;

function cors(origin: string | null) {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json",
  };

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

function response(body: Record<string, unknown>, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers });
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9₵ ]+/g, " ").replace(/\s+/g, " ").trim();
}

function money(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? `GH₵${n.toFixed(2)}` : "Price unavailable";
}

function productLine(product: Record<string, unknown>) {
  const stock = Number(product.available_stock ?? 0);
  const stockText = stock > 0 ? "in stock" : "currently out of stock";
  return `${product.name} — ${money(product.price)} (${stockText})`;
}

function isQuestion(message: string, words: string[]) {
  const normalized = normalize(message);
  return words.some((word) => normalized.includes(word));
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const headers = cors(origin);

  if (req.method === "OPTIONS") {
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return new Response(null, { status: 403, headers });
    }
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== "POST") {
    return response({ success: false, error: "Method not allowed." }, 405, headers);
  }

  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return response({ success: false, error: "Forbidden." }, 403, headers);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("Store assistant is missing Supabase server configuration.");
      return response(
        { success: false, error: "The store assistant is not configured yet." },
        500,
        headers,
      );
    }

    const body = await req.json();
    const rawMessages = Array.isArray(body?.messages) ? body.messages : [];

    if (!rawMessages.length || rawMessages.length > MAX_MESSAGES) {
      return response({ success: false, error: "Invalid message history." }, 400, headers);
    }

    let totalChars = 0;
    const messages = rawMessages
      .filter((item: unknown) => item && typeof item === "object")
      .map((item: Record<string, unknown>) => ({
        role: item.role === "assistant" ? "assistant" : "user",
        content: text(item.content).slice(0, MAX_MESSAGE_LENGTH),
      }))
      .filter((item: { content: string }) => item.content)
      .map((item) => {
        totalChars += item.content.length;
        return item;
      });

    if (!messages.length || totalChars > MAX_TOTAL_CHARS) {
      return response({ success: false, error: "Message history is too large." }, 400, headers);
    }

    const latest = messages[messages.length - 1].content;
    const query = normalize(latest);

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const [{ data: products, error: productsError }, { data: settings }] = await Promise.all([
      supabaseAdmin
        .from("products")
        .select("id,name,slug,description,category,price,compare_at_price,available_stock:stock_quantity,featured,best_seller,new_arrival,special_offer,active")
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("store_settings")
        .select("brand_name:store_name,tagline,email,phone,whatsapp,store_open,maintenance_mode,pay_online_enabled:moolre_enabled,pay_on_delivery_enabled:cod_enabled,pay_on_delivery_accra_only:cod_accra_only,delivery_fee_amount:delivery_rate,delivery_distance_km:delivery_distance_unit")
        .eq("id", true)
        .maybeSingle(),
    ]);

    if (productsError) {
      console.error("Store assistant product query failed:", productsError);
      return response(
        { success: false, error: "I couldn't load the store catalog right now." },
        500,
        headers,
      );
    }

    const catalog = products ?? [];
    const storeName = settings?.brand_name || "Plugged by Ayeley";
    const deliveryDistance = Number(settings?.delivery_distance_km ?? 7);
    const deliveryFee = Number(settings?.delivery_fee_amount ?? 10);
    const payOnline = settings?.pay_online_enabled ?? true;
    const payOnDelivery = settings?.pay_on_delivery_enabled ?? true;
    const podAccraOnly = settings?.pay_on_delivery_accra_only ?? true;

    if (isQuestion(query, ["hello", "hi", "hey", "help"])) {
      return response({
        success: true,
        message: `Hi 👋 I’m the ${storeName} Store Assistant. Ask me about products, prices, stock, delivery, payments, or order tracking.`,
      }, 200, headers);
    }

    if (isQuestion(query, ["delivery", "shipping", "deliver", "distance", "fee"])) {
      const feeText = `The configured delivery rule is ${money(deliveryFee)} per ${deliveryDistance} km, and the final fee is calculated securely at checkout from the selected delivery location.`;
      const podText = payOnDelivery && podAccraOnly
        ? " Pay on Delivery is available within Greater Accra when enabled."
        : "";
      return response({ success: true, message: feeText + podText }, 200, headers);
    }

    if (isQuestion(query, ["moolre", "payment", "pay online", "momo", "pay on delivery"])) {
      const methods = [];
      if (payOnline) methods.push("Pay Online with Moolre Mobile Money");
      if (payOnDelivery) methods.push(podAccraOnly ? "Pay on Delivery within Greater Accra" : "Pay on Delivery");
      return response({
        success: true,
        message: methods.length
          ? `Available payment options: ${methods.join(" or ")}.`
          : "Payment options are temporarily unavailable.",
      }, 200, headers);
    }

    if (isQuestion(query, ["track", "tracking", "order status", "my order"])) {
      return response({
        success: true,
        message: "I can help you get to order tracking. Open Track Order and enter the tracking code/order information from your confirmation.",
        link: "/track-order",
      }, 200, headers);
    }

    if (isQuestion(query, ["open", "hours", "closing", "closed"])) {
      return response({
        success: true,
        message: settings?.store_open === false
          ? "The store is currently marked as closed."
          : "The store is currently marked as open.",
      }, 200, headers);
    }

    const searchableTerms = query
      .split(" ")
      .filter((word: string) => word.length >= 3)
      .slice(0, 8);

    const matched = catalog.filter((product: Record<string, unknown>) => {
      const haystack = normalize([
        product.name,
        product.category,
        product.description,
      ].filter(Boolean).join(" "));
      return searchableTerms.some((term: string) => haystack.includes(term));
    }).slice(0, 5);

    if (matched.length) {
      return response({
        success: true,
        message: `I found these products for you:\n\n${matched.map(productLine).join("\n")}`,
        products: matched.map((product: Record<string, unknown>) => ({
          id: product.id,
          name: product.name,
          slug: product.slug,
          price: product.price,
          available_stock: product.available_stock,
        })),
      }, 200, headers);
    }

    const featured = catalog.filter((product: Record<string, unknown>) =>
      product.featured || product.best_seller || product.new_arrival || product.special_offer,
    ).slice(0, 5);

    if (isQuestion(query, ["product", "products", "sell", "snack", "toiletries", "beauty", "supplement", "perfume", "hair"])) {
      return response({
        success: true,
        message: featured.length
          ? `Here are some products you can explore:\n\n${featured.map(productLine).join("\n")}`
          : "We have products across our store categories. Tell me the product or category you're looking for and I’ll help you search.",
      }, 200, headers);
    }

    return response({
      success: true,
      message: "I’m the store assistant, so I can help with products, prices, stock, delivery, payments, and order tracking. Tell me what you’re looking for and I’ll help.",
    }, 200, headers);
  } catch (error) {
    console.error("store-assistant error:", error);
    return response(
      { success: false, error: "The store assistant is temporarily unavailable." },
      500,
      headers,
    );
  }
});
