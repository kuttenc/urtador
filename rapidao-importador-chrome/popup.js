// Chrome extension popup: local manual listing drafts only; no external page access.
const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 1_500_000;
const STORAGE_KEY = "rapidaoManualDrafts";
const form = document.querySelector("#listing-form");
const category = document.querySelector("#category");
const customCategoryWrap = document.querySelector("#custom-category-wrap");
const customCategory = document.querySelector("#custom-category");
const photos = document.querySelector("#photos");
const preview = document.querySelector("#photo-preview");
const formStatus = document.querySelector("#form-status");
const savedList = document.querySelector("#saved-list");
function setStatus(message,type=""){formStatus.textContent=message;formStatus.className=`status ${type}`}
function getCategory(){return category.value==="Outros"?customCategory.value.trim():category.value}
function parseCurrency(value){const normalized=value.trim().replace(/\./g,"").replace(",",".");const parsed=Number(normalized);return Number.isFinite(parsed)&&parsed>0?parsed:null}
function asCurrency(value){return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(value)}
function selectedPhotosAreValid(files){if(files.length>MAX_PHOTOS){setStatus(`Escolha no máximo ${MAX_PHOTOS} fotos.`,"error");return false}for(const file of files){if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>MAX_PHOTO_BYTES){setStatus("Cada foto deve ser JPG, PNG ou WebP com até 1,5 MB.","error");return false}}return true}
function renderPhotoPreview(){preview.replaceChildren();const files=[...photos.files];if(!selectedPhotosAreValid(files))return;for(const file of files){const image=document.createElement("img");image.src=URL.createObjectURL(file);image.alt=`Prévia de ${file.name}`;image.onload=()=>URL.revokeObjectURL(image.src);preview.append(image)}}
function fileToDataUrl(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({name:file.name,type:file.type,dataUrl:reader.result});reader.onerror=()=>reject(new Error("Não foi possível ler a foto."));reader.readAsDataURL(file)})}
async function getDrafts(){const stored=await chrome.storage.local.get(STORAGE_KEY);return Array.isArray(stored[STORAGE_KEY])?stored[STORAGE_KEY]:[]}
async function saveDrafts(drafts){await chrome.storage.local.set({[STORAGE_KEY]:drafts})}
function downloadDraft(draft){const blob=new Blob([JSON.stringify(draft,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);chrome.downloads.download({url,filename:`leilao-rapidao-${draft.lot}.json`,saveAs:true},()=>URL.revokeObjectURL(url))}
async function deleteDraft(id){const drafts=await getDrafts();await saveDrafts(drafts.filter(draft=>draft.id!==id));renderDrafts()}
async function renderDrafts(){const drafts=await getDrafts();savedList.replaceChildren();if(!drafts.length){const empty=document.createElement("p");empty.className="empty";empty.textContent="Nenhum rascunho salvo.";savedList.append(empty);return}for(const draft of drafts){const card=document.createElement("article");card.className="card";const title=document.createElement("h3");title.textContent=draft.name;const details=document.createElement("p");details.textContent=`${draft.category} · Lote ${draft.lot} · ${asCurrency(draft.minimumBid)}`;const actions=document.createElement("div");actions.className="actions";const download=document.createElement("button");download.type="button";download.textContent="Baixar JSON";download.addEventListener("click",()=>downloadDraft(draft));const remove=document.createElement("button");remove.type="button";remove.textContent="Apagar";remove.addEventListener("click",()=>deleteDraft(draft.id));actions.append(download,remove);card.append(title,details,actions);savedList.append(card)}}
category.addEventListener("change",()=>{const isOther=category.value==="Outros";customCategoryWrap.hidden=!isOther;customCategory.required=isOther;if(!isOther)customCategory.value=""});photos.addEventListener("change",renderPhotoPreview);
form.addEventListener("submit",async event=>{event.preventDefault();const files=[...photos.files];const selectedCategory=getCategory();const minimumBid=parseCurrency(document.querySelector("#minimum-bid").value);if(!selectedCategory)return setStatus("Escolha ou informe a categoria.","error");if(!minimumBid)return setStatus("Informe um lance mínimo válido.","error");if(!selectedPhotosAreValid(files))return;try{const imageData=await Promise.all(files.map(fileToDataUrl));const drafts=await getDrafts();const draft={id:crypto.randomUUID(),createdAt:new Date().toISOString(),name:document.querySelector("#name").value.trim(),category:selectedCategory,lot:document.querySelector("#lot").value.trim(),description:document.querySelector("#description").value.trim(),minimumBid,photos:imageData};await saveDrafts([draft,...drafts]);form.reset();customCategoryWrap.hidden=true;preview.replaceChildren();setStatus("Rascunho salvo neste navegador.","success");renderDrafts()}catch(error){setStatus("Não foi possível salvar. Reduza o tamanho ou a quantidade das fotos.","error")}});
document.querySelector("#clear-all").addEventListener("click",async()=>{const drafts=await getDrafts();if(!drafts.length||!confirm("Apagar todos os rascunhos deste navegador?"))return;await saveDrafts([]);renderDrafts()});
renderDrafts();
