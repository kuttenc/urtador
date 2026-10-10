import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Payload = {
  action?: string;
  phone?: string;
  code?: string;
  adsenseAuthCode?: string;
  password?: string;
  token?: string;
  url?: string;
  slug?: string;
  title?: string;
  guestSessionId?: string;
  reportStart?: string;
  reportEnd?: string;
  reportGroup?: "day" | "week" | "month";
  pixKey?: string;
  idMessage?: string;
  amountCents?: number;
  testPerson?: "mateus" | "fabio";
  provider?: "adsense" | "adsterra";
  impressions?: number;
  clicks?: number;
  revenueCents?: number;
  announce?: boolean;
  notifySlot?: "08" | "20";
  enabled?: boolean;
  consent?: boolean;
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
const ownerPhoneValue = Deno.env.get("OWNER_PHONE")?.trim() ?? "";
const adminPhones = new Set([
  ...(ownerPhoneValue ? [normalizePhone(ownerPhoneValue)] : []),
  ...(Deno.env.get("ADMIN_PHONES") ?? "").split(",").map((phone) => phone.trim()).filter(Boolean).map(normalizePhone)
]);
const otpPepper = Deno.env.get("OTP_PEPPER") ?? "";
const greenApiUrl = (Deno.env.get("GREEN_API_FALLBACK_URL") || Deno.env.get("GREEN_API_URL") || "").replace(/\/$/, "");
const greenApiInstance = Deno.env.get("GREEN_API_FALLBACK_INSTANCE_ID") || Deno.env.get("GREEN_API_INSTANCE_ID") || "";
const greenApiToken = Deno.env.get("GREEN_API_FALLBACK_TOKEN") || Deno.env.get("GREEN_API_TOKEN") || "";
const kuttCommunityId = "120363430513969812@g.us";
const adsenseOAuthClientId = Deno.env.get("ADSENSE_OAUTH_CLIENT_ID") ?? "";
const adsenseOAuthClientSecret = Deno.env.get("ADSENSE_OAUTH_CLIENT_SECRET") ?? "";
const adsensePublisherId = Deno.env.get("ADSENSE_PUBLISHER_ID") ?? "pub-6464589391694014";
const adsterraApiToken = Deno.env.get("ADSTERRA_API_TOKEN") ?? "";
const adNotificationGroupId = (Deno.env.get("KUTT_AD_NOTIFICATION_GROUP_ID") ?? "").replace(/@g\.us$/i, "");
const reportCronSecret = Deno.env.get("KUTT_REPORT_CRON_SECRET") ?? "";
const pixConfirmationWebhookSecret = Deno.env.get("KUTT_PIX_CONFIRMATION_WEBHOOK_SECRET") ?? "";
const allowedOrigins = new Set((Deno.env.get("ALLOWED_ORIGINS") ?? "https://kuttenc.github.io")
  .split(",").map((v) => v.trim()).filter(Boolean));
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function normalizePhone(input: string) {
  const source = String(input).trim();
  const explicitInternationalCode = /^\s*\+|^\s*00/.test(source);
  let digits = source.replace(/\D/g, "");
  if (/^00/.test(source)) digits = digits.slice(2);
  if (!explicitInternationalCode && (digits.length === 10 || digits.length === 11)) digits = `55${digits}`;
  if (!/^\d{8,15}$/.test(digits)) throw new Error("Informe o telefone com DDI e DDD.");
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

function saoPauloDay(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(date);
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
  const host = scriptUrl.hostname.toLowerCase();
  const pathMatch = host === "bauval.org"
    ? scriptUrl.pathname.match(/^\/22\/([a-f0-9]{32})$/i)
    : scriptUrl.pathname.match(/^\/([a-f0-9]{32})\/invoke\.js$/i);
  const allowedHost = host === "bauval.org" || host === "www.highperformanceformat.com" || host === "highperformanceformat.com";
  if (scriptUrl.protocol !== "https:" || !allowedHost || scriptUrl.username || scriptUrl.password || scriptUrl.port || scriptUrl.search || scriptUrl.hash || pathMatch?.[1].toLowerCase() !== key) {
    throw new Error(`O anúncio ${index} usa uma origem não reconhecida. Use o código gerado para seu site no painel oficial Adsterra.`);
  }
  if (width < 120 || width > 728 || height < 50 || height > 600) throw new Error(`As dimensões do anúncio ${index} estão fora do limite permitido.`);
  return { title, owner, key, width, height, host, scriptPath: scriptUrl.pathname };
}

function formatAdsterraBanner(slot: Record<string, unknown>) {
  const key = String(slot.key);
  const width = Number(slot.width);
  const height = Number(slot.height);
  const host = String(slot.host);
  const scriptPath = String(slot.scriptPath ?? (host.endsWith("highperformanceformat.com") ? `/${key}/invoke.js` : `/22/${key}`));
  const expectedPath = host === "bauval.org" ? `/22/${key}` : `/${key}/invoke.js`;
  if (scriptPath !== expectedPath) throw new Error("O caminho do script do anúncio salvo não é válido.");
  return `<script type="text/javascript">\natOptions = {\n  'key': '${key}',\n  'format': 'iframe',\n  'height': ${height},\n  'width': ${width},\n  'params': {}\n};\n</script>\n<script type="text/javascript" src="https://${host}${scriptPath}"></script>`;
}

function bearer(request: Request) {
  return request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
}

async function requireUser(request: Request, payload: Payload, allowPasswordSetup = false) {
  const token = String(payload.token || bearer(request));
  if (!token || token.length < 20) throw new Error("Entre com seu telefone para continuar.");
  const tokenHash = await hash(token);
  const { data, error } = await supabase.from("kutt_sessions")
    .select("id, expires_at, password_recovery, user:kutt_users(id, phone, role, pix_key, pix_key_confirmed_at, password_hash, payout_percent)")
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

async function ensureKuttCommunityMember(phone: string) {
  if (!greenApiUrl || !greenApiInstance || !greenApiToken) {
    throw new Error("O envio pelo grupo ainda não está configurado no servidor.");
  }
  const endpoint = `${greenApiUrl}/waInstance${encodeURIComponent(greenApiInstance)}/getGroupData/${encodeURIComponent(greenApiToken)}`;
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupId: kuttCommunityId })
    });
  } catch {
    throw new Error("Não consegui confirmar os membros da comunidade Kuttencurtador. Tente novamente mais tarde.");
  }
  if (!response.ok) {
    throw new Error("A conexão do WhatsApp da comunidade está indisponível. A equipe precisa reativá-la.");
  }
  const group = await response.json().catch(() => ({}));
  if (String(group?.subject ?? "").trim().toLocaleLowerCase("pt-BR") !== "kuttencurtador" || !Array.isArray(group?.participants)) {
    throw new Error("Não consegui confirmar os membros da comunidade Kuttencurtador. Tente novamente mais tarde.");
  }
  const isMember = group.participants.some((participant: Record<string, unknown>) => {
    const values = [participant.phoneNumber, participant.id, participant.lid];
    return values.some((value) => {
      const digits = String(value ?? "").split("@")[0].replace(/\D/g, "");
      return digits === phone || (phone.startsWith("55") && digits === phone.slice(2));
    });
  });
  if (!isMember) throw new Error("Este telefone ainda não está no grupo. Entre na comunidade pelo link e tente novamente.");
}

async function sendOtpToKuttCommunity(phone: string, code: string) {
  const endpoint = `${greenApiUrl}/waInstance${encodeURIComponent(greenApiInstance)}/sendMessage/${encodeURIComponent(greenApiToken)}`;
  const digits = phone.slice(2);
  const phoneEnding = `(${digits.slice(0, 2)}) ****-${digits.slice(-4)}`;
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: kuttCommunityId, message: `${phoneEnding} · ${code}` })
    });
  } catch {
    throw new Error("Não foi possível publicar o código no grupo Kuttencurtador. Tente novamente mais tarde.");
  }
  const receipt = await response.json().catch(() => ({}));
  if (!response.ok || receipt?.error || !receipt?.idMessage) {
    console.error("community_otp_rejected", JSON.stringify({
      status: response.status,
      quotaStatus: receipt?.correspondentsStatus?.status || receipt?.invokeStatus?.status || null,
      chatsUsed: receipt?.correspondentsStatus?.used ?? null,
      chatsTotal: receipt?.correspondentsStatus?.total ?? null
    }));
    if (response.status === 466) {
      throw new Error("O código não foi enviado: a Green API atingiu o limite do plano (erro 466). O administrador precisa regularizar o plano da instância para liberar os envios ao grupo.");
    }
    if (response.status === 429) {
      throw new Error("O WhatsApp está recebendo muitas solicitações. Aguarde um minuto antes de pedir outro código.");
    }
    throw new Error(`Não foi possível publicar o código no grupo. A Green API recusou o envio (HTTP ${response.status}).`);
  }
}

async function issueOtp(request: Request, phone: string, passwordVerified: boolean, passwordRecovery = false) {
  const isAdmin = adminPhones.has(phone);
  await rateLimit(request, isAdmin ? "otp-admin-ip" : "otp-ip", isAdmin ? 12 : 8, 60);
  await ensureKuttCommunityMember(phone);
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
    await sendOtpToKuttCommunity(phone, code);
  } catch (err) {
    await supabase.from("kutt_otp_challenges").delete().eq("id", challenge.id);
    throw err;
  }
  return { ok: true, message: "Código publicado no grupo Kuttencurtador. Ele vale por 10 minutos." };
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
  const isAdmin = adminPhones.has(phone);
  await rateLimit(request, isAdmin ? "password-recovery-admin-ip" : "password-recovery-ip", isAdmin ? 12 : 6, 60);
  await rateLimitIdentity(isAdmin ? "password-recovery-admin-phone" : "password-recovery-phone", phone, isAdmin ? 8 : 4, 15);
  const { data: user, error } = await supabase.from("kutt_users").select("id, password_hash, password_salt").eq("phone", phone).maybeSingle();
  if (error) throw error;
  if (user?.password_hash && user.password_salt) await issueOtp(request, phone, false, true);
  return { ok: true, message: "Se a conta puder recuperar a senha, publicaremos um código de 6 dígitos no grupo Kuttencurtador." };
}

