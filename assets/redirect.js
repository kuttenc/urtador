(async function () {
  const config = window.URTADOR_CONFIG || {};
  const apiBase = `${String(config.supabaseUrl || "").replace(/\/$/, "")}/functions/v1/${config.functionName || "kutt-short-links"}`;
  const basePath = config.basePath || "/urtador/";
  const statuses = [...document.querySelectorAll("[data-redirect-status]")];
  const openButton = document.querySelector("[data-redirect-open]");
  const path = window.location.pathname;
  const index = path.indexOf(basePath);
  const slug = decodeURIComponent((index >= 0 ? path.slice(index + basePath.length) : path.slice(1)).replace(/^\/+|\/+$/g, ""));
  let readyToOpen = false;

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
        body: JSON.stringify({ action: "resolve", slug })
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
      readyToOpen = true;
      if (openButton) openButton.disabled = false;
      write("Toque em “Abrir destino” para continuar.");
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
