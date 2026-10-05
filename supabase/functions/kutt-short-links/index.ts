import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Payload = {
  action?: string;
  phone?: string;
  code?: string;
  password?: string;
  token?: string;
  url?: string;
  slug?: string;
  title?: string;
  pixKey?: string;
  withdrawalId?: string;
  status?: "approved" | "paid" | "rejected";
  note?: string;
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const publicBaseUrl = (Deno.env.get("PUBLIC_BASE_URL") ?? "https://kuttenc.github.io/urtador").replace(/\/$/, "");
const ownerPhone = normalizePhone(Deno.env.get("OWNER_PHONE") ?? "11989346164");
const otpPepper = Deno.env.get("OTP_PEPPER") ?? "";
const greenApiUrl = (Deno.env.get("GREEN_API_URL") ?? "").replace(/\/$/, "");
const greenApiInstance = Deno.env.get("GREEN_API_INSTANCE_ID") ?? "";
const greenApiToken = Deno.env.get("GREEN_API_TOKEN") ?? "";
const allowedOrigins = new Set((Deno.env.get("ALLOWED_ORIGINS") ?? "https://kuttenc.github.io")
  .split(",").map((v) => v.trim()).filter(Boolean));
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

function normalizePhone(input: string) {
  let digits = String(input).replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  if (!/^55\d{10,11}$/.test(digits)) throw new Error("Informe um celular brasileiro com DDD.");
  return digits;
}

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://kuttenc.github.io",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(request: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(request), "Content-Type": "application/json; charset=utf-8" } });
}

async function hash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function bytesToHex(value: Uint8Array) {
  return Array.from(value).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string) {
  if (!/^(?:[0-9a-f]{2})+$/i.test(value)) return new Uint8Array();
  return new Uint8Array(value.match(/.{2}/g)!.map((b) => Number.parseInt(b, 16)));
}

async function derivePasswordHash(password: string, saltHex: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: hexToBytes(saltHex), iterations: 310000, hash: "SHA-256" }, key, 256);
  return bytesToHex(new Uint8Array(bits));
}

function secureEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

function validatePassword(input: unknown) {
  const password = String(input ?? "");
  if (password.length < 10 || password.length > 128) throw new Error("A senha precisa ter de 10 a 128 caracteres.");
  return password;
}

function clientIp(request: Request) {
  return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

function normalizeSlug(input?: string) {
  return String(input ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48)
    || crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}

function normalizeUrl(input?: string) {
  const value = String(input ?? "").trim();
  if (!value || value.length > 2048) throw new Error("Informe um endereço válido.");
  const parsed = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname.includes(".")) throw new Error("O endereço precisa ser HTTP ou HTTPS válido.");
  return parsed.toString();
}

function bearer(request: Request) {
  return request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
}

async function requireUser(request: Request, payload: Payload, allowPasswordSetup = false) {
  const token = String(payload.token || bearer(request));
  if (!token || token.length < 20) throw new Error("Entre com seu telefone para continuar.");
  const tokenHash = await hash(token);
  const { data, error } = await supabase.from("kutt_sessions")
    .select("id, expires_at, user:kutt_users(id, phone, role, pix_key, password_hash)")
    .eq("token_hash", tokenHash).is("revoked_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (error) throw error;
  if (!data?.user) throw new Error("Sua sessão expirou. Entre novamente pelo WhatsApp.");
  const user = Array.isArray(data.user) ? data.user[0] : data.user;
  if (!allowPasswordSetup && !user.password_hash) throw new Error("Cadastre sua senha para continuar.");
  return { session: data, user };
}

async function rateLimitIdentity(action: string, identity: string, limit: number, minutes: number) {
  const ipHash = await hash(identity);
  const since = new Date(Date.now() - minutes * 60000).toISOString();
  const { count, error } = await supabase.from("kutt_short_link_rate_limits").select("id", { count: "exact", head: true })
    .eq("action", action).eq("ip_hash", ipHash).gte("created_at", since);
  if (error) throw error;
  if ((count ?? 0) >= limit) throw new Error("Muitas tentativas. Aguarde um pouco e tente novamente.");
  const { error: insertError } = await supabase.from("kutt_short_link_rate_limits").insert({ action, ip_hash: ipHash });
  if (insertError) throw insertError;
  return ipHash;
}

async function rateLimit(request: Request, action: string, limit: number, minutes: number) {
  return await rateLimitIdentity(action, clientIp(request), limit, minutes);
}

async function sendWhatsApp(phone: string, message: string) {
  if (!greenApiUrl || !greenApiInstance || !greenApiToken) throw new Error("O envio de código ainda não está configurado no servidor.");
  const endpoint = `${greenApiUrl}/waInstance${encodeURIComponent(greenApiInstance)}/sendMessage/${encodeURIComponent(greenApiToken)}`;
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatId: `${phone}@c.us`, message }) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.error) throw new Error("O WhatsApp não aceitou o envio do código. Tente novamente mais tarde.");
}