async function createSession(user: { id: string; phone: string; role: string; pix_key: string | null }, passwordRecovery = false) {
  const token = `${crypto.randomUUID()}${crypto.randomUUID().replace(/-/g, "")}`;
  const { error } = await supabase.from("kutt_sessions").insert({ user_id: user.id, token_hash: await hash(token), expires_at: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(), password_recovery: passwordRecovery });
  if (error) throw error;
  return { token, expiresInSeconds: 10800, user: { phone: user.phone, role: user.role, pixKey: user.pix_key } };
}

async function loginWithPassword(request: Request, payload: Payload) {
  const phone = normalizePhone(payload.phone ?? "");
  await rateLimit(request, adminPhones.has(phone) ? "password-login-admin-ip" : "password-login-ip", 12, 60);
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
    return { otpRequired: true, phone, message: "Senha confirmada. Digite o código publicado no grupo Kuttencurtador." };
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
  return { ok: true, message: "Senha cadastrada. Use-a nos próximos acessos; a cada 48 horas o código do grupo será confirmado." };
}

async function verifyOtp(request: Request, payload: Payload) {
  await rateLimit(request, "otp-verify-ip", 20, 60);
  const phone = normalizePhone(payload.phone ?? "");
  const code = String(payload.code ?? "").replace(/\D/g, "");
  if (!/^\d{6}$/.test(code)) throw new Error("Digite os 6 números publicados no grupo Kuttencurtador.");
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
  await refreshRevenueRewards();
  const { data: links, error } = await supabase.from("kutt_short_links")
    .select("id, slug, target_url, title, created_at, qualified_click_count").eq("owner_user_id", user.id).order("created_at", { ascending: false }).limit(100);
  if (error) throw error;
  const { count: eligibleVisits, error: visitError } = await supabase.from("kutt_short_link_events")
    .select("id", { count: "exact", head: true }).in("link_id", (links ?? []).map((item) => item.id).length ? (links ?? []).map((item) => item.id) : ["00000000-0000-0000-0000-000000000000"])
    .eq("eligible_for_reward", true);
  if (visitError) throw visitError;
  const { data: withdrawals, error: withdrawalError } = await supabase.from("kutt_withdrawals")
    .select("id, amount_cents, pix_key, status, requested_at, processed_at, admin_note").eq("user_id", user.id).order("requested_at", { ascending: false }).limit(20);
  if (withdrawalError) throw withdrawalError;
  const [rewards, notificationCharges, notificationPreference, reservedCents, notificationBonus] = await Promise.all([
    readRewardBalance(user.id),
    readNotificationChargeBalance(user.id),
    supabase.from("kutt_ad_notification_preferences")
      .select("enabled, consent_version, enabled_at, disabled_at, free_notice_sent_at")
      .eq("user_id", user.id).maybeSingle(),
    readReservedWithdrawalCents(user.id),
    readNotificationBonusBalance(user.id)
  ]);
  if (notificationPreference.error) throw notificationPreference.error;
  const rewardBaseCents = await currentRewardBaseCents();
  const rewardPolicy = await readRewardPolicy();
  const earnedCents = rewards.earnedCents - notificationCharges.totalCents + notificationBonus.totalCents;
  const notificationLedger: Record<string, unknown>[] = [
    ...notificationCharges.rows.map((row) => ({ ...row, kind: "Tarifa" })),
    ...notificationBonus.rows.map((row: Record<string, unknown>) => ({ ...row, kind: "Bônus da primeira mensagem" }))
  ].sort((a: Record<string, unknown>, b: Record<string, unknown>) => String(b.service_day).localeCompare(String(a.service_day))).slice(0, 30);
  return { user: { phone: user.phone, role: user.role, pixKey: user.pix_key, pixKeyConfirmedAt: user.pix_key_confirmed_at, payoutPercent: Number(user.payout_percent ?? 100) }, rewardBaseCents, rewardPolicy, pendingRewardVisits: rewards.pendingVisits, expiresAt: session.expires_at, links: links ?? [], eligibleVisits: rewards.visitCount, rawLinkVisits: eligibleVisits ?? 0, grossEarnedCents: rewards.earnedCents, notificationFeesCents: notificationCharges.totalCents, notificationBonusCents: notificationBonus.totalCents, notificationCharges: notificationLedger, adRevenueNotifications: notificationPreference.data ?? { enabled: false }, earnedCents, reservedCents, availableCents: Math.max(0, earnedCents - reservedCents), withdrawals: withdrawals ?? [] };
}

async function readReservedWithdrawalCents(userId: string) {
  const pageSize = 1000;
  let totalCents = 0;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from("kutt_withdrawals")
      .select("amount_cents, status").eq("user_id", userId)
      .neq("status", "rejected").range(offset, offset + pageSize - 1);
    if (error) throw error;
    const rows = data ?? [];
    totalCents += rows.reduce((sum, row) => sum + Number(row.amount_cents || 0), 0);
    if (rows.length < pageSize) break;
  }
  return totalCents;
}

async function readNotificationChargeBalance(userId: string) {
  const pageSize = 1000;
  let totalCents = 0;
  const recentRows: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from("kutt_ad_notification_charges")
      .select("service_day, amount_cents").eq("user_id", userId)
      .order("service_day", { ascending: false }).range(offset, offset + pageSize - 1);
    if (error) throw error;
    const rows = data ?? [];
    totalCents += rows.reduce((sum, row) => sum + Number(row.amount_cents || 0), 0);
    if (recentRows.length < 30) recentRows.push(...rows.slice(0, 30 - recentRows.length));
    if (rows.length < pageSize) break;
  }
  return { totalCents, rows: recentRows };
}

async function readNotificationBonusBalance(userId: string) {
  const { data, error } = await supabase.from("kutt_ad_notification_credits")
    .select("service_day, amount_cents, reason").eq("user_id", userId);
  if (error) throw error;
  const rows = data ?? [];
  return { totalCents: rows.reduce((sum, row) => sum + Number(row.amount_cents || 0), 0), rows };
}

async function setAdRevenueNotificationPreference(request: Request, payload: Payload) {
  const { user } = await requireUser(request, payload);
  if (typeof payload.enabled !== "boolean") throw new Error("Escolha ativar ou desativar os avisos.");
  const now = new Date().toISOString();
  if (payload.enabled) {
    if (payload.consent !== true) throw new Error("Confirme que leu e aceita a tarifa diária antes de ativar.");
    const { data: existingPreference, error: preferenceError } = await supabase.from("kutt_ad_notification_preferences")
      .select("free_notice_sent_at").eq("user_id", user.id).maybeSingle();
    if (preferenceError) throw preferenceError;
    if (existingPreference?.free_notice_sent_at) {
      const [rewards, fees, bonus, reservedCents] = await Promise.all([
        readRewardBalance(user.id),
        readNotificationChargeBalance(user.id),
        readNotificationBonusBalance(user.id),
        readReservedWithdrawalCents(user.id)
      ]);
      const availableCents = rewards.earnedCents - fees.totalCents + bonus.totalCents - reservedCents;
      if (availableCents <= 7000) throw new Error("Para reativar os avisos, seu saldo disponível precisa ser maior que R$ 70,00.");
    }
    const { error } = await supabase.from("kutt_ad_notification_preferences").upsert({
      user_id: user.id,
      enabled: true,
      consent_version: "ad-revenue-whatsapp-1-cent-daily-v1",
      consented_at: now,
      enabled_at: now,
      disabled_at: null,
      updated_at: now
    }, { onConflict: "user_id" });
    if (error) throw error;
    return { ok: true, enabled: true, message: existingPreference?.free_notice_sent_at ? "Avisos reativados. A tarifa é de R$ 0,01 por dia em que ao menos um aviso for enviado." : "Primeiro aviso ativado: ele será gratuito, adicionará R$ 0,01 ao seu saldo e desligará os avisos automaticamente." };
  }
  const { error } = await supabase.from("kutt_ad_notification_preferences").upsert({
    user_id: user.id,
    enabled: false,
    disabled_at: now,
    updated_at: now
  }, { onConflict: "user_id" });
  if (error) throw error;
  return { ok: true, enabled: false, message: "Avisos desativados. Não haverá novas tarifas nem mensagens." };
}

