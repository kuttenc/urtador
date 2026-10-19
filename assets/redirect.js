(async function () {
  const config = window.URTADOR_CONFIG || {};
  const apiBase = `${String(config.supabaseUrl || "").replace(/\/$/, "")}/functions/v1/${config.functionName || "kutt-short-links"}`;
  const basePath = config.basePath || "/urtador/";
  const statuses = [...document.querySelectorAll("[data-redirect-status]")];
  const openButton = document.querySelector("[data-redirect-open]");
  const turnstileShell = document.querySelector("[data-turnstile-shell]");
  const turnstileContainer = document.querySelector("[data-turnstile-container]");
  const path = window.location.pathname;
  const index = path.indexOf(basePath);
  const slug = decodeURIComponent((index >= 0 ? path.slice(index + basePath.length) : path.slice(1)).replace(/^\/+|\/+$/g, ""));
  let readyToOpen = false;
  let turnstileToken = "";

  function write(text) {
    statuses.forEach((status) => { status.textContent = text; });
  }

  openButton?.addEventListener("click", async () => {
    if (openButton.disabled || !readyToOpen) return;
    openButton.disabled = true;
    openButton.textContent = "Abrindo destino…";
    write("Abrindo o destino solicitado...");
    try {
      const response = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve", slug, turnstileToken })
      });
      const data = await response.json().catch(() => ({}));
      if (data.accessExpired) {
        write("O período de acesso deste link terminou. Voltando ao Urtador...");
        window.location.replace(data.redirectUrl || "https://kuttenc.github.io/");
        return;
      }
      if (!response.ok || !data.url) throw new Error(data.error || "Link não encontrado.");
      const parsedDestination = new URL(data.url);
      if (!["http:", "https:"].includes(parsedDestination.protocol)) throw new Error("Este link não possui um destino web válido.");
      window.location.assign(parsedDestination.href);
    } catch (error) {
      write(error.message || "Não foi possível abrir o destino.");
      openButton.disabled = false;
      openButton.textContent = "Tentar abrir destino";
    }
  });

  if (!slug) {
    window.location.replace(basePath);
    return;
  }

  function loadTurnstile(siteKey) {
    return new Promise((resolve, reject) => {
      if (window.turnstile) { resolve(window.turnstile); return; }
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.onload = () => resolve(window.turnstile);
      script.onerror = () => reject(new Error("Não foi possível carregar a confirmação."));
      document.head.append(script);
    });
  }

  async function prepareTurnstile(configuration) {
    if (!configuration?.enabled || !configuration.siteKey) {
      readyToOpen = true;
      if (openButton) openButton.disabled = false;
      write("Toque em “Abrir destino” para continuar.");
      return;
    }
    turnstileShell.hidden = false;
    write("Confirme que você não é um robô para continuar.");
    const turnstile = await loadTurnstile(configuration.siteKey);
    turnstile.render(turnstileContainer, {
      sitekey: configuration.siteKey,
      theme: "dark",
      action: "short-link-open",
      callback(token) {
        turnstileToken = token;
        readyToOpen = true;
        if (openButton) openButton.disabled = false;
        write("Toque em “Abrir destino” para continuar.");
      },
      "expired-callback"() {
        turnstileToken = "";
        readyToOpen = false;
        if (openButton) openButton.disabled = true;
        write("A confirmação expirou. Confirme novamente para abrir o destino.");
      },
      "error-callback"() {
        turnstileToken = "";
        readyToOpen = false;
        if (openButton) openButton.disabled = true;
        write("Não foi possível concluir a confirmação. Tente recarregar a página.");
      }
    });
  }

  async function beginAccessWindow() {
    if (openButton) openButton.disabled = true;
    write("Verificando a disponibilidade do link...");
    try {
      const response = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start-link-access-window", slug })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Link não encontrado.");
      if (data.accessExpired) {
        write("O período de acesso deste link terminou. Voltando ao Urtador...");
        window.location.replace(data.redirectUrl || "https://kuttenc.github.io/");
        return;
      }
      await prepareTurnstile(data.turnstile);
      const remaining = new Date(data.expiresAt || 0).getTime() - Date.now();
      if (Number.isFinite(remaining) && remaining > 0) {
        window.setTimeout(() => window.location.replace("https://kuttenc.github.io/"), remaining + 100);
      }
    } catch (error) {
      write(error.message || "Não foi possível verificar este link.");
    }
  }

  beginAccessWindow();
})();
