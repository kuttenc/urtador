import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Payload = {
  action?: "create" | "resolve" | "stats";
  url?: string;
  slug?: string;
  title?: string;
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const publicBaseUrl = (Deno.env.get("PUBLIC_BASE_URL") ?? "https://kuttenc.github.io/urtador").replace(/\/$/, "");
const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://kuttenc.github.io")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  const allowOrigin = allowedOrigins.includes(origin) || origin.endsWith(".github.io") ? origin : allowedOrigins[0] ?? "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
}

function json(request: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function clientIp(request: Request) {
  return request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown";
}

function normalizeSlug(input?: string) {
  const cleaned = String(input ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return cleaned || crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}

function normalizeUrl(input?: string) {
  const value = String(input ?? "").trim();
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const parsed = new URL(withProtocol);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("URL invalida.");
  return parsed.toString();
}

async function assertRateLimit(request: Request, action: string, limit: number, minutes: number) {
  const ipHash = await sha256(clientIp(request));
  const since = new Date(Date.now() - minutes * 60 * 1000).toISOString();

  const { count, error } = await supabase
    .from("kutt_short_link_rate_limits")
    .select("id", { count: "exact", head: true })
    .eq("action", action)
    .eq("ip_hash", ipHash)
    .gte("created_at", since);

  if (error) throw error;
  if ((count ?? 0) >= limit) {
    throw new Error("Muitas tentativas agora. Aguarde alguns minutos e tente de novo.");
  }

  await supabase.from("kutt_short_link_rate_limits").insert({ action, ip_hash: ipHash });
  return ipHash;
}

async function createLink(request: Request, payload: Payload) {
  const ipHash = await assertRateLimit(request, "create", 20, 60);
  const targetUrl = normalizeUrl(payload.url);
  const slug = normalizeSlug(payload.slug);
  const title = String(payload.title ?? "").trim().slice(0, 120) || null;

  const { data: existing } = await supabase
    .from("kutt_short_links")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (existing) throw new Error("Esse apelido ja esta em uso.");

  const { data, error } = await supabase
    .from("kutt_short_links")
    .insert({ slug, target_url: targetUrl, title, creator_ip_hash: ipHash })
    .select("slug, target_url")
    .single();

  if (error) throw error;

  return {
    slug: data.slug,
    url: data.target_url,
    shortUrl: `${publicBaseUrl}/${data.slug}`
  };
}

async function resolveLink(request: Request, payload: Payload) {
  await assertRateLimit(request, "resolve", 240, 60);
  const slug = normalizeSlug(payload.slug);

  const { data, error } = await supabase
    .from("kutt_short_links")
    .select("id, target_url, disabled_at")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw error;
  if (!data || data.disabled_at) throw new Error("Link nao encontrado.");

  const visitorHash = await sha256(clientIp(request));
  await supabase.from("kutt_short_link_events").insert({
    link_id: data.id,
    visitor_ip_hash: visitorHash,
    user_agent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
    referer: request.headers.get("referer")?.slice(0, 500) ?? null
  });
  await supabase.rpc("kutt_increment_short_link_click", { row_id: data.id }).then(async ({ error: rpcError }) => {
    if (rpcError) {
      await supabase
        .from("kutt_short_links")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", data.id);
    }
  });

  return { url: data.target_url };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(request) });
  }
  if (request.method !== "POST") {
    return json(request, 405, { error: "Metodo nao permitido." });
  }
  if (!supabaseUrl || !serviceRoleKey) {
    return json(request, 500, { error: "Backend sem configuracao." });
  }

  try {
    const payload = await request.json() as Payload;
    if (payload.action === "create") return json(request, 200, await createLink(request, payload));
    if (payload.action === "resolve") return json(request, 200, await resolveLink(request, payload));
    return json(request, 400, { error: "Acao invalida." });
  } catch (error) {
    return json(request, 400, { error: error instanceof Error ? error.message : "Erro inesperado." });
  }
});
