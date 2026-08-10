if (window.location.protocol === "file:") {
  window.location.replace("http://localhost:3000");
}

let offers = [];
let signedInAccount = null;
const escapeHtml = value => String(value).replace(/[&<>"]|'/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]);

const translations = {
  ES: { market: "Mercado", how: "Cómo funciona", sell: "Vender", login: "Iniciar sesión", register: "Crear cuenta", eyebrow: "MERCADO GAMER P2P", headline: "Compra. Vende.<br /><em>Juega tranquilo.</em>", subheadline: "Pagos USDT TRC20 con verificación manual durante la beta. Revisa cada pedido antes de confirmar.", explore: "Explorar ofertas", learn: "Ver cómo funciona <span>→</span>", proof: "con reputación visible", live: "MERCADO EN VIVO", find: "Encuentra lo que buscas", filters: "Filtrar", clear: "Limpiar", product: "Tipo de producto", delivery: "Entrega", protected: "PAGO MANUAL EN BETA", safe: "Así funciona el pago", safeText: "Un proceso manual y claro para compradores y vendedores, desde el pago USDT hasta la entrega.", stepOne: "Elige una oferta", stepOneText: "Compara precios, tiempo de entrega y reputación real del vendedor.", stepTwo: "Envía USDT TRC20", stepTwoText: "Envía el importe indicado y registra el hash para revisión manual.", stepThree: "Confirma y recibe", stepThreeText: "Tras la verificación manual, recibe tu pedido y confirma la entrega." },
  EN: { market: "Marketplace", how: "How it works", sell: "Sell", login: "Log in", register: "Create account", eyebrow: "P2P GAMING MARKET", headline: "Buy. Sell.<br /><em>Play with confidence.</em>", subheadline: "Currency and services from verified players. Your payment stays protected until your order arrives.", explore: "Explore offers", learn: "See how it works <span>→</span>", proof: "with visible reputation", live: "LIVE MARKET", find: "Find what you need", filters: "Filters", clear: "Clear", product: "Product type", delivery: "Delivery", protected: "PROTECTED PURCHASE", safe: "How we keep your purchase safe", safeText: "A clear process for buyers and sellers, from payment through delivery.", stepOne: "Choose an offer", stepOneText: "Compare prices, delivery time and real seller reputation.", stepTwo: "Pay with protection", stepTwoText: "Your payment is held while the seller prepares delivery.", stepThree: "Confirm and receive", stepThreeText: "Receive your order and confirm. Then we release payment to the seller." },
  RU: { market: "Маркет", how: "Как это работает", sell: "Продавать", login: "Войти", register: "Создать аккаунт", eyebrow: "P2P РЫНОК ИГР", headline: "Покупай. Продавай.<br /><em>Играй спокойно.</em>", subheadline: "Валюта и услуги от проверенных игроков. Платёж защищён до получения заказа.", explore: "Смотреть предложения", learn: "Как это работает <span>→</span>", proof: "с видимой репутацией", live: "РЫНОК ОНЛАЙН", find: "Найдите нужное", filters: "Фильтры", clear: "Очистить", product: "Тип товара", delivery: "Доставка", protected: "ЗАЩИЩЁННАЯ ПОКУПКА", safe: "Как мы защищаем покупку", safeText: "Понятный процесс для покупателей и продавцов от оплаты до доставки.", stepOne: "Выберите предложение", stepOneText: "Сравните цены, время доставки и репутацию продавца.", stepTwo: "Оплатите безопасно", stepTwoText: "Ваш платёж удерживается, пока продавец готовит доставку.", stepThree: "Подтвердите получение", stepThreeText: "Получите заказ и подтвердите. Затем платёж будет отправлен продавцу." }
};

let currentGame = "all";
let currentLanguage = "ES";
const offersElement = document.querySelector("#offers");
const searchInput = document.querySelector("#searchInput");
const sortOffers = document.querySelector("#sortOffers");

function renderOffers() {
  const types = [...document.querySelectorAll('input[type="checkbox"]:checked')].map(input => input.value);
  const search = searchInput.value.toLowerCase().trim();
  const filtered = offers.filter(offer => (currentGame === "all" || offer.game === currentGame) && types.includes(offer.type) && `${offer.game} ${offer.title} ${offer.seller}`.toLowerCase().includes(search));
  if (sortOffers.value === "price-asc") filtered.sort((first, second) => Number(first.price) - Number(second.price));
  if (sortOffers.value === "price-desc") filtered.sort((first, second) => Number(second.price) - Number(first.price));
  document.querySelector("#resultCount").textContent = `${filtered.length} ofertas disponibles`;
  offersElement.innerHTML = filtered.length ? filtered.map(offer => `<article class="offer"><div><div class="offer-name">${escapeHtml(offer.title)}</div><div class="offer-game">${escapeHtml(offer.game)} · ${escapeHtml(offer.type)}</div></div><div class="seller">${offer.sellerId ? `<a class="seller-profile-link" href="seller-profile.html?id=${escapeHtml(offer.sellerId)}">${escapeHtml(offer.seller)}</a>` : escapeHtml(offer.seller)}${offer.verified ? '<b class="verified">VERIFICADO</b>' : ''}<span>● ${escapeHtml(offer.rating)}</span></div><div class="delivery">${escapeHtml(offer.delivery)}</div><div class="price">$${Number(offer.price).toFixed(2)}</div>${offer.sellerId ? offer.sellerId === signedInAccount?.id ? '<span class="own-offer">Tu oferta</span>' : `<button class="button buy" data-order="${escapeHtml(offer.id)}" type="button">Solicitar</button>` : '<span class="preview">Oferta de muestra</span>'}</article>`).join("") : '<p style="padding:30px">No hay ofertas con esos filtros.</p>';
}

document.querySelector("#gameTabs").addEventListener("click", event => { const button = event.target.closest("button"); if (!button) return; document.querySelectorAll(".game-tab").forEach(tab => tab.classList.remove("active")); button.classList.add("active"); currentGame = button.dataset.game; renderOffers(); });
document.querySelector(".directory-grid").addEventListener("click", event => { const link = event.target.closest("a"); if (!link) return; const game = link.closest("[data-market-game]").dataset.marketGame; currentGame = game; document.querySelectorAll(".game-tab").forEach(tab => tab.classList.toggle("active", tab.dataset.game === game)); renderOffers(); });
document.querySelector("#allGamesLink").addEventListener("click", () => { currentGame = "all"; document.querySelectorAll(".game-tab").forEach(tab => tab.classList.toggle("active", tab.dataset.game === "all")); renderOffers(); });
document.querySelectorAll('input[type="checkbox"]').forEach(input => input.addEventListener("change", renderOffers));
searchInput.addEventListener("input", renderOffers);
sortOffers.addEventListener("change", renderOffers);
document.querySelector("#resetFilters").addEventListener("click", () => { document.querySelectorAll('input[type="checkbox"]').forEach(input => input.checked = true); searchInput.value = ""; renderOffers(); });
offersElement.addEventListener("click", async event => {
  const button = event.target.closest("[data-order]");
  if (!button) return;
  const response = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offerId: button.dataset.order }) });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401) window.location.href = "account.html";
    else window.alert(result.error);
    return;
  }
  window.location.href = `orders.html?order=${encodeURIComponent(result.id)}`;
});
function setLanguage(language) {
  currentLanguage = language;
  document.querySelector("#languageButton").innerHTML = `${currentLanguage} <span>⌄</span>`;
  document.documentElement.lang = currentLanguage.toLowerCase();
  document.querySelectorAll("[data-i18n]").forEach(element => element.innerHTML = translations[currentLanguage][element.dataset.i18n]);
}

