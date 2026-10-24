import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ALLOWED_ORIGINS = new Set([
  "https://pluggedbyayeley.com",
  "https://www.pluggedbyayeley.com",
  "https://plugged-by-ayeley.onrender.com",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:4173",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://127.0.0.1:4173",
]);

const resultCache = new Map<string, { expiresAt: number; places: unknown[] }>();
let lastRequestAt = 0;

function headersFor(origin: string | null) {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function respond(body: Record<string, unknown>, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const headers = headersFor(origin);

  if (req.method === "OPTIONS") {
    return origin && !ALLOWED_ORIGINS.has(origin)
      ? respond({ error: "Forbidden origin." }, 403, headers)
      : new Response(null, { status: 204, headers });
  }
  if (req.method !== "POST") return respond({ error: "Method not allowed." }, 405, headers);
  if (origin && !ALLOWED_ORIGINS.has(origin)) return respond({ error: "Forbidden origin." }, 403, headers);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return respond({ error: "Enter a town, area or landmark to search." }, 400, headers);
  }
  const query = body && typeof body === "object" && "query" in body && typeof body.query === "string"
    ? body.query.trim().replace(/\s+/g, " ")
    : "";
  if (query.length < 3 || query.length > 120) {
    return respond({ error: "Enter a location between 3 and 120 characters." }, 400, headers);
  }

  const cacheKey = query.toLocaleLowerCase();
  const cached = resultCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return respond({ places: cached.places }, 200, headers);

  try {
    const waitMs = 1_100 - (Date.now() - lastRequestAt);
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    const params = new URLSearchParams({
      q: `${query}, Ghana`,
      format: "jsonv2",
      countrycodes: "gh",
      viewbox: "-3.5,11.5,1.5,4.5",
      bounded: "1",
      "accept-language": "en",
      limit: "5",
    });
    lastRequestAt = Date.now();
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: {
        Accept: "application/json",
        "Accept-Language": "en",
        "User-Agent": "PluggedByAyeley/1.0 (https://pluggedbyayeley.com)",
        Referer: "https://plugged-by-ayeley.onrender.com/checkout",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 429) {
      return respond({ error: "Location search is busy. Please wait a moment and try again." }, 429, headers);
    }
    if (!response.ok) return respond({ error: "Location search is temporarily unavailable." }, 502, headers);

    const data: unknown = await response.json();
    const places = Array.isArray(data) ? data.flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const place = value as Record<string, unknown>;
      const lat = Number(place.lat);
      const lon = Number(place.lon);
      const displayName = typeof place.display_name === "string" ? place.display_name : "";
      if (!displayName || !Number.isFinite(lat) || !Number.isFinite(lon)) return [];
      if (lat < 4.5 || lat > 11.5 || lon < -3.5 || lon > 1.5) return [];
      return [{
        place_id: String(place.place_id || `${place.osm_type || "place"}-${place.osm_id || `${lat}-${lon}`}`),
        lat,
        lon,
        display_name: displayName,
      }];
    }) : [];

    resultCache.set(cacheKey, { expiresAt: Date.now() + 60 * 60 * 1000, places });
    if (resultCache.size > 500) {
      const oldestKey = resultCache.keys().next().value;
      if (oldestKey) resultCache.delete(oldestKey);
    }
    return respond({ places }, 200, headers);
  } catch {
    return respond({ error: "Location search is temporarily unavailable. You can still place the pin on the map." }, 502, headers);
  }
});
