let account;
const escapeHtml = value => String(value).replace(/[&<>"]|'/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]);

async function loadOffers() {
  const response = await fetch("/api/seller/offers");
  const offers = await response.json();
  const container = document.querySelector("#sellerOffers");
  container.innerHTML = offers.length ? offers.map(offer => `<form class="offer-manager ${offer.paused ? "paused" : ""}" data-offer="${escapeHtml(offer.id)}"><label>Oferta<input name="title" value="${escapeHtml(offer.title)}" required /></label><label>Precio USD<input name="price" type="number" min="0.01" step="0.01" value="${Number(offer.price)}" required /></label><label>Entrega<input name="delivery" value="${escapeHtml(offer.delivery)}" required /></label><div class="offer-actions"><button type="submit">Guardar</button><button type="button" data-pause>${offer.paused ? "Reanudar" : "Pausar"}</button><button type="button" data-delete>Eliminar</button></div></form>`).join("") : '<div class="empty">Aún no has publicado ofertas. Crea la primera para aparecer en el mercado.</div>';
}

document.querySelector("#sellerOffers").addEventListener("submit", async event => {
  const form = event.target.closest("form[data-offer]");
  if (!form) return;
  event.preventDefault();
  const response = await fetch(`/api/offers/${form.dataset.offer}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
  if (!response.ok) return window.alert((await response.json()).error);
  loadOffers();
});

document.querySelector("#sellerOffers").addEventListener("click", async event => {
  const form = event.target.closest("form[data-offer]");
  if (!form) return;
  if (event.target.closest("[data-pause]")) { await fetch(`/api/offers/${form.dataset.offer}/pause`, { method: "POST" }); loadOffers(); }
  if (event.target.closest("[data-delete]")) { if (!window.confirm("¿Eliminar esta oferta?")) return; const response = await fetch(`/api/offers/${form.dataset.offer}`, { method: "DELETE" }); if (!response.ok) return window.alert((await response.json()).error); loadOffers(); }
});

async function setup() {
  const response = await fetch("/api/auth/me");
  if (!response.ok) return window.location.href = "account.html";
  account = await response.json();
  if (account.role !== "seller") return window.location.href = "index.html";
  document.querySelector("#sellerName").textContent = account.name;
  const walletResponse = await fetch("/api/seller/wallet");
  if (walletResponse.ok) {
    const wallet = await walletResponse.json();
    document.querySelector("#walletSummary").innerHTML = `<span>Saldo disponible</span><strong>${Number(wallet.availableUsdt).toFixed(2)} USDT</strong><small>${Number(wallet.pendingUsdt).toFixed(2)} USDT retenidos · Ver billetera</small>`;
  }
  document.querySelector("#verification").innerHTML = account.verified ? "<span>Vendedor verificado</span>" : account.verificationRequested ? "<span>Solicitud de verificación enviada</span>" : '<button id="verificationButton" type="button">Solicitar verificación</button>';
  const button = document.querySelector("#verificationButton");
  if (button) button.addEventListener("click", async () => { await fetch("/api/seller/verification", { method: "POST" }); setup(); });
  loadOffers();
}

setup();