document.querySelector("#languageButton").addEventListener("click", () => {
  const options = document.querySelector("#languageOptions");
  options.hidden = !options.hidden;
  document.querySelector("#languageButton").setAttribute("aria-expanded", String(!options.hidden));
});
document.querySelector("#languageOptions").addEventListener("click", event => {
  const button = event.target.closest("[data-language]");
  if (!button) return;
  setLanguage(button.dataset.language);
  document.querySelector("#languageOptions").hidden = true;
  document.querySelector("#languageButton").setAttribute("aria-expanded", "false");
});
document.addEventListener("click", event => {
  if (!event.target.closest(".language-menu")) document.querySelector("#languageOptions").hidden = true;
});

function loadOffers() {
  return fetch("/api/offers").then(response => response.json()).then(data => { offers = data; renderOffers(); }).catch(() => { offersElement.innerHTML = '<p style="padding:30px">No se pudo conectar con el servidor local.</p>'; });
}

document.querySelector("#offerForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = document.querySelector("#offerStatus");
  const payload = Object.fromEntries(new FormData(form));
  const response = await fetch("/api/offers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const result = await response.json();
  if (!response.ok) {
    status.textContent = result.error;
    return;
  }
  status.textContent = "Oferta publicada. Ya aparece en el mercado como nuevo vendedor.";
  form.reset();
  await loadOffers();
  document.querySelector("#mercado").scrollIntoView({ behavior: "smooth" });
});

