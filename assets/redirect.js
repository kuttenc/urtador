(async function () {
  const config = window.URTADOR_CONFIG || {};
  const apiBase = `${String(config.supabaseUrl || "").replace(/\/$/, "")}/functions/v1/${config.functionName || "kutt-short-links"}`;
  const basePath = config.basePath || "/urtador/";
  const status = document.querySelector("[data-redirect-status]");
  const reviewButton = document.querySelector("[data-redirect-review]");
  const openButton = document.querySelector("[data-redirect-open]");
  const steps = [...document.querySelectorAll("[data-redirect-step]")];
  const destinationUrl = { value: "" };
  const path = window.location.pathname;
  const index = path.indexOf(basePath);
  const slug = decodeURIComponent((index >= 0 ? path.slice(index + basePath.length) : path.slice(1)).replace(/^\/+|\/+$/g, ""));

  function write(text) {
    if (status) status.textContent = text;
  }

  function showStep(number) {
    steps.forEach((step) => { step.hidden = step.dataset.redirectStep !== String(number); });
  }

  function startCountdown(stepNumber, button) {
    const secondsTotal = 20;
    const counter = document.querySelector(`[data-redirect-countdown="${stepNumber}"]`);
    let remaining = secondsTotal;
    button.disabled = true;
    const update = () => {
      if (counter) counter.textContent = remaining > 0 ? `Aguarde ${remaining} segundos` : "Etapa concluída";
      button.textContent = remaining > 0
        ? `${stepNumber === 1 ? "Próxima etapa" : "Abrir destino"} (${remaining})`
        : stepNumber === 1 ? "Próxima etapa" : "Abrir destino";
      if (remaining <= 0) {
        button.disabled = false;
        return;
      }
      remaining -= 1;
      window.setTimeout(update, 1000);
    };
    update();
  }

  reviewButton?.addEventListener("click", () => {
    showStep(2);
    if (openButton) startCountdown(2, openButton);
  });
  openButton?.addEventListener("click", () => {
    if (!openButton.disabled && destinationUrl.value) window.location.assign(destinationUrl.value);
  });

  if (!slug) {
    window.location.replace(basePath);
    return;
  }

  try {
    write("Carregando o link...");
    const response = await fetch(apiBase, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resolve", slug })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.url) throw new Error(data.error || "Link não encontrado.");
    const parsedDestination = new URL(data.url);
    if (!["http:", "https:"].includes(parsedDestination.protocol)) throw new Error("Este link não possui um destino web válido.");
    destinationUrl.value = parsedDestination.href;
    write("O link foi carregado. Aguarde a primeira etapa para continuar.");
    if (reviewButton) startCountdown(1, reviewButton);
  } catch (error) {
    write(error.message || "Link não encontrado.");
    if (reviewButton) reviewButton.disabled = true;
  }
})();
