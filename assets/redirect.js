(async function () {
  const config = window.URTADOR_CONFIG || {};
  const apiBase = `${String(config.supabaseUrl || "").replace(/\/$/, "")}/functions/v1/${config.functionName || "kutt-short-links"}`;
  const basePath = config.basePath || "/urtador/";
  const status = document.querySelector("[data-redirect-status]");
  const reviewButton = document.querySelector("[data-redirect-review]");
  const openButton = document.querySelector("[data-redirect-open]");
  const backButton = document.querySelector("[data-redirect-back]");
  const destinationText = document.querySelector("[data-redirect-destination]");
  const destinationNote = document.querySelector("[data-redirect-note]");
  const finalDestinationText = document.querySelector("[data-redirect-destination-final]");
  const fullLinkDetails = [...document.querySelectorAll("[data-redirect-full-link]")];
  const fullLinkTexts = [...document.querySelectorAll("[data-redirect-full-url]")];
  const steps = [...document.querySelectorAll("[data-redirect-step]")];
  let destinationUrl = "";
  const path = window.location.pathname;
  const index = path.indexOf(basePath);
  const slug = decodeURIComponent((index >= 0 ? path.slice(index + basePath.length) : path.slice(1)).replace(/^\/+|\/+$/g, ""));

  function write(text) {
    if (status) status.textContent = text;
  }

  function showStep(number) {
    steps.forEach((step) => {
      step.hidden = step.dataset.redirectStep !== String(number);
    });
  }

  function destinationPreview(parsedDestination) {
    const path = parsedDestination.pathname.replace(/\/+$/, "");
    const suffix = path.length > 1 ? path.slice(-2) : "";
    const previewPath = suffix ? `/…${suffix}` : "/";
    const hasExtra = Boolean(parsedDestination.search || parsedDestination.hash);
    return `${parsedDestination.origin}${previewPath}${hasExtra ? " · parâmetros ocultos" : ""}`;
  }

  reviewButton?.addEventListener("click", () => showStep(2));
  backButton?.addEventListener("click", () => showStep(1));
  openButton?.addEventListener("click", () => {
    if (destinationUrl) window.location.assign(destinationUrl);
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
    const parsedDestination = new URL(data.url);
    if (!["http:", "https:"].includes(parsedDestination.protocol)) throw new Error("Este link não possui um destino web válido.");
    destinationUrl = parsedDestination.href;
    if (destinationText) {
      destinationText.textContent = destinationPreview(parsedDestination);
      destinationText.hidden = false;
    }
    if (finalDestinationText) finalDestinationText.textContent = destinationPreview(parsedDestination);
    fullLinkTexts.forEach((element) => { element.textContent = parsedDestination.href; });
    fullLinkDetails.forEach((element) => { element.hidden = false; });
    if (destinationNote) destinationNote.hidden = false;
    if (reviewButton) {
      reviewButton.disabled = false;
      reviewButton.hidden = false;
    }
    write("Confira o endereço acima. Se você o reconhecer, avance para confirmar a abertura.");
  } catch (error) {
    write(error.message || "Link nao encontrado.");
  }
})();
