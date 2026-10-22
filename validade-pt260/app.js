(() => {
  const endpoint = "https://suipuquznkksgrkchqrv.supabase.co/functions/v1/validity-group-web-session";
  const text = {
    "pt-BR": {
      state: "CONECTADO", title: "Sua sessão<br>de coleta.", lead: "Este painel foi aberto pelo aplicativo e está vinculado à sessão atual do dispositivo.", session: "Sessão", sessionValue: "Vinculada", language: "Idioma", panelTitle: "Próximo passo", panelCopy: "No aplicativo, informe origem, destino e quantidade. Tire a foto para enviar ao grupo operacional.", refresh: "ATUALIZAR PAINEL", unavailable: "Abra este painel pela aba Grupo do aplicativo.", error: "Não foi possível confirmar a sessão agora."
    },
    en: {
      state: "CONNECTED", title: "Your collection<br>session.", lead: "This panel was opened by the app and is linked to the current device session.", session: "Session", sessionValue: "Linked", language: "Language", panelTitle: "Next step", panelCopy: "In the app, enter origin, destination and quantity. Take a photo to send it to the operational group.", refresh: "REFRESH PANEL", unavailable: "Open this panel from the app Group tab.", error: "The session could not be confirmed right now."
    }
  };
  const byId = (id) => document.getElementById(id);
  const ref = new URLSearchParams(location.search).get("s") || "";
  function apply(language) {
    const copy = text[language] || text.en;
    document.documentElement.lang = language;
    byId("state").textContent = copy.state;
    byId("title").innerHTML = copy.title;
    byId("lead").textContent = copy.lead;
    byId("card-one-label").textContent = copy.session;
    byId("session-value").textContent = copy.sessionValue;
    byId("card-two-label").textContent = copy.language;
    byId("language-value").textContent = language === "pt-BR" ? "Português" : "English";
    byId("panel-title").textContent = copy.panelTitle;
    byId("panel-copy").textContent = copy.panelCopy;
    byId("refresh").textContent = copy.refresh;
  }
  async function load() {
    if (!/^[0-9a-f-]{36}$/i.test(ref)) { byId("notice").textContent = text["pt-BR"].unavailable; return; }
    byId("notice").textContent = "";
    try {
      const response = await fetch(`${endpoint}?s=${encodeURIComponent(ref)}`);
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error("session");
      apply(data.language === "pt-BR" ? "pt-BR" : "en");
    } catch (_) {
      byId("notice").textContent = text["pt-BR"].error;
    }
  }
  byId("refresh").addEventListener("click", load);
  load();
})();