async function buildPersonalAdRevenueRows(userId: string, start: string, end: string, reportsOverride?: Record<string, unknown>[]) {
  const [{ data: shares, error: shareError }, reportResponse] = await Promise.all([
    supabase.rpc("kutt_ad_revenue_daily_visit_share", { target_user_id: userId, start_day: start, end_day: end }),
    reportsOverride ? Promise.resolve({ data: reportsOverride, error: null }) : supabase.from("kutt_ad_revenue_reports")
      .select("report_date, impressions, cpm, revenue_cents, revenue_amount, currency_code")
      .eq("provider", "adsterra").gte("report_date", start).lte("report_date", end).order("report_date", { ascending: true })
  ]);
  if (shareError) throw shareError;
  if (reportResponse.error) throw reportResponse.error;
  const reports = reportResponse.data ?? [];
  const shareByDay = new Map((shares ?? []).map((row: Record<string, unknown>) => [String(row.report_date).slice(0, 10), row]));
  return reports.map((report: Record<string, unknown>) => {
    const day = String(report.report_date).slice(0, 10);
    const share = shareByDay.get(day) as Record<string, unknown> | undefined;
    const userVisits = Number(share?.user_visits ?? 0);
    const totalVisits = Number(share?.total_visits ?? 0);
    const participation = totalVisits > 0 ? userVisits / totalVisits : 0;
    const storedAmount = Number(report.revenue_amount ?? 0);
    const legacyAmount = Number(report.revenue_cents ?? 0) / 100;
    const cpm = Number(report.cpm ?? 0);
    const impressions = Number(report.impressions ?? 0);
    const hasStoredAmount = storedAmount > 0 || legacyAmount > 0;
    const siteRevenueUsd = hasStoredAmount ? (storedAmount || legacyAmount) : (cpm * impressions) / 1000;
    return {
      reportDate: day,
      userVisits,
      totalVisits,
      participationPercent: Number((participation * 100).toFixed(6)),
      siteRevenueUsd: Number(siteRevenueUsd.toFixed(10)),
      userRevenueEstimateUsd: Number((siteRevenueUsd * participation).toFixed(10)),
      estimateSource: hasStoredAmount ? "API Adsterra" : "Estimativa derivada do CPM e das impressões",
      currencyCode: String(report.currency_code ?? "USD")
    };
  });
}

async function personalAdRevenueReport(request: Request, payload: Payload) {
  const { user } = await requireUser(request, payload);
  const start = validReportDay(payload.reportStart);
  const end = validReportDay(payload.reportEnd);
  const daySpan = (new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) / 86400000;
  if (start > end || daySpan > 366) throw new Error("Escolha um período de até 367 dias.");
  const rows = await buildPersonalAdRevenueRows(user.id, start, end);
  return {
    ok: true,
    start,
    end,
    rows,
    note: "Estimativa proporcional às visitas qualificadas registradas por conta e dia. A Adsterra fornece dados agregados e não identifica receita por usuário ou link; este rateio não altera o saldo interno nem confirma pagamento."
  };
}

async function readRewardBalance(userId: string) {
  const { data, error } = await supabase.rpc("kutt_read_reward_balance", { p_user_id: userId });
  if (error) throw error;
  const row = data?.[0];
  if (!row) throw new Error("Não foi possível consultar o saldo registrado.");
  return { visitCount: Number(row.visit_count), earnedCents: Number(row.earned_cents), pendingVisits: Number(row.pending_visits) };
}

async function refreshRevenueRewards() {
  const { data: cached, error } = await supabase.from("kutt_reward_fx").select("usd_brl, quoted_at, updated_at").eq("id", true).maybeSingle();
  if (error) throw error;
  if (!cached || Date.now() - new Date(cached.updated_at).getTime() > 12 * 60 * 60 * 1000) {
    // Separate from the Adsterra importer: preserve its original amounts in USD.
    try {
      const response = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(5000) });
      const quote = await response.json();
      const rate = Number(quote?.rates?.BRL);
      const quotedAt = new Date(Number(quote?.time_last_update_unix) * 1000);
      if (!response.ok || quote?.result !== "success" || !(rate > 0) || !Number.isFinite(rate)
        || Number.isNaN(quotedAt.getTime()) || quotedAt.getTime() > Date.now() + 300000
        || Date.now() - quotedAt.getTime() > 48 * 60 * 60 * 1000) throw new Error("Cotação indisponível.");
      const { error: saveError } = await supabase.from("kutt_reward_fx").upsert({
        id: true, usd_brl: rate, quoted_at: quotedAt.toISOString(), updated_at: new Date().toISOString()
      });
      if (saveError) throw saveError;
    } catch {
      console.warn("reward_fx_refresh_unavailable");
    }
  }
  const { error: reconciliationError } = await supabase.rpc("kutt_reconcile_ad_rewards");
  if (reconciliationError) throw reconciliationError;
}

async function readRewardPolicy() {
  const { data: config, error } = await supabase.from("kutt_ad_configuration")
    .select("reward_model, reward_base_cents").eq("id", true).maybeSingle();
  if (error) throw error;
  const model = config?.reward_model ?? "adsterra_share";
  const capCents = Math.min(Number(config?.reward_base_cents ?? 7000), 7000);
  const end = saoPauloDay();
  const start = new Date(new Date(`${end}T00:00:00Z`).getTime() - 7 * 86400000).toISOString().slice(0, 10);
  const { data: days, error: dayError } = await supabase.from("kutt_reward_revenue_days")
    .select("report_date, qualified_visits, rate_per_thousand_cents, applied_at")
    .gte("report_date", start).lt("report_date", end).order("report_date", { ascending: true });
  if (dayError) throw dayError;
  const sampleVisits = (days ?? []).reduce((sum, day) => sum + Number(day.qualified_visits), 0);
  const rateNumerator = (days ?? []).reduce((sum, day) => sum
    + Math.min(capCents, Number(day.rate_per_thousand_cents)) * Number(day.qualified_visits), 0);
  return { model, publisherPercent: 70, administrationPercent: 30, capPerThousandCents: capCents,
    estimatedPerThousandCents: sampleVisits > 0 ? rateNumerator / sampleVisits : null,
    sampleVisits, sampleDays: days?.length ?? 0, sampleStart: days?.[0]?.report_date ?? null,
    sampleEnd: days?.length ? days[days.length - 1].report_date : null };
}

async function currentRewardBaseCents() {
  const { data, error } = await supabase.from("kutt_ad_configuration").select("reward_base_cents").eq("id", true).maybeSingle();
  if (error) throw error;
  return Number(data?.reward_base_cents ?? 7000);
}

async function createLink(request: Request, payload: Payload) {
  const token = String(payload.token || bearer(request));
  const guestSessionId = String(payload.guestSessionId ?? "");
  let ownerUserId: string | null = null;
  let guestSessionHash: string | null = null;
  let ipHash: string;
  if (token) {
    const { user } = await requireUser(request, payload);
    ownerUserId = user.id;
    ipHash = await rateLimit(request, `create:${user.id}`, 30, 60);
  } else {
    if (!/^(?:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|[0-9a-f]{64})$/i.test(guestSessionId)) {
      throw new Error("Não foi possível validar esta sessão do navegador. Atualize a página e tente de novo.");
    }
    if (clientIp(request) === "unknown") throw new Error("Não foi possível validar sua conexão. Tente novamente.");
    ipHash = await rateLimit(request, "guest-create-ip", 10, 60);
    await rateLimitIdentity("guest-create-session", guestSessionId, 10, 60);
    guestSessionHash = await hash(`urtador:guest:${guestSessionId}:${serviceRoleKey}`);
  }
  const targetUrl = normalizeUrl(payload.url);
  const slug = normalizeSlug(payload.slug);
  const title = String(payload.title ?? "").trim().slice(0, 120) || null;
  const { data, error } = await supabase.from("kutt_short_links")
    .insert({ slug, target_url: targetUrl, title, owner_user_id: ownerUserId, guest_session_hash: guestSessionHash, creator_ip_hash: ipHash })
    .select("slug, target_url").single();
  if (error?.code === "23505") throw new Error("Esse final já está em uso. Escolha outro.");
  if (error) throw error;
  return { slug: data.slug, url: data.target_url, shortUrl: `${publicBaseUrl}/${data.slug}` };
}

async function claimGuestLinks(request: Request, payload: Payload) {
  const { user } = await requireUser(request, payload);
  const guestSessionId = String(payload.guestSessionId ?? "");
  if (!/^(?:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|[0-9a-f]{64})$/i.test(guestSessionId)) {
    throw new Error("Sessão temporária inválida.");
  }
  const guestSessionHash = await hash(`urtador:guest:${guestSessionId}:${serviceRoleKey}`);
  const { data, error } = await supabase.from("kutt_short_links")
    .update({ owner_user_id: user.id, guest_session_hash: null })
    .is("owner_user_id", null).eq("guest_session_hash", guestSessionHash)
    .select("slug");
  if (error) throw error;
  return { ok: true, claimedCount: data?.length ?? 0 };
}

function looksAutomated(userAgent: string) {
  return /bot|crawler|spider|preview|facebookexternalhit|whatsapp|slack|discord|curl|wget|headless|phantom|monitor|uptime/i.test(userAgent);
}

async function resolveLink(request: Request, payload: Payload) {
  await rateLimit(request, "resolve", 120, 60);
  const slug = normalizeSlug(payload.slug);
  const { data, error } = await supabase.from("kutt_short_links").select("id, target_url, disabled_at, owner_user_id, creator_ip_hash")
    .eq("slug", slug).maybeSingle();
  if (error) throw error;
  if (!data || data.disabled_at) throw new Error("Link não encontrado.");
  const userAgent = request.headers.get("user-agent")?.slice(0, 500) ?? "";
  const ip = clientIp(request);
  const eligible = Boolean(data.owner_user_id) && !looksAutomated(userAgent) && ip !== "unknown" && (await hash(ip)) !== data.creator_ip_hash;
  // Only a human-confirmed destination open with a known, non-creator IP can affect clicks or rewards.
  // The database function commits the event, link counter, and reward together and enforces daily deduplication.
  if (eligible) {
    const visitorHash = await hash(ip);
    const visitDay = saoPauloDay();
    const { error: recordError } = await supabase.rpc("kutt_record_qualified_click", {
      row_id: data.id,
      visitor_ip_hash: visitorHash,
      event_user_agent: userAgent || null,
      event_referer: request.headers.get("referer")?.slice(0, 500) ?? null,
      qualified_visit_day: visitDay
    });
    if (recordError) throw recordError;
  }
  return { url: data.target_url };
}

