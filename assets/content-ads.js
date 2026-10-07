(async function () {
  const config = window.URTADOR_CONFIG || {};
  const apiUrl = `${String(config.supabaseUrl || "").replace(/\/$/, "")}/functions/v1/${config.functionName || "kutt-short-links"}`;
  const headers = { "Content-Type": "application/json" };
  if (config.publishableKey) headers.apikey = config.publishableKey;

  function addAdsenseLoader() {
    if (document.querySelector('script[data-adsense-loader="urtador"]')) return;
    const script = document.createElement("script");
    script.async = true;
    script.crossOrigin = "anonymous";
    script.dataset.adsenseLoader = "urtador";
    script.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6464589391694014";
    document.head.appendChild(script);
  }

  function renderBanner(slot, index) {
    if (!/^[a-f0-9]{32}$/i.test(String(slot.key || ""))) return;
    if (!new Set(["www.highperformanceformat.com", "highperformanceformat.com"]).has(String(slot.host || "").toLowerCase())) return;
    const width = Number(slot.width);
    const height = Number(slot.height);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 120 || width > 728 || height < 50 || height > 600) return;

    const container = document.querySelector(`[data-content-ad="${index + 1}"]`);
    if (!container) return;
    const heading = document.createElement("p");
    heading.className = "content-ad-label";
    heading.textContent = "Publicidade";
    const frame = document.createElement("iframe");
    frame.title = `Publicidade — banner ${index + 1}`;
    frame.width = String(width);
    frame.height = String(height);
    frame.loading = "lazy";
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    frame.setAttribute("sandbox", "allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms");
    const key = String(slot.key).toLowerCase();
    const host = String(slot.host).toLowerCase();
    frame.srcdoc = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}body{display:grid;place-items:center}</style></head><body><script>var atOptions={key:"${key}",format:"iframe",height:${height},width:${width},params:{}};<\/script><script src="https://${host}/${key}/invoke.js"><\/script></body></html>`;
    container.replaceChildren(heading, frame);
    container.hidden = false;
  }

  try {
    const response = await fetch(apiUrl, { method: "POST", headers, body: JSON.stringify({ action: "public-ad-configuration" }) });
    if (!response.ok) return;
    const data = await response.json();
    if (data.adsenseEnabled) addAdsenseLoader();
    (Array.isArray(data.slots) ? data.slots.slice(0, 6) : []).forEach(renderBanner);
  } catch {
    // Content and link creation remain available when ad settings cannot be loaded.
  }
})();
