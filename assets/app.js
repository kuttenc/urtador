(function () {
  const config = window.URTADOR_CONFIG || {};
  const apiBase = `${String(config.supabaseUrl || "").replace(/\/$/, "")}/functions/v1/${config.functionName || "kutt-short-links"}`;
  const form = document.querySelector("[data-shortener-form]");
  const result = document.querySelector("[data-result]");
  const resultLink = document.querySelector("[data-result-link]");
  const message = document.querySelector("[data-message]");
  const copyButton = document.querySelector("[data-copy]");
  const status = document.querySelector("[data-status]");

  function setMessage(text, isError) {
    if (!message) return;
    message.textContent = text || "";
    message.classList.toggle("error", Boolean(isError));
  }

  function normalizeUrl(value) {
    const trimmed = String(value || "").trim();
    if (!trimmed) return "";
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  }

  async function request(payload) {
    const response = await fetch(apiBase, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) {
      throw new Error(data.error || "Nao foi possivel concluir agora.");
    }
    return data;
  }

  if (form) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = form.querySelector("button[type='submit']");
      const url = normalizeUrl(form.elements.url.value);
      const slug = String(form.elements.slug.value || "").trim();
      const title = String(form.elements.title.value || "").trim();

      result?.classList.remove("is-visible");
      setMessage("");

      if (!url) {
        setMessage("Informe o link grande primeiro.", true);
        return;
      }

      submit.disabled = true;
      submit.textContent = "Gerando...";
      status && (status.textContent = "Conectando ao Supabase");

      try {
        const data = await request({ action: "create", url, slug, title });
        resultLink.href = data.shortUrl;
        resultLink.textContent = data.shortUrl;
        result?.classList.add("is-visible");
        setMessage("Link criado. Agora voce pode usar no WhatsApp, anuncios ou atendimento.");
        status && (status.textContent = "Online");
      } catch (error) {
        setMessage(error.message, true);
        status && (status.textContent = "Aguardando backend");
      } finally {
        submit.disabled = false;
        submit.textContent = "Encurtar link";
      }
    });
  }

  copyButton?.addEventListener("click", async () => {
    if (!resultLink?.href) return;
    await navigator.clipboard.writeText(resultLink.href);
    setMessage("Copiado.");
  });
})();