async function setPix(request: Request, payload: Payload) {
  const { user } = await requireUser(request, payload);
  const pixKey = String(payload.pixKey ?? "").trim().slice(0, 120);
  if (pixKey.length < 5) throw new Error("Informe uma chave Pix válida.");
  const keyChanged = pixKey !== String(user.pix_key ?? "");
  const { error } = await supabase.from("kutt_users").update({
    pix_key: pixKey,
    ...(keyChanged ? { pix_key_confirmed_at: null } : {}),
    updated_at: new Date().toISOString()
  }).eq("id", user.id);
  if (error) throw error;
  if (keyChanged) {
    await supabase.from("kutt_pix_confirmation_challenges").update({ expires_at: new Date().toISOString() })
      .eq("user_id", user.id).is("confirmed_at", null);
  }
  return { ok: true, message: keyChanged ? "Chave Pix salva. Confirme-a pelo WhatsApp antes de fazer o próximo pedido." : "Chave Pix salva para solicitar saques." };
}

function maskPixKey(input: string) {
  const key = input.trim();
  if (key.includes("@")) {
    const [local, domain] = key.split("@", 2);
    return `${local.slice(0, 1)}•••@${domain}`;
  }
  const digits = key.replace(/\D/g, "");
  if (digits.length >= 8 && digits.length === key.replace(/[./-]/g, "").length) return `••••••${digits.slice(-4)}`;
  if (key.length <= 4) return "••••";
  return `${key.slice(0, 1)}${"•".repeat(Math.min(12, Math.max(3, key.length - 5)))}${key.slice(-4)}`;
}

async function requestPixConfirmation(request: Request, payload: Payload) {
  const { user } = await requireUser(request, payload);
  const pixKey = String(user.pix_key ?? "");
  if (!pixKey) throw new Error("Salve uma chave Pix antes de pedir a confirmação pelo WhatsApp.");
  if (user.pix_key_confirmed_at) return { ok: true, confirmed: true, message: "Esta chave Pix já está confirmada." };
  await rateLimitIdentity("pix-confirmation", user.phone, 3, 60);
  const code = String(Number.parseInt(bytesToHex(crypto.getRandomValues(new Uint8Array(4))).slice(0, 8), 16) % 1000000).padStart(6, "0");
  const challenge = {
    user_id: user.id,
    pix_key_hash: await hash(`${user.phone}:${pixKey}:${otpPepper}`),
    code_hash: await hash(`${user.phone}:${code}:${otpPepper}`),
    expires_at: new Date(Date.now() + 10 * 60000).toISOString()
  };
  await supabase.from("kutt_pix_confirmation_challenges").update({ expires_at: new Date().toISOString() })
    .eq("user_id", user.id).is("confirmed_at", null);
  const { data: inserted, error } = await supabase.from("kutt_pix_confirmation_challenges")
    .insert(challenge).select("id").single();
  if (error) throw error;
  const message = `🔐 *Confirmação da chave Pix · Urtador*\n\nChave salva: ${maskPixKey(pixKey)}\n\nPara confirmar que está correta, responda nesta conversa com:\n*CONFIRMAR PIX ${code}*\n\nO código vence em 10 minutos e pode ser usado uma vez. Nunca envie sua chave Pix completa no grupo.`;
  try {
    await sendWhatsApp(user.phone, message);
  } catch (error) {
    await supabase.from("kutt_pix_confirmation_challenges").delete().eq("id", inserted.id);
    throw error;
  }
  return { ok: true, sent: true, message: "Enviamos ao seu WhatsApp a chave mascarada e um código de 6 dígitos. Responda CONFIRMAR PIX seguido do código para concluir." };
}

async function handlePixConfirmationWebhook(request: Request, payload: Record<string, any>) {
  const suppliedSecret = bearer(request);
  if (!pixConfirmationWebhookSecret || !secureEqual(suppliedSecret, pixConfirmationWebhookSecret)) {
    return json(request, 401, { error: "Acesso não autorizado." });
  }
  if (payload.typeWebhook !== "incomingMessageReceived" || payload.messageData?.typeMessage !== "textMessage") {
    return json(request, 200, { ignored: true });
  }
  const senderData = payload.senderData ?? {};
  const chatId = String(senderData.chatId ?? senderData.chat_id ?? payload.chatId ?? "");
  const senderId = String(senderData.sender ?? senderData.senderId ?? "");
  if (!chatId.endsWith("@c.us") || (senderId.endsWith("@c.us") && senderId !== chatId)) {
    return json(request, 200, { ignored: true });
  }
  const rawMessage = String(payload.messageData?.textMessageData?.textMessage ?? payload.messageData?.extendedTextMessageData?.text ?? "").trim();
  const match = rawMessage.match(/^CONFIRMAR\s+PIX\s+(\d{6})$/i);
  if (!match) return json(request, 200, { ignored: true });
  const messageId = String(payload.idMessage ?? "");
  if (!/^[A-Za-z0-9_-]{5,160}$/.test(messageId)) return json(request, 200, { ignored: true });
  const phone = normalizePhone(chatId.slice(0, -5));
  const greenEndpoint = `${greenApiUrl}/waInstance${encodeURIComponent(greenApiInstance)}/getMessage/${encodeURIComponent(greenApiToken)}`;
  let verifiedMessage: Record<string, any>;
  try {
    const response = await fetch(greenEndpoint, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, idMessage: messageId }), signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) return json(request, 200, { ignored: true });
    verifiedMessage = await response.json();
  } catch {
    return json(request, 503, { error: "Não foi possível validar a mensagem do WhatsApp." });
  }
  const verifiedText = String(verifiedMessage.textMessage ?? "").trim();
  if (verifiedMessage.type !== "incoming" || verifiedMessage.idMessage !== messageId || verifiedMessage.chatId !== chatId ||
      (verifiedMessage.senderId && verifiedMessage.senderId !== chatId) || !secureEqual(verifiedText.toUpperCase(), rawMessage.toUpperCase())) {
    return json(request, 200, { ignored: true });
  }
  const { data: user, error: userError } = await supabase.from("kutt_users")
    .select("id, phone, pix_key, pix_key_confirmed_at").eq("phone", phone).maybeSingle();
  if (userError) throw userError;
  if (!user?.pix_key || user.pix_key_confirmed_at) return json(request, 200, { ignored: true });
  const { data: challenge, error: challengeError } = await supabase.from("kutt_pix_confirmation_challenges")
    .select("id, pix_key_hash, code_hash, attempts, created_at, expires_at")
    .eq("user_id", user.id).is("confirmed_at", null).gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (challengeError) throw challengeError;
  if (!challenge || Number(challenge.attempts) >= 5) {
    await sendWhatsApp(phone, "Não há confirmação Pix ativa para esse número. Peça um novo código no painel do Urtador.");
    return json(request, 200, { handled: true, confirmed: false });
  }
  const expectedCodeHash = await hash(`${phone}:${match[1]}:${otpPepper}`);
  const currentPixKeyHash = await hash(`${phone}:${user.pix_key}:${otpPepper}`);
  const challengeFresh = new Date(Number(verifiedMessage.timestamp) * 1000).getTime() >= new Date(challenge.created_at).getTime();
  if (!challengeFresh || !secureEqual(expectedCodeHash, challenge.code_hash) || !secureEqual(currentPixKeyHash, challenge.pix_key_hash)) {
    const attempts = Number(challenge.attempts) + 1;
    await supabase.from("kutt_pix_confirmation_challenges").update({
      attempts,
      ...(attempts >= 5 ? { expires_at: new Date().toISOString() } : {})
    }).eq("id", challenge.id).eq("attempts", challenge.attempts);
    await sendWhatsApp(phone, attempts >= 5
      ? "O código não foi confirmado após 5 tentativas. Peça outro pelo painel do Urtador."
      : "Código Pix incorreto ou expirado. Confira o último código enviado pelo painel.");
    return json(request, 200, { handled: true, confirmed: false });
  }
  const confirmedAt = new Date().toISOString();
  const { data: updatedUser, error: confirmError } = await supabase.from("kutt_users")
    .update({ pix_key_confirmed_at: confirmedAt, updated_at: confirmedAt })
    .eq("id", user.id).eq("pix_key", user.pix_key).is("pix_key_confirmed_at", null).select("id").maybeSingle();
  if (confirmError) throw confirmError;
  if (!updatedUser) return json(request, 200, { handled: true, confirmed: false });
  const { error: challengeUpdateError } = await supabase.from("kutt_pix_confirmation_challenges")
    .update({ confirmed_at: confirmedAt }).eq("id", challenge.id).is("confirmed_at", null);
  if (challengeUpdateError) throw challengeUpdateError;
  await sendWhatsApp(phone, `✅ Sua chave Pix ${maskPixKey(user.pix_key)} foi confirmada no Urtador. Ela está pronta para os próximos pedidos de saque pelo painel.`);
  return json(request, 200, { handled: true, confirmed: true });
}

async function logout(request: Request, payload: Payload) {
  const { session } = await requireUser(request, payload);
  const { error } = await supabase.from("kutt_sessions").update({ revoked_at: new Date().toISOString() }).eq("id", session.id);
  if (error) throw error;
  return { ok: true };
}