async function issueOtp(request: Request, phone: string, passwordVerified: boolean) {
  await rateLimit(request, "otp-ip", 8, 60);
  const since = new Date(Date.now() - 15 * 60000).toISOString();
  const { count, error: countError } = await supabase.from("kutt_otp_challenges").select("id", { count: "exact", head: true })
    .eq("phone", phone).gte("created_at", since);
  if (countError) throw countError;
  if ((count ?? 0) >= 3) throw new Error("Limite de códigos atingido. Aguarde 15 minutos.");
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
  const codeHash = await hash(`${phone}:${code}:${otpPepper}`);
  const expiresAt = new Date(Date.now() + 10 * 60000).toISOString();
  const { data: challenge, error } = await supabase.from("kutt_otp_challenges")
    .insert({ phone, code_hash: codeHash, expires_at: expiresAt, password_verified: passwordVerified }).select("id").single();
  if (error) throw error;
  try {
    await sendWhatsApp(phone, `Seu código do Urtador é ${code}. Ele vence em 10 minutos. Não compartilhe este código.`);
  } catch (err) {
    await supabase.from("kutt_otp_challenges").delete().eq("id", challenge.id);
    throw err;
  }
  return { ok: true, message: "Código enviado pelo WhatsApp. Ele vale por 10 minutos." };
}

async function requestOtp(request: Request, payload: Payload) {
  const phone = normalizePhone(payload.phone ?? "");
  const { data: user, error } = await supabase.from("kutt_users").select("id, password_hash").eq("phone", phone).maybeSingle();
  if (error) throw error;
  if (user?.password_hash) throw new Error("Entre com sua senha. Após 48 horas, o código será enviado depois da validação da senha.");
  return await issueOtp(request, phone, false);
}

async function createSession(user: { id: string; phone: string; role: string; pix_key: string | null }) {
  const token = `${crypto.randomUUID()}${crypto.randomUUID().replace(/-/g, "")}`;
  const { error } = await supabase.from("kutt_sessions").insert({ user_id: user.id, token_hash: await hash(token), expires_at: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString() });
  if (error) throw error;
  return { token, expiresInSeconds: 10800, user: { phone: user.phone, role: user.role, pixKey: user.pix_key } };
}

async function loginWithPassword(request: Request, payload: Payload) {
  await rateLimit(request, "password-login-ip", 12, 60);
  const phone = normalizePhone(payload.phone ?? "");
  await rateLimitIdentity("password-login-phone", phone, 8, 15);
  const password = validatePassword(payload.password);
  const { data: user, error } = await supabase.from("kutt_users")
    .select("id, phone, role, pix_key, password_hash, password_salt, otp_verified_at")
    .eq("phone", phone).maybeSingle();
  if (error) throw error;
  if (!user?.password_hash || !user.password_salt) throw new Error("Primeiro acesso: confirme seu WhatsApp para cadastrar uma senha.");
  const candidate = await derivePasswordHash(password, user.password_salt);
  if (!secureEqual(candidate, user.password_hash)) throw new Error("Telefone ou senha incorretos.");
  const lastOtp = user.otp_verified_at ? new Date(user.otp_verified_at).getTime() : 0;
  if (Date.now() - lastOtp >= 48 * 60 * 60 * 1000) {
    await issueOtp(request, phone, true);
    return { otpRequired: true, phone, message: "Senha confirmada. Digite também o código enviado pelo WhatsApp." };
  }
  return await createSession(user);
}

