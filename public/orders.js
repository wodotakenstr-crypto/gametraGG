let account;
let orders = [];
let activeOrder;
let reviewOrderId;
let paymentOrderId;
const escapeHtml = value => String(value).replace(/[&<>"]|'/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]);
const paymentReferenceInput = document.querySelector("#paymentTransactionId");
paymentReferenceInput.maxLength = 80;
paymentReferenceInput.removeAttribute("pattern");
paymentReferenceInput.placeholder = "Hash TRC20 o referencia numerica de Binance";
paymentReferenceInput.parentNode.firstChild.textContent = "Hash TRC20 o referencia Binance";

function statusLabel(status) {
  return status === "awaiting_payment" ? "Esperando pago" : status === "payment_submitted" ? "Pago enviado para revisión" : status === "awaiting_settlement" ? "Pago confirmado · esperando conversión" : status === "awaiting_seller" ? "Esperando al vendedor" : status === "delivered" ? "Entrega marcada" : status === "completed" ? "Completado" : status === "disputed" ? "En disputa" : status;
}

function notificationButton(notification) {
  const orderAttribute = notification.orderId ? ` data-notification-order="${escapeHtml(notification.orderId)}"` : "";
  return `<button type="button" data-notification-id="${escapeHtml(notification.id)}"${orderAttribute}>${escapeHtml(notification.text)}<small>${escapeHtml(new Date(notification.createdAt).toLocaleString())}</small></button>`;
}

async function loadNotifications() {
  const response = await fetch("/api/notifications");
  if (!response.ok) return;
  const notifications = await response.json();
  document.querySelector("#notificationCount").textContent = notifications.length;
  const banner = document.querySelector("#notificationBanner");
  banner.hidden = true;
  banner.innerHTML = "";
}

async function showRecentNotifications() {
  const response = await fetch("/api/notifications/recent");
  if (!response.ok) return;
  const notifications = await response.json();
  const dropdown = document.querySelector("#notificationDropdown");
  dropdown.hidden = false;
  dropdown.innerHTML = notifications.length ? notifications.map(notificationButton).join("") : "<p>No tienes notificaciones recientes.</p>";
}

async function loadMessages() {
  if (!activeOrder) return;
  const response = await fetch(`/api/orders/${activeOrder.id}/messages`);
  const messages = await response.json();
  document.querySelector("#messages").innerHTML = messages.map(message => {
    const sender = `<a class="seller-profile-link" href="seller-profile.html?id=${escapeHtml(message.senderId)}">${escapeHtml(message.sender)}</a>`;
    return `<article class="message ${message.senderId === account.id ? "mine" : ""}"><small>${sender}</small>${escapeHtml(message.text)}</article>`;
  }).join("");
}

async function selectOrder(orderId) {
  activeOrder = orders.find(order => order.id === orderId);
  if (!activeOrder) return;
  document.querySelectorAll(".order-card").forEach(card => card.classList.toggle("active", card.dataset.order === orderId));
  const isSeller = activeOrder.sellerId === account.id;
  const remainingMinutes = Math.max(0, Math.ceil((30 * 60 * 1000 - (Date.now() - Date.parse(activeOrder.createdAt))) / 60000));
  const canDispute = !isSeller && ["awaiting_seller", "delivered"].includes(activeOrder.status);
  const disputeAction = canDispute ? `<button class="dispute" id="disputeButton" ${remainingMinutes ? "disabled" : ""}>${remainingMinutes ? `Disputa disponible en ${remainingMinutes} min` : "Abrir disputa"}</button>` : "";
  const confirmAction = !isSeller && activeOrder.status === "delivered" ? '<br /><button class="deliver" id="confirmButton">Confirmar recepción</button><p class="order-hint">Al confirmar, la compra digital queda final. Revisa el pedido antes de continuar.</p>' : "";
  const reviewAction = !isSeller && activeOrder.status === "completed" && !activeOrder.reviewedByBuyer ? '<br /><button class="deliver" id="reviewButton">Dejar reseña</button>' : "";
  const reviewDetail = activeOrder.review ? `<section class="product-summary"><span>RESEÑA DEL COMPRADOR</span><strong>${"★".repeat(activeOrder.review.rating)}${"☆".repeat(5 - activeOrder.review.rating)} · ${escapeHtml(activeOrder.review.buyer)}</strong><small>${escapeHtml(activeOrder.review.comment)}</small></section>` : "";
  const settlementDetail = isSeller && activeOrder.status === "completed" ? `<section class="product-summary"><span>INGRESO ACREDITADO EN BILLETERA</span><strong>+${Number(activeOrder.sellerNetUsdt || 0).toFixed(2)} USDT</strong><small>Venta: ${Number(activeOrder.grossUsdt ?? activeOrder.paymentAmountUsdt ?? activeOrder.amount).toFixed(2)} USDT · Comisión GameTrade: ${Number(activeOrder.commissionUsdt || 0).toFixed(2)} USDT · Tarifa PayPal: ${Number(activeOrder.paypalMerchantFeeUsdt || 0).toFixed(2)} USDT</small></section>` : "";
  const paymentAmount = Number(activeOrder.paymentAmountUsdt ?? activeOrder.amount).toFixed(2);
  const orderCurrency = activeOrder.paymentAmountUsdt != null ? "USDT" : activeOrder.currency || "USD";
  const paypalLabel = activeOrder.paypalEnvironment === "live" ? "PayPal" : "PayPal Sandbox";
  const paymentAction = !isSeller && activeOrder.status === "awaiting_payment" ? `<section class="payment-methods"><div class="payment-methods-heading"><p>ELIGE TU MÉTODO DE PAGO</p><span>${paymentAmount} ${orderCurrency}</span></div>${activeOrder.paypalSandboxAvailable ? `<button class="payment-method payment-method-paypal" id="paypalButton" type="button"><span class="payment-brand payment-brand-paypal">P</span><span class="payment-method-copy"><strong>PayPal</strong><small>Pago protegido · $${activeOrder.paypalBuyerChargeUsd} USD</small></span><span class="payment-method-tag">${activeOrder.paypalEnvironment === "live" ? "SEGURO" : "PRUEBA"}</span><span class="payment-method-arrow">→</span></button>${activeOrder.paypalEnvironment === "live" ? '<button class="payment-method payment-method-paypal" id="cardButton" type="button"><span class="payment-brand payment-brand-paypal">▣</span><span class="payment-method-copy"><strong>Visa / Mastercard</strong><small>Tarjeta procesada por PayPal</small></span><span class="payment-method-tag">TARJETA</span><span class="payment-method-arrow">→</span></button>' : ""}` : ""}${activeOrder.depositAddress ? '<button class="payment-method payment-method-usdt" id="trc20Button" type="button"><span class="payment-brand payment-brand-usdt">₮</span><span class="payment-method-copy"><strong>USDT · TRC20</strong><small>Confirmación manual con hash de red</small></span><span class="payment-method-tag">TRC20</span><span class="payment-method-arrow">→</span></button><button class="payment-method payment-method-usdt" id="binanceButton" type="button"><span class="payment-brand payment-brand-usdt">B</span><span class="payment-method-copy"><strong>Transferencia Binance</strong><small>Envía USDT y registra tu referencia interna</small></span><span class="payment-method-tag">BINANCE</span><span class="payment-method-arrow">→</span></button>' : ""}<small class="payment-methods-note"><strong>Importante:</strong> el total mostrado es el cargo de GameTrade. PayPal, tu banco o emisor de tarjeta pueden aplicar conversión de moneda o cargos adicionales ajenos a GameTrade. La tarifa real de PayPal se descuenta del saldo del vendedor. GameTrade retiene 5% de la venta al vendedor. Las compras digitales son finales tras confirmar recepción. <a href="refunds.html" target="_blank" rel="noopener">Ver política</a>.</small></section>` : "";
  const actionHint = activeOrder.status === "payment_submitted" ? '<p class="order-hint">El hash fue enviado. Administración verificará el pago manualmente antes de avisar al vendedor.</p>' : activeOrder.status === "delivered" ? `<p class="order-hint">${isSeller ? "Esperando que el comprador confirme la recepción." : "Confirma solo si recibiste exactamente lo acordado."}</p>` : activeOrder.status === "completed" ? '<p class="order-hint">Este pedido fue confirmado y completado.</p>' : "";
  const disputeDetail = activeOrder.dispute ? `<p><strong>Motivo de disputa:</strong> ${escapeHtml(activeOrder.dispute.reason)}</p>` : "";
  const productDetail = `<section class="product-summary"><span>PRODUCTO DEL PEDIDO</span><strong>${escapeHtml(activeOrder.productTitle)}</strong><small>${escapeHtml(activeOrder.productGame)} · ${escapeHtml(activeOrder.productType)} · Entrega: ${escapeHtml(activeOrder.productDelivery)}</small></section>`;
  const participant = isSeller ? `Comprador: <a class="seller-profile-link" href="seller-profile.html?id=${escapeHtml(activeOrder.buyerId)}">${escapeHtml(activeOrder.buyer)}</a>` : `Vendedor: <a class="seller-profile-link" href="seller-profile.html?id=${escapeHtml(activeOrder.sellerId)}">${escapeHtml(activeOrder.seller)}</a>`;
  document.querySelector("#orderDetail").innerHTML = `<h2>Pedido ${escapeHtml(activeOrder.id)}</h2>${productDetail}<p>${participant} · ${paymentAmount} ${escapeHtml(orderCurrency)}</p><span class="status">${escapeHtml(statusLabel(activeOrder.status))}</span>${paymentAction}${actionHint}${settlementDetail}${reviewDetail}${disputeDetail}${isSeller && activeOrder.status === "awaiting_seller" ? '<br /><button class="deliver" id="deliverButton">Marcar entrega realizada</button>' : ""}${confirmAction}${reviewAction}${disputeAction}`;
  if (!isSeller && activeOrder.status === "awaiting_payment" && Number(activeOrder.paymentAmountUsdt ?? activeOrder.amount) < Number(activeOrder.paypalMinimumUsd || 5)) {
    document.querySelector("#paypalButton")?.remove();
    document.querySelector("#cardButton")?.remove();
    document.querySelector(".payment-methods-heading")?.insertAdjacentHTML("afterend", `<button class="payment-method payment-method-paypal payment-method-minimum" id="minimumPaypalButton" type="button"><span class="payment-brand payment-brand-paypal">P</span><span class="payment-method-copy"><strong>PayPal</strong><small>Disponible desde ${Number(activeOrder.paypalMinimumUsd || 5).toFixed(2)} USD</small></span><span class="payment-method-tag">MÍNIMO</span><span class="payment-method-arrow">→</span></button><button class="payment-method payment-method-paypal payment-method-minimum" id="minimumCardButton" type="button"><span class="payment-brand payment-brand-paypal">▣</span><span class="payment-method-copy"><strong>Visa / Mastercard</strong><small>Disponible desde ${Number(activeOrder.paypalMinimumUsd || 5).toFixed(2)} USD</small></span><span class="payment-method-tag">MÍNIMO</span><span class="payment-method-arrow">→</span></button>`);
  }
  if (activeOrder.paypalEnvironment !== "live") {
    const paypalTag = document.querySelector("#paypalButton .payment-method-tag");
    if (paypalTag) paypalTag.textContent = "SANDBOX";
  }
  document.querySelector("#binanceButton")?.remove();
  document.querySelector("#messageForm").hidden = false;
  await loadMessages();
  const deliverButton = document.querySelector("#deliverButton");
  if (deliverButton) deliverButton.addEventListener("click", async () => { const response = await fetch(`/api/orders/${activeOrder.id}/deliver`, { method: "POST" }); const result = await response.json(); if (!response.ok) return window.alert(result.error); activeOrder = result; orders = orders.map(order => order.id === result.id ? result : order); selectOrder(result.id); });
  const confirmButton = document.querySelector("#confirmButton");
  if (confirmButton) confirmButton.addEventListener("click", async () => { if (!window.confirm("Confirma solo si recibiste exactamente lo acordado. Esta acción completará el pedido.")) return; const response = await fetch(`/api/orders/${activeOrder.id}/confirm`, { method: "POST" }); const result = await response.json(); if (!response.ok) return window.alert(result.error); activeOrder = result; orders = orders.map(order => order.id === result.id ? result : order); selectOrder(result.id); });
  const trc20Button = document.querySelector("#trc20Button");
  if (trc20Button) trc20Button.addEventListener("click", () => openPaymentDialog(activeOrder, "trc20"));
  const binanceButton = document.querySelector("#binanceButton");
  if (binanceButton) binanceButton.addEventListener("click", () => openPaymentDialog(activeOrder, "binance"));
  const paypalButton = document.querySelector("#paypalButton");
  if (paypalButton) paypalButton.addEventListener("click", () => startPaypalPayment(activeOrder, paypalButton));
  const cardButton = document.querySelector("#cardButton");
  if (cardButton) cardButton.addEventListener("click", () => startPaypalPayment(activeOrder, cardButton, "card"));
  const minimumMessage = `PayPal y tarjeta están disponibles para pedidos desde ${Number(activeOrder.paypalMinimumUsd || 5).toFixed(2)} USD.`;
  document.querySelector("#minimumPaypalButton")?.addEventListener("click", () => window.alert(minimumMessage));
  document.querySelector("#minimumCardButton")?.addEventListener("click", () => window.alert(minimumMessage));
  const reviewButton = document.querySelector("#reviewButton");
  if (reviewButton) reviewButton.addEventListener("click", () => { reviewOrderId = activeOrder.id; resetReviewForm(); document.querySelector("#reviewDialog").showModal(); });
  const disputeButton = document.querySelector("#disputeButton");
  if (disputeButton) disputeButton.addEventListener("click", async () => { const reason = window.prompt("Explica el motivo de la disputa:"); if (!reason) return; const response = await fetch(`/api/orders/${activeOrder.id}/dispute`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) }); const result = await response.json(); if (!response.ok) return window.alert(result.error); activeOrder = result; orders = orders.map(order => order.id === result.id ? result : order); selectOrder(result.id); });
}

