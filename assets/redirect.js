(async function () {
  const config = window.URTADOR_CONFIG || {};
  const apiBase = `${String(config.supabaseUrl || "").replace(/\/$/, "")}/functions/v1/${config.functionName || "kutt-short-links"}`;
  const basePath = config.basePath || "/urtador/";
  const status = document.querySelector("[data-redirect-status]");
  const continueLink = document.querySelector("[data-redirect-continue]");
  const path = window.location.pathname;
  const index = path.indexOf(basePath);
  const slug = decodeURIComponent((index >= 0 ? path.slice(index + basePath.length) : path.slice(1)).replace(/^\/+|\/+$/g, ""));

  function write(text) {
    if (status) status.textContent = text;
  }

  if (!slug) {
    window.location.replace(basePath);
    return;
  }

  try {
    write("Buscando link...");
    const response = await fetch(apiBase, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resolve", slug })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.url) throw new Error(data.error || "Link nao encontrado.");
    if (continueLink) {
      continueLink.href = data.url;
      continueLink.hidden = false;
    }
    write("Link pronto. Toque no botão para continuar.");
  } catch (error) {
    write(error.message || "Link nao encontrado.");
  }
})();

