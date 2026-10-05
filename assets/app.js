(function () {
  const config = window.URTADOR_CONFIG || {};
  const apiBase = `${String(config.supabaseUrl || "").replace(/\/$/, "")}/functions/v1/${config.functionName || "kutt-short-links"}`;
  const state = { token: sessionStorage.getItem("urtador-token") || "", phone: sessionStorage.getItem("urtador-phone") || "", user: null, data: null };
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
  }

  function showAuth(mode) {
    el("password-login-form").hidden = mode !== "password";
    el("first-access-button").hidden = mode !== "password";
    el("otp-form").hidden = mode !== "otp";
    el("set-password-form").hidden = mode !== "set-password";
  }

  async function refreshDashboard() {
    const data = await api("me");
    state.data = data;
    state.user = data.user;
    setLoggedIn(true);
    el("welcome-title").textContent = `Olá, ${data.user.phone}`;
    el("session-expiry").textContent = `Sua sessão expira às ${new Date(data.expiresAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`;
    el("eligible-count").textContent = Number(data.eligibleVisits || 0).toLocaleString("pt-BR");
    el("earned-balance").textContent = money(data.earnedCents);
    el("available-balance").textContent = money(data.availableCents);
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
    el("admin-panel").hidden = data.user.role !== "admin";
    if (data.user.role === "admin") await refreshAdmin();
  }

  async function refreshAdmin() {
    const data = await api("admin-list");
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
  }

  el("password-login-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const phone = el("login-phone").value.trim();
    const password = el("login-password").value;
    state.phone = phone; sessionStorage.setItem("urtador-phone", phone);
    say(el("auth-message"), "Conferindo seus dados…");
    try {
      const result = await api("login-password", { phone, password });
      if (result.otpRequired) {
        showAuth("otp");
        say(el("auth-message"), "Senha confirmada. Digite também o código enviado pelo WhatsApp.");
        return;
      }
      state.token = result.token; state.user = result.user;
      sessionStorage.setItem("urtador-token", result.token);
      await refreshDashboard();
      say(el("auth-message"), "Acesso confirmado.");
    } catch (error) { say(el("auth-message"), error.message, true); }
  });

  el("first-access-button")?.addEventListener("click", async () => {
    const phoneInput = el("login-phone");
    if (!phoneInput.reportValidity()) return;
    const phone = phoneInput.value.trim();
    state.phone = phone; sessionStorage.setItem("urtador-phone", phone);
    say(el("auth-message"), "Enviando código…");
    try {
      await api("request-otp", { phone });
      showAuth("otp");
      say(el("auth-message"), "Código enviado pelo WhatsApp. Digite os 6 números recebidos.");
    } catch (error) { say(el("auth-message"), error.message, true); }
  });

  el("otp-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    say(el("auth-message"), "Validando…");
    try {
      const result = await api("verify-otp", { phone: state.phone, code: el("otp").value });
      state.token = result.token; state.user = result.user;
      sessionStorage.setItem("urtador-token", result.token);
      if (result.passwordSetupRequired) {
        showAuth("set-password");
        say(el("auth-message"), "WhatsApp confirmado. Crie sua senha abaixo para concluir o primeiro acesso.");
        el("new-password").focus();
        return;
      }
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
      await refreshDashboard();
      say(el("auth-message"), result.message);
    } catch (error) { say(el("auth-message"), error.message, true); }
  });

  el("change-phone")?.addEventListener("click", () => { showAuth("password"); el("otp").value = ""; el("login-password").value = ""; say(el("auth-message"), ""); });
  el("logout-button")?.addEventListener("click", async () => {
    try { await api("logout"); } catch { /* The local session is still discarded if the network is unavailable. */ }
    state.token = ""; sessionStorage.removeItem("urtador-token"); sessionStorage.removeItem("urtador-phone");
    setLoggedIn(false); showAuth("password"); el("login-password").value = ""; say(el("auth-message"), "Você saiu da sua conta.");
  });

  el("shortener-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type='submit']");
    button.disabled = true; say(el("link-message"), "Criando seu link…"); el("short-link-result").hidden = true;
    try {
      const result = await api("create", { url: el("url").value, slug: el("slug").value, title: el("title").value });
      const anchor = el("short-link-result"); anchor.href = result.shortUrl; anchor.textContent = result.shortUrl; anchor.hidden = false;
      el("copy-link").disabled = false; say(el("link-message"), "Link criado. Copie e compartilhe.");
      await refreshDashboard();
    } catch (error) { say(el("link-message"), error.message, true); }
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

  if (state.token) {
    refreshDashboard().catch((error) => {
      state.token = ""; sessionStorage.removeItem("urtador-token"); setLoggedIn(false); showAuth("password");
      say(el("auth-message"), error.message, true);
    });
  } else showAuth("password");
})();
