(function () {
  const config = window.URTADOR_CONFIG || {};
  const apiBase = `${String(config.supabaseUrl || "").replace(/\/$/, "")}/functions/v1/${config.functionName || "kutt-short-links"}`;
  const storage = window.localStorage || window.sessionStorage;
  const state = {
    token: storage.getItem("urtador-token") || "",
    phone: storage.getItem("urtador-phone") || "",
    passwordSetupRequired: storage.getItem("urtador-password-setup") === "1",
    resumingDraft: false,
    user: null,
    data: null,
    activeDashboardPage: ""
  };
  const el = (id) => document.getElementById(id);

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

  function money(cents) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((Number(cents) || 0) / 100);
  }

  function date(value) {
    return value ? new Date(value).toLocaleDateString("pt-BR") : "—";
  }

  function dateOnly(value) {
    const [year, month, day] = String(value || "").split("-").map(Number);
    return year && month && day ? new Date(year, month - 1, day).toLocaleDateString("pt-BR") : "—";
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
    const data = await api("me");
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
    el("pix-key").value = data.user.pixKey || "";
    const linksBody = el("links-body");
    linksBody.replaceChildren();
    for (const link of data.links || []) {
      const row = document.createElement("tr");
      cell(row, link.title || link.slug);
      const linkCell = document.createElement("td"); linkCell.append(safeLink(`${config.defaultDomain}/${link.slug}`, `${config.defaultDomain}/${link.slug}`)); row.append(linkCell);
      cell(row, Number(link.click_count || 0).toLocaleString("pt-BR"));
      cell(row, date(link.created_at));
      linksBody.append(row);
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
    for (const item of data.withdrawals || []) {
      const row = document.createElement("tr");
      const user = Array.isArray(item.user) ? item.user[0] : item.user;
      cell(row, user?.phone || "—"); cell(row, item.pix_key); cell(row, money(item.amount_cents)); cell(row, item.status);
      const actions = document.createElement("td");
      if (item.status === "pending" || item.status === "approved") {
        const action = document.createElement("button"); action.className = "button small"; action.type = "button";
        action.textContent = item.status === "pending" ? "Aprovar" : "Marcar pago";
        action.addEventListener("click", async () => {
          const nextStatus = item.status === "pending" ? "approved" : "paid";
          const prompt = nextStatus === "paid" ? `Confirma que fez o Pix de ${money(item.amount_cents)} para ${item.pix_key}?` : `Aprovar o saque de ${money(item.amount_cents)} para ${item.pix_key}?`;
          if (!window.confirm(prompt)) return;
          await api("admin-withdrawal", { withdrawalId: item.id, status: nextStatus }); await refreshDashboard();
        });
        const reject = document.createElement("button"); reject.className = "button small secondary"; reject.type = "button"; reject.textContent = "Recusar";
        reject.addEventListener("click", async () => { await api("admin-withdrawal", { withdrawalId: item.id, status: "rejected", note: "Recusado pelo administrador" }); await refreshDashboard(); });
        actions.append(action, reject);
      } else actions.textContent = "—";
      row.append(actions); withdrawalsBody.append(row);
    }
    const usersBody = el("admin-users-body"); usersBody.replaceChildren();
    for (const item of data.users || []) { const row = document.createElement("tr"); cell(row, item.phone); cell(row, item.role); cell(row, item.pix_key || "—"); cell(row, date(item.created_at)); usersBody.append(row); }
    const linksBody = el("admin-links-body"); linksBody.replaceChildren();
    for (const item of data.links || []) {
      const row = document.createElement("tr");
      const user = Array.isArray(item.user) ? item.user[0] : item.user;
      cell(row, user?.phone || "legado");
      const shortCell = document.createElement("td"); shortCell.append(safeLink(`${config.defaultDomain}/${item.slug}`, item.slug)); row.append(shortCell);
      const targetCell = document.createElement("td"); targetCell.append(safeLink(item.target_url, item.target_url)); row.append(targetCell);
      cell(row, Number(item.click_count || 0).toLocaleString("pt-BR")); linksBody.append(row);
    }
    const adConfiguration = data.adConfiguration || { adsenseEnabled: false, slots: [] };
    el("adsense-primary").checked = Boolean(adConfiguration.adsenseEnabled);
    for (let index = 0; index < 6; index++) {
      el(`banner-code-${index + 1}`).value = adConfiguration.slots?.[index]?.script || "";
    }
    say(el("admin-load-message"), "Dados atualizados. Contas vazias aparecem com zero; o traço indica que a leitura ainda não foi concluída.");
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
      storage.setItem("urtador-token", result.token);
      storage.removeItem("urtador-password-setup");
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

  el("otp-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    say(el("auth-message"), "Validando…");
    try {
      const result = await api("verify-otp", { phone: state.phone, code: el("otp").value });
      state.token = result.token; state.user = result.user;
      storage.setItem("urtador-token", result.token);
      if (result.passwordSetupRequired) {
        state.passwordSetupRequired = true;
        storage.setItem("urtador-password-setup", "1");
        showAuth("set-password");
        say(el("auth-message"), "WhatsApp confirmado. Crie sua senha abaixo para concluir o primeiro acesso.");
        el("new-password").focus();
        return;
      }
      state.passwordSetupRequired = false;
      storage.removeItem("urtador-password-setup");
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
      storage.removeItem("urtador-password-setup");
      await refreshDashboard();
      say(el("auth-message"), result.message);
    } catch (error) { say(el("auth-message"), error.message, true); }
  });

  el("change-phone")?.addEventListener("click", () => { showAuth("password"); el("otp").value = ""; el("login-password").value = ""; say(el("auth-message"), ""); });
  document.querySelectorAll("[data-logout]").forEach((button) => button.addEventListener("click", async () => {
    try { await api("logout"); } catch { /* The local session is still discarded if the network is unavailable. */ }
    state.token = ""; state.passwordSetupRequired = false; storage.removeItem("urtador-token"); storage.removeItem("urtador-phone"); storage.removeItem("urtador-password-setup");
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
    try { const result = await api("withdraw"); say(el("payout-message"), result.message); await refreshDashboard(); }
    catch (error) { say(el("payout-message"), error.message, true); }
  });

  el("refresh-admin")?.addEventListener("click", () => refreshAdmin().catch((error) => window.alert(error.message)));

  el("ad-config-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    say(el("ad-config-message"), "Validando e salvando as configurações…");
    try {
      const result = await api("admin-save-ad-configuration", {
        adsenseEnabled: el("adsense-primary").checked,
        adScripts: Array.from({ length: 6 }, (_, index) => el(`banner-code-${index + 1}`).value)
      });
      say(el("ad-config-message"), `Configuração salva: ${result.adConfiguration.slots.length} banner(s) na página Guia. O redirecionamento permanece sem anúncios e sem espera.`);
      await refreshAdmin();
    } catch (error) {
      say(el("ad-config-message"), error.message, true);
    } finally {
      button.disabled = false;
    }
  });

  el("prelogin-link-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const url = el("pending-url").value.trim();
    storage.setItem("urtador-pending-link", JSON.stringify({url, savedAt: Date.now()}));
    say(el("draft-message"), "Endereço guardado. Entre com sua senha ou escolha receber o código; depois do acesso, vamos retomar este link.");
    el("login-phone").focus();
  });

  const pendingDraft = storage.getItem("urtador-pending-link");
  if (pendingDraft) {
    try { el("pending-url").value = JSON.parse(pendingDraft).url || ""; } catch { storage.removeItem("urtador-pending-link"); }
  }
  if (state.phone) el("login-phone").value = state.phone;
  if (state.token && state.passwordSetupRequired) {
    showAuth("set-password");
    say(el("auth-message"), "Seu WhatsApp já foi confirmado. Crie sua senha para concluir o primeiro acesso.");
  } else if (state.token) {
    refreshDashboard().catch((error) => {
      state.token = ""; storage.removeItem("urtador-token"); setLoggedIn(false); showAuth("password");
      say(el("auth-message"), error.message, true);
    });
  } else showAuth("password");
})();
