(async function () {
  const config = window.URTADOR_CONFIG || {};
  const apiBase = `${String(config.supabaseUrl || "").replace(/\/$/, "")}/functions/v1/${config.functionName || "kutt-short-links"}`;
  const basePath = config.basePath || "/urtador/";
  const statuses = [...document.querySelectorAll("[data-redirect-status]")];
  const reviewButton = document.querySelector("[data-redirect-review]");
  const openButton = document.querySelector("[data-redirect-open]");
  const steps = [...document.querySelectorAll("[data-redirect-step]")];
  const path = window.location.pathname;
  const index = path.indexOf(basePath);
  const slug = decodeURIComponent((index >= 0 ? path.slice(index + basePath.length) : path.slice(1)).replace(/^\/+|\/+$/g, ""));

  function write(text) {
    statuses.forEach((status) => { status.textContent = text; });
  }

  function showStep(number) {
    steps.forEach((step) => { step.hidden = step.dataset.redirectStep !== String(number); });
  }

  reviewButton?.addEventListener("click", () => showStep(2));
  openButton?.addEventListener("click", async () => {
    if (openButton.disabled) return;
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

  write("O destino só será solicitado ao confirmar a abertura.");
})();
