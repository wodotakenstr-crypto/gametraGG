const money = value => `${Number(value).toFixed(2)} USDT`;
const escapeHtml = value => String(value).replace(/[&<>"']|'/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]);
const withdrawalStatus = status => status === "requested" ? "En revisión" : status === "approved_manual_payout" ? "Pago manual registrado" : status === "rejected" ? "Rechazado y devuelto" : status;

async function loadWallet() {
  const response = await fetch("/api/seller/wallet");
  if (!response.ok) return window.location.href = "account.html";
  const wallet = await response.json();
  document.querySelector("#available").textContent = money(wallet.availableUsdt);
  document.querySelector("#pending").textContent = money(wallet.pendingUsdt);
  document.querySelector("#withdrawalAddress").value = wallet.withdrawalAddress;
  document.querySelector("#credits").innerHTML = wallet.credits.length ? wallet.credits.map(item => `<article><strong>+${money(item.netUsdt)}</strong><span>${escapeHtml(item.productTitle || item.id)} · Venta: ${money(item.grossUsdt)} · Comisión GameTrade: ${money(item.commissionUsdt)} · PayPal: ${money(item.paypalMerchantFeeUsdt)} · ${escapeHtml(new Date(item.creditedAt).toLocaleString())}</span></article>`).join("") : "<p>Aún no hay ingresos acreditados.</p>";
  document.querySelector("#withdrawals").innerHTML = wallet.withdrawals.length ? wallet.withdrawals.map(item => `<article><strong>${money(item.grossCents / 100)}</strong><span>Neto estimado: ${money(item.netCents / 100)} · ${escapeHtml(withdrawalStatus(item.status))} · ${escapeHtml(new Date(item.createdAt).toLocaleString())}</span></article>`).join("") : "<p>Aún no hay retiros.</p>";
}

async function saveWithdrawalAddress() {
  const addressForm = document.querySelector("#addressForm");
  const response = await fetch("/api/seller/wallet/address", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(addressForm))) });
  const result = await response.json();
  document.querySelector("#addressStatus").textContent = response.ok ? "Dirección guardada." : result.error;
  return response.ok;
}

document.querySelector("#addressForm").addEventListener("submit", async event => { event.preventDefault(); await saveWithdrawalAddress(); });
document.querySelector("#withdrawalForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const address = document.querySelector("#withdrawalAddress").value.trim();
  const status = document.querySelector("#withdrawalStatus");
  if (!address) { status.textContent = "Ingresa una dirección TRC20 antes de solicitar el retiro."; return; }
  if (!await saveWithdrawalAddress()) { status.textContent = "Corrige la dirección TRC20 antes de solicitar el retiro."; return; }
  const response = await fetch("/api/seller/wallet/withdrawals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
  const result = await response.json();
  status.textContent = response.ok ? "Solicitud enviada para revisión manual." : result.error;
  if (response.ok) { form.reset(); loadWallet(); }
});
loadWallet();
