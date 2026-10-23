(() => {
  const consentKey = "rapidao-consent-v1";
  const dialog = document.querySelector("#consent-dialog");
  const check = document.querySelector("#consent-check");
  const continueButton = document.querySelector("#consent-continue");
  if (!dialog || !check || !continueButton) return;

  const accepted = () => localStorage.getItem(consentKey) === "accepted";
  const openConsent = () => {
    if (!dialog.open) dialog.showModal();
  };

  check.addEventListener("change", () => { continueButton.disabled = !check.checked; });
  dialog.addEventListener("close", () => {
    if (dialog.returnValue === "" && !accepted()) openConsent();
  });
  continueButton.addEventListener("click", () => {
    if (!check.checked) return;
    localStorage.setItem(consentKey, "accepted");
  });
  document.querySelectorAll(".requires-consent").forEach((link) => {
    link.addEventListener("click", (event) => {
      if (!accepted()) {
        event.preventDefault();
        openConsent();
      }
    });
  });
  if (!accepted()) openConsent();
})();
