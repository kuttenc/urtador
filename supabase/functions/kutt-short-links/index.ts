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
  userId?: string;
  payoutPercent?: number;
  rewardBaseCents?: number;
  adsenseEnabled?: boolean;
  adsenseTitle?: string;
  adScripts?: unknown[];
  status?: "approved" | "paid" | "rejected";
  note?: string;
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const publicBaseUrl = (Deno.env.get("PUBLIC_BASE_URL") ?? "https://kuttenc.github.io/urtador").replace(/\/$/, "");
const ownerPhone = normalizePhone(Deno.env.get("OWNER_PHONE") ?? "11989346164");
const adminPhones = new Set([ownerPhone, "12996629929", ...(Deno.env.get("ADMIN_PHONES") ?? "").split(",").map((phone) => phone.trim()).filter(Boolean).map(normalizePhone)]);
const otpPepper = Deno.env.get("OTP_PEPPER") ?? "";
const greenApiUrl = (Deno.env.get("GREEN_API_URL") ?? "").replace(/\/$/, "");
const greenApiInstance = Deno.env.get("GREEN_API_INSTANCE_ID") ?? "";
const greenApiToken = Deno.env.get("GREEN_API_TOKEN") ?? "";
const adNotificationGroupId = (Deno.env.get("KUTT_AD_NOTIFICATION_GROUP_ID") ?? "").replace(/@g\.us$/i, "");
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

