(function () {
  const config = window.URTADOR_CONFIG || {};
  const apiBase = `${String(config.supabaseUrl || "").replace(/\/$/, "")}/functions/v1/${config.functionName || "kutt-short-links"}`;
  const storage = window.localStorage || window.sessionStorage;
  const state = {
    token: storage.getItem("urtador-token") || "",
    phone: storage.getItem("urtador-phone") || "",
    passwordSetupRequired: storage.getItem("urtador-password-setup") === "1",
    passwordRecovery: storage.getItem("urtador-password-recovery") === "1",
    resumingDraft: false,
    guestClaimedToken: "",
    adminReportRows: [],
    adminUsers: [],
    adminLinks: [],
    adminAdRevenueRows: [],
    adminReport: null,
    rewardBaseCents: 7000,
    user: null,
    data: null,
    activeDashboardPage: ""
  };
  const adRevenueCurrencyStorageKey = "urtador-ad-revenue-display-currency";
  const adRevenueFxStorageKey = "urtador-usd-brl-rate";
  const savedFx = (() => {
    try { return JSON.parse(storage.getItem(adRevenueFxStorageKey) || "null"); } catch { return null; }
  })();
  state.adRevenueDisplayCurrency = storage.getItem(adRevenueCurrencyStorageKey) === "USD" ? "USD" : "BRL";
  state.usdBrlRate = Number(savedFx?.rate) > 0 ? Number(savedFx.rate) : 0;
  state.usdBrlUpdatedAt = savedFx?.updatedAt || "";
  state.usdBrlFetchedAt = Number(savedFx?.fetchedAt) || 0;
  const starterAdsterraBanner = {
    title: "Adsterra Beta 300x250",
    owner: "owner",
    script: `<script>\n  atOptions = {\n    'key' : '02033b78716daab542298321e0a8d3a6',\n    'format' : 'iframe',\n    'height' : 250,\n    'width' : 300,\n    'params' : {}\n  };\n</script>\n<script src="https://bauval.org/22/02033b78716daab542298321e0a8d3a6"></script>`
  };
  const el = (id) => document.getElementById(id);
  let adsenseTokenClient = null;
  const adsenseOAuthStorageKey = "urtador-adsense-oauth-client-id";
  const adsenseOAuthClientId = () => String(storage.getItem(adsenseOAuthStorageKey) || config.adsenseOAuthClientId || "").trim();
  if (el("adsense-publisher-label")) el("adsense-publisher-label").textContent = `ca-${String(config.adsensePublisherId || "").replace(/^pub-/, "")}`;

  function guestSessionId() {
    let id = storage.getItem("urtador-guest-session");
    if (!id) {
      id = crypto.randomUUID();
      storage.setItem("urtador-guest-session", id);
    }
    return id;
  }

  function say(node, text, error = false) {
    if (!node) return;
    node.textContent = text || "";
    node.classList.toggle("error", Boolean(error));
  }

  async function api(action, body = {}) {
    const headers = { "Content-Type": "application/json" };
    if (config.publishableKey) headers.apikey = config.publishableKey;
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    let response;
    try {
      response = await fetch(apiBase, { method: "POST", headers, body: JSON.stringify({ action, ...body, ...(state.token ? { token: state.token } : {}) }) });
    } catch {
      throw new Error("O serviço de links ainda não está conectado. A função do Supabase precisa ser publicada.");
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) {
      if (response.status === 404 || data.code === "NOT_FOUND") throw new Error("O serviço de links ainda não foi publicado no Supabase.");
      throw new Error(data.error || `Falha na solicitação (${response.status}).`);
    }
    return data;
  }

  function money(cents, currency = "BRL") {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format((Number(cents) || 0) / 100);
  }

  function date(value) {
    return value ? new Date(value).toLocaleDateString("pt-BR") : "—";
  }

  function dateOnly(value) {
    const [year, month, day] = String(value || "").split("-").map(Number);
    return year && month && day ? new Date(year, month - 1, day).toLocaleDateString("pt-BR") : "—";
  }

  function localDateInputValue(value) {
    const dateValue = value instanceof Date ? value : new Date(value);
    const year = dateValue.getFullYear();
    const month = String(dateValue.getMonth() + 1).padStart(2, "0");
    const day = String(dateValue.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function convertAdRevenueCents(cents, sourceCurrency, targetCurrency) {
    const value = Number(cents) || 0;
    if (sourceCurrency === targetCurrency) return value;
    if (!(state.usdBrlRate > 0)) return value;
    if (sourceCurrency === "USD" && targetCurrency === "BRL") return Math.round(value * state.usdBrlRate);
    if (sourceCurrency === "BRL" && targetCurrency === "USD") return Math.round(value / state.usdBrlRate);
    return value;
  }

  function renderAdRevenueFxStatus(message = "") {
    const status = el("ad-revenue-fx-status");
    if (!status) return;
    if (state.usdBrlRate > 0) {
      const updated = state.usdBrlUpdatedAt ? new Date(state.usdBrlUpdatedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }) : "data não informada";
      status.textContent = `US$ 1 = ${money(Math.round(state.usdBrlRate * 100), "BRL")} · cotação publicada em ${updated}. ExchangeRate-API · atualização diária. ${message}`.trim();
    } else {
      status.textContent = message || "Cotação indisponível; os relatórios continuam na moeda original.";
    }
  }

  async function loadUsdBrlRate(force = false) {
    if (!force && state.usdBrlRate > 0 && Date.now() - state.usdBrlFetchedAt < 12 * 60 * 60 * 1000) {
      renderAdminAdRevenue();
      renderAdRevenueFxStatus();
      return;
    }
    const button = el("refresh-ad-revenue-fx");
    if (button) button.disabled = true;
    renderAdRevenueFxStatus("Consultando a cotação mais recente disponível…");
    try {
      const response = await fetch("https://open.er-api.com/v6/latest/USD", { cache: "no-store" });
      if (!response.ok) throw new Error(`Falha HTTP ${response.status}`);
      const data = await response.json();
      const rate = Number(data?.rates?.BRL);
      if (data?.result !== "success" || !(rate > 0)) throw new Error("Resposta de câmbio inválida");
      state.usdBrlRate = rate;
      state.usdBrlUpdatedAt = data.time_last_update_utc || new Date().toISOString();
      state.usdBrlFetchedAt = Date.now();
      storage.setItem(adRevenueFxStorageKey, JSON.stringify({ rate, updatedAt: state.usdBrlUpdatedAt, fetchedAt: state.usdBrlFetchedAt }));
      renderAdminAdRevenue();
      renderAdRevenueFxStatus();
    } catch {
      renderAdRevenueFxStatus(state.usdBrlRate > 0 ? "Não foi possível atualizar agora; usando a cotação salva neste navegador." : "Não foi possível obter o câmbio. Valores exibidos na moeda original.");
    } finally {
      if (button) button.disabled = false;
    }
  }

  function renderAdminAdRevenue() {
    const rows = state.adminAdRevenueRows || [];
    const targetCurrency = state.adRevenueDisplayCurrency || "BRL";
    for (const provider of ["adsense", "adsterra"]) {
      const providerRows = rows.filter((row) => row.provider === provider);
      const totals = providerRows.reduce((sum, row) => ({
        impressions: sum.impressions + Number(row.impressions || 0),
        clicks: sum.clicks + Number(row.clicks || 0)
      }), { impressions: 0, clicks: 0 });
      const revenueByCurrency = new Map();
      for (const row of providerRows) {
        const originalCurrency = row.currency_code || "BRL";
        const currency = state.usdBrlRate > 0 ? targetCurrency : originalCurrency;
        const amount = state.usdBrlRate > 0 ? convertAdRevenueCents(row.revenue_cents, originalCurrency, targetCurrency) : Number(row.revenue_cents || 0);
        revenueByCurrency.set(currency, (revenueByCurrency.get(currency) || 0) + amount);
      }
      const prefix = provider === "adsense" ? "adsense" : "adsterra";
      el(`${prefix}-revenue-traffic`).textContent = `${totals.impressions.toLocaleString("pt-BR")} / ${totals.clicks.toLocaleString("pt-BR")}`;
      const currencies = [...revenueByCurrency.entries()].sort(([a], [b]) => a.localeCompare(b));
      el(`${prefix}-revenue-total`).textContent = currencies.length ? currencies.map(([currency, cents]) => money(cents, currency)).join(" · ") : money(0, state.usdBrlRate > 0 ? targetCurrency : provider === "adsense" ? "BRL" : "USD");
    }
    const body = el("admin-ad-revenue-body");
    body.replaceChildren();
    for (const item of rows) {
      const row = document.createElement("tr");
      cell(row, dateOnly(item.report_date));
      cell(row, item.provider === "adsense" ? "Google AdSense" : "Adsterra");
      cell(row, Number(item.impressions || 0).toLocaleString("pt-BR"));
      cell(row, Number(item.clicks || 0).toLocaleString("pt-BR"));
      const ctr = item.ctr === null || item.ctr === undefined ? "—" : `${Number(item.ctr).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}%`;
      const cpm = item.cpm === null || item.cpm === undefined ? "—" : `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 6 }).format(Number(item.cpm))} ${item.currency_code || "USD"} / 1.000`;
      cell(row, ctr);
      cell(row, cpm);
      const originalCurrency = item.currency_code || "BRL";
      const displayCurrency = state.usdBrlRate > 0 ? targetCurrency : originalCurrency;
      const displayCents = state.usdBrlRate > 0 ? convertAdRevenueCents(item.revenue_cents, originalCurrency, targetCurrency) : Number(item.revenue_cents || 0);
      cell(row, money(displayCents, displayCurrency));
      cell(row, item.source === "adsense_api" ? "API oficial do AdSense" : item.source === "adsterra_api" ? "API oficial Adsterra" : "Informado no painel");
      body.append(row);
    }
  }

  function requestAdSenseAuthorizationCode() {
    return new Promise((resolve, reject) => {
      const clientId = adsenseOAuthClientId();
      if (!clientId) {
        reject(new Error("Informe primeiro o ID público do cliente OAuth Web criado no Google Cloud e salve a configuração."));
        return;
      }
      if (!window.google?.accounts?.oauth2) {
        reject(new Error("A biblioteca de autorização do Google ainda não carregou. Recarregue a página e tente novamente."));
        return;
      }
      adsenseTokenClient = window.google.accounts.oauth2.initCodeClient({
        client_id: clientId,
        scope: "https://www.googleapis.com/auth/adsense.readonly",
        ux_mode: "popup",
        select_account: true,
        callback: (response) => response?.code ? resolve(response.code) : reject(new Error(response?.error_description || response?.error || "A autorização do Google não foi concluída.")),
        error_callback: (error) => reject(new Error(error?.type === "popup_closed" ? "A janela de autorização do Google foi fechada." : "Não foi possível abrir a autorização do Google."))
      });
      adsenseTokenClient.requestCode();
    });
  }

  async function loadAdminAdRevenue() {
    const start = el("ad-revenue-start")?.value;
    const end = el("ad-revenue-end")?.value;
    if (!start || !end) return;
    say(el("admin-ad-revenue-message"), "Consultando os relatórios salvos…");
    try {
      const report = await api("admin-ad-revenue-list", { reportStart: start, reportEnd: end });
      state.adminAdRevenueRows = report.rows || [];
      renderAdminAdRevenue();
      say(el("admin-ad-revenue-message"), `${state.adminAdRevenueRows.length} registro(s) no período ${dateOnly(start)} a ${dateOnly(end)}.`);
    } catch (error) {
      say(el("admin-ad-revenue-message"), error.message, true);
    }
  }

  function renderAdminLinks() {
    const linksBody = el("admin-links-body");
    if (!linksBody) return;
    const links = state.adminLinks || [];
    const period = el("links-period-filter")?.value || "all";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let start = "";
    let end = "";
    if (period === "today") start = end = localDateInputValue(today);
    if (period === "yesterday") {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      start = end = localDateInputValue(yesterday);
    }
    if (period === "week") {
      const monday = new Date(today);
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
      start = localDateInputValue(monday);
      end = localDateInputValue(today);
    }
    if (period === "month") {
      start = localDateInputValue(new Date(today.getFullYear(), today.getMonth(), 1));
      end = localDateInputValue(today);
    }
    if (period === "month-pick") {
      const monthValue = el("links-month-filter")?.value || "";
      if (monthValue) {
        const [year, month] = monthValue.split("-").map(Number);
        start = `${monthValue}-01`;
        end = localDateInputValue(new Date(year, month, 0));
      }
    }
    if (period === "range") {
      start = el("links-date-start")?.value || "";
      end = el("links-date-end")?.value || "";
    }
    const digitsQuery = String(el("links-phone-filter")?.value || "").replace(/\D/g, "");
    const filtered = links.filter((item) => {
      const createdDay = item.created_at ? localDateInputValue(item.created_at) : "";
      if (start && (!createdDay || createdDay < start)) return false;
      if (end && (!createdDay || createdDay > end)) return false;
      const user = Array.isArray(item.user) ? item.user[0] : item.user;
      const phone = String(user?.phone || "").replace(/\D/g, "");
      return !digitsQuery || phone.includes(digitsQuery);
    });
    linksBody.replaceChildren();
    for (const item of filtered) {
      const row = document.createElement("tr");
      const user = Array.isArray(item.user) ? item.user[0] : item.user;
      cell(row, user?.phone || "legado");
      const shortCell = document.createElement("td"); shortCell.append(safeLink(`${config.defaultDomain}/${item.slug}`, item.slug)); row.append(shortCell);
      const targetCell = document.createElement("td"); targetCell.append(safeLink(item.target_url, item.target_url)); row.append(targetCell);
      cell(row, Number(item.qualified_click_count || 0).toLocaleString("pt-BR"));
      cell(row, date(item.created_at));
      linksBody.append(row);
    }
    const count = el("admin-links-filter-count");
    if (count) count.textContent = `Exibindo ${filtered.length} de ${links.length} links.`;
    const rangeError = period === "range" && start && end && start > end;
    const message = el("admin-links-filter-message");
    if (message) say(message, rangeError ? "A data inicial precisa ser anterior ou igual à data final." : "");
  }

  function cell(row, value, tag = "td") {
    const node = document.createElement(tag);
    node.textContent = value ?? "—";
    row.appendChild(node);
    return node;
  }

  function safeLink(value, label = value) {
    const a = document.createElement("a");
    a.href = value;
    a.textContent = label;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    return a;
  }

  function parseAdPreview(source) {
    const text = String(source || "");
    const key = text.match(/['"]key['"]\s*:\s*['"]([a-f0-9]{32})['"]/i)?.[1]?.toLowerCase();
    const width = Number(text.match(/['"]width['"]\s*:\s*(\d{2,4})/i)?.[1]);
    const height = Number(text.match(/['"]height['"]\s*:\s*(\d{2,4})/i)?.[1]);
    const sourceUrl = text.match(/<script\b[^>]*\bsrc\s*=\s*['"](https:\/\/[^'"]+)['"]/i)?.[1];
    if (!key || !sourceUrl || !Number.isInteger(width) || !Number.isInteger(height) || width < 120 || width > 728 || height < 50 || height > 600) {
      throw new Error("Cole o código completo do banner gerado no painel Publisher.");
    }
    const parsed = new URL(sourceUrl);
    const host = parsed.hostname.toLowerCase();
    const validPath = host === "bauval.org"
      ? parsed.pathname.toLowerCase() === `/22/${key}`
      : new Set(["www.highperformanceformat.com", "highperformanceformat.com"]).has(host) && parsed.pathname.toLowerCase() === `/${key}/invoke.js`;
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash || !validPath) {
      throw new Error("Este código usa um endereço de script não permitido. Cole o snippet oficial validado pelo painel.");
    }
    return { key, width, height, host, scriptPath: parsed.pathname };
  }

  function showAdPreview(index) {
    const preview = document.querySelector(`[data-banner-preview-frame="${index}"]`);
    if (!preview) return;
    try {
      const banner = parseAdPreview(el(`banner-code-${index}`).value);
      const mock = document.createElement("div");
      mock.className = "banner-preview-mock";
      mock.setAttribute("role", "img");
      mock.setAttribute("aria-label", `Espaço de anúncio ${banner.width} por ${banner.height} pixels`);
      mock.style.aspectRatio = `${banner.width} / ${banner.height}`;
      mock.style.width = `min(100%, ${Math.min(banner.width, 560)}px)`;
      const title = document.createElement("strong");
      title.textContent = el(`banner-title-${index}`).value.trim() || `Banner ${index}`;
      const size = document.createElement("span");
      size.textContent = `${banner.width} × ${banner.height} px`;
      mock.replaceChildren(title, size);
      const note = document.createElement("p");
      note.className = "field-help";
      note.textContent = "Prévia do espaço e dimensões. O script não é executado aqui, evitando gerar uma impressão de teste.";
      preview.replaceChildren(note, mock);
    } catch (error) {
      const message = document.createElement("p");
      message.className = "message error";
      message.textContent = error.message;
      preview.replaceChildren(message);
    }
  }

  function setLoggedIn(on) {
    el("auth-view").hidden = on;
    el("dashboard-view").hidden = !on;
    el("auth-intro").hidden = on;
    document.body.classList.toggle("dashboard-mode", on);
    document.querySelectorAll('.site-nav a[href="#auth-view"]').forEach((link) => { link.hidden = on; });
  }

  function showDashboardPage(name) {
    if (name === "admin" && state.user?.role !== "admin") name = "overview";
    document.querySelectorAll("[data-dashboard-area]").forEach((page) => {
      page.hidden = page.dataset.dashboardArea !== name;
    });
    document.querySelectorAll("[data-dashboard-page]").forEach((button) => {
      if (button.dataset.dashboardPage === name) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    state.activeDashboardPage = name;
  }

  function showAuth(mode) {
    el("password-login-form").hidden = mode !== "password";
    el("first-access-button").hidden = mode !== "password";
    el("forgot-password-button").hidden = mode !== "password";
    el("password-recovery-form").hidden = mode !== "recovery";
    el("otp-form").hidden = mode !== "otp";
    el("set-password-form").hidden = mode !== "set-password";
  }

  function showExistingCodeIfRateLimited(error) {
    if (!/limite de c[oó]digos/i.test(String(error?.message || ""))) return false;
    showAuth("otp");
    say(el("auth-message"), `${error.message} Se você já recebeu um código nos últimos 10 minutos, digite o mais recente; se não, aguarde antes de pedir outro.`, true);
    el("otp").focus();
    return true;
  }

  async function refreshDashboard() {
    let data = await api("me");
    if (state.guestClaimedToken !== state.token) {
      try {
        const claim = await api("claim-guest-links", { guestSessionId: guestSessionId() });
        state.guestClaimedToken = state.token;
        storage.setItem("urtador-guest-session", crypto.randomUUID());
        if (claim.claimedCount > 0) data = await api("me");
      } catch {
        // O painel continua acessível; uma próxima atualização tentará anexar os links novamente.
      }
    }
    state.data = data;
    state.user = data.user;
    setLoggedIn(true);
    el("admin-nav-item").hidden = data.user.role !== "admin";
    el("sidebar-phone").textContent = data.user.phone;
    el("settings-phone").textContent = data.user.phone;
    el("settings-role").textContent = data.user.role === "admin" ? "Administrador" : "Usuário";
    showDashboardPage(state.activeDashboardPage || "overview");
    el("welcome-title").textContent = `Olá, ${data.user.phone}`;
    el("session-expiry").textContent = `Sua sessão expira às ${new Date(data.expiresAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`;
    el("eligible-count").textContent = Number(data.eligibleVisits || 0).toLocaleString("pt-BR");
    el("earned-balance").textContent = money(data.earnedCents);
    el("available-balance").textContent = money(data.availableCents);
    el("earnings-visits").textContent = Number(data.eligibleVisits || 0).toLocaleString("pt-BR");
    el("earnings-total").textContent = money(data.earnedCents);
    el("earnings-available").textContent = money(data.availableCents);
    const maxWithdrawal = Math.floor(Number(data.availableCents || 0) / 1000) * 10;
    const withdrawalAmount = el("withdrawal-amount");
    if (maxWithdrawal >= 10) {
      withdrawalAmount.max = String(maxWithdrawal);
      if (Number(withdrawalAmount.value) > maxWithdrawal) withdrawalAmount.value = String(maxWithdrawal);
    } else {
      withdrawalAmount.removeAttribute("max");
    }
    el("withdraw-button").disabled = Number(data.earnedCents || 0) < 7000 || maxWithdrawal < 10;
    const payoutPercent = Number(data.user.payoutPercent ?? 100);
    const rewardBaseCents = Number(data.rewardBaseCents ?? 7000);
    el("earnings-rate").textContent = `Seu repasse está em ${payoutPercent.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% do valor-base: ${money(Math.round(rewardBaseCents * payoutPercent / 100))} por mil visitas qualificadas futuras.`;
    el("pix-key").value = data.user.pixKey || "";
    const linksBody = el("links-body");
    linksBody.replaceChildren();
    const earningsLinksBody = el("earnings-links-body");
    earningsLinksBody.replaceChildren();
    const userLinks = data.links || [];
    if (userLinks.length === 0) {
      for (const body of [linksBody, earningsLinksBody]) {
        const emptyRow = document.createElement("tr");
        const emptyCell = document.createElement("td"); emptyCell.colSpan = 4; emptyCell.textContent = "Você ainda não criou links nesta conta."; emptyRow.append(emptyCell); body.append(emptyRow);
      }
    }
    for (const link of userLinks) {
      const row = document.createElement("tr");
      cell(row, link.title || link.slug);
      const linkCell = document.createElement("td"); linkCell.append(safeLink(`${config.defaultDomain}/${link.slug}`, `${config.defaultDomain}/${link.slug}`)); row.append(linkCell);
      cell(row, Number(link.qualified_click_count || 0).toLocaleString("pt-BR"));
      cell(row, date(link.created_at));
      linksBody.append(row);

      const earningsRow = document.createElement("tr");
      cell(earningsRow, link.title || link.slug);
      const earningsLinkCell = document.createElement("td"); earningsLinkCell.append(safeLink(`${config.defaultDomain}/${link.slug}`, `${config.defaultDomain}/${link.slug}`)); earningsRow.append(earningsLinkCell);
      cell(earningsRow, Number(link.qualified_click_count || 0).toLocaleString("pt-BR"));
      cell(earningsRow, date(link.created_at));
      earningsLinksBody.append(earningsRow);
    }
    const withdrawalsBody = el("withdrawals-body");
    withdrawalsBody.replaceChildren();
    for (const item of data.withdrawals || []) {
      const row = document.createElement("tr");
      cell(row, date(item.requested_at)); cell(row, money(item.amount_cents)); cell(row, item.status === "pending" ? "Aguardando conferência" : item.status === "approved" ? "Aprovado para pagamento" : item.status === "paid" ? "Pago" : "Recusado");
      withdrawalsBody.append(row);
    }
    if (data.user.role === "admin") await refreshAdmin();
    resumePendingLink();
  }

  function resumePendingLink() {
    const raw = storage.getItem("urtador-pending-link");
    if (!raw || state.resumingDraft) return;
    try {
      const draft = JSON.parse(raw);
      if (!draft.url || typeof draft.url !== "string" || Date.now() - Number(draft.savedAt || 0) > 7 * 24 * 60 * 60 * 1000) {
        storage.removeItem("urtador-pending-link");
        return;
      }
      el("url").value = draft.url;
      el("slug").value = draft.slug || "";
      el("title").value = draft.title || "";
      state.resumingDraft = true;
      say(el("link-message"), "Retomando o link que você guardou…");
      el("shortener-form").requestSubmit();
    } catch {
      storage.removeItem("urtador-pending-link");
    }
  }

  async function refreshAdmin() {
    say(el("admin-load-message"), "Consultando os dados administrativos…");
    let data;
    try {
      data = await api("admin-list");
    } catch (error) {
      say(el("admin-load-message"), `Não foi possível carregar os dados: ${error.message}. Confira a conexão e tente Atualizar.`, true);
      return;
    }
    const summary = data.summary || {};
    state.adminUsers = data.users || [];
    state.adminLinks = data.links || [];
    state.rewardBaseCents = Number(data.adConfiguration?.rewardBaseCents ?? 7000);
    el("admin-user-count").textContent = Number(summary.userCount || 0).toLocaleString("pt-BR");
    el("admin-link-count").textContent = Number(summary.linkCount || 0).toLocaleString("pt-BR");
    el("admin-qualified-visits").textContent = Number(summary.qualifiedVisits || 0).toLocaleString("pt-BR");
    el("admin-pending-pix").textContent = `${money(summary.pendingPayoutCents)} (${Number(summary.pendingPayoutCount || 0).toLocaleString("pt-BR")})`;
    el("admin-paid-pix").textContent = money(summary.paidCents);
    const dailyBody = el("admin-daily-body"); dailyBody.replaceChildren();
    for (const item of summary.dailyActivity || []) {
      const row = document.createElement("tr");
      cell(row, dateOnly(item.day));
      cell(row, Number(item.qualifiedVisits || 0).toLocaleString("pt-BR"));
      cell(row, `${Number(item.withdrawalRequests || 0).toLocaleString("pt-BR")} · ${money(item.requestedCents)}`);
      cell(row, money(item.openCents)); cell(row, money(item.paidCents));
      dailyBody.append(row);
    }
    const withdrawalsBody = el("admin-withdrawals-body"); withdrawalsBody.replaceChildren();
    const pendingWithdrawalCount = (data.withdrawals || []).filter((item) => item.status === "pending" || item.status === "approved").length;
    el("admin-withdrawals-section").open = pendingWithdrawalCount > 0;
    for (const item of data.withdrawals || []) {
      const row = document.createElement("tr");
      const user = Array.isArray(item.user) ? item.user[0] : item.user;
      cell(row, user?.phone || "—");
      const pixCell = cell(row, item.pix_key);
      if (item.pix_key) {
        const copyPix = document.createElement("button"); copyPix.className = "button small secondary"; copyPix.type = "button"; copyPix.textContent = "Copiar chave";
        copyPix.addEventListener("click", async () => {
          try { await navigator.clipboard.writeText(item.pix_key); say(el("admin-load-message"), `Chave Pix do telefone final ${String(user?.phone || "").slice(-4)} copiada.`); }
          catch { say(el("admin-load-message"), "Não foi possível copiar a chave Pix neste navegador.", true); }
        });
        pixCell.append(document.createTextNode(" "), copyPix);
      }
      cell(row, money(item.amount_cents)); cell(row, item.status === "pending" ? "Solicitado · aguardando pagamento" : item.status === "approved" ? "Aprovado · aguardando Pix" : item.status === "paid" ? "Pago" : "Recusado");
      const actions = document.createElement("td");
      if (item.status === "pending" || item.status === "approved") {
        const action = document.createElement("button"); action.className = "button small"; action.type = "button";
        action.textContent = "Eu enviei o Pix";
        action.addEventListener("click", async () => {
          if (!window.confirm(`Confirma que o Pix de ${money(item.amount_cents)} foi realmente enviado para a chave ${item.pix_key}? Isso marcará o pedido como pago e avisará a comunidade.`)) return;
          try {
            const result = await api("admin-withdrawal", { withdrawalId: item.id, status: "paid" });
            await refreshDashboard();
            say(el("admin-load-message"), result.notificationSent ? "Pix registrado como pago. Aviso enviado à comunidade." : "Pix registrado como pago, mas o aviso à comunidade não foi enviado.", !result.notificationSent);
          } catch (error) { say(el("admin-load-message"), error.message, true); }
        });
        const reject = document.createElement("button"); reject.className = "button small secondary"; reject.type = "button"; reject.textContent = "Recusar";
        reject.addEventListener("click", async () => { await api("admin-withdrawal", { withdrawalId: item.id, status: "rejected", note: "Recusado pelo administrador" }); await refreshDashboard(); });
        actions.append(action, reject);
      } else actions.textContent = "—";
      row.append(actions); withdrawalsBody.append(row);
    }
    const adConfiguration = data.adConfiguration || { adsenseEnabled: false, rewardBaseCents: 7000, slots: [] };
    const rewardBaseCents = Number(adConfiguration.rewardBaseCents ?? 7000);
    const usersBody = el("admin-users-body"); usersBody.replaceChildren();
    for (const item of data.users || []) {
      const row = document.createElement("tr");
      const accountCell = document.createElement("td"); accountCell.className = "admin-user-account";
      const phone = document.createElement("strong"); phone.textContent = item.phone || "Telefone não informado";
      const details = document.createElement("small"); details.className = "admin-user-details";
      details.textContent = `${item.role === "admin" ? "Administrador" : "Colaborador"} · Cadastro ${date(item.created_at)} · Pix: ${item.pix_key || "não cadastrada"}`;
      accountCell.append(phone, details); row.append(accountCell);
      const rateCell = document.createElement("td"); rateCell.className = "admin-user-rate-cell";
      const rateControl = document.createElement("div"); rateControl.className = "admin-user-rate-control";
      const rateInput = document.createElement("input");
      rateInput.className = "rate-input"; rateInput.type = "number"; rateInput.min = "0"; rateInput.max = "100"; rateInput.step = "0.01";
      rateInput.value = String(Number(item.payout_percent ?? 100)); rateInput.setAttribute("aria-label", `Percentual do valor-base para ${item.phone}`);
      const rateSuffix = document.createElement("span"); rateSuffix.textContent = "%";
      rateControl.append(rateInput, rateSuffix);
      const estimatedRate = document.createElement("small"); estimatedRate.className = "admin-user-estimate";
      const updateEstimate = () => { estimatedRate.textContent = `${money(Math.round(rewardBaseCents * (Number(rateInput.value) || 0) / 100))} por 1.000 visitas`; };
      rateInput.addEventListener("input", updateEstimate); updateEstimate();
      rateCell.append(rateControl, estimatedRate); row.append(rateCell);
      const actionCell = document.createElement("td");
      actionCell.className = "admin-user-action";
      const saveRate = document.createElement("button"); saveRate.className = "button small"; saveRate.type = "button"; saveRate.textContent = "Salvar taxa";
      saveRate.addEventListener("click", async () => {
        saveRate.disabled = true;
        try {
          const result = await api("admin-set-user-payout", { userId: item.id, payoutPercent: Number(rateInput.value) });
          const percent = Number(result.payoutPercent ?? rateInput.value);
          const perThousand = money(Number(result.ratePerThousandCents ?? Math.round(Number(result.rewardBaseCents ?? 7000) * percent / 100)));
          await refreshAdmin();
          say(el("admin-load-message"), result.unchanged
            ? `A taxa de ${item.phone} já era ${percent}%; nenhuma mudança ou mensagem enviada.`
            : `Taxa de ${item.phone} salva em ${percent}% (${perThousand} por mil visitas futuras). ${result.notificationSent ? "Aviso enviado à comunidade do WhatsApp." : "Não foi possível enviar o aviso ao grupo."}`,
            !result.unchanged && !result.notificationSent);
        } catch (error) { say(el("admin-load-message"), error.message, true); }
        finally { saveRate.disabled = false; }
      });
      actionCell.append(saveRate); row.append(actionCell); usersBody.append(row);
    }
    renderAdminLinks();
    el("reward-base-value").value = (Number(adConfiguration.rewardBaseCents ?? 7000) / 100).toFixed(2);
    el("adsense-primary").checked = Boolean(adConfiguration.adsenseEnabled);
    el("adsense-title").value = adConfiguration.adsenseTitle || "";
    const savedSlots = Array.isArray(adConfiguration.slots) ? adConfiguration.slots : [];
    const slotsForForm = savedSlots.length ? savedSlots : [starterAdsterraBanner];
    const ownerCounts = { owner: 0, mateus: 0, missing: 0 };
    for (let index = 0; index < 6; index++) {
      const slot = slotsForForm[index];
      el(`banner-title-${index + 1}`).value = slot?.title || "";
      el(`banner-code-${index + 1}`).value = slot?.script || "";
      const owner = slot?.owner || "";
      el(`banner-owner-${index + 1}`).value = owner;
      if (savedSlots[index]) {
        const savedOwner = savedSlots[index].owner || "";
        ownerCounts[savedOwner === "owner" || savedOwner === "mateus" ? savedOwner : "missing"]++;
      }
    }
    el("ad-owner-summary").textContent = `Titularidade dos anúncios salvos: Fabio ${ownerCounts.owner}; Matheus ${ownerCounts.mateus}; sem titular ${ownerCounts.missing}. Esta identificação organiza os códigos, não mede o faturamento.`;
    say(el("ad-config-message"), savedSlots.length ? "" : "O banner Adsterra Beta do Fabio está preenchido como rascunho. Clique em Salvar anúncios para ativá-lo.");
    say(el("admin-load-message"), "Dados atualizados. Contas vazias aparecem com zero; o traço indica que a leitura ainda não foi concluída.");
    await loadAdminAdRevenue();
  }

  function renderAdminReport(report) {
    state.adminReport = report;
    const totals = report.totals || {};
    el("admin-report-totals").hidden = false;
    el("report-visits").textContent = Number(totals.qualifiedVisits || 0).toLocaleString("pt-BR");
    el("report-estimated").textContent = money(totals.estimatedAccrualCents);
    el("report-paid").textContent = money(totals.paidPixCents);
    el("report-open").textContent = money(totals.openPixCents);
    const forecast = report.forecast || {};
    el("admin-forecast-heading").hidden = false;
    el("admin-forecast-note").hidden = false;
    el("admin-forecast-totals").hidden = false;
    el("forecast-unpaid").textContent = money(forecast.unpaidAccruedCents);
    el("forecast-week").textContent = money(forecast.reserveSevenDaysCents);
    el("forecast-month").textContent = money(forecast.reserveThirtyDaysCents);
    const basis = Number(forecast.sampleVisitCount || 0) === 0
      ? "Não houve visitas qualificadas nos últimos sete dias completos; a previsão de novos repasses fica em zero até haver histórico."
      : `Base: média dos sete dias completos de ${dateOnly(forecast.referenceStart)} a ${dateOnly(forecast.referenceEnd)}.`;
    el("admin-forecast-note").textContent = `${basis} A reserva potencial soma essa projeção ao saldo de repasses estimado e ainda não marcado como pago. É uma estimativa de planejamento, não um valor de saque confirmado.`;
    state.adminReportRows = report.rows || [];
    renderFilteredAdminReport();
  }

  function renderFilteredAdminReport() {
    const query = String(el("report-person-filter")?.value || "").trim().toLocaleLowerCase("pt-BR").replace(/\s/g, "");
    const usersByPhone = new Map(state.adminUsers.map((user) => [String(user.phone || "").replace(/\D/g, ""), user]));
    const rows = state.adminReportRows.filter((item) => {
      if (!query) return true;
      const phone = String(item.phone || "").replace(/\D/g, "");
      const pix = String(usersByPhone.get(phone)?.pix_key || "").toLocaleLowerCase("pt-BR").replace(/\s/g, "");
      const digitsOnlyQuery = query.replace(/\D/g, "");
      return (digitsOnlyQuery && phone.includes(digitsOnlyQuery)) || pix.includes(query);
    });
    const body = el("admin-report-body"); body.replaceChildren();
    for (const item of rows) {
      const row = document.createElement("tr");
      cell(row, item.period); cell(row, item.phone);
      cell(row, Number(item.qualifiedVisits || 0).toLocaleString("pt-BR"));
      cell(row, money(item.estimatedAccrualCents));
      cell(row, money(item.paidPixCents)); cell(row, money(item.openPixCents));
      body.append(row);
    }
    const filteredTotals = rows.reduce((total, row) => ({
      visits: total.visits + Number(row.qualifiedVisits || 0),
      estimated: total.estimated + Number(row.estimatedAccrualCents || 0),
      paid: total.paid + Number(row.paidPixCents || 0),
      open: total.open + Number(row.openPixCents || 0)
    }), { visits: 0, estimated: 0, paid: 0, open: 0 });
    el("report-visits").textContent = filteredTotals.visits.toLocaleString("pt-BR");
    el("report-estimated").textContent = money(filteredTotals.estimated);
    el("report-paid").textContent = money(filteredTotals.paid);
    el("report-open").textContent = money(filteredTotals.open);
    el("export-admin-report").disabled = rows.length === 0;
    el("print-admin-report").disabled = rows.length === 0;
    const accruedByUser = new Map();
    rows.forEach((row) => accruedByUser.set(row.phone, (accruedByUser.get(row.phone) || 0) + Number(row.estimatedAccrualCents || 0)));
    const eligibleUsers = [...accruedByUser].filter(([, cents]) => cents > 7000);
    const eligibleSelect = el("report-eligible-person");
    const previousSelection = eligibleSelect.value;
    eligibleSelect.replaceChildren(new Option("Selecione uma pessoa", ""));
    for (const [phone, cents] of eligibleUsers) {
      const option = new Option(`${phone} · ${money(cents)}`, phone);
      eligibleSelect.append(option);
    }
    if (eligibleUsers.some(([phone]) => phone === previousSelection)) eligibleSelect.value = previousSelection;
    eligibleSelect.disabled = eligibleUsers.length === 0;
    el("print-eligible-reports").disabled = eligibleUsers.length === 0 || !eligibleSelect.value;
    return rows;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>\"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]);
  }

  function printRevenuePdf(title, subtitle, reportRows, simulation = false) {
    const grouped = new Map();
    for (const row of reportRows) {
      const key = simulation ? "Mateus · teste" : String(row.phone || "Conta");
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(row);
    }
    const watermark = simulation ? '<div class="stamp">SIMULAÇÃO · NÃO PAGÁVEL · NÃO ALTERA O SALDO</div>' : "";
    const statements = [...grouped.entries()].map(([person, rows]) => {
      const total = rows.reduce((sum, row) => ({ visits: sum.visits + Number(row.qualifiedVisits || 0), accrued: sum.accrued + Number(row.estimatedAccrualCents || 0), paid: sum.paid + Number(row.paidPixCents || 0), open: sum.open + Number(row.openPixCents || 0) }), { visits: 0, accrued: 0, paid: 0, open: 0 });
      const personPhone = String(rows[0]?.phone || "").replace(/\D/g, "");
      const pixKey = state.adminUsers.find((user) => String(user.phone || "").replace(/\D/g, "") === personPhone)?.pix_key || "Não cadastrada";
      const tableRows = rows.map((row) => `<tr><td>${escapeHtml(row.period)}</td><td>${Number(row.qualifiedVisits || 0).toLocaleString("pt-BR")}</td><td>${money(row.estimatedAccrualCents)}</td><td>${money(row.paidPixCents)}</td><td>${money(row.openPixCents)}</td></tr>`).join("");
      return `<section class="statement"><h2>${escapeHtml(person)}</h2><p>Chave Pix cadastrada: ${escapeHtml(pixKey)}</p><div class="summary"><div>Visitas qualificadas<b>${total.visits.toLocaleString("pt-BR")}</b></div><div>Repasse estimado<b>${money(total.accrued)}</b></div><div>Pix pagos<b>${money(total.paid)}</b></div><div>Em aberto<b>${money(total.open)}</b></div></div><p><b>Faixa interna de conferência de R$ 70:</b> ${total.accrued > 7000 ? "atingida (estimativa acima de R$ 70)" : "não atingida"}.</p><table><thead><tr><th>Período</th><th>Visitas qualificadas</th><th>Estimativa</th><th>Pix pagos</th><th>Em aberto</th></tr></thead><tbody>${tableRows}</tbody></table></section>`;
    }).join("");
    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) { say(el("admin-report-message"), "O navegador bloqueou a janela do PDF. Permita pop-ups para este site e tente novamente.", true); return; }
    printWindow.document.write(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font:14px Arial,sans-serif;color:#15251e;margin:36px}h1{color:#08785a;margin-bottom:6px}p{line-height:1.5}.summary{display:flex;gap:12px;margin:22px 0}.summary div{border:1px solid #ccd9d1;border-radius:8px;padding:12px;flex:1}.summary b{display:block;margin-top:8px;font-size:18px}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{text-align:left;padding:9px;border-bottom:1px solid #dce5df;overflow-wrap:anywhere}th{background:#edf5f0}.stamp{border:3px solid #b42318;color:#b42318;font-weight:bold;text-align:center;padding:12px;margin:16px 0;font-size:18px}.foot{margin-top:26px;color:#52645a;font-size:12px}.statement{page-break-after:always}.statement:last-of-type{page-break-after:auto}@media print{button{display:none}}</style><body>${watermark}<h1>Urtador · Relatório de repasses</h1><p>${escapeHtml(subtitle)}</p>${statements}<p class="foot">Documento de controle interno do Urtador. “Visitas qualificadas” são aberturas de destino registradas pelo serviço. Repasse estimado não é receita real de Adsterra/AdSense nem comprovante bancário. ${simulation ? "Dados simulados para validar a exportação; não são elegíveis a pagamento." : "Conferir com o histórico de pagamentos antes de efetuar qualquer repasse."}</p><button onclick="window.print()">Imprimir / salvar como PDF</button><script>window.onload=()=>window.print()</script></body></html>`);
    printWindow.document.close();
  }

  el("password-login-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const phone = el("login-phone").value.trim();
    const password = el("login-password").value;
    state.phone = phone; storage.setItem("urtador-phone", phone);
    say(el("auth-message"), "Conferindo seus dados…");
    try {
      const result = await api("login-password", { phone, password });
      if (result.otpRequired) {
        showAuth("otp");
        say(el("auth-message"), "Senha confirmada. Digite também o código enviado pelo WhatsApp.");
        return;
      }
      state.token = result.token; state.user = result.user;
      state.passwordSetupRequired = false;
      state.passwordRecovery = false;
      storage.setItem("urtador-token", result.token);
      storage.removeItem("urtador-password-setup");
      storage.removeItem("urtador-password-recovery");
      await refreshDashboard();
      say(el("auth-message"), "Acesso confirmado.");
    } catch (error) { if (!showExistingCodeIfRateLimited(error)) say(el("auth-message"), error.message, true); }
  });

  el("first-access-button")?.addEventListener("click", async () => {
    const phoneInput = el("login-phone");
    if (!phoneInput.reportValidity()) return;
    const phone = phoneInput.value.trim();
    state.phone = phone; storage.setItem("urtador-phone", phone);
    say(el("auth-message"), "Enviando código…");
    try {
      await api("request-otp", { phone });
      showAuth("otp");
      say(el("auth-message"), "Código enviado pelo WhatsApp. Digite os 6 números recebidos.");
    } catch (error) { if (!showExistingCodeIfRateLimited(error)) say(el("auth-message"), error.message, true); }
  });

  el("forgot-password-button")?.addEventListener("click", () => {
    el("recovery-phone").value = el("login-phone").value.trim();
    showAuth("recovery");
    say(el("auth-message"), "");
    el("recovery-phone").focus();
  });

  el("recovery-back")?.addEventListener("click", () => {
    showAuth("password");
    say(el("auth-message"), "");
  });

  el("password-recovery-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const phone = el("recovery-phone").value.trim();
    state.phone = phone;
    storage.setItem("urtador-phone", phone);
    say(el("auth-message"), "Solicitando o código de recuperação…");
    try {
      const result = await api("request-password-recovery", { phone });
      showAuth("otp");
      say(el("auth-message"), `${result.message} Se você já pediu um código há pouco, use o mais recente.`);
      el("otp").focus();
    } catch (error) {
      if (!showExistingCodeIfRateLimited(error)) say(el("auth-message"), error.message, true);
    }
  });

  el("otp-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    say(el("auth-message"), "Validando…");
    try {
      const result = await api("verify-otp", { phone: state.phone, code: el("otp").value });
      state.token = result.token; state.user = result.user;
      storage.setItem("urtador-token", result.token);
      if (result.passwordSetupRequired) {
        state.passwordSetupRequired = true;
        state.passwordRecovery = false;
        storage.setItem("urtador-password-setup", "1");
        storage.removeItem("urtador-password-recovery");
        showAuth("set-password");
        el("password-form-help").textContent = "WhatsApp confirmado. Crie sua senha para concluir o primeiro acesso.";
        say(el("auth-message"), "WhatsApp confirmado. Crie sua senha abaixo para concluir o primeiro acesso.");
        el("new-password").focus();
        return;
      }
      if (result.passwordRecoveryRequired) {
        state.passwordRecovery = true;
        storage.setItem("urtador-password-recovery", "1");
        showAuth("set-password");
        el("password-form-help").textContent = "WhatsApp confirmado. Escolha uma nova senha para recuperar o acesso.";
        say(el("auth-message"), "Código confirmado. Defina sua nova senha abaixo.");
        el("new-password").focus();
        return;
      }
      state.passwordSetupRequired = false;
      state.passwordRecovery = false;
      storage.removeItem("urtador-password-setup");
      storage.removeItem("urtador-password-recovery");
      await refreshDashboard();
      say(el("auth-message"), "Acesso confirmado.");
    } catch (error) { say(el("auth-message"), error.message, true); }
  });

  el("set-password-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = el("new-password").value;
    if (password !== el("confirm-password").value) {
      say(el("auth-message"), "As senhas não coincidem.", true);
      el("confirm-password").focus();
      return;
    }
    if (password.length < 10 || password.length > 128) {
      say(el("auth-message"), "A senha precisa ter de 10 a 128 caracteres.", true);
      el("new-password").focus();
      return;
    }
    say(el("auth-message"), "Salvando sua senha…");
    try {
      const result = await api("set-password", { password });
      state.passwordSetupRequired = false;
      state.passwordRecovery = false;
      storage.removeItem("urtador-password-setup");
      storage.removeItem("urtador-password-recovery");
      await refreshDashboard();
      say(el("auth-message"), result.message);
    } catch (error) { say(el("auth-message"), error.message, true); }
  });

  el("change-phone")?.addEventListener("click", () => { state.passwordRecovery = false; storage.removeItem("urtador-password-recovery"); showAuth("password"); el("otp").value = ""; el("login-password").value = ""; say(el("auth-message"), ""); });
  document.querySelectorAll("[data-logout]").forEach((button) => button.addEventListener("click", async () => {
    try { await api("logout"); } catch { /* The local session is still discarded if the network is unavailable. */ }
    state.token = ""; state.passwordSetupRequired = false; state.passwordRecovery = false; storage.removeItem("urtador-token"); storage.removeItem("urtador-phone"); storage.removeItem("urtador-password-setup"); storage.removeItem("urtador-password-recovery");
    state.user = null; state.activeDashboardPage = "";
    setLoggedIn(false); showAuth("password"); el("login-password").value = ""; say(el("auth-message"), "Você saiu da sua conta.");
  }));

  document.querySelectorAll("[data-dashboard-page]").forEach((button) => button.addEventListener("click", () => {
    showDashboardPage(button.dataset.dashboardPage);
  }));

  el("shortener-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const resumedDraft = state.resumingDraft;
    state.resumingDraft = false;
    const button = event.currentTarget.querySelector("button[type='submit']");
    button.disabled = true; say(el("link-message"), "Criando seu link…"); el("short-link-result").hidden = true;
    try {
      const result = await api("create", { url: el("url").value, slug: el("slug").value, title: el("title").value });
      storage.removeItem("urtador-pending-link");
      const anchor = el("short-link-result"); anchor.href = result.shortUrl; anchor.textContent = result.shortUrl; anchor.hidden = false;
      el("copy-link").disabled = false; say(el("link-message"), "Link criado. Copie e compartilhe.");
      if (typeof window.gtag === "function") window.gtag("event", "urtador_link_created", { event_category: "engagement", event_label: "short_link" });
      await refreshDashboard();
    } catch (error) {
      if (resumedDraft) storage.setItem("urtador-pending-link", JSON.stringify({url: el("url").value, slug: el("slug").value, title: el("title").value, savedAt: Date.now()}));
      say(el("link-message"), error.message, true);
    }
    finally { button.disabled = false; }
  });

  el("copy-link")?.addEventListener("click", async () => {
    const url = el("short-link-result").href;
    try { await navigator.clipboard.writeText(url); say(el("link-message"), "Link copiado."); }
    catch { say(el("link-message"), url); }
  });

  el("pix-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try { const result = await api("save-pix", { pixKey: el("pix-key").value }); say(el("payout-message"), result.message); await refreshDashboard(); }
    catch (error) { say(el("payout-message"), error.message, true); }
  });

  el("withdraw-button")?.addEventListener("click", async () => {
    const amount = Number(el("withdrawal-amount").value);
    if (!Number.isSafeInteger(amount) || amount < 10 || amount % 10 !== 0) {
      say(el("payout-message"), "Escolha pelo menos R$ 10,00, em múltiplos de R$ 10,00.", true); return;
    }
    const button = el("withdraw-button"); button.disabled = true;
    try {
      const result = await api("withdraw", { amountCents: amount * 100 });
      say(el("payout-message"), `${result.message}${result.notificationSent ? " Aviso enviado à comunidade." : " O pedido ficou registrado; o aviso à comunidade não foi enviado."}`, !result.notificationSent);
      await refreshDashboard();
    } catch (error) { say(el("payout-message"), error.message, true); }
    finally {
      const current = state.data || {};
      const maxAvailable = Math.floor(Number(current.availableCents || 0) / 1000) * 10;
      button.disabled = Number(current.earnedCents || 0) < 7000 || maxAvailable < 10;
    }
  });

  el("refresh-admin")?.addEventListener("click", () => refreshAdmin().catch((error) => window.alert(error.message)));

  const adminSections = [...document.querySelectorAll("#admin-panel details.admin-section")];
  el("admin-expand-all")?.addEventListener("click", () => adminSections.forEach((section) => { section.open = true; }));
  el("admin-collapse-all")?.addEventListener("click", () => adminSections.forEach((section) => { section.open = false; }));

  document.querySelectorAll("[data-banner-preview]").forEach((button) => {
    button.addEventListener("click", () => showAdPreview(button.dataset.bannerPreview));
  });

  el("reward-base-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    const amount = Number(el("reward-base-value").value);
    if (!Number.isFinite(amount) || amount < 0 || amount > 500) {
      say(el("reward-base-message"), "Informe um valor entre R$ 0,00 e R$ 500,00.", true);
      return;
    }
    button.disabled = true;
    say(el("reward-base-message"), "Salvando valor-base…");
    try {
      const result = await api("admin-set-reward-base", { rewardBaseCents: Math.round(amount * 100) });
      const notice = result.notificationSent ? "Aviso enviado à comunidade." : "O valor foi salvo, mas o aviso do WhatsApp não foi enviado; confira a integração do grupo.";
      say(el("reward-base-message"), `Valor salvo: ${money(result.rewardBaseCents)} por mil visitas qualificadas. ${notice}`, !result.notificationSent);
      await refreshAdmin();
    } catch (error) {
      say(el("reward-base-message"), error.message, true);
    } finally {
      button.disabled = false;
    }
  });

  el("ad-config-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    say(el("ad-config-message"), "Validando e salvando as configurações…");
    try {
      const result = await api("admin-save-ad-configuration", {
        adsenseEnabled: el("adsense-primary").checked,
        adsenseTitle: el("adsense-title").value,
        adScripts: Array.from({ length: 6 }, (_, index) => ({ title: el(`banner-title-${index + 1}`).value, code: el(`banner-code-${index + 1}`).value, owner: el(`banner-owner-${index + 1}`).value }))
      });
      const groupNotice = result.notificationSent ? " Aviso enviado à comunidade Kuttencurtador." : " Não foi possível enviar o aviso ao grupo; confira a conexão do WhatsApp.";
      say(el("ad-config-message"), `Configuração salva: ${result.adConfiguration.slots.length} banner(s) Adsterra na Guia e na etapa 2/2. O destino não depende de interação com o anúncio. O AdSense continua desligado até aprovação.${groupNotice}`);
      await refreshAdmin();
    } catch (error) {
      say(el("ad-config-message"), error.message, true);
    } finally {
      button.disabled = false;
    }
  });

  el("prelogin-link-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button[type='submit']");
    const output = el("guest-link-output");
    button.disabled = true;
    output.hidden = true;
    say(el("draft-message"), "Criando seu link…");
    api("create", { url: el("pending-url").value, guestSessionId: guestSessionId() }).then((result) => {
      const anchor = el("guest-link-result");
      anchor.href = result.shortUrl;
      anchor.textContent = result.shortUrl;
      output.hidden = false;
      say(el("draft-message"), "Link pronto. Ele será vinculado à sua conta se você entrar neste mesmo navegador.");
      if (typeof window.gtag === "function") window.gtag("event", "urtador_link_created", { event_category: "engagement", event_label: "guest_short_link" });
    }).catch((error) => say(el("draft-message"), error.message, true)).finally(() => { button.disabled = false; });
  });

  el("copy-guest-link")?.addEventListener("click", async () => {
    const url = el("guest-link-result").href;
    try { await navigator.clipboard.writeText(url); say(el("draft-message"), "Link copiado."); }
    catch { say(el("draft-message"), url); }
  });

  el("admin-report-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type='submit']");
    button.disabled = true;
    say(el("admin-report-message"), "Consultando os repasses registrados…");
    try {
      const report = await api("admin-report", { reportStart: el("report-start").value, reportEnd: el("report-end").value, reportGroup: el("report-group").value });
      renderAdminReport(report);
      say(el("admin-report-message"), `Relatório de ${dateOnly(report.start)} a ${dateOnly(report.end)} carregado.`);
    } catch (error) { say(el("admin-report-message"), error.message, true); }
    finally { button.disabled = false; }
  });

  el("admin-ad-revenue-filter")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await loadAdminAdRevenue();
  });

  const adRevenueCurrencySelect = el("ad-revenue-currency");
  if (adRevenueCurrencySelect) adRevenueCurrencySelect.value = state.adRevenueDisplayCurrency;
  renderAdRevenueFxStatus();
  adRevenueCurrencySelect?.addEventListener("change", () => {
    state.adRevenueDisplayCurrency = adRevenueCurrencySelect.value === "USD" ? "USD" : "BRL";
    storage.setItem(adRevenueCurrencyStorageKey, state.adRevenueDisplayCurrency);
    if (!(state.usdBrlRate > 0)) loadUsdBrlRate();
    renderAdminAdRevenue();
  });
  el("refresh-ad-revenue-fx")?.addEventListener("click", () => loadUsdBrlRate(true));
  el("admin-ad-revenue-section")?.addEventListener("toggle", (event) => {
    if (event.currentTarget.open) loadUsdBrlRate();
  });

  if (el("adsense-oauth-client-id")) el("adsense-oauth-client-id").value = adsenseOAuthClientId();
  el("save-adsense-oauth-client-id")?.addEventListener("click", () => {
    const input = el("adsense-oauth-client-id");
    const clientId = String(input.value || "").trim();
    if (clientId && !/^[0-9]+-[a-z0-9-]+\.apps\.googleusercontent\.com$/i.test(clientId)) {
      say(el("admin-ad-revenue-message"), "Esse formato não parece um ID OAuth Web do Google (…apps.googleusercontent.com).", true);
      return;
    }
    if (clientId) storage.setItem(adsenseOAuthStorageKey, clientId);
    else storage.removeItem(adsenseOAuthStorageKey);
    say(el("admin-ad-revenue-message"), clientId ? "ID OAuth público salvo neste navegador. Agora conecte a conta Google." : "ID OAuth removido deste navegador.");
  });

  el("import-adsense-api")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const start = el("ad-revenue-start")?.value;
    const end = el("ad-revenue-end")?.value;
    if (!start || !end || start > end) {
      say(el("admin-ad-revenue-message"), "Escolha um período válido antes de importar.", true);
      return;
    }
    if ((new Date(`${end}T00:00:00Z`) - new Date(`${start}T00:00:00Z`)) / 86400000 > 366) {
      say(el("admin-ad-revenue-message"), "O período pode ter no máximo 367 dias.", true);
      return;
    }
    button.disabled = true;
    say(el("admin-ad-revenue-message"), "Aguardando autorização do Google para leitura do AdSense…");
    try {
      const authCode = await requestAdSenseAuthorizationCode();
      say(el("admin-ad-revenue-message"), "Supabase autorizado com segurança; consultando o relatório oficial…");
      const result = await api("admin-ad-revenue-import-adsense-api", { adsenseAuthCode: authCode, reportStart: start, reportEnd: end });
      await loadAdminAdRevenue();
      const warning = result.warnings?.length ? ` Aviso do Google: ${result.warnings.join("; ")}` : "";
      say(el("admin-ad-revenue-message"), `${result.message}${warning}`);
    } catch (error) {
      say(el("admin-ad-revenue-message"), error.message, true);
    } finally {
      button.disabled = false;
    }
  });

  el("import-adsterra-api")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const start = el("ad-revenue-start")?.value;
    const end = el("ad-revenue-end")?.value;
    if (!start || !end || start > end) {
      say(el("admin-ad-revenue-message"), "Escolha um período válido antes de importar.", true);
      return;
    }
    if ((new Date(`${end}T00:00:00Z`) - new Date(`${start}T00:00:00Z`)) / 86400000 > 366) {
      say(el("admin-ad-revenue-message"), "O período pode ter no máximo 367 dias.", true);
      return;
    }
    button.disabled = true;
    say(el("admin-ad-revenue-message"), "Consultando a API Adsterra e salvando o relatório diário…");
    try {
      const result = await api("admin-ad-revenue-import-adsterra-api", { reportStart: start, reportEnd: end });
      await loadAdminAdRevenue();
      say(el("admin-ad-revenue-message"), result.message || "Relatório Adsterra importado.");
    } catch (error) {
      say(el("admin-ad-revenue-message"), error.message, true);
    } finally {
      button.disabled = false;
    }
  });

  el("admin-ad-revenue-entry")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const provider = el("ad-revenue-provider").value;
    const reportDate = el("ad-revenue-date").value;
    const impressions = Number(el("ad-revenue-impressions").value);
    const clicks = Number(el("ad-revenue-clicks").value);
    const revenue = Number(el("ad-revenue-amount").value);
    if (!reportDate || !Number.isSafeInteger(impressions) || impressions < 0 || !Number.isSafeInteger(clicks) || clicks < 0 || !Number.isFinite(revenue) || revenue < 0) {
      say(el("admin-ad-revenue-message"), "Confira a data, impressões, cliques e receita antes de salvar.", true);
      return;
    }
    const button = el("save-ad-revenue");
    button.disabled = true;
    say(el("admin-ad-revenue-message"), "Salvando números informados do painel da rede…");
    try {
      const result = await api("admin-ad-revenue-save", {
        provider,
        reportStart: reportDate,
        impressions,
        clicks,
        revenueCents: Math.round(revenue * 100)
      });
      if (reportDate < el("ad-revenue-start").value || reportDate > el("ad-revenue-end").value) {
        el("ad-revenue-start").value = reportDate;
        el("ad-revenue-end").value = reportDate;
      }
      await loadAdminAdRevenue();
      say(el("admin-ad-revenue-message"), result.message || "Relatório salvo.");
    } catch (error) {
      say(el("admin-ad-revenue-message"), error.message, true);
    } finally {
      button.disabled = false;
    }
  });

  el("admin-payout-test-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const person = el("payout-test-person").value;
    const amountCents = Number(el("payout-test-amount").value);
    const personLabel = person === "mateus" ? "Mateus (final 9929)" : "Fabio (final 6164)";
    if (!window.confirm(`Enviar à comunidade um AVISO DE TESTE para ${personLabel}, no valor ilustrativo de ${money(amountCents)}? A mensagem dirá que não houve saque nem Pix.`)) return;
    const button = el("send-payout-test");
    button.disabled = true;
    say(el("payout-test-message"), "Enviando aviso identificado como teste…");
    try {
      const result = await api("admin-test-withdrawal-notice", { testPerson: person, amountCents });
      say(el("payout-test-message"), result.message || "Aviso de teste enviado. Nenhum dado financeiro foi alterado.");
    } catch (error) {
      say(el("payout-test-message"), error.message, true);
    } finally {
      button.disabled = false;
    }
  });

  el("export-admin-report")?.addEventListener("click", () => {
    const columns = ["periodo", "telefone_gerador", "visitas_qualificadas", "repasse_estimado_centavos", "pix_pagos_centavos", "pix_em_aberto_centavos"];
    const quote = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const lines = [columns, ...renderFilteredAdminReport().map((row) => [row.period, row.phone, row.qualifiedVisits, row.estimatedAccrualCents, row.paidPixCents, row.openPixCents])];
    const blob = new Blob([`\uFEFF${lines.map((line) => line.map(quote).join(",")).join("\r\n")}`], { type: "text/csv;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = href; anchor.download = "urtador-relatorio-repasses.csv"; anchor.click();
    URL.revokeObjectURL(href);
  });

  el("report-person-filter")?.addEventListener("input", renderFilteredAdminReport);
  const updateLinksFilterControls = () => {
    const period = el("links-period-filter")?.value;
    if (!period) return;
    el("links-month-wrap").hidden = period !== "month-pick";
    el("links-start-wrap").hidden = period !== "range";
    el("links-end-wrap").hidden = period !== "range";
    if (period === "month-pick" && !el("links-month-filter").value) {
      el("links-month-filter").value = localDateInputValue(new Date()).slice(0, 7);
    }
    renderAdminLinks();
  };
  el("links-period-filter")?.addEventListener("change", updateLinksFilterControls);
  el("links-month-filter")?.addEventListener("change", renderAdminLinks);
  el("links-date-start")?.addEventListener("change", renderAdminLinks);
  el("links-date-end")?.addEventListener("change", renderAdminLinks);
  el("links-phone-filter")?.addEventListener("input", renderAdminLinks);
  el("clear-links-filters")?.addEventListener("click", () => {
    el("links-period-filter").value = "all";
    el("links-month-filter").value = "";
    el("links-date-start").value = "";
    el("links-date-end").value = "";
    el("links-phone-filter").value = "";
    updateLinksFilterControls();
  });
  el("print-admin-report")?.addEventListener("click", () => {
    const rows = renderFilteredAdminReport();
    if (!rows.length || !state.adminReport) return;
    const filter = el("report-person-filter").value.trim();
    const person = filter ? ` · Filtro: ${filter}` : " · Todos os geradores";
    printRevenuePdf("Relatório de repasses Urtador", `Período ${dateOnly(state.adminReport.start)} a ${dateOnly(state.adminReport.end)}${person}`, rows);
  });
  el("print-eligible-reports")?.addEventListener("click", () => {
    const rows = renderFilteredAdminReport();
    const phone = el("report-eligible-person").value;
    const eligibleRows = rows.filter((row) => row.phone === phone);
    if (!eligibleRows.length || !state.adminReport) return;
    printRevenuePdf("Relatório individual de repasse Urtador", `Período ${dateOnly(state.adminReport.start)} a ${dateOnly(state.adminReport.end)} · relatório individual`, eligibleRows);
  });
  el("report-eligible-person")?.addEventListener("change", () => {
    el("print-eligible-reports").disabled = !el("report-eligible-person").value;
  });
  el("test-mateus-report")?.addEventListener("click", () => {
    const mateus = state.adminUsers.find((user) => String(user.phone || "").replace(/\D/g, "").endsWith("9929"));
    const percent = Number(mateus?.payout_percent ?? 50);
    const visits = 995;
    const cents = Math.round(visits * state.rewardBaseCents * percent / 100 / 1000);
    const simulatedRow = { period: "SIMULAÇÃO", phone: "Mateus · teste", qualifiedVisits: visits, estimatedAccrualCents: cents, paidPixCents: 0, openPixCents: 0 };
    printRevenuePdf("Simulação de exportação Urtador", `Teste local · 995 visitas fictícias · taxa usada no cenário: ${percent}% · base interna: ${money(state.rewardBaseCents)} por 1.000 visitas`, [simulatedRow], true);
  });

  const reportToday = new Date();
  const reportDate = new Date(reportToday.getTime() - reportToday.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  if (el("report-start")) el("report-start").value = `${reportDate.slice(0, 8)}01`;
  if (el("report-end")) el("report-end").value = reportDate;
  if (el("ad-revenue-start")) el("ad-revenue-start").value = `${reportDate.slice(0, 8)}01`;
  if (el("ad-revenue-end")) el("ad-revenue-end").value = reportDate;
  if (el("ad-revenue-date")) el("ad-revenue-date").value = reportDate;
  if (state.phone) el("login-phone").value = state.phone;
  if (state.token && state.passwordRecovery) {
    showAuth("set-password");
    el("password-form-help").textContent = "WhatsApp confirmado. Escolha uma nova senha para recuperar o acesso.";
    say(el("auth-message"), "Código confirmado. Defina sua nova senha abaixo.");
  } else if (state.token && state.passwordSetupRequired) {
    showAuth("set-password");
    say(el("auth-message"), "Seu WhatsApp já foi confirmado. Crie sua senha para concluir o primeiro acesso.");
  } else if (state.token) {
    refreshDashboard().catch((error) => {
      state.token = ""; storage.removeItem("urtador-token"); setLoggedIn(false); showAuth("password");
      say(el("auth-message"), error.message, true);
    });
  } else showAuth("password");
})();