async function startPaypalPayment(order, button, method = "paypal") {
  if (button) {
    button.disabled = true;
    button.textContent = "Abriendo PayPal Sandbox...";
  }
  const response = await fetch(`/api/orders/${order.id}/paypal/create`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method }) });
  const result = await response.json();
  if (!response.ok) {
    if (button) { button.disabled = false; button.textContent = "Pagar con PayPal Sandbox"; }
    return window.alert(result.error);
  }
  window.location.assign(result.approvalUrl);
}

async function loadOrders() {
  const response = await fetch("/api/orders");
  orders = await response.json();
  document.querySelector("#orderList").innerHTML = orders.length ? orders.map(order => `<button class="order-card" data-order="${escapeHtml(order.id)}"><strong>${escapeHtml(order.seller)} · ${escapeHtml(order.id)}</strong><span>${Number(order.paymentAmountUsdt ?? order.amount).toFixed(2)} ${escapeHtml(order.paymentAmountUsdt != null ? "USDT" : order.currency || "USD")} · ${escapeHtml(statusLabel(order.status))}</span><span class="order-preview">${escapeHtml(order.lastMessage?.text || order.productTitle)}</span><time>${escapeHtml(new Date(order.lastMessage?.createdAt || order.createdAt).toLocaleDateString())}</time></button>`).join("") : "<p>No tienes pedidos todavía.</p>";
  document.querySelectorAll(".order-card").forEach(card => card.addEventListener("click", () => selectOrder(card.dataset.order)));
  const requestedOrder = new URLSearchParams(window.location.search).get("order");
  if (!orders.length) return;
  const selectedOrderId = orders.some(order => order.id === requestedOrder) ? requestedOrder : orders[0].id;
  await selectOrder(selectedOrderId);
}

