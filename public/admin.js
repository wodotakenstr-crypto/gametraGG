const usd = value => `$${Number(value).toFixed(2)} USD`;
const usdt = value => `${Number(value).toFixed(2)} USDT`;
const money = value => Number(value).toFixed(2);
const escapeHtml = value => String(value).replace(/[&<>"]|'/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]);

function renderList(selector, items, render, empty) {
  document.querySelector(selector).innerHTML = items.length ? items.map(render).join("") : `<div class="empty">${empty}</div>`;
}

function ensureUsersSection() {
  if (document.querySelector("#users")) return;
  const section = document.createElement("section");
  section.className = "admin-section";
  section.innerHTML = '<div class="section-title"><h2>Usuarios registrados</h2><p>Datos privados visibles solo para administración.</p></div><div id="users" class="admin-list"></div>';
  document.querySelector("#metrics").after(section);
}

function ensureSettlementsSection() {
  if (document.querySelector("#paypalSettlements")) return;
  const section = document.createElement("section");
  section.className = "admin-section";
  section.innerHTML = '<div class="section-title"><h2>Liquidaciones PayPal USD → USDT</h2><p>Convierte el USD neto y acredita el USDT real antes de liberar la entrega.</p></div><div id="paypalSettlements" class="admin-list"></div>';
  document.querySelector("#paypalPayments").closest(".admin-section").after(section);
}

async function loadAdmin() {
  const responses = await Promise.all(["/api/admin/summary", "/api/admin/users", "/api/admin/sellers", "/api/admin/disputes", "/api/admin/offers", "/api/admin/payments", "/api/admin/paypal-payments", "/api/admin/paypal-settlements", "/api/admin/withdrawals"].map(url => fetch(url)));
  if (responses.some(response => !response.ok)) return window.location.href = "index.html";
  const [summary, users, sellers, disputes, offers, payments, paypalPayments, paypalSettlements, withdrawals] = await Promise.all(responses.map(response => response.json()));
  document.querySelector("#metrics").innerHTML = [["Ofertas activas", summary.activeOffers], ["Vendedores", summary.sellers], ["Por verificar", summary.pendingVerification], ["Disputas", summary.openDisputes], ["Pedidos completados", summary.completedOrders], ["Comisión GameTrade", usdt(summary.platformCommission)], ["Tarifas PayPal vendedor", usd(summary.paypalMerchantFees)], ["Ganancia GameTrade", usdt(summary.netPlatformEarnings)]].map(([label, value]) => `<article class="metric"><span>${label}</span><strong>${value}</strong></article>`).join("");
  ensureUsersSection();
  ensureSettlementsSection();
  renderList("#users", users, user => `<article class="admin-row"><div><strong>${escapeHtml(user.name)}${user.isAdmin ? " · ADMIN" : ""}</strong><span>${escapeHtml(user.email)} · ${user.role === "seller" ? "Vendedor" : "Comprador"} · correo ${user.emailVerified ? "verificado" : "sin verificar"}${user.role === "seller" ? ` · vendedor ${user.verified ? "verificado" : "nuevo"}${user.foundingSeller ? " · FUNDADOR" : ""}` : ""}</span><span>Ofertas: ${user.offers} · Pedidos: ${user.orders} · Completados: ${user.completedOrders} · Reseñas: ${user.reviews}${user.wallet ? ` · Saldo: ${usdt(user.wallet.availableUsdt)} · Retenido: ${usdt(user.wallet.pendingUsdt)}` : ""}</span></div>${user.role === "seller" ? `<a class="admin-profile-link" href="seller-profile.html?id=${escapeHtml(user.id)}">Ver perfil público</a>` : ""}</article>`, "No hay usuarios registrados.");
  renderList("#sellers", sellers.filter(seller => seller.verificationRequested && !seller.verified), seller => `<article class="admin-row"><div><strong>${escapeHtml(seller.name)}</strong><span>${escapeHtml(seller.email)} · ${Number(seller.offers)} ofertas</span></div><button data-verify="${escapeHtml(seller.id)}">Verificar vendedor</button></article>`, "No hay solicitudes pendientes.");
  renderList("#disputes", disputes, dispute => `<article class="admin-row"><div><strong>${escapeHtml(dispute.id)} · ${money(dispute.amount)}</strong><span>${escapeHtml(dispute.buyer)} vs. ${escapeHtml(dispute.seller)} · ${escapeHtml(dispute.dispute.reason)}</span></div><div class="decision"><input data-refund-hash maxlength="64" placeholder="Hash TRC20 de reembolso" /><span>Para resolver a favor del comprador, primero envía el reembolso y registra su hash TRC20 de 64 caracteres.</span><button data-resolve="${escapeHtml(dispute.id)}" data-decision="buyer">Registrar reembolso y resolver a comprador</button><button data-resolve="${escapeHtml(dispute.id)}" data-decision="seller">Resolver a vendedor y acreditar saldo</button></div></article>`, "No hay disputas abiertas.");
  renderList("#offers", offers, offer => `<article class="admin-row"><div><strong>${escapeHtml(offer.title)}</strong><span>${escapeHtml(offer.seller)} · ${escapeHtml(offer.game)} · ${money(offer.price)} · ${offer.paused ? "Pausada" : "Activa"}</span></div><button class="pause" data-pause="${escapeHtml(offer.id)}">${offer.paused ? "Reanudar" : "Pausar"}</button></article>`, "No hay ofertas.");
  renderList("#payments", payments, payment => `<article class="admin-row"><div><strong>${escapeHtml(payment.id)} · ${Number(payment.paymentAmountUsdt).toFixed(2)} USDT</strong><span>${escapeHtml(payment.buyer)} / ${escapeHtml(payment.seller)} · ${payment.paymentReferenceType === "binance_internal" ? "Referencia Binance interna" : "Hash TRC20"}: ${escapeHtml(payment.paymentTxId)}</span></div><button data-payment="${escapeHtml(payment.id)}">Confirmar pago manual</button></article>`, "No hay pagos pendientes.");
  renderList("#paypalPayments", paypalPayments, payment => `<article class="admin-row"><div><strong>${escapeHtml(payment.id)} · PayPal · ${money(payment.buyerChargeUsd)} USD cobrados</strong><span>${escapeHtml(payment.buyer)} / ${escapeHtml(payment.seller)} · Pedido ${payment.status === "completed" ? "completado" : payment.status} · ${new Date(payment.confirmedAt).toLocaleString()}</span><span>Venta: ${money(payment.saleAmountUsdt)} USDT · Tarifa PayPal pagada por vendedor: ${money(payment.merchantFeeUsd)} USD · Comisión GameTrade: ${money(payment.platformCommissionUsdt)} USDT · Neto vendedor: ${money(payment.sellerNetUsdt)} USDT</span><span>Captura: ${escapeHtml(payment.captureId)}</span></div></article>`, "No hay pagos PayPal confirmados.");
  renderList("#paypalSettlements", paypalSettlements, payment => `<article class="admin-row"><div><strong>${escapeHtml(payment.id)} · USD neto: ${money(payment.netUsd)} USD</strong><span>${escapeHtml(payment.buyer)} / ${escapeHtml(payment.seller)} · Bruto: ${money(payment.grossUsd)} USD · Comisión PayPal: ${money(payment.paypalFeeUsd)} USD</span></div><div class="decision"><input data-converted-usdt type="number" min="0.01" step="0.01" placeholder="USDT recibido" /><input data-settlement-reference maxlength="80" placeholder="Hash TRC20 o referencia Binance" /><button data-settle-paypal="${escapeHtml(payment.id)}">Acreditar liquidación</button></div></article>`, "No hay liquidaciones PayPal pendientes.");
  renderList("#withdrawals", withdrawals, withdrawal => `<article class="admin-row"><div><strong>${escapeHtml(withdrawal.seller)} · ${money(withdrawal.grossCents / 100)} USDT</strong><span>Dirección TRC20: ${escapeHtml(withdrawal.address)} · Neto estimado: ${money(withdrawal.netCents / 100)} USDT</span></div><div class="decision"><input data-payout-hash maxlength="80" placeholder="Hash TRC20 o referencia Binance" /><button data-withdrawal="${escapeHtml(withdrawal.id)}" data-withdrawal-decision="approve">Registrar pago enviado</button><button data-withdrawal="${escapeHtml(withdrawal.id)}" data-withdrawal-decision="reject">Rechazar y devolver</button></div></article>`, "No hay retiros pendientes.");
}

document.addEventListener("click", async event => {
  const verify = event.target.closest("[data-verify]");
  const resolve = event.target.closest("[data-resolve]");
  const pause = event.target.closest("[data-pause]");
  const payment = event.target.closest("[data-payment]");
  const withdrawal = event.target.closest("[data-withdrawal]");
  const settlement = event.target.closest("[data-settle-paypal]");
  if (!(verify || resolve || pause || payment || withdrawal || settlement)) return;
  let response;
  if (verify) response = await fetch(`/api/admin/sellers/${verify.dataset.verify}/verify`, { method: "POST" });
  if (resolve) { const refundTransactionId = resolve.closest(".admin-row").querySelector("[data-refund-hash]")?.value || ""; response = await fetch(`/api/admin/disputes/${resolve.dataset.resolve}/resolve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: resolve.dataset.decision, refundTransactionId }) }); }
  if (pause) response = await fetch(`/api/admin/offers/${pause.dataset.pause}/pause`, { method: "POST" });
  if (payment) response = await fetch(`/api/admin/payments/${payment.dataset.payment}/confirm`, { method: "POST" });
  if (withdrawal) { const transactionId = withdrawal.closest(".admin-row").querySelector("[data-payout-hash]")?.value || ""; response = await fetch(`/api/admin/withdrawals/${withdrawal.dataset.withdrawal}/${withdrawal.dataset.withdrawalDecision}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transactionId }) }); }
  if (settlement) { const row = settlement.closest(".admin-row"); response = await fetch(`/api/admin/paypal-settlements/${settlement.dataset.settlePaypal}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ convertedUsdt: row.querySelector("[data-converted-usdt]")?.value, reference: row.querySelector("[data-settlement-reference]")?.value }) }); }
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    window.alert(result.error || "No se pudo completar la acción.");
    return;
  }
  loadAdmin();
});

loadAdmin();
