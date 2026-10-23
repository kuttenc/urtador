(() => {
  const endpoint = "https://suipuquznkksgrkchqrv.supabase.co/functions/v1/validity-group-web-session";
  const byId = (id) => document.getElementById(id);
  const ref = new URLSearchParams(location.search).get("s") || "";
  let period = "day";

  const copy = {
    unavailable: "Abra este painel pela aba Grupo do aplicativo.",
    error: "Não foi possível confirmar a sessão agora.",
    loading: "Carregando coletas…",
    empty: "Nenhuma coleta neste período.",
    count: (value) => value === 1 ? "1 coleta enviada" : `${value} coletas enviadas`
  };

  function applyLanguage(language) {
    const portuguese = language === "pt-BR";
    document.documentElement.lang = portuguese ? "pt-BR" : "en";
    byId("state").textContent = portuguese ? "CONECTADO" : "CONNECTED";
    byId("title").innerHTML = portuguese ? "Sua sessão<br>de coleta." : "Your collection<br>session.";
    byId("lead").textContent = portuguese
      ? "Este painel mostra somente as fotos enviadas por esta sessão do aplicativo."
      : "This panel shows only photos sent by this app session.";
    byId("card-one-label").textContent = portuguese ? "Sessão" : "Session";
    byId("session-value").textContent = portuguese ? "Vinculada" : "Linked";
    byId("card-two-label").textContent = portuguese ? "Idioma" : "Language";
    byId("language-value").textContent = portuguese ? "Português" : "English";
    byId("panel-title").textContent = portuguese ? "Coletas enviadas" : "Sent collections";
    byId("panel-copy").textContent = portuguese
      ? "Escolha o período para consultar as fotos desta sessão."
      : "Choose a period to view this session's photos.";
    byId("refresh").textContent = portuguese ? "ATUALIZAR RELATÓRIO" : "REFRESH REPORT";
  }

  function renderEvents(events) {
    const list = byId("report-list");
    list.replaceChildren();
    byId("report-summary").textContent = copy.count(events.length);
    if (!events.length) {
      const empty = document.createElement("div");
      empty.className = "report-empty";
      empty.textContent = copy.empty;
      list.append(empty);
      return;
    }
    events.forEach((event) => {
      const item = document.createElement("article");
      item.className = "report-item";
      const title = document.createElement("strong");
      title.textContent = event.item || event.ean || "Item sem descrição";
      const route = document.createElement("span");
      const quantity = event.quantity ? `${event.quantity}${event.unit ? ` ${event.unit}` : ""}` : "Quantidade não informada";
      route.textContent = `${event.origin || "Origem não informada"} → ${event.destination || "Destino não informado"} · ${quantity}`;
      const sent = document.createElement("span");
      const date = event.sent_at || event.captured_at;
      sent.textContent = date ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(date)) : "Envio registrado";
      item.append(title, route, sent);
      list.append(item);
    });
  }

  async function load() {
    if (!/^[0-9a-f-]{36}$/i.test(ref)) {
      byId("notice").textContent = copy.unavailable;
      byId("report-summary").textContent = "";
      return;
    }
    byId("notice").textContent = "";
    byId("report-summary").textContent = copy.loading;
    byId("report-list").replaceChildren();
    try {
      const response = await fetch(`${endpoint}?s=${encodeURIComponent(ref)}&period=${encodeURIComponent(period)}`);
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error("session");
      applyLanguage(data.language === "pt-BR" ? "pt-BR" : "en");
      if (!Array.isArray(data.events)) {
        byId("report-summary").textContent = "Atualizando o relatório desta sessão…";
        return;
      }
      renderEvents(data.events);
    } catch (_) {
      byId("notice").textContent = copy.error;
      byId("report-summary").textContent = "";
    }
  }

  document.querySelectorAll(".period").forEach((button) => {
    button.addEventListener("click", () => {
      period = button.dataset.period || "day";
      document.querySelectorAll(".period").forEach((item) => item.classList.toggle("active", item === button));
      load();
    });
  });
  byId("refresh").addEventListener("click", load);
  load();
})();