async function setPassword(request: Request, payload: Payload) {
  const { user } = await requireUser(request, payload, true);
  const password = validatePassword(payload.password);
  const { data: existing, error: readError } = await supabase.from("kutt_users").select("password_hash").eq("id", user.id).single();
  if (readError) throw readError;
  if (existing.password_hash) throw new Error("A senha já foi cadastrada. Fale com o administrador para redefini-la.");
  const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  const passwordHash = await derivePasswordHash(password, salt);
  const { data, error } = await supabase.from("kutt_users").update({ password_salt: salt, password_hash: passwordHash, updated_at: new Date().toISOString() })
    .eq("id", user.id).is("password_hash", null).select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("A senha já foi cadastrada nesta conta. Atualize a página e entre com ela.");
  return { ok: true, message: "Senha cadastrada. Use-a nos próximos acessos; a cada 48 horas o WhatsApp também será confirmado." };
}

async function verifyOtp(request: Request, payload: Payload) {
  await rateLimit(request, "otp-verify-ip", 20, 60);
  const phone = normalizePhone(payload.phone ?? "");
  const code = String(payload.code ?? "").replace(/\D/g, "");
  if (!/^\d{6}$/.test(code)) throw new Error("Digite os 6 números recebidos no WhatsApp.");
  const { data: challenge, error } = await supabase.from("kutt_otp_challenges").select("id, code_hash, attempts, password_verified")
    .eq("phone", phone).is("consumed_at", null).gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!challenge || challenge.attempts >= 5) throw new Error("Código expirado ou inválido. Peça outro código.");
  if (await hash(`${phone}:${code}:${otpPepper}`) !== challenge.code_hash) {
    await supabase.from("kutt_otp_challenges").update({ attempts: challenge.attempts + 1 }).eq("id", challenge.id);
    throw new Error("Código incorreto. Confira a mensagem e tente de novo.");
  }
  const { data: knownUser, error: knownUserError } = await supabase.from("kutt_users").select("id, password_hash").eq("phone", phone).maybeSingle();
  if (knownUserError) throw knownUserError;
  if (knownUser?.password_hash && !challenge.password_verified) throw new Error("Esta conta exige a senha antes do código do WhatsApp.");
  await supabase.from("kutt_otp_challenges").update({ consumed_at: new Date().toISOString() }).eq("id", challenge.id);
  const isAdmin = phone === ownerPhone;
  const { data: user, error: userError } = await supabase.from("kutt_users")
    .upsert({ phone, role: isAdmin ? "admin" : "user", otp_verified_at: new Date().toISOString() }, { onConflict: "phone", ignoreDuplicates: false })
    .select("id, phone, role, pix_key").single();
  if (userError) throw userError;
  return { ...await createSession(user), passwordSetupRequired: !knownUser?.password_hash };
}

async function profile(request: Request, payload: Payload) {
  const { user, session } = await requireUser(request, payload);
  const { data: links, error } = await supabase.from("kutt_short_links")
    .select("id, slug, target_url, title, created_at, click_count").eq("owner_user_id", user.id).order("created_at", { ascending: false }).limit(100);
  if (error) throw error;
  const { count: eligibleVisits, error: visitError } = await supabase.from("kutt_short_link_events")
    .select("id", { count: "exact", head: true }).in("link_id", (links ?? []).map((item) => item.id).length ? (links ?? []).map((item) => item.id) : ["00000000-0000-0000-0000-000000000000"])
    .eq("eligible_for_reward", true);
  if (visitError) throw visitError;
  const { data: withdrawals, error: withdrawalError } = await supabase.from("kutt_withdrawals")
    .select("id, amount_cents, pix_key, status, requested_at, processed_at, admin_note").eq("user_id", user.id).order("requested_at", { ascending: false }).limit(20);
  if (withdrawalError) throw withdrawalError;
  const { count: rewardedVisits, error: rewardsError } = await supabase.from("kutt_reward_visits").select("id", { count: "exact", head: true }).eq("owner_user_id", user.id);
  if (rewardsError) throw rewardsError;
  const earnedCents = Math.floor((rewardedVisits ?? 0) / 1000) * 7000;
  const reservedCents = (withdrawals ?? []).filter((w) => w.status !== "rejected").reduce((sum, w) => sum + Number(w.amount_cents), 0);
  return { user: { phone: user.phone, role: user.role, pixKey: user.pix_key }, expiresAt: session.expires_at, links: links ?? [], eligibleVisits: rewardedVisits ?? 0, rawLinkVisits: eligibleVisits ?? 0, earnedCents, reservedCents, availableCents: Math.max(0, earnedCents - reservedCents), withdrawals: withdrawals ?? [] };
}