async function requestWithdrawal(request: Request, payload: Payload) {
  const { user } = await requireUser(request, payload);
  await refreshRevenueRewards();
  const amount = Math.round(Number(payload.amountCents));
  if (!Number.isSafeInteger(amount) || amount < 1000 || amount % 1000 !== 0) {
    throw new Error("Informe um valor a partir de R$ 10,00, em múltiplos de R$ 10,00.");
  }
  const { data, error } = await supabase.rpc("kutt_request_withdrawal", { p_user_id: user.id, p_amount_cents: amount });
  if (error) throw error;
  const withdrawal = Array.isArray(data) ? data[0] : data;
  if (!withdrawal?.id) throw new Error("A solicitação não retornou confirmação. Atualize o painel antes de tentar novamente.");
  const lastDigits = String(user.phone ?? "").replace(/\D/g, "").slice(-4) || "????";
  const notificationSent = await notifyCollaboratorGroup(`📥 Solicitação de saque recebida no Urtador\nConta final ${lastDigits} · ${formatMoney(Number(withdrawal.amount_cents))}\nStatus: aguardando conferência e pagamento manual.`);
  return { ok: true, amountCents: Number(withdrawal.amount_cents), notificationSent, message: `Solicitação de ${formatMoney(Number(withdrawal.amount_cents))} registrada. O administrador confere as visitas e faz o Pix manualmente.` };
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

function validReportDay(value: unknown) {
  const day = String(value ?? "");
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T00:00:00Z`) : new Date(Number.NaN);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) {
    throw new Error("Escolha um período válido para o relatório.");
  }
  return day;
}

function reportBucket(day: string, group: "day" | "week" | "month") {
  if (group === "day") return day;
  if (group === "month") return day.slice(0, 7);
  const date = new Date(`${day}T00:00:00Z`);
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - mondayOffset);
  return date.toISOString().slice(0, 10);
}

async function readRowsBetween(table: string, columns: string, orderBy: string, start: string, end: string) {
  const pageSize = 1000;
  const rows: Record<string, any>[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from(table).select(columns).gte(orderBy, start).lte(orderBy, end)
      .order(orderBy, { ascending: true }).range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) return rows;
  }
}

async function adminReport(payload: Payload) {
  await refreshRevenueRewards();
  const start = validReportDay(payload.reportStart);
  const end = validReportDay(payload.reportEnd);
  const group = payload.reportGroup ?? "day";
  if (start > end || (new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) > 366 * 86400000) {
    throw new Error("O período precisa estar em ordem e ter no máximo 367 dias.");
  }
  if (!["day", "week", "month"].includes(group)) throw new Error("Escolha o agrupamento diário, semanal ou mensal.");
  const endExclusive = new Date(`${end}T00:00:00Z`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  const endTimestamp = endExclusive.toISOString();
  const todayUtc = new Date(`${saoPauloDay()}T00:00:00.000Z`);
  const referenceEndDate = new Date(todayUtc.getTime() - 86400000);
  const referenceStartDate = new Date(referenceEndDate.getTime() - 6 * 86400000);
  const referenceStart = referenceStartDate.toISOString().slice(0, 10);
  const referenceEnd = referenceEndDate.toISOString().slice(0, 10);
  const [visits, paidWithdrawals, openWithdrawals, referenceVisits, allVisits, allWithdrawals] = await Promise.all([
    readRowsBetween("kutt_reward_visits", "owner_user_id, visit_day, payout_percent, reward_base_cents, user:kutt_users!kutt_reward_visits_owner_user_id_fkey(phone)", "visit_day", start, end),
    readRowsBetween("kutt_withdrawals", "user_id, amount_cents, status, processed_at, requested_at, user:kutt_users!kutt_withdrawals_user_id_fkey(phone)", "processed_at", `${start}T00:00:00.000Z`, endTimestamp),
    readRowsBetween("kutt_withdrawals", "user_id, amount_cents, status, processed_at, requested_at, user:kutt_users!kutt_withdrawals_user_id_fkey(phone)", "requested_at", `${start}T00:00:00.000Z`, endTimestamp),
    readRowsBetween("kutt_reward_visits", "payout_percent, reward_base_cents", "visit_day", referenceStart, referenceEnd),
    readAllRows("kutt_reward_visits", "payout_percent, reward_base_cents", "visit_day"),
    readAllRows("kutt_withdrawals", "amount_cents, status", "requested_at")
  ]);
  const grouped = new Map<string, { period: string; userId: string; phone: string; qualifiedVisits: number; estimatedAccrualCents: number; paidPixCents: number; openPixCents: number }>();
  const ensure = (period: string, userId: string, phone: string) => {
    const key = `${period}:${userId}`;
    if (!grouped.has(key)) grouped.set(key, { period, userId, phone, qualifiedVisits: 0, estimatedAccrualCents: 0, paidPixCents: 0, openPixCents: 0 });
    return grouped.get(key)!;
  };
  for (const visit of visits) {
    const user = Array.isArray(visit.user) ? visit.user[0] : visit.user;
    const row = ensure(reportBucket(String(visit.visit_day).slice(0, 10), group), visit.owner_user_id, String(user?.phone ?? "Conta"));
    row.qualifiedVisits++;
    row.estimatedAccrualCents += Math.round(Number(visit.payout_percent ?? 100) * 100) * Number(visit.reward_base_cents ?? 7000);
  }
  for (const withdrawal of paidWithdrawals) {
    if (withdrawal.status !== "paid" || !withdrawal.processed_at) continue;
    const day = new Date(withdrawal.processed_at).toISOString().slice(0, 10);
    if (day < start || day > end) continue;
    const user = Array.isArray(withdrawal.user) ? withdrawal.user[0] : withdrawal.user;
    ensure(reportBucket(day, group), withdrawal.user_id, String(user?.phone ?? "Conta")).paidPixCents += Number(withdrawal.amount_cents ?? 0);
  }
  for (const withdrawal of openWithdrawals) {
    if (withdrawal.status !== "pending" && withdrawal.status !== "approved") continue;
    const day = new Date(withdrawal.requested_at).toISOString().slice(0, 10);
    if (day < start || day > end) continue;
    const user = Array.isArray(withdrawal.user) ? withdrawal.user[0] : withdrawal.user;
    ensure(reportBucket(day, group), withdrawal.user_id, String(user?.phone ?? "Conta")).openPixCents += Number(withdrawal.amount_cents ?? 0);
  }
  const rows = [...grouped.values()].map((row) => ({ ...row, estimatedAccrualCents: Math.floor(row.estimatedAccrualCents / 10_000_000) }))
    .sort((a, b) => a.period.localeCompare(b.period) || a.phone.localeCompare(b.phone));
  const numeratorFor = (items: Record<string, any>[]) => items.reduce((sum, item) =>
    sum + Math.round(Number(item.payout_percent ?? 100) * 100) * Number(item.reward_base_cents ?? 7000), 0);
  const recentAccruedCents = numeratorFor(referenceVisits) / 10_000_000;
  const accruedToDateCents = Math.floor(numeratorFor(allVisits) / 10_000_000);
  const paidToDateCents = allWithdrawals.filter((item) => item.status === "paid")
    .reduce((sum, item) => sum + Number(item.amount_cents ?? 0), 0);
  const unpaidAccruedCents = Math.max(0, accruedToDateCents - paidToDateCents);
  const projectedSevenDaysCents = Math.round(recentAccruedCents);
  const projectedThirtyDaysCents = Math.round(recentAccruedCents * 30 / 7);
  return {
    start, end, group,
    totals: rows.reduce((total, row) => ({ qualifiedVisits: total.qualifiedVisits + row.qualifiedVisits,
      estimatedAccrualCents: total.estimatedAccrualCents + row.estimatedAccrualCents,
      paidPixCents: total.paidPixCents + row.paidPixCents, openPixCents: total.openPixCents + row.openPixCents }),
    { qualifiedVisits: 0, estimatedAccrualCents: 0, paidPixCents: 0, openPixCents: 0 }),
    rows,
    forecast: {
      referenceStart, referenceEnd,
      sampleVisitCount: referenceVisits.length,
      unpaidAccruedCents,
      newSevenDaysCents: projectedSevenDaysCents,
      newThirtyDaysCents: projectedThirtyDaysCents,
      reserveSevenDaysCents: unpaidAccruedCents + projectedSevenDaysCents,
      reserveThirtyDaysCents: unpaidAccruedCents + projectedThirtyDaysCents
    }
  };
}

function makeAdminSummary(users: Record<string, any>[], withdrawals: Record<string, any>[], links: Record<string, any>[], visits: Record<string, any>[]) {
  const visitsByDay = new Map<string, number>();
  for (const visit of visits) {
    const day = String(visit.visit_day).slice(0, 10);
    visitsByDay.set(day, (visitsByDay.get(day) ?? 0) + 1);
  }
  const pendingWithdrawals = withdrawals.filter((item) => item.status === "pending" || item.status === "approved");
  const today = new Date(`${saoPauloDay()}T00:00:00.000Z`);
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

async function sendUserAdRevenueNotifications(rows: Record<string, unknown>[], reportStart: string, reportEnd: string, notifySlot: "08" | "20") {
  const { data: preferences, error } = await supabase.from("kutt_ad_notification_preferences")
    .select("user_id, free_notice_sent_at, user:kutt_users!kutt_ad_notification_preferences_user_id_fkey(phone)")
    .eq("enabled", true);
  if (error) throw error;
  let sent = 0;
  let failed = 0;
  const serviceDay = saoPauloDay();
  for (const preference of preferences ?? []) {
    const user = Array.isArray(preference.user) ? preference.user[0] : preference.user;
    const phone = String(user?.phone ?? "");
    if (!phone) continue;
    const { data: delivery, error: deliveryError } = await supabase.from("kutt_ad_notification_deliveries")
      .insert({ user_id: preference.user_id, service_day: serviceDay, slot: notifySlot, status: "sending" })
      .select("id").maybeSingle();
    if (deliveryError) {
      if (deliveryError.code === "23505") continue;
      failed++;
      continue;
    }
    if (!delivery?.id) continue;
    try {
      const { data: stillEnabled, error: preferenceError } = await supabase.from("kutt_ad_notification_preferences")
        .select("enabled").eq("user_id", preference.user_id).maybeSingle();
      if (preferenceError) throw preferenceError;
      if (!stillEnabled?.enabled) {
        await supabase.from("kutt_ad_notification_deliveries").update({ status: "skipped" }).eq("id", delivery.id);
        continue;
      }
      const reportRows = await buildPersonalAdRevenueRows(String(preference.user_id), reportStart, reportEnd, rows);
      const recent = reportRows.slice(-3);
      const lines = recent.length
        ? recent.map((item) => `📅 ${item.reportDate} · participação ${Number(item.participationPercent).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}% · parcela estimada ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: item.currencyCode, minimumFractionDigits: 6, maximumFractionDigits: 10 }).format(Number(item.userRevenueEstimateUsd))}`)
        : ["Ainda não há relatório diário da Adsterra para os últimos dias."];
      const totalEstimate = recent.reduce((sum, item) => sum + Number(item.userRevenueEstimateUsd || 0), 0);
      const [rewardBalance, notificationBalance, bonusBalance, withdrawalResponse] = await Promise.all([
        readRewardBalance(String(preference.user_id)),
        readNotificationChargeBalance(String(preference.user_id)),
        readNotificationBonusBalance(String(preference.user_id)),
        supabase.from("kutt_withdrawals").select("amount_cents, status").eq("user_id", preference.user_id).neq("status", "rejected")
      ]);
      if (withdrawalResponse.error) throw withdrawalResponse.error;
      const firstFreeNotice = !preference.free_notice_sent_at;
      const alreadyChargedToday = notificationBalance.rows.some((charge) => charge.service_day === serviceDay);
      const todayFeeCents = firstFreeNotice || alreadyChargedToday ? 0 : 1;
      const netBalanceCents = rewardBalance.earnedCents - notificationBalance.totalCents + bonusBalance.totalCents - todayFeeCents;
      const reservedCents = (withdrawalResponse.data ?? []).reduce((sum, item) => sum + Number(item.amount_cents || 0), 0);
      const availableCents = netBalanceCents - reservedCents + (firstFreeNotice ? 1 : 0);
      const withdrawalPrompt = availableCents >= 7000
        ? `Quer solicitar um saque? Seu saldo líquido disponível após esta mensagem é ${formatMoney(availableCents)}. Abra ${publicBaseUrl} e escolha “Saque Pix”.`
        : `Saldo líquido disponível para saque após esta mensagem: ${formatMoney(Math.max(0, availableCents))}. O mínimo disponível é R$ 70,00; abaixo disso o painel bloqueia a solicitação. Quando atingir o mínimo, abra ${publicBaseUrl} > “Saque Pix”.`;
      const firstNoticeCopy = firstFreeNotice
        ? "🎁 Esta é sua primeira mensagem grátis. Adicionamos R$ 0,01 de bônus ao seu saldo e desligaremos os avisos automaticamente após o envio."
        : "🧾 Avisos: R$ 0,01 por dia em que pelo menos um aviso for enviado, cobrado no máximo uma vez no dia (mesmo com os avisos das 8h e 20h). O saldo líquido pode ficar negativo. Você pode desativar a qualquer momento no painel.";
      const message = `📊 *Urtador · seu resumo de anúncios (${notifySlot}h)*\n\n${lines.join("\n")}\n\n💰 *Estimativa rateada do período:* ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: recent.at(-1)?.currencyCode || "USD", minimumFractionDigits: 6, maximumFractionDigits: 10 }).format(totalEstimate)}\n\n💳 *${withdrawalPrompt}*\n\nℹ️ A rede informa valores agregados; a parcela é estimada pela participação das suas visitas qualificadas e não confirma pagamento.\n${firstNoticeCopy}`;
      await sendWhatsApp(phone, message);
      if (firstFreeNotice) {
        const { error: creditError } = await supabase.from("kutt_ad_notification_credits").upsert({
          user_id: preference.user_id,
          service_day: serviceDay,
          amount_cents: 1,
          reason: "first_free_notice_bonus",
          delivery_id: delivery.id
        }, { onConflict: "user_id,reason", ignoreDuplicates: true });
        if (creditError) throw creditError;
        const { error: disableError } = await supabase.from("kutt_ad_notification_preferences")
          .update({ enabled: false, free_notice_sent_at: new Date().toISOString(), disabled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("user_id", preference.user_id);
        if (disableError) throw disableError;
      } else {
        const { error: chargeError } = await supabase.from("kutt_ad_notification_charges").upsert({
          user_id: preference.user_id,
          service_day: serviceDay,
          amount_cents: 1,
          delivery_id: delivery.id
        }, { onConflict: "user_id,service_day", ignoreDuplicates: true });
        if (chargeError) throw chargeError;
      }
      const { error: markSentError } = await supabase.from("kutt_ad_notification_deliveries")
        .update({ status: "sent", sent_at: new Date().toISOString(), error_message: null }).eq("id", delivery.id);
      if (markSentError) throw markSentError;
      sent++;
    } catch (notificationError) {
      await supabase.from("kutt_ad_notification_deliveries")
        .update({ status: "failed", error_message: String(notificationError instanceof Error ? notificationError.message : "Erro ao enviar aviso").slice(0, 500) })
        .eq("id", delivery.id);
      failed++;
    }
  }
  return { sent, failed };
}

async function sendScheduledAdsterraReport(request: Request, announce = false, notifySlot?: "08" | "20") {
  const suppliedSecret = request.headers.get("x-kutt-report-secret") ?? "";
  if (!reportCronSecret || !secureEqual(suppliedSecret, reportCronSecret)) {
    return json(request, 401, { error: "Acesso não autorizado." });
  }
  if (notifySlot && notifySlot !== "08" && notifySlot !== "20") throw new Error("Horário de aviso inválido.");
  if (!adsterraApiToken) throw new Error("A chave da API Adsterra não está configurada.");
  const todayParts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  const today = `${todayParts.year}-${todayParts.month}-${todayParts.day}`;
  const endDate = new Date(`${today}T00:00:00Z`);
  const startDate = new Date(endDate.getTime() - 6 * 86400000);
  const start = startDate.toISOString().slice(0, 10);
  const statsUrl = new URL("https://api3.adsterratools.com/publisher/stats.json");
  statsUrl.searchParams.set("start_date", start);
  statsUrl.searchParams.set("finish_date", today);
  statsUrl.searchParams.set("group_by", "date");
  const statsResponse = await fetch(statsUrl, { headers: { Accept: "application/json", "X-API-Key": adsterraApiToken } });
  const statsData = await statsResponse.json().catch(() => null);
  if (!statsResponse.ok) throw new Error(`A API Adsterra respondeu com erro ${statsResponse.status}.`);
  const apiRows = Array.isArray(statsData) ? statsData : (statsData?.items ?? statsData?.data ?? statsData?.stats ?? statsData?.result ?? []);
  if (!Array.isArray(apiRows)) throw new Error("A API Adsterra devolveu um formato inesperado.");
  const rows = apiRows.map((entry: Record<string, unknown>) => {
    const fields = Object.fromEntries(Object.entries(entry).map(([key, value]) => [key.toLowerCase(), value]));
    const reportDate = validReportDay(fields.date ?? fields.day);
    const metric = (value: unknown, label: string) => {
      const parsed = Number(String(value ?? "0").replace(",", "."));
      if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`A API Adsterra retornou ${label} inválido.`);
      return parsed;
    };
    const impressions = Math.round(metric(fields.impressions ?? fields.impression, "impressões"));
    const clicks = Math.round(metric(fields.clicks, "cliques"));
    const ctr = metric(fields.ctr, "CTR");
    const cpm = metric(fields.cpm, "CPM");
    const revenue = metric(fields.revenue, "receita");
    if (reportDate < start || reportDate > today || ctr > 100) throw new Error("A API Adsterra retornou uma métrica fora do intervalo.");
    return { provider: "adsterra", report_date: reportDate, impressions, clicks, ctr, cpm, revenue_cents: Math.round(revenue * 100), revenue_amount: revenue, currency_code: "USD", source: "adsterra_api", updated_at: new Date().toISOString() };
  }).sort((left, right) => left.report_date.localeCompare(right.report_date));
  if (rows.length) {
    const { error } = await supabase.from("kutt_ad_revenue_reports").upsert(rows, { onConflict: "provider,report_date" });
    if (error) throw error;
  }
  await refreshRevenueRewards();
  const individualNotifications = notifySlot
    ? await sendUserAdRevenueNotifications(rows, start, today, notifySlot)
    : { sent: 0, failed: 0 };
  const activeRows = rows.filter((row) => row.impressions > 0 || row.clicks > 0);
  const dayLabel = (value: string) => {
    const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
    const shortDate = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
    return `${weekday.replace(".", "")} ${shortDate}`;
  };
  const decimal = (value: number, digits = 3) => value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: 6 });
  const lines = activeRows.length
    ? activeRows.map((row) => `📅 ${dayLabel(row.report_date)} · ${row.impressions} imp. · ${row.clicks} cliques · CTR ${decimal(row.ctr)}% · CPM US$ ${decimal(row.cpm)} / mil · receita US$ ${(row.revenue_cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
    : ["Ainda não há impressões ou cliques reportados nesse período."];
  const now = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date());
  const introduction = announce ? "✅ O painel agora traz CTR e CPM da API oficial, separados da receita. Este resumo semanal será enviado automaticamente todos os dias às 8h e às 20h (horário de Brasília).\n\n" : "";
  const message = `📊 *Urtador · Relatório Adsterra — últimos 7 dias*\n${introduction}🕒 Atualizado: ${now} (Brasília)\n${lines.join("\n")}\n\nCPM é a métrica por mil impressões. A receita é o valor informado separadamente pela API e pode ser ajustada pela rede.`;
  const notificationSent = await notifyCollaboratorGroup(message);
  if (!notificationSent) throw new Error("O relatório foi consultado, mas não foi possível enviá-lo à comunidade. Confira a integração Green API do Urtador.");
  return json(request, 200, { ok: true, imported: rows.length, notificationSent: true, individualNotifications });
}

