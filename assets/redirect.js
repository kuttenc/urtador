(async function () {
  const config = window.URTADOR_CONFIG || {};
  const apiBase = `${String(config.supabaseUrl || "").replace(/\/$/, "")}/functions/v1/${config.functionName || "kutt-short-links"}`;
  const basePath = config.basePath || "/urtador/";
  const status = document.querySelector("[data-redirect-status]");
  const countdownText = document.querySelector("[data-redirect-countdown]");
  const continueLink = document.querySelector("[data-redirect-continue]");
  let destinationUrl = "";
  const path = window.location.pathname;
  const index = path.indexOf(basePath);
  const slug = decodeURIComponent((index >= 0 ? path.slice(index + basePath.length) : path.slice(1)).replace(/^\/+|\/+$/g, ""));

  function write(text) {
    if (status) status.textContent = text;
  }

  function writeRemaining(seconds) {
    if (!countdownText) return;
    const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
    const remainingSeconds = (seconds % 60).toString().padStart(2, "0");
    countdownText.textContent = `Tempo restante: ${minutes}:${remainingSeconds}`;
  }

  continueLink?.addEventListener("click", () => {
    if (!continueLink.disabled && destinationUrl) window.location.assign(destinationUrl);
  });

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
    destinationUrl = data.url;
    if (continueLink) {
      continueLink.textContent = "Aguarde 60 segundos";
      continueLink.hidden = false;
    }
    let secondsLeft = 60;
    writeRemaining(secondsLeft);
    if (countdownText) countdownText.hidden = false;
    write(`O botão será liberado em ${secondsLeft} segundos.`);
    const countdown = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      secondsLeft -= 1;
      if (secondsLeft <= 0) {
        window.clearInterval(countdown);
        writeRemaining(0);
        if (continueLink) {
          continueLink.disabled = false;
          continueLink.textContent = "Continuar para o destino";
        }
        write("Pronto. Toque no botão para abrir o destino.");
        return;
      }
      writeRemaining(secondsLeft);
      if (continueLink) continueLink.textContent = `Aguarde ${secondsLeft} segundos`;
      write(`O botão será liberado em ${secondsLeft} segundos.`);
    }, 1000);
  } catch (error) {
    write(error.message || "Link nao encontrado.");
  }
})();