async function createLink(request: Request, payload: Payload) {
  const { user } = await requireUser(request, payload);
  const ipHash = await rateLimit(request, `create:${user.id}`, 30, 60);
  const targetUrl = normalizeUrl(payload.url);
  const slug = normalizeSlug(payload.slug);
  const title = String(payload.title ?? "").trim().slice(0, 120) || null;
  const { data, error } = await supabase.from("kutt_short_links")
    .insert({ slug, target_url: targetUrl, title, owner_user_id: user.id, creator_ip_hash: ipHash })
    .select("slug, target_url").single();
  if (error?.code === "23505") throw new Error("Esse final já está em uso. Escolha outro.");
  if (error) throw error;
  return { slug: data.slug, url: data.target_url, shortUrl: `${publicBaseUrl}/${data.slug}` };
}

function looksAutomated(userAgent: string) {
  return /bot|crawler|spider|preview|facebookexternalhit|whatsapp|slack|discord|curl|wget|headless|phantom|monitor|uptime/i.test(userAgent);
}

async function resolveLink(request: Request, payload: Payload) {
  await rateLimit(request, "resolve", 600, 60);
  const slug = normalizeSlug(payload.slug);
  const { data, error } = await supabase.from("kutt_short_links").select("id, target_url, disabled_at, owner_user_id, creator_ip_hash")
    .eq("slug", slug).maybeSingle();
  if (error) throw error;
  if (!data || data.disabled_at) throw new Error("Link não encontrado.");
  const userAgent = request.headers.get("user-agent")?.slice(0, 500) ?? "";
  const visitorHash = await hash(clientIp(request));
  const eligible = Boolean(data.owner_user_id) && !looksAutomated(userAgent) && clientIp(request) !== "unknown" && visitorHash !== data.creator_ip_hash;
  const { data: event, error: eventError } = await supabase.from("kutt_short_link_events").insert({
    link_id: data.id, visitor_ip_hash: visitorHash, user_agent: userAgent || null,
    referer: request.headers.get("referer")?.slice(0, 500) ?? null, eligible_for_reward: eligible
  }).select("id").maybeSingle();
  if (eventError && eventError.code !== "23505") throw eventError;
  if (event?.id) {
    const { error: countError } = await supabase.rpc("kutt_increment_short_link_click", { row_id: data.id });
    if (countError) throw countError;
    if (eligible) {
      const { error: rewardError } = await supabase.from("kutt_reward_visits").insert({ owner_user_id: data.owner_user_id, visitor_ip_hash: visitorHash, first_link_id: data.id });
      if (rewardError && rewardError.code !== "23505") throw rewardError;
    }
  }
  return { url: data.target_url };
}

async function setPix(request: Request, payload: Payload) {
  const { user } = await requireUser(request, payload);
  const pixKey = String(payload.pixKey ?? "").trim().slice(0, 120);
  if (pixKey.length < 5) throw new Error("Informe uma chave Pix válida.");
  const { error } = await supabase.from("kutt_users").update({ pix_key: pixKey, updated_at: new Date().toISOString() }).eq("id", user.id);
  if (error) throw error;
  return { ok: true, message: "Chave Pix salva para solicitar saques." };
}

async function logout(request: Request, payload: Payload) {
  const { session } = await requireUser(request, payload);
  const { error } = await supabase.from("kutt_sessions").update({ revoked_at: new Date().toISOString() }).eq("id", session.id);
  if (error) throw error;
  return { ok: true };
}

async function requestWithdrawal(request: Request, payload: Payload) {
  const { user } = await requireUser(request, payload);
  if (!user.pix_key) throw new Error("Cadastre sua chave Pix antes de solicitar saque.");
  const { count, error: countError } = await supabase.from("kutt_reward_visits").select("id", { count: "exact", head: true }).eq("owner_user_id", user.id);
  if (countError) throw countError;
  const earned = Math.floor((count ?? 0) / 1000) * 7000;
  const { data: withdrawals, error: withdrawalError } = await supabase.from("kutt_withdrawals").select("amount_cents, status")
    .eq("user_id", user.id).neq("status", "rejected");
  if (withdrawalError) throw withdrawalError;
  const reserved = (withdrawals ?? []).reduce((sum, item) => sum + Number(item.amount_cents), 0);
  const amount = earned - reserved;
  if (amount < 7000) throw new Error("Seu saldo ainda não atingiu R$ 70,00 disponíveis para saque.");
  const { error } = await supabase.from("kutt_withdrawals").insert({ user_id: user.id, amount_cents: amount, pix_key: user.pix_key });
  if (error) throw error;
  return { ok: true, amountCents: amount, message: "Solicitação enviada. O administrador fará o pagamento via Pix após conferir as visitas." };
}

