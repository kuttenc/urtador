// Static manual draft builder. Files remain in memory until the operator downloads the JSON.
const MAX_PHOTOS = 5;
const MAX_BYTES = 2_000_000;
const photosInput = document.querySelector("#photos");
const dropZone = document.querySelector("#drop-zone");
const photoPreview = document.querySelector("#photo-preview");
const photoCount = document.querySelector("#photo-count");
const category = document.querySelector("#category");
const customCategoryWrap = document.querySelector("#custom-category-wrap");
const customCategory = document.querySelector("#custom-category");
const status = document.querySelector("#status");
let selectedFiles = [];

function setStatus(message, kind = "") { status.textContent = message; status.className = `status ${kind}`; }
function validImage(file) { return ["image/jpeg", "image/png", "image/webp"].includes(file.type) && file.size <= MAX_BYTES; }
function renderPhotos() {
  photoPreview.replaceChildren(); photoCount.textContent = `${selectedFiles.length} de ${MAX_PHOTOS}`;
  selectedFiles.forEach((file, index) => {
    const box = document.createElement("div"); box.className = "photo";
    const image = document.createElement("img"); image.alt = `Foto ${index + 1}: ${file.name}`; image.src = URL.createObjectURL(file); image.onload = () => URL.revokeObjectURL(image.src);
    const remove = document.createElement("button"); remove.type = "button"; remove.title = "Remover foto"; remove.textContent = "×";
    remove.addEventListener("click", () => { selectedFiles.splice(index, 1); renderPhotos(); });
    box.append(image, remove); photoPreview.append(box);
  });
}
function addFiles(files) {
  const invalid = files.filter(file => !validImage(file)); const available = MAX_PHOTOS - selectedFiles.length;
  selectedFiles.push(...files.filter(validImage).slice(0, available)); renderPhotos();
  if (invalid.length) setStatus("Alguma foto foi ignorada: use JPG, PNG ou WebP com até 2 MB.", "error");
  else if (files.length > available) setStatus(`Foram adicionadas somente ${available} fotos para manter o limite de ${MAX_PHOTOS}.`, "error");
  else setStatus("");
}
function readFile(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve({ name: file.name, type: file.type, dataUrl: reader.result }); reader.onerror = reject; reader.readAsDataURL(file); }); }
function minimumBid(value) { const amount = Number(value.trim().replace(/\./g, "").replace(",", ".")); return Number.isFinite(amount) && amount > 0 ? amount : null; }
function selectedCategory() { return category.value === "Outros" ? customCategory.value.trim() : category.value; }
dropZone.addEventListener("click", () => photosInput.click());
photosInput.addEventListener("change", () => addFiles([...photosInput.files]));
["dragenter", "dragover"].forEach(type => dropZone.addEventListener(type, event => { event.preventDefault(); dropZone.classList.add("dragging"); }));
["dragleave", "drop"].forEach(type => dropZone.addEventListener(type, event => { event.preventDefault(); dropZone.classList.remove("dragging"); }));
dropZone.addEventListener("drop", event => addFiles([...event.dataTransfer.files]));
category.addEventListener("change", () => { const other = category.value === "Outros"; customCategoryWrap.hidden = !other; customCategory.required = other; if (!other) customCategory.value = ""; });
document.querySelector("#clear").addEventListener("click", () => { document.querySelector("#listing-form").reset(); selectedFiles = []; customCategoryWrap.hidden = true; renderPhotos(); setStatus(""); });
document.querySelector("#listing-form").addEventListener("submit", async event => {
  event.preventDefault();
  const name = document.querySelector("#name").value.trim(); const lot = document.querySelector("#lot").value.trim(); const bid = minimumBid(document.querySelector("#minimum-bid").value); const itemCategory = selectedCategory();
  if (!name || !lot || !itemCategory || !bid) return setStatus("Preencha nome, categoria, lote e lance mínimo antes de exportar.", "error");
  if (!selectedFiles.length) return setStatus("Adicione ao menos uma foto do item.", "error");
  try {
    const draft = { version: 1, createdAt: new Date().toISOString(), name, category: itemCategory, lot, description: document.querySelector("#description").value.trim(), condition: document.querySelector("#condition").value, minimumBid: bid, photos: await Promise.all(selectedFiles.map(readFile)) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" })); const link = document.createElement("a"); link.href = url; link.download = `rascunho-${lot.replace(/[^a-z0-9_-]/gi, "-")}.json`; link.click(); URL.revokeObjectURL(url);
    setStatus("Rascunho baixado. Revise os dados antes de publicar o item.", "success");
  } catch { setStatus("Não foi possível preparar as fotos. Tente novamente com arquivos menores.", "error"); }
});
renderPhotos();
