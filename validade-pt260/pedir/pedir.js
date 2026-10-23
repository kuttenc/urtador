(() => {
  const endpoint = "https://suipuquznkksgrkchqrv.supabase.co/functions/v1/validity-group-web-session";
  const ref = new URLSearchParams(location.search).get("s") || "";
  const $ = (id) => document.getElementById(id);
  const state = { items: [] };
  const ignored = /^(lista|pedido|data|peixeiro|refrigerantes|cervejas|destilados|polpas|bebidas|limpeza|itens|para\s+p\d|p\d)$/i;
  const units = [[/\b(fardo|fardos)\b/i,"fardos"],[/\b(caixa|caixas|cx)\b/i,"caixas"],[/\b(pacote|pacotes|pct)\b/i,"pacotes"],[/\b(bandeja|bandejas)\b/i,"bandejas"],[/\b(garrafa|garrafas)\b/i,"garrafas"],[/\b(lata|latas|frasco)\b/i,"unidades"],[/\b(unidade|unidades|un)\b/i,"unidades"]];
  function notice(text, type = "") { $("notice").textContent = text; $("notice").className = `notice ${type}`; }
  function clean(line) { return line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").replace(/\s+/g, " ").trim(); }
  function categoryLine(line) { return /^\d+\.[^\d]+:$/.test(line) || /^(refrigerantes|cervejas|destilados|polpas|limpeza|bebidas|lista)/i.test(line); }
  function splitLines(text) { return text.replace(/\r/g, "").split(/\n|\/\/+/).map(clean).filter(Boolean); }
  function parseLine(line, category) {
    if (ignored.test(line) || /^data\s*:/i.test(line) || categoryLine(line)) return null;
    const match = line.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
    const quantity = match ? match[1].replace(",", ".") : "";
    let name = match ? match[2] : line;
    let unit = "";
    for (const [pattern, value] of units) { if (pattern.test(name)) { unit = value; name = name.replace(pattern, "").replace(/^de\s+/i, ""); break; } }
    name = name.replace(/^de\s+/i, "").replace(/\s+/g, " ").trim();
    if (!name || ignored.test(name)) return null;
    return { quantity, unit, name: name.replace(/^(\w)/, (c) => c.toUpperCase()), category, needs_review: !quantity };
  }
  function parse() {
    const text = $("source").value.trim(); if (!text) return notice("Cole uma lista para o assistente revisar.", "error");
    let category = ""; const items = [];
    splitLines(text).forEach((line) => {
      if (categoryLine(line)) { category = line.replace(/^\d+\.\s*/, "").replace(/:$/, ""); return; }
      const item = parseLine(line, category); if (item) items.push(item);
    });
    state.items = items; render();
    notice(items.length ? `${items.length} item(ns) foram reconhecidos. Revise os campos em amarelo.` : "Não reconheci itens. Escreva um item por linha.", items.length ? "success" : "error");
  }
  function render() {
    const host = $("items"); host.replaceChildren();
    $("review").hidden = !state.items.length; $("count").textContent = `${state.items.length} itens`;
    state.items.forEach((item, index) => {
      const row = document.createElement("article"); row.className = `item${item.needs_review ? " needs-review" : ""}`;
      const quantity = document.createElement("input"); quantity.value = item.quantity; quantity.inputMode = "decimal"; quantity.placeholder = "Qtd"; quantity.setAttribute("aria-label", "Quantidade");
      const unit = document.createElement("select"); ["", "unidades", "caixas", "fardos", "pacotes", "bandejas", "garrafas"].forEach(value => { const option = document.createElement("option"); option.value = value; option.textContent = value || "unidade"; option.selected = value === item.unit; unit.append(option); });
      const name = document.createElement("input"); name.value = item.name; name.placeholder = "Nome do item"; name.setAttribute("aria-label", "Nome do item");
      const remove = document.createElement("button"); remove.className = "remove"; remove.type = "button"; remove.textContent = "×"; remove.title = "Remover item";
      const update = () => { item.quantity = quantity.value.trim(); item.unit = unit.value; item.name = name.value.trim(); item.needs_review = !item.quantity || item.name.length < 2; row.classList.toggle("needs-review", item.needs_review); };
      [quantity, unit, name].forEach(input => input.addEventListener("input", update)); remove.addEventListener("click", () => { state.items.splice(index, 1); render(); });
      row.append(quantity, unit, name, remove); host.append(row);
    });
  }
  function validItems() { return state.items.filter(item => item.name.length >= 2 && item.quantity); }
  function formatOrder() { const target = $("destination").value.trim(); const lines = ["PEDIDO REVISADO · PT260"]; if (target) lines.push(`Destino: ${target}`); validItems().forEach((item, index) => lines.push(`${index + 1}. ${item.quantity}${item.unit ? ` ${item.unit}` : ""} · ${item.name}${item.category ? ` (${item.category})` : ""}`)); return lines.join("\n"); }
  async function copyOrder() { const text = formatOrder(); if (!validItems().length) return notice("Corrija a quantidade dos itens antes de copiar.", "error"); try { await navigator.clipboard.writeText(text); $("send-status").textContent = "Pedido copiado para a área de transferência."; } catch { $("send-status").textContent = text; } }
  async function send() {
    const items = validItems(); if (!items.length || items.length !== state.items.length) { $("send-status").textContent = "Revise todos os itens destacados antes de enviar."; $("send-status").className = "notice error"; return; }
    if (!/^[0-9a-f-]{36}$/i.test(ref)) { $("send-status").textContent = "Abra esta página pelo painel Grupo do aplicativo para enviar ao grupo."; $("send-status").className = "notice error"; return; }
    $("send").disabled = true; $("send-status").textContent = "Enviando pedido revisado…"; $("send-status").className = "notice";
    try { const response = await fetch(endpoint, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ action:"submit_order", session_ref:ref, destination_label:$("destination").value.trim(), source_text:$("source").value.trim(), items }) }); const data = await response.json(); if (!response.ok || !data.ok) throw new Error(data.error || "Falha"); $("send-status").textContent = `${data.item_count} item(ns) enviados ao grupo.`; $("send-status").className = "notice success"; } catch (error) { $("send-status").textContent = "Não foi possível confirmar o envio. Tente novamente."; $("send-status").className = "notice error"; } finally { $("send").disabled = false; }
  }
  $("parse").addEventListener("click", parse); $("clear").addEventListener("click", () => { $("source").value = ""; $("destination").value = ""; state.items = []; render(); notice(""); }); $("copy").addEventListener("click", copyOrder); $("send").addEventListener("click", send);
  $("state").textContent = /^[0-9a-f-]{36}$/i.test(ref) ? "CONECTADO" : "MODO REVISÃO";
})();