async function adminAction(request: Request, payload: Payload) {
  const { user } = await requireUser(request, payload);
  if (user.role !== "admin" || user.phone !== ownerPhone) throw new Error("Acesso restrito ao administrador.");
  if (payload.action === "admin-list") {
    const [{ data: users, error: usersError }, { data: withdrawals, error: withdrawalsError }, { data: links, error: linksError }] = await Promise.all([
      supabase.from("kutt_users").select("id, phone, role, pix_key, created_at").order("created_at", { ascending: false }).limit(250),
      supabase.from("kutt_withdrawals").select("id, user_id, amount_cents, pix_key, status, requested_at, processed_at, admin_note, user:kutt_users(phone)").order("requested_at", { ascending: false }).limit(250),
      supabase.from("kutt_short_links").select("id, slug, target_url, title, click_count, created_at, owner_user_id, user:kutt_users(phone)").order("created_at", { ascending: false }).limit(250)
    ]);
    if (usersError) throw usersError; if (withdrawalsError) throw withdrawalsError; if (linksError) throw linksError;
    return { users: users ?? [], withdrawals: withdrawals ?? [], links: links ?? [] };
  }
  if (payload.action === "admin-withdrawal") {
    const status = payload.status;
    if (!payload.withdrawalId || !["approved", "paid", "rejected"].includes(status ?? "")) throw new Error("Ação de saque inválida.");
    const { data: current, error: readError } = await supabase.from("kutt_withdrawals").select("status").eq("id", payload.withdrawalId).maybeSingle();
    if (readError) throw readError;
    if (!current) throw new Error("Solicitação não encontrada.");
    const transitions: Record<string, string[]> = { pending: ["approved", "rejected"], approved: ["paid", "rejected"] };
    if (!transitions[current.status]?.includes(status!)) throw new Error("Transição de status inválida para esta solicitação.");
    const { data: updated, error } = await supabase.from("kutt_withdrawals").update({ status, admin_note: String(payload.note ?? "").slice(0, 500), processed_at: new Date().toISOString(), processed_by: user.id }).eq("id", payload.withdrawalId).eq("status", current.status).select("id").maybeSingle();
    if (error) throw error;
    if (!updated) throw new Error("A solicitação mudou em outra sessão. Atualize o painel.");
    return { ok: true, message: status === "paid" ? "Pagamento marcado como realizado." : "Solicitação atualizada." };
  }
  throw new Error("Ação administrativa inválida.");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, 405, { error: "Método não permitido." });
  if (!supabaseUrl || !serviceRoleKey || !otpPepper) return json(request, 500, { error: "Backend sem configuração completa." });
  try {
    const payload = await request.json() as Payload;
    switch (payload.action) {
      case "request-otp": return json(request, 200, await requestOtp(request, payload));
      case "verify-otp": return json(request, 200, await verifyOtp(request, payload));
      case "login-password": return json(request, 200, await loginWithPassword(request, payload));
      case "set-password": return json(request, 200, await setPassword(request, payload));
      case "me": return json(request, 200, await profile(request, payload));
      case "create": return json(request, 200, await createLink(request, payload));
      case "resolve": return json(request, 200, await resolveLink(request, payload));
      case "save-pix": return json(request, 200, await setPix(request, payload));
      case "withdraw": return json(request, 200, await requestWithdrawal(request, payload));
      case "logout": return json(request, 200, await logout(request, payload));
      case "admin-list":
      case "admin-withdrawal": return json(request, 200, await adminAction(request, payload));
      default: return json(request, 400, { error: "Ação inválida." });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado.";
    const status = /sessão expirou|entre com seu telefone|acesso restrito/i.test(message) ? 401 : /muitas tentativas|limite de códigos/i.test(message) ? 429 : 400;
    return json(request, status, { error: message });
  }
});