function parseAdsterraBanner(input: unknown, index: number) {
  const entry = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const source = String(entry.code ?? input ?? "").trim();
  if (!source) return null;
  const title = String(entry.title ?? "").trim();
  const owner = String(entry.owner ?? "").trim();
  if (!title || title.length > 80) throw new Error(`Informe um título de até 80 caracteres para o anúncio ${index}.`);
  if (!new Set(["owner", "mateus"]).has(owner)) throw new Error(`Selecione se o anúncio ${index} pertence a você ou ao Matheus.`);
  if (source.length > 12000) throw new Error(`O código do anúncio ${index} excede o limite de 12 mil caracteres.`);
  const keyMatch = source.match(/['"]key['"]\s*:\s*['"]([a-f0-9]{32})['"]/i);
  const widthMatch = source.match(/['"]width['"]\s*:\s*(\d{2,4})/i);
  const heightMatch = source.match(/['"]height['"]\s*:\s*(\d{2,4})/i);
  const scriptMatch = source.match(/<script\b[^>]*\bsrc\s*=\s*['"](https:\/\/[^'"]+)['"][^>]*>\s*<\/script>/i);
  if (!keyMatch || !widthMatch || !heightMatch || !scriptMatch) {
    throw new Error(`O anúncio ${index} não parece um código de banner Adsterra válido. Cole o código original do painel Publisher.`);
  }
  const key = keyMatch[1].toLowerCase();
  const width = Number(widthMatch[1]);
  const height = Number(heightMatch[1]);
  let scriptUrl: URL;
  try { scriptUrl = new URL(scriptMatch[1]); } catch { throw new Error(`A URL do script do anúncio ${index} é inválida.`); }
  const allowedHosts = new Set(["www.highperformanceformat.com", "highperformanceformat.com"]);
  const pathMatch = scriptUrl.pathname.match(/^\/([a-f0-9]{32})\/invoke\.js$/i);
  if (scriptUrl.protocol !== "https:" || !allowedHosts.has(scriptUrl.hostname.toLowerCase()) || pathMatch?.[1].toLowerCase() !== key) {
    throw new Error(`O anúncio ${index} usa uma origem não reconhecida. Use o código gerado para seu site no painel oficial Adsterra.`);
  }
  if (width < 120 || width > 728 || height < 50 || height > 600) throw new Error(`As dimensões do anúncio ${index} estão fora do limite permitido.`);
  return { title, owner, key, width, height, host: scriptUrl.hostname.toLowerCase() };
}

function formatAdsterraBanner(slot: Record<string, unknown>) {
  const key = String(slot.key);
  const width = Number(slot.width);
  const height = Number(slot.height);
  const host = String(slot.host);
  return `<script type="text/javascript">\natOptions = {\n  'key': '${key}',\n  'format': 'iframe',\n  'height': ${height},\n  'width': ${width},\n  'params': {}\n};\n</script>\n<script type="text/javascript" src="https://${host}/${key}/invoke.js"></script>`;
}

function bearer(request: Request) {
  return request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
}

async function requireUser(request: Request, payload: Payload, allowPasswordSetup = false) {
  const token = String(payload.token || bearer(request));
  if (!token || token.length < 20) throw new Error("Entre com seu telefone para continuar.");
  const tokenHash = await hash(token);
  const { data, error } = await supabase.from("kutt_sessions")
    .select("id, expires_at, password_recovery, user:kutt_users(id, phone, role, pix_key, password_hash, payout_percent)")
    .eq("token_hash", tokenHash).is("revoked_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (error) throw error;
  if (!data?.user) throw new Error("Sua sessão expirou. Entre novamente pelo WhatsApp.");
  const user = Array.isArray(data.user) ? data.user[0] : data.user;
  if (data.password_recovery && payload.action !== "set-password") throw new Error("Conclua a redefinição da senha antes de usar sua conta.");
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

async function issueOtp(request: Request, phone: string, passwordVerified: boolean, passwordRecovery = false) {
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
    .insert({ phone, code_hash: codeHash, expires_at: expiresAt, password_verified: passwordVerified, password_recovery: passwordRecovery }).select("id").single();
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

async function requestPasswordRecovery(request: Request, payload: Payload) {
  const phone = normalizePhone(payload.phone ?? "");
  await rateLimit(request, "password-recovery-ip", 6, 60);
  await rateLimitIdentity("password-recovery-phone", phone, 4, 15);
  const { data: user, error } = await supabase.from("kutt_users").select("id, password_hash, password_salt").eq("phone", phone).maybeSingle();
  if (error) throw error;
  if (user?.password_hash && user.password_salt) await issueOtp(request, phone, false, true);
  return { ok: true, message: "Se a conta puder recuperar a senha, enviaremos um código de 6 dígitos pelo WhatsApp. Confira as mensagens." };
}

async function createSession(user: { id: string; phone: string; role: string; pix_key: string | null }, passwordRecovery = false) {
  const token = `${crypto.randomUUID()}${crypto.randomUUID().replace(/-/g, "")}`;
  const { error } = await supabase.from("kutt_sessions").insert({ user_id: user.id, token_hash: await hash(token), expires_at: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(), password_recovery: passwordRecovery });
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
  const role = adminPhones.has(phone) ? "admin" : "user";
  if (user.role !== role) {
    const { error: roleError } = await supabase.from("kutt_users").update({ role }).eq("id", user.id);
    if (roleError) throw roleError;
  }
  return await createSession({ ...user, role });
}

async function setPassword(request: Request, payload: Payload) {
  const { user, session } = await requireUser(request, payload, true);
  const password = validatePassword(payload.password);
  const { data: existing, error: readError } = await supabase.from("kutt_users").select("password_hash").eq("id", user.id).single();
  if (readError) throw readError;
  const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  const passwordHash = await derivePasswordHash(password, salt);
  let update = supabase.from("kutt_users").update({ password_salt: salt, password_hash: passwordHash, updated_at: new Date().toISOString() }).eq("id", user.id);
  if (!session.password_recovery) update = update.is("password_hash", null);
  const { data, error } = await update.select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("A senha já foi cadastrada nesta conta. Atualize a página e entre com ela.");
  if (session.password_recovery) {
    const { error: currentSessionError } = await supabase.from("kutt_sessions").update({ password_recovery: false }).eq("id", session.id);
    if (currentSessionError) throw currentSessionError;
    const { error: revokeError } = await supabase.from("kutt_sessions").update({ revoked_at: new Date().toISOString() })
      .eq("user_id", user.id).neq("id", session.id).is("revoked_at", null);
    if (revokeError) throw revokeError;
    return { ok: true, message: "Senha redefinida. Por segurança, outras sessões foram encerradas." };
  }
  return { ok: true, message: "Senha cadastrada. Use-a nos próximos acessos; a cada 48 horas o WhatsApp também será confirmado." };
}

async function verifyOtp(request: Request, payload: Payload) {
  await rateLimit(request, "otp-verify-ip", 20, 60);
  const phone = normalizePhone(payload.phone ?? "");
  const code = String(payload.code ?? "").replace(/\D/g, "");
  if (!/^\d{6}$/.test(code)) throw new Error("Digite os 6 números recebidos no WhatsApp.");
  const { data: challenge, error } = await supabase.from("kutt_otp_challenges").select("id, code_hash, attempts, password_verified, password_recovery")
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
  if (knownUser?.password_hash && !challenge.password_verified && !challenge.password_recovery) throw new Error("Esta conta exige a senha antes do código do WhatsApp.");
  await supabase.from("kutt_otp_challenges").update({ consumed_at: new Date().toISOString() }).eq("id", challenge.id);
  const isAdmin = adminPhones.has(phone);
  const { data: user, error: userError } = await supabase.from("kutt_users")
    .upsert({ phone, role: isAdmin ? "admin" : "user", otp_verified_at: new Date().toISOString() }, { onConflict: "phone", ignoreDuplicates: false })
    .select("id, phone, role, pix_key").single();
  if (userError) throw userError;
  return { ...await createSession(user, Boolean(challenge.password_recovery)), passwordSetupRequired: !knownUser?.password_hash, passwordRecoveryRequired: Boolean(challenge.password_recovery) };
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
  const rewards = await readRewardBalance(user.id);
  const rewardBaseCents = await currentRewardBaseCents();
  const reservedCents = (withdrawals ?? []).filter((w) => w.status !== "rejected").reduce((sum, w) => sum + Number(w.amount_cents), 0);
  return { user: { phone: user.phone, role: user.role, pixKey: user.pix_key, payoutPercent: Number(user.payout_percent ?? 100) }, rewardBaseCents, expiresAt: session.expires_at, links: links ?? [], eligibleVisits: rewards.visitCount, rawLinkVisits: eligibleVisits ?? 0, earnedCents: rewards.earnedCents, reservedCents, availableCents: Math.max(0, rewards.earnedCents - reservedCents), withdrawals: withdrawals ?? [] };
}

async function readRewardBalance(userId: string) {
  const pageSize = 1000;
  let visitCount = 0;
  let rewardNumerator = 0;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from("kutt_reward_visits").select("payout_percent, reward_base_cents")
      .eq("owner_user_id", userId).order("id", { ascending: true }).range(offset, offset + pageSize - 1);
    if (error) throw error;
    const rows = data ?? [];
    visitCount += rows.length;
    for (const row of rows) rewardNumerator += Math.round(Number(row.payout_percent ?? 100) * 100) * Number(row.reward_base_cents ?? 7000);
    if (rows.length < pageSize) break;
  }
  return { visitCount, earnedCents: Math.floor(rewardNumerator / 10_000_000) };
}

async function currentRewardBaseCents() {
  const { data, error } = await supabase.from("kutt_ad_configuration").select("reward_base_cents").eq("id", true).maybeSingle();
  if (error) throw error;
  return Number(data?.reward_base_cents ?? 7000);
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
      const { data: owner, error: ownerError } = await supabase.from("kutt_users").select("payout_percent").eq("id", data.owner_user_id).maybeSingle();
      if (ownerError) throw ownerError;
      const rewardBaseCents = await currentRewardBaseCents();
      const { error: rewardError } = await supabase.from("kutt_reward_visits").insert({ owner_user_id: data.owner_user_id, visitor_ip_hash: visitorHash, first_link_id: data.id, payout_percent: Number(owner?.payout_percent ?? 100), reward_base_cents: rewardBaseCents });
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
  const { earnedCents: earned } = await readRewardBalance(user.id);
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

async function readAllRows(table: string, columns: string, orderBy: string) {
  const pageSize = 1000;
  const rows: Record<string, any>[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from(table).select(columns).order(orderBy, { ascending: false }).range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) return rows;
  }
}

function makeAdminSummary(users: Record<string, any>[], withdrawals: Record<string, any>[], links: Record<string, any>[], visits: Record<string, any>[]) {
  const visitsByDay = new Map<string, number>();
  for (const visit of visits) {
    const day = String(visit.visit_day).slice(0, 10);
    visitsByDay.set(day, (visitsByDay.get(day) ?? 0) + 1);
  }
  const pendingWithdrawals = withdrawals.filter((item) => item.status === "pending" || item.status === "approved");
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const daily = new Map<string, { day: string; qualifiedVisits: number; withdrawalRequests: number; requestedCents: number; openCents: number; paidCents: number }>();
  const ensureDay = (day: string) => {
    if (!daily.has(day)) daily.set(day, { day, qualifiedVisits: 0, withdrawalRequests: 0, requestedCents: 0, openCents: 0, paidCents: 0 });
    return daily.get(day)!;
  };
  for (let offset = -13; offset <= 0; offset++) {
    const date = new Date(today.getTime() + offset * 86400000);
    const day = date.toISOString().slice(0, 10);
    ensureDay(day).qualifiedVisits = visitsByDay.get(day) ?? 0;
  }
  for (const item of withdrawals) {
    const requestedDay = item.requested_at ? new Date(item.requested_at).toISOString().slice(0, 10) : "";
    const amount = Number(item.amount_cents || 0);
    if (daily.has(requestedDay)) {
      const day = ensureDay(requestedDay);
      day.withdrawalRequests++;
      day.requestedCents += amount;
      if (item.status === "pending" || item.status === "approved") day.openCents += amount;
    }
    if (item.status === "paid" && item.processed_at) {
      const processedDay = new Date(item.processed_at).toISOString().slice(0, 10);
      if (daily.has(processedDay)) ensureDay(processedDay).paidCents += amount;
    }
  }
  return {
    userCount: users.length,
    linkCount: links.length,
    qualifiedVisits: visits.length,
    pendingPayoutCount: pendingWithdrawals.length,
    pendingPayoutCents: pendingWithdrawals.reduce((sum, item) => sum + Number(item.amount_cents || 0), 0),
    paidCents: withdrawals.filter((item) => item.status === "paid").reduce((sum, item) => sum + Number(item.amount_cents || 0), 0),
    dailyActivity: [...daily.values()].sort((a, b) => a.day.localeCompare(b.day))
  };
}

async function notifyCollaboratorGroup(message: string) {
  if (!adNotificationGroupId || !greenApiUrl || !greenApiInstance || !greenApiToken) return false;
  const endpoint = `${greenApiUrl}/waInstance${encodeURIComponent(greenApiInstance)}/sendMessage/${encodeURIComponent(greenApiToken)}`;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: `${adNotificationGroupId}@g.us`, message })
    });
    const result = await response.json().catch(() => ({}));
    return response.ok && !result?.error;
  } catch {
    return false;
  }
}

async function readAdConfiguration() {
  const { data, error } = await supabase.from("kutt_ad_configuration")
    .select("adsense_enabled, adsense_title, adsterra_slots, reward_base_cents").eq("id", true).maybeSingle();
  if (error) throw error;
  const slots = Array.isArray(data?.adsterra_slots) ? data.adsterra_slots : [];
  return {
    adsenseEnabled: Boolean(data?.adsense_enabled),
    adsenseTitle: String(data?.adsense_title ?? ""),
    rewardBaseCents: Number(data?.reward_base_cents ?? 7000),
    slots: slots.map((slot: Record<string, unknown>) => ({ ...slot, script: formatAdsterraBanner(slot) }))
  };
}

async function publicAdConfiguration() {
  const config = await readAdConfiguration();
  return { adsenseEnabled: config.adsenseEnabled, slots: config.slots };
}

async function adminAction(request: Request, payload: Payload) {
  const { user } = await requireUser(request, payload);
  if (user.role !== "admin" || !adminPhones.has(user.phone)) throw new Error("Acesso restrito ao administrador.");
  if (payload.action === "admin-list") {
    const [users, withdrawals, links, visits, adConfiguration] = await Promise.all([
      readAllRows("kutt_users", "id, phone, role, pix_key, payout_percent, created_at", "created_at"),
      readAllRows("kutt_withdrawals", "id, user_id, amount_cents, pix_key, status, requested_at, processed_at, admin_note, user:kutt_users!kutt_withdrawals_user_id_fkey(phone)", "requested_at"),
      readAllRows("kutt_short_links", "id, slug, target_url, title, click_count, created_at, owner_user_id, user:kutt_users!kutt_short_links_owner_user_id_fkey(phone)", "created_at"),
      readAllRows("kutt_reward_visits", "owner_user_id, visit_day", "visit_day"),
      readAdConfiguration()
    ]);
    return { users, withdrawals, links, adConfiguration, summary: makeAdminSummary(users, withdrawals, links, visits) };
  }
  if (payload.action === "admin-set-user-payout") {
    const userId = String(payload.userId ?? "");
    const payoutPercent = Number(payload.payoutPercent);
    if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("Selecione um colaborador válido.");
    if (!Number.isFinite(payoutPercent) || payoutPercent < 0 || payoutPercent > 100) throw new Error("A porcentagem deve estar entre 0 e 100.");
    const { data: target, error: targetError } = await supabase.from("kutt_users").select("id, phone, payout_percent").eq("id", userId).maybeSingle();
    if (targetError) throw targetError;
    if (!target) throw new Error("Colaborador não encontrado.");
    const nextPercent = Math.round(payoutPercent * 100) / 100;
    if (Number(target.payout_percent ?? 100) === nextPercent) return { ok: true, notificationSent: false, unchanged: true };
    const { error } = await supabase.from("kutt_users").update({ payout_percent: nextPercent, updated_at: new Date().toISOString() }).eq("id", userId);
    if (error) throw error;
    const rewardBaseCents = await currentRewardBaseCents();
    const ratePerThousandCents = Math.round(rewardBaseCents * nextPercent / 100);
    const maskedPhone = `final ${String(target.phone).slice(-4)}`;
    const formattedPercent = nextPercent.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    const formattedRate = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(ratePerThousandCents / 100);
    const message = `📊 Taxa de ganhos atualizada no Urtador\nColaborador: ${maskedPhone}\nPercentual: ${formattedPercent}% do valor-base.\nReferência: ${formattedRate} por 1.000 visitas qualificadas e únicas.\nA nova taxa vale para visitas futuras; registros anteriores mantêm a taxa que tinham. Esse valor é uma regra interna do Urtador, não CPM nem receita de anúncios.`;
    const notificationSent = await notifyCollaboratorGroup(message);
    return { ok: true, notificationSent, payoutPercent: nextPercent, ratePerThousandCents, rewardBaseCents };
  }
  if (payload.action === "admin-set-reward-base") {
    const rewardBaseCents = Number(payload.rewardBaseCents);
    if (!Number.isInteger(rewardBaseCents) || rewardBaseCents < 0 || rewardBaseCents > 50000) throw new Error("O valor-base deve ficar entre R$ 0,00 e R$ 500,00 por mil visitas qualificadas.");
    const previousRewardBaseCents = await currentRewardBaseCents();
    const { error } = await supabase.from("kutt_ad_configuration").upsert({
      id: true,
      reward_base_cents: rewardBaseCents,
      updated_at: new Date().toISOString(),
      updated_by: user.id
    }, { onConflict: "id" });
    if (error) throw error;
    const formatMoney = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
    const notificationSent = await notifyCollaboratorGroup(`📊 Valor-base interno de ganhos atualizado no Urtador\nAntes: ${formatMoney(previousRewardBaseCents)} por mil visitas qualificadas.\nAgora: ${formatMoney(rewardBaseCents)} por mil visitas qualificadas.\nA nova regra vale para visitas futuras; visitas registradas mantêm o valor anterior. Isso não representa CPM nem receita de anúncios.`);
    return { ok: true, rewardBaseCents, notificationSent };
  }
  if (payload.action === "admin-save-ad-configuration") {
    if (typeof payload.adsenseEnabled !== "boolean") throw new Error("Informe se o AdSense está habilitado.");
    const adsenseTitle = String(payload.adsenseTitle ?? "").trim();
    if (payload.adsenseEnabled && (!adsenseTitle || adsenseTitle.length > 80)) throw new Error("Informe um título de até 80 caracteres para o Google AdSense.");
    if (!Array.isArray(payload.adScripts) || payload.adScripts.length !== 6) throw new Error("Envie os seis campos de banner, mesmo que alguns estejam vazios.");
    const slots = payload.adScripts.map((script, index) => parseAdsterraBanner(script, index + 1)).filter(Boolean);
    const { error } = await supabase.from("kutt_ad_configuration").upsert({
      id: true,
      adsense_enabled: payload.adsenseEnabled,
      adsense_title: adsenseTitle,
      adsterra_slots: slots,
      updated_at: new Date().toISOString(),
      updated_by: user.id
    }, { onConflict: "id" });
    if (error) throw error;
    const activeProviders = [
      ...(slots.length ? [`Adsterra (${slots.map((slot) => slot.title).join(", ")})`] : []),
      ...(payload.adsenseEnabled ? [`Google AdSense (${adsenseTitle}; aguardando aprovação antes de ativar na página)`] : [])
    ];
    const ownerSummary = slots.length ? `Titularidade configurada: você ${slots.filter((slot) => slot.owner === "owner").length}, Matheus ${slots.filter((slot) => slot.owner === "mateus").length}.` : "Nenhum banner Adsterra ativo.";
    const notified = activeProviders.length
      ? await notifyCollaboratorGroup(`✅ Atualização de anúncios salva no Urtador. Fornecedor(es) configurado(s): ${activeProviders.join("; ")}. ${ownerSummary} Os anúncios são exibidos somente na página Guia. Google AdSense: ${payload.adsenseEnabled ? "marcado como habilitado" : "desligado"}; a veiculação depende da aprovação do site.`)
      : false;
    return { ok: true, notificationSent: notified, adConfiguration: { adsenseEnabled: payload.adsenseEnabled, adsenseTitle, rewardBaseCents: await currentRewardBaseCents(), slots } };
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
      case "request-password-recovery": return json(request, 200, await requestPasswordRecovery(request, payload));
      case "verify-otp": return json(request, 200, await verifyOtp(request, payload));
      case "login-password": return json(request, 200, await loginWithPassword(request, payload));
      case "set-password": return json(request, 200, await setPassword(request, payload));
      case "me": return json(request, 200, await profile(request, payload));
      case "create": return json(request, 200, await createLink(request, payload));
      case "resolve": return json(request, 200, await resolveLink(request, payload));
      case "save-pix": return json(request, 200, await setPix(request, payload));
      case "withdraw": return json(request, 200, await requestWithdrawal(request, payload));
      case "logout": return json(request, 200, await logout(request, payload));
      case "public-ad-configuration": return json(request, 200, await publicAdConfiguration());
      case "admin-list":
      case "admin-withdrawal":
      case "admin-set-user-payout":
      case "admin-set-reward-base":
      case "admin-save-ad-configuration": return json(request, 200, await adminAction(request, payload));
      default: return json(request, 400, { error: "Ação inválida." });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado.";
    const status = /sessão expirou|entre com seu telefone|acesso restrito/i.test(message) ? 401 : /muitas tentativas|limite de códigos/i.test(message) ? 429 : 400;
    return json(request, status, { error: message });
  }
});