async function setupSellerPanel() {
  const form = document.querySelector("#offerForm");
  const identity = document.querySelector("#sellerIdentity");
  identity.className = "seller-identity";
  const response = await fetch("/api/auth/me");
  if (!response.ok) {
    identity.innerHTML = 'Inicia sesión con una cuenta de vendedor para publicar. <a href="account.html">Acceder o crear cuenta</a>';
    form.querySelectorAll("input, select, button").forEach(field => field.disabled = true);
    return;
  }
  const account = await response.json();
  if (!account.emailVerified) {
    identity.innerHTML = 'Verifica tu correo antes de publicar. <a href="verify-email.html">Verificar correo</a>';
    form.querySelectorAll("input, select, button").forEach(field => field.disabled = true);
    return;
  }
  if (account.role !== "seller") {
    identity.classList.add("seller-identity-warning");
    identity.innerHTML = '<span class="seller-identity-icon" aria-hidden="true">!</span><span><strong>Esta cuenta es de comprador.</strong><br />Para publicar ofertas necesitas una cuenta de vendedor.</span><a href="account.html?mode=register&role=seller">Crear cuenta de vendedor</a>';
    form.querySelectorAll("input, select, button").forEach(field => field.disabled = true);
    return;
  }
  identity.textContent = `Publicas como ${account.name}. Tu oferta aparecerá como nuevo vendedor hasta ser verificada.`;
}

async function setupAccountHeader() {
  const response = await fetch("/api/auth/me");
  if (!response.ok) return;
  const account = await response.json();
  signedInAccount = account;
  renderOffers();
  const actions = document.querySelector("#accountActions");
  const notifications = document.createElement("a");
  notifications.className = "header-notifications";
  notifications.href = "orders.html";
  notifications.textContent = "Notificaciones";
  const badge = document.createElement("b");
  notifications.append(" ", badge);
  const profileArea = document.createElement("div");
  profileArea.className = "profile-area";
  const profile = document.createElement("button");
  profile.className = "account-name";
  profile.type = "button";
  profile.textContent = account.name;
  const menu = document.createElement("div");
  menu.className = "profile-dropdown";
  menu.hidden = true;
  [["Mi perfil", "profile.html"], ["Mis pedidos", "orders.html"], ...(account.role === "seller" ? [["Mis ofertas", "seller-dashboard.html"], ["Billetera", "wallet.html"]] : []), ["Crear otra cuenta", "account.html?mode=register"], ...(account.isAdmin ? [["Administración", "admin.html"]] : [])].forEach(([label, href]) => { const link = document.createElement("a"); link.href = href; link.textContent = label; menu.append(link); });
  const logout = document.createElement("button");
  logout.type = "button";
  logout.textContent = "Cerrar sesión";
  logout.addEventListener("click", async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.reload(); });
  menu.append(logout);
  profile.addEventListener("click", () => { menu.hidden = !menu.hidden; });
  profileArea.append(profile, menu);
  actions.replaceChildren(notifications, profileArea);
  const loadHeaderNotifications = async () => { const notificationResponse = await fetch("/api/notifications"); if (!notificationResponse.ok) return; const items = await notificationResponse.json(); badge.textContent = items.length; badge.hidden = items.length === 0; };
  loadHeaderNotifications();
  window.setInterval(loadHeaderNotifications, 15000);
  document.addEventListener("click", event => { if (!event.target.closest(".profile-area")) menu.hidden = true; });
}

setupAccountHeader();
setupSellerPanel();
loadOffers();