async function readAdConfiguration() {
  const { data, error } = await supabase.from("kutt_ad_configuration")
    .select("adsense_enabled, adsense_title, adsterra_slots, reward_base_cents, reward_model").eq("id", true).maybeSingle();
  if (error) throw error;
  const slots = Array.isArray(data?.adsterra_slots) ? data.adsterra_slots : [];
  return {
    adsenseEnabled: Boolean(data?.adsense_enabled),
    adsenseTitle: String(data?.adsense_title ?? ""),
    rewardBaseCents: Number(data?.reward_base_cents ?? 7000),
    rewardModel: data?.reward_model ?? "adsterra_share",
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
  if (payload.action === "admin-ad-revenue-list") {
    const start = validReportDay(payload.reportStart);
    const end = validReportDay(payload.reportEnd);
    if (start > end || (new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) > 366 * 86400000) {
      throw new Error("O período precisa estar em ordem e ter no máximo 367 dias.");
    }
    const { data, error } = await supabase.from("kutt_ad_revenue_reports")
      .select("provider, report_date, impressions, clicks, ctr, cpm, revenue_cents, revenue_amount, currency_code, source, updated_at")
      .gte("report_date", start).lte("report_date", end).order("report_date", { ascending: false });
    if (error) throw error;
    return { ok: true, rows: data ?? [], start, end };
  }
  if (payload.action === "admin-ad-revenue-save") {
    const provider = payload.provider;
    const reportDate = validReportDay(payload.reportStart);
    const impressions = Number(payload.impressions);
    const clicks = Number(payload.clicks);
    const revenueCents = Number(payload.revenueCents);
    if (provider !== "adsense" && provider !== "adsterra") throw new Error("Selecione AdSense ou Adsterra.");
    if (![impressions, clicks, revenueCents].every((value) => Number.isSafeInteger(value) && value >= 0)) {
      throw new Error("Impressões, cliques e receita devem ser números inteiros iguais ou maiores que zero.");
    }
    if (impressions > 1_000_000_000_000 || clicks > 1_000_000_000_000 || revenueCents > 100_000_000_000) {
      throw new Error("Um dos valores ultrapassa o limite permitido.");
    }
    const { data, error } = await supabase.from("kutt_ad_revenue_reports").upsert({
      provider,
      report_date: reportDate,
      impressions,
      clicks,
      revenue_cents: revenueCents,
      revenue_amount: revenueCents / 100,
      currency_code: "BRL",
      source: "official_dashboard",
      updated_at: new Date().toISOString(),
      updated_by: user.id
    }, { onConflict: "provider,report_date" }).select("provider, report_date, impressions, clicks, revenue_cents, currency_code, updated_at").single();
    if (error) throw error;
    if (provider === "adsterra") await refreshRevenueRewards();
    return { ok: true, row: data, message: "Dados do relatório oficial salvos. Se já existia um registro do mesmo provedor e dia, ele foi atualizado." };
  }
  if (payload.action === "admin-ad-revenue-import-adsense-api") {
    const authCode = String(payload.adsenseAuthCode ?? "");
    const start = validReportDay(payload.reportStart);
    const end = validReportDay(payload.reportEnd);
    if (!adsenseOAuthClientId || !adsenseOAuthClientSecret) throw new Error("As credenciais OAuth do AdSense ainda não estão configuradas como secrets no Supabase.");
    if (!authCode || authCode.length > 4096) throw new Error("O Google não retornou um código de autorização válido.");
    if (start > end || (new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) > 366 * 86400000) throw new Error("Escolha um período de até 367 dias.");

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: authCode,
        client_id: adsenseOAuthClientId,
        client_secret: adsenseOAuthClientSecret,
        redirect_uri: "https://kuttenc.github.io",
        grant_type: "authorization_code"
      })
    });
    const tokenData = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !tokenData.access_token) throw new Error(tokenData.error_description || "O Google não aceitou o código OAuth. Confira a configuração do cliente e tente conectar novamente.");

    const accountsUrl = new URL("https://adsense.googleapis.com/v2/accounts");
    accountsUrl.searchParams.set("pageSize", "100");
    const accountsResponse = await fetch(accountsUrl, { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
    const accountsData = await accountsResponse.json().catch(() => ({}));
    if (!accountsResponse.ok) throw new Error(accountsData?.error?.message || "Falha ao consultar as contas do AdSense. Verifique se a AdSense Management API está ativada no Google Cloud.");
    const accountName = `accounts/${adsensePublisherId}`;
    const account = (accountsData.accounts || []).find((item: Record<string, unknown>) => item.name === accountName);
    if (!account) throw new Error(`A conta autorizada não contém o publisher ${adsensePublisherId}. Entre com a conta Google vinculada a esse AdSense.`);

    const reportUrl = new URL(`https://adsense.googleapis.com/v2/${accountName}/reports:generate`);
    reportUrl.searchParams.set("dateRange", "CUSTOM");
    for (const [key, value] of [["startDate.year", start.slice(0, 4)], ["startDate.month", String(Number(start.slice(5, 7)))], ["startDate.day", String(Number(start.slice(8, 10)))], ["endDate.year", end.slice(0, 4)], ["endDate.month", String(Number(end.slice(5, 7)))], ["endDate.day", String(Number(end.slice(8, 10)))]] as const) reportUrl.searchParams.set(key, value);
    reportUrl.searchParams.append("dimensions", "DATE");
    for (const metric of ["IMPRESSIONS", "CLICKS", "ESTIMATED_EARNINGS"]) reportUrl.searchParams.append("metrics", metric);
    reportUrl.searchParams.set("currencyCode", "BRL");
    reportUrl.searchParams.set("languageCode", "pt-BR");
    const reportResponse = await fetch(reportUrl, { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
    const report = await reportResponse.json().catch(() => ({}));
    if (!reportResponse.ok) throw new Error(report?.error?.message || "Falha ao buscar o relatório diário da API AdSense.");
    const headerNames = (report.headers || []).map((header: Record<string, unknown>) => String(header.name || "").toUpperCase());
    const indexFor = (name: string) => headerNames.indexOf(name);
    if (["DATE", "IMPRESSIONS", "CLICKS", "ESTIMATED_EARNINGS"].some((name) => indexFor(name) < 0)) throw new Error("A API AdSense retornou um formato inesperado; nada foi gravado.");
    const rows = (report.rows || []).map((line: Record<string, any>) => {
      const values = (line.cells || []).map((item: Record<string, unknown>) => item.value);
      const reportDate = validReportDay(values[indexFor("DATE")]);
      const impressions = Number(values[indexFor("IMPRESSIONS")]);
      const clicks = Number(values[indexFor("CLICKS")]);
      const earnings = Number(values[indexFor("ESTIMATED_EARNINGS")]);
      const revenueCents = Math.round(earnings * 100);
      if (![impressions, clicks, revenueCents].every((value) => Number.isSafeInteger(value) && value >= 0)) throw new Error("O relatório trouxe números inválidos; nada foi gravado.");
      return { provider: "adsense", report_date: reportDate, impressions, clicks, revenue_cents: revenueCents, revenue_amount: earnings, currency_code: "BRL", source: "adsense_api", updated_at: new Date().toISOString(), updated_by: user.id };
    });
    if (rows.length) {
      const { error } = await supabase.from("kutt_ad_revenue_reports").upsert(rows, { onConflict: "provider,report_date" });
      if (error) throw error;
    }
    return { ok: true, imported: rows.length, warnings: report.warnings || [], message: `${rows.length} dia(s) importado(s) diretamente da API oficial do AdSense.` };
  }
  if (payload.action === "admin-ad-revenue-import-adsterra-api") {
    const start = validReportDay(payload.reportStart);
    const end = validReportDay(payload.reportEnd);
    if (!adsterraApiToken) throw new Error("A chave da API Adsterra ainda não está configurada como secret no Supabase.");
    if (start > end || (new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) > 366 * 86400000) throw new Error("Escolha um período de até 367 dias.");
    const statsUrl = new URL("https://api3.adsterratools.com/publisher/stats.json");
    statsUrl.searchParams.set("start_date", start);
    statsUrl.searchParams.set("finish_date", end);
    statsUrl.searchParams.set("group_by", "date");
    const statsResponse = await fetch(statsUrl, { headers: { Accept: "application/json", "X-API-Key": adsterraApiToken } });
    const statsData = await statsResponse.json().catch(() => null);
    if (!statsResponse.ok) {
      const message = statsResponse.status === 401 ? "A Adsterra recusou a chave da API (401). Confira o token de publisher." : statsResponse.status === 403 ? "A chave Adsterra foi revogada ou expirou (403). Gere um token novo." : `A API Adsterra respondeu com erro ${statsResponse.status}.`;
      throw new Error(message);
    }
    const apiRows = Array.isArray(statsData) ? statsData : (statsData?.items ?? statsData?.data ?? statsData?.stats ?? statsData?.result ?? []);
    if (!Array.isArray(apiRows)) throw new Error("A API Adsterra devolveu um formato inesperado; nada foi gravado.");
    const rows = apiRows.map((entry: Record<string, unknown>) => {
      const fields = Object.fromEntries(Object.entries(entry).map(([key, value]) => [key.toLowerCase(), value]));
      const reportDate = validReportDay(fields.date ?? fields.day);
      const numberValue = (value: unknown, label: string) => {
        const result = Number(String(value ?? "0").replace(",", "."));
        if (!Number.isFinite(result) || result < 0) throw new Error(`A API Adsterra retornou ${label} inválido; nada foi gravado.`);
        return result;
      };
      const impressions = Math.round(numberValue(fields.impressions ?? fields.impression, "impressões"));
      const clicks = Math.round(numberValue(fields.clicks, "cliques"));
      const ctr = numberValue(fields.ctr, "CTR");
      const cpm = numberValue(fields.cpm, "CPM");
      const revenue = numberValue(fields.revenue, "receita");
      const revenueCents = Math.round(revenue * 100);
      if (reportDate < start || reportDate > end || ![impressions, clicks, revenueCents].every(Number.isSafeInteger) || ctr > 100) throw new Error("A API Adsterra retornou um dia ou valor fora do intervalo; nada foi gravado.");
      return { provider: "adsterra", report_date: reportDate, impressions, clicks, ctr, cpm, revenue_cents: revenueCents, revenue_amount: revenue, currency_code: "USD", source: "adsterra_api", updated_at: new Date().toISOString(), updated_by: user.id };
    });
    if (rows.length) {
      const { error } = await supabase.from("kutt_ad_revenue_reports").upsert(rows, { onConflict: "provider,report_date" });
      if (error) throw error;
    }
    await refreshRevenueRewards();
    return { ok: true, imported: rows.length, message: `${rows.length} dia(s) importado(s) diretamente da API Adsterra. Receita mantida em USD, moeda do relatório.` };
  }
  if (payload.action === "admin-test-withdrawal-notice") {
    const person = payload.testPerson;
    const amountCents = Number(payload.amountCents);
    if (person !== "mateus" && person !== "fabio") throw new Error("Selecione uma conta de teste válida.");
    if (amountCents !== 1000 && amountCents !== 7000) throw new Error("Selecione um dos valores de teste disponíveis.");
    const personLabel = person === "mateus" ? "Mateus · conta de exemplo final 9929" : "Fabio · conta de exemplo final 6164";
    const message = `🧪✨ *TESTE DO SISTEMA DE SAQUES* ✨🧪\n_Urtador · aviso para a comunidade_\n\n👤 *Conta de exemplo:* ${personLabel}\n💰 *Valor ilustrativo:* ${formatMoney(amountCents)}\n\n✅ Este teste verifica apenas o envio de avisos.\n🚫 Nenhum saque foi solicitado.\n💸 Nenhum Pix foi enviado ou confirmado.\n📊 Nenhum saldo foi alterado.`;
    const notificationSent = await notifyCollaboratorGroup(message);
    if (!notificationSent) throw new Error("O aviso de teste não foi enviado. Confira a integração Green API e o ID da comunidade.");
    return { ok: true, notificationSent, message: "Aviso de teste enviado à comunidade. Nenhum dado financeiro foi alterado." };
  }
  if (payload.action === "admin-list") {
    const [users, withdrawals, links, visits, adConfiguration] = await Promise.all([
      readAllRows("kutt_users", "id, phone, role, pix_key, payout_percent, created_at", "created_at"),
      readAllRows("kutt_withdrawals", "id, user_id, amount_cents, pix_key, status, requested_at, processed_at, admin_note, user:kutt_users!kutt_withdrawals_user_id_fkey(phone)", "requested_at"),
      readAllRows("kutt_short_links", "id, slug, target_url, title, qualified_click_count, created_at, owner_user_id, user:kutt_users!kutt_short_links_owner_user_id_fkey(phone)", "created_at"),
      readAllRows("kutt_reward_visits", "owner_user_id, visit_day", "visit_day"),
      readAdConfiguration()
    ]);
    return { users, withdrawals, links, adConfiguration, summary: makeAdminSummary(users, withdrawals, links, visits) };
  }
  if (payload.action === "admin-report") return await adminReport(payload);
  if (payload.action === "admin-set-user-payout") {
    if ((await readAdConfiguration()).rewardModel === "adsterra_share") {
      throw new Error("A regra é igual para todos: 70% da receita Adsterra rateada pelas visitas, com teto de R$ 70 por mil. Percentuais individuais antigos não se aplicam a novas visitas.");
    }
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
    if (!Number.isInteger(rewardBaseCents) || rewardBaseCents < 0 || rewardBaseCents > 7000) throw new Error("O teto deve ficar entre R$ 0,00 e R$ 70,00 por mil visitas qualificadas.");
    const previousRewardBaseCents = await currentRewardBaseCents();
    const { error } = await supabase.from("kutt_ad_configuration").upsert({
      id: true,
      reward_base_cents: rewardBaseCents,
      updated_at: new Date().toISOString(),
      updated_by: user.id
    }, { onConflict: "id" });
    if (error) throw error;
    const formatMoney = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
    const notificationSent = await notifyCollaboratorGroup(`📊 Teto de ganhos atualizado no Urtador\nAntes: ${formatMoney(previousRewardBaseCents)} por mil visitas qualificadas.\nAgora: até ${formatMoney(rewardBaseCents)} por mil visitas qualificadas.\nO repasse é limitado a 70% da receita Adsterra, dividido pelas visitas qualificadas. O teto novo vale para visitas futuras; saldos anteriores são preservados.`);
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
    const fabioBanners = slots.filter((slot) => slot?.owner === "owner").length;
    const mateusBanners = slots.filter((slot) => slot?.owner === "mateus").length;
    const bannerLabel = (count: number) => `${count} ${count === 1 ? "banner" : "banners"}`;
    const notified = slots.length || payload.adsenseEnabled
      ? await notifyCollaboratorGroup(`✅ Anúncios atualizados\nFabio: ${bannerLabel(fabioBanners)}\nMatheus: ${bannerLabel(mateusBanners)}\nPágina: Guia`)
      : false;
    return { ok: true, notificationSent: notified, adConfiguration: { adsenseEnabled: payload.adsenseEnabled, adsenseTitle, rewardBaseCents: await currentRewardBaseCents(), slots } };
  }
  if (payload.action === "admin-withdrawal") {
    const status = payload.status;
    if (!payload.withdrawalId || !["approved", "paid", "rejected"].includes(status ?? "")) throw new Error("Ação de saque inválida.");
    const { data: current, error: readError } = await supabase.from("kutt_withdrawals")
      .select("id, status, amount_cents, pix_key, user:kutt_users!kutt_withdrawals_user_id_fkey(phone)")
      .eq("id", payload.withdrawalId).maybeSingle();
    if (readError) throw readError;
    if (!current) throw new Error("Solicitação não encontrada.");
    const transitions: Record<string, string[]> = { pending: ["approved", "paid", "rejected"], approved: ["paid", "rejected"] };
    if (!transitions[current.status]?.includes(status!)) throw new Error("Transição de status inválida para esta solicitação.");
    const { data: updated, error } = await supabase.from("kutt_withdrawals").update({ status, admin_note: String(payload.note ?? "").slice(0, 500), processed_at: new Date().toISOString(), processed_by: user.id }).eq("id", payload.withdrawalId).eq("status", current.status).select("id").maybeSingle();
    if (error) throw error;
    if (!updated) throw new Error("A solicitação mudou em outra sessão. Atualize o painel.");
    let notificationSent = false;
    if (status === "paid") {
      const user = Array.isArray(current.user) ? current.user[0] : current.user;
      const lastDigits = String(user?.phone ?? "").replace(/\D/g, "").slice(-4) || "????";
      notificationSent = await notifyCollaboratorGroup(`✅ Repasse Pix confirmado no Urtador\nConta final ${lastDigits} · ${formatMoney(Number(current.amount_cents))}\nPagamento conferido e marcado manualmente por administrador.`);
    }
    return { ok: true, notificationSent, message: status === "paid" ? "Pagamento marcado como realizado." : "Solicitação atualizada." };
  }
  throw new Error("Ação administrativa inválida.");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, 405, { error: "Método não permitido." });
  if (!supabaseUrl || !serviceRoleKey || !otpPepper) return json(request, 500, { error: "Backend sem configuração completa." });
  try {
    const payload = await request.json() as Payload;
    if (request.headers.get("x-kutt-hook-action") === "pix-confirmation") {
      return await handlePixConfirmationWebhook(request, payload as Record<string, any>);
    }
    if (payload.action === "scheduled-adsterra-report") return await sendScheduledAdsterraReport(request, payload.announce === true, payload.notifySlot);
    switch (payload.action) {
      case "request-otp": return json(request, 200, await requestOtp(request, payload));
      case "request-password-recovery": return json(request, 200, await requestPasswordRecovery(request, payload));
      case "verify-otp": return json(request, 200, await verifyOtp(request, payload));
      case "login-password": return json(request, 200, await loginWithPassword(request, payload));
      case "set-password": return json(request, 200, await setPassword(request, payload));
      case "me": return json(request, 200, await profile(request, payload));
      case "request-pix-confirmation": return json(request, 200, await requestPixConfirmation(request, payload));
      case "my-ad-revenue-report": return json(request, 200, await personalAdRevenueReport(request, payload));
      case "set-ad-revenue-notifications": return json(request, 200, await setAdRevenueNotificationPreference(request, payload));
      case "create": return json(request, 200, await createLink(request, payload));
      case "claim-guest-links": return json(request, 200, await claimGuestLinks(request, payload));
      case "resolve": return json(request, 200, await resolveLink(request, payload));
      case "save-pix": return json(request, 200, await setPix(request, payload));
      case "withdraw": return json(request, 200, await requestWithdrawal(request, payload));
      case "logout": return json(request, 200, await logout(request, payload));
      case "public-ad-configuration": return json(request, 200, await publicAdConfiguration());
      case "admin-list":
      case "admin-report":
      case "admin-withdrawal":
      case "admin-test-withdrawal-notice":
      case "admin-ad-revenue-list":
      case "admin-ad-revenue-save":
      case "admin-ad-revenue-import-adsense-api":
      case "admin-ad-revenue-import-adsterra-api":
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
