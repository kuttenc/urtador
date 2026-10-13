(function () {
  const config = window.URTADOR_CONFIG || {};
  const endpoint = `${String(config.supabaseUrl || "").replace(/\/$/, "")}/functions/v1/${config.functionName || "kutt-short-links"}`;
  const storageKey = "urtador-rental-token";
  const state = { token: localStorage.getItem(storageKey) || "", items: [], customer: null };
  const byId = (id) => document.getElementById(id);

  function message(id, text, error = false) {
    const node = byId(id);
    if (!node) return;
    node.textContent = text || "";
    node.classList.toggle("error", Boolean(error));
  }

  async function api(action, data = {}) {
    const headers = { "Content-Type": "application/json" };
    if (config.publishableKey) headers.apikey = config.publishableKey;
    const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify({ action, ...data, ...(state.token ? { rentalToken: state.token } : {}) }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.error) throw new Error(result.error || `Falha na solicitação (${response.status}).`);
    return result;
  }

  function money(cents) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((Number(cents) || 0) / 100);
  }

  function localToday() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  function datePt(value) {
    const [year, month, day] = String(value || "").split("-").map(Number);
    return year && month && day ? new Date(year, month - 1, day).toLocaleDateString("pt-BR") : "—";
  }

  function option(label, value) {
    const node = document.createElement("option");
    node.value = value;
    node.textContent = label;
    return node;
  }

  function renderItems() {
    const host = byId("rental-items");
    const select = byId("rental-item-select");
    host.replaceChildren();
    select.replaceChildren(option("Selecione um item", ""));
    if (!state.items.length) {
      const empty = document.createElement("p"); empty.className = "field-help"; empty.textContent = "Nenhum item está disponível para reserva agora."; host.append(empty);
      return;
    }
    for (const item of state.items) {
      select.append(option(`${item.name} · ${money(item.daily_price_cents)}/dia`, item.id));
      const card = document.createElement("article"); card.className = "rental-item-card";
      const content = document.createElement("div");
      const title = document.createElement("h3"); title.textContent = item.name;
      const description = document.createElement("p"); description.textContent = item.description || "Item disponível para reserva.";
      const price = document.createElement("strong"); price.textContent = `${money(item.daily_price_cents)} por dia`;
      content.append(title, description, price);
      const choose = document.createElement("button"); choose.className = "button secondary small"; choose.type = "button"; choose.textContent = "Escolher";
      choose.addEventListener("click", () => {
        select.value = item.id;
        updateTotal();
        byId("rental-start-date").focus();
      });
      card.append(content, choose); host.append(card);
    }
  }

  function selectedItem() {
    return state.items.find((item) => item.id === byId("rental-item-select").value);
  }

  function updateTotal() {
    const item = selectedItem();
    const start = byId("rental-start-date").value;
    const end = byId("rental-end-date").value;
    const output = byId("rental-total");
    if (!item || !start || !end || end < start) {
      output.textContent = "Escolha o item e as datas para calcular o total.";
      return;
    }
    const days = Math.floor((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1;
    if (!Number.isSafeInteger(days) || days < 1 || days > 366) {
      output.textContent = "O período deve ter de 1 a 366 dias.";
      return;
    }
    output.textContent = `${days} ${days === 1 ? "diária" : "diárias"}: ${money(days * Number(item.daily_price_cents))}`;
  }

  const reservationStatuses = {
    pending: "Aguardando sua aprovação",
    approved: "Aprovada",
    rejected: "Recusada",
    cancelled: "Cancelada",
    completed: "Encerrada"
  };

  async function loadReservations() {
    const host = byId("rental-reservations");
    host.replaceChildren();
    const { reservations } = await api("rental-my-reservations");
    if (!reservations.length) {
      const empty = document.createElement("p"); empty.className = "field-help"; empty.textContent = "Você ainda não enviou pedidos de reserva."; host.append(empty);
      return;
    }
    for (const reservation of reservations) {
      const card = document.createElement("article"); card.className = "rental-reservation-card";
      const heading = document.createElement("div"); heading.className = "rental-reservation-heading";
      const title = document.createElement("h3");
      const item = Array.isArray(reservation.item) ? reservation.item[0] : reservation.item;
      title.textContent = item?.name || "Item para aluguel";
      const status = document.createElement("span"); status.className = `rental-status status-${reservation.status}`; status.textContent = reservationStatuses[reservation.status] || reservation.status;
      heading.append(title, status);
      const period = document.createElement("p"); period.textContent = `${datePt(reservation.start_date)} a ${datePt(reservation.end_date)} · ${reservation.total_days} ${Number(reservation.total_days) === 1 ? "diária" : "diárias"}`;
      const total = document.createElement("strong"); total.textContent = `${money(reservation.total_price_cents)} · pagamento ${reservation.payment_status === "paid" ? "confirmado" : reservation.payment_status === "refunded" ? "estornado" : "a combinar"}`;
      card.append(heading, period, total);
      if (reservation.admin_note) {
        const note = document.createElement("p"); note.className = "rental-admin-note"; note.textContent = `Mensagem: ${reservation.admin_note}`; card.append(note);
      }
      if (reservation.status === "pending") {
        const cancel = document.createElement("button"); cancel.className = "button secondary small"; cancel.type = "button"; cancel.textContent = "Cancelar pedido";
        cancel.addEventListener("click", async () => {
          cancel.disabled = true;
          try {
            await api("rental-cancel-reservation", { rentalReservationId: reservation.id });
            message("rental-booking-message", "Pedido cancelado.");
            await loadReservations();
          } catch (error) { message("rental-booking-message", error.message, true); cancel.disabled = false; }
        });
        card.append(cancel);
      }
      host.append(card);
    }
  }

  async function setSession(result) {
    state.token = result.rentalToken;
    state.customer = result.customer;
    localStorage.setItem(storageKey, state.token);
    byId("rental-auth").hidden = true;
    byId("rental-workspace").hidden = false;
    byId("rental-customer-name").textContent = result.customer.name;
    await loadReservations();
  }

  async function loadItems() {
    try {
      const result = await api("rental-list");
      state.items = result.items || [];
      renderItems();
      message("rental-public-message", state.items.length ? "" : "A disponibilidade será atualizada quando o administrador cadastrar um item.");
    } catch (error) {
      message("rental-public-message", error.message, true);
    }
  }

  byId("rental-login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type=submit]"); button.disabled = true;
    message("rental-login-message", "Entrando…");
    try { await setSession(await api("rental-login", { rentalPhone: byId("rental-login-phone").value, rentalPassword: byId("rental-login-password").value })); }
    catch (error) { message("rental-login-message", error.message, true); }
    finally { button.disabled = false; }
  });

  byId("rental-register-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type=submit]"); button.disabled = true;
    message("rental-register-message", "Criando sua conta…");
    try {
      await setSession(await api("rental-register", {
        rentalName: byId("rental-register-name").value,
        rentalPhone: byId("rental-register-phone").value,
        rentalEmail: byId("rental-register-email").value,
        rentalPassword: byId("rental-register-password").value
      }));
    } catch (error) { message("rental-register-message", error.message, true); }
    finally { button.disabled = false; }
  });

  byId("rental-booking-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = byId("rental-booking-submit"); button.disabled = true;
    message("rental-booking-message", "Enviando seu pedido…");
    try {
      const result = await api("rental-create-reservation", {
        rentalItemId: byId("rental-item-select").value,
        rentalStartDate: byId("rental-start-date").value,
        rentalEndDate: byId("rental-end-date").value,
        rentalCustomerNote: byId("rental-customer-note").value
      });
      message("rental-booking-message", `Pedido enviado e aguardando aprovação. Total: ${money(result.reservation.total_price_cents)}.`);
      byId("rental-customer-note").value = "";
      await loadReservations();
    } catch (error) { message("rental-booking-message", error.message, true); }
    finally { button.disabled = false; }
  });

  byId("rental-logout").addEventListener("click", async () => {
    try { await api("rental-logout"); } catch { /* remove the local credential even if the connection is down */ }
    state.token = ""; state.customer = null; localStorage.removeItem(storageKey);
    byId("rental-workspace").hidden = true; byId("rental-auth").hidden = false;
  });

  byId("rental-refresh").addEventListener("click", loadItems);
  byId("rental-history-refresh").addEventListener("click", () => loadReservations().catch((error) => message("rental-booking-message", error.message, true)));
  for (const id of ["rental-item-select", "rental-start-date", "rental-end-date"]) byId(id).addEventListener("input", updateTotal);
  byId("rental-start-date").min = localToday();
  byId("rental-end-date").min = localToday();
  byId("rental-start-date").addEventListener("change", () => { byId("rental-end-date").min = byId("rental-start-date").value || localToday(); updateTotal(); });

  loadItems();
  if (state.token) {
    api("rental-me").then((result) => setSession(result)).catch(() => {
      state.token = ""; localStorage.removeItem(storageKey);
      message("rental-public-message", "Sua sessão anterior expirou. Entre novamente para ver suas reservas.");
    });
  }
})();