document.querySelector("#messageForm").addEventListener("submit", async event => { event.preventDefault(); const input = document.querySelector("#messageInput"); const response = await fetch(`/api/orders/${activeOrder.id}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: input.value }) }); if (response.ok) { input.value = ""; loadMessages(); } });
function openPaymentDialog(order, method) {
  paymentOrderId = order.id;
  document.querySelector("#paymentAmount").textContent = `${Number(order.paymentAmountUsdt ?? order.amount).toFixed(2)} USDT`;
  document.querySelector("#paymentAddress").value = order.depositAddress;
  document.querySelector("#paymentTitle").textContent = method === "binance" ? "Transferencia interna Binance" : "Pago USDT por TRC20";
  paymentReferenceInput.placeholder = method === "binance" ? "Referencia numérica de Binance" : "Hash TRC20 de 64 caracteres";
  document.querySelector("#paymentTransactionId").value = "";
  document.querySelector("#paymentStatus").textContent = "";
  document.querySelector("#paymentDialog").showModal();
}

document.querySelector("#paymentCancel").addEventListener("click", () => document.querySelector("#paymentDialog").close());
document.querySelector("#paymentCancelButton").addEventListener("click", () => document.querySelector("#paymentDialog").close());
document.querySelector("#copyPaymentAddress").addEventListener("click", async () => {
  const address = document.querySelector("#paymentAddress").value;
  try { await navigator.clipboard.writeText(address); document.querySelector("#paymentStatus").textContent = "Dirección copiada."; } catch (_) { document.querySelector("#paymentAddress").select(); document.querySelector("#paymentStatus").textContent = "Copia la dirección manualmente."; }
});
document.querySelector("#paymentForm").addEventListener("submit", async event => {
  event.preventDefault();
  const status = document.querySelector("#paymentStatus");
  const response = await fetch(`/api/orders/${paymentOrderId}/payment`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transactionId: document.querySelector("#paymentTransactionId").value }) });
  const result = await response.json();
  if (!response.ok) { status.textContent = result.error; return; }
  activeOrder = result;
  orders = orders.map(order => order.id === result.id ? result : order);
  document.querySelector("#paymentDialog").close();
  selectOrder(result.id);
});
function resetReviewForm() {
  document.querySelector("#reviewForm").reset();
  document.querySelector("#reviewRating").value = "";
  document.querySelector("#reviewStatus").textContent = "";
  document.querySelector("#ratingLabel").textContent = "Elige de 1 a 5 estrellas";
  document.querySelectorAll("#ratingStars button").forEach(button => button.classList.remove("selected"));
}

function selectRating(rating) {
  document.querySelector("#reviewRating").value = rating;
  document.querySelectorAll("#ratingStars button").forEach(button => button.classList.toggle("selected", Number(button.dataset.rating) <= rating));
  document.querySelector("#ratingLabel").textContent = `${rating} ${rating === 1 ? "estrella" : "estrellas"}`;
}

document.querySelector("#ratingStars").addEventListener("click", event => {
  const star = event.target.closest("[data-rating]");
  if (star) selectRating(Number(star.dataset.rating));
});
document.querySelector("#reviewCancel").addEventListener("click", () => document.querySelector("#reviewDialog").close());
document.querySelector("#reviewCancelButton").addEventListener("click", () => document.querySelector("#reviewDialog").close());
document.querySelector("#reviewForm").addEventListener("submit", async event => {
  event.preventDefault();
  const rating = document.querySelector("#reviewRating").value;
  const comment = document.querySelector("#reviewComment").value.trim();
  const status = document.querySelector("#reviewStatus");
  if (!rating) { status.textContent = "Selecciona de 1 a 5 estrellas."; return; }
  const response = await fetch(`/api/orders/${reviewOrderId}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rating, comment }) });
  const result = await response.json();
  if (!response.ok) { status.textContent = result.error; return; }
  const order = orders.find(item => item.id === reviewOrderId);
  if (order) order.reviewedByBuyer = true;
  document.querySelector("#reviewDialog").close();
  if (activeOrder?.id === reviewOrderId) selectOrder(reviewOrderId);
});
async function openNotification(event) {
  const button = event.target.closest("[data-notification-id]");
  if (!button) return;
  const orderId = button.dataset.notificationOrder;
  if (orderId) await loadOrders();
  if (orderId) await selectOrder(orderId);
  await fetch(`/api/notifications/${button.dataset.notificationId}/read`, { method: "POST" });
  document.querySelector("#notificationDropdown").hidden = true;
  if (orderId) document.querySelector("#orderDetail").scrollIntoView({ behavior: "smooth", block: "start" });
  loadNotifications();
}

document.querySelector("#notificationBanner").addEventListener("click", openNotification);
document.querySelector("#notificationDropdown").addEventListener("click", openNotification);
document.querySelector("#notificationButton").addEventListener("click", async event => {
  event.stopPropagation();
  const dropdown = document.querySelector("#notificationDropdown");
  if (!dropdown.hidden) {
    dropdown.hidden = true;
    return;
  }
  await showRecentNotifications();
});
document.addEventListener("click", event => {
  if (!event.target.closest("#notificationArea")) document.querySelector("#notificationDropdown").hidden = true;
});

fetch("/api/auth/me").then(response => response.ok ? response.json() : Promise.reject()).then(result => { account = result; document.querySelector("#accountName").textContent = `${account.name} · ${account.role === "seller" ? "Vendedor" : "Comprador"}`; loadOrders(); loadNotifications(); window.setInterval(loadNotifications, 8000); window.setInterval(() => { if (activeOrder) selectOrder(activeOrder.id); }, 60000); }).catch(() => window.location.href = "account.html");
