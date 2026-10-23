(() => {
  const phone = document.querySelector("#profile-phone");
  const copy = document.querySelector("#profile-copy");
  const account = document.querySelector("#profile-account");
  const status = document.querySelector("#profile-status");
  const fail = (message) => {
    phone.textContent = "Sessão não disponível";
    copy.textContent = message;
    status.textContent = "Expirada";
    account.textContent = "—";
  };
  let profile;
  try { profile = JSON.parse(sessionStorage.getItem("rapidao-profile-display") || "null"); } catch { profile = null; }
  if (!profile || !profile.phoneMasked || !profile.expiresAt || new Date(profile.expiresAt).getTime() <= Date.now()) {
    fail("Abra o Rapidao pelo botão no painel Urtador para identificar sua conta.");
    return;
  }
  phone.textContent = profile.phoneMasked;
  copy.textContent = "Identificação recebida da sessão ativa no painel Urtador.";
  account.textContent = `Conta ${Number(profile.accountNumber || 1)}`;
  status.textContent = "Conectada";
})();
