const parameters = new URLSearchParams(window.location.search);
const orderId = parameters.get("order");
const state = parameters.get("state");
const token = parameters.get("token");
const status = document.querySelector("#status");

async function finishPaypalPayment() {
  if (parameters.has("cancel")) {
    status.textContent = "Cancelaste el pago. Puedes elegir otro método desde tu pedido.";
    return;
  }
  if (!orderId || !state || !token) {
    status.textContent = "El retorno de PayPal no contiene los datos necesarios.";
    return;
  }
  const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/paypal/capture`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state, token }) });
  const result = await response.json();
  if (!response.ok) { status.textContent = result.error || "No se pudo confirmar el pago."; return; }
  status.textContent = "Pago confirmado. Volviendo a tu pedido...";
  window.setTimeout(() => window.location.replace(`orders.html?order=${encodeURIComponent(result.id)}`), 900);
}

finishPaypalPayment();
