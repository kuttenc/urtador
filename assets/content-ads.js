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

  function isValidBanner(slot) {
    if (!/^[a-f0-9]{32}$/i.test(String(slot.key || ""))) return false;
    const host = String(slot.host || "").toLowerCase();
    const scriptPath = String(slot.scriptPath || (host.endsWith("highperformanceformat.com") ? `/${slot.key}/invoke.js` : `/22/${slot.key}`));
    const validPath = host === "bauval.org"
      ? scriptPath === `/22/${slot.key}`
      : new Set(["www.highperformanceformat.com", "highperformanceformat.com"]).has(host) && scriptPath === `/${slot.key}/invoke.js`;
    if (!validPath) return false;
    const width = Number(slot.width);
    const height = Number(slot.height);
    return Number.isInteger(width) && Number.isInteger(height) && width >= 120 && width <= 728 && height >= 50 && height <= 600;
  }

  function renderBanner(slot, placement) {
    const container = document.querySelector(`[data-content-ad="${placement}"]`);
    if (!container) return;
    const width = Number(slot.width);
    const height = Number(slot.height);
    const heading = document.createElement("p");
    heading.className = "content-ad-label";
    heading.textContent = "Publicidade";
    const frame = document.createElement("iframe");
    frame.title = `Publicidade — banner ${placement}`;
    frame.width = String(width);
    frame.height = String(height);
    frame.loading = "lazy";
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    frame.setAttribute("sandbox", "allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms");
    const key = String(slot.key).toLowerCase();
    const host = String(slot.host).toLowerCase();
    const scriptPath = String(slot.scriptPath || (host === "bauval.org" ? `/22/${key}` : `/${key}/invoke.js`));
    frame.srcdoc = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}body{display:grid;place-items:center}</style></head><body><script>var atOptions={key:"${key}",format:"iframe",height:${height},width:${width},params:{}};<\/script><script src="https://${host}${scriptPath}"><\/script></body></html>`;
    container.replaceChildren(heading, frame);
    container.hidden = false;
  }

  try {
    const response = await fetch(apiUrl, { method: "POST", headers, body: JSON.stringify({ action: "public-ad-configuration" }) });
    if (!response.ok) return;
    const data = await response.json();
    if (data.adsenseEnabled) addAdsenseLoader();
    const banners = (Array.isArray(data.slots) ? data.slots : []).filter(isValidBanner);
    if (banners.length) {
      // Rotate through the saved units by UTC day; show at most three well-spaced banners per guide visit.
      const first = Math.floor(Date.now() / 86400000) % banners.length;
      const placements = [2, 4, 6];
      placements.slice(0, Math.min(3, banners.length)).forEach((placement, index) => {
        renderBanner(banners[(first + index) % banners.length], placement);
      });
    }
  } catch {
    // Content and link creation remain available when ad settings cannot be loaded.
  }
})();
