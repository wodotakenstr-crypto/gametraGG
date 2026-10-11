import { json, readState, validState, writeState } from "../../../../_shared/state.js";

export async function onRequestPost({ params, env }) {
  const state = await readState(env.DB);
  if (!validState(state)) return json({ error: "Estado operativo no inicializado." }, 404);
  const id = String(params.orderId);
  const transfer = (state.pendingTransfers || []).find((item) => String(item.id) === id);
  if (!transfer) return json({ error: "Transferencia pendiente no encontrada." }, 404);

  const order = { ...transfer, status: "Entregado", paymentConfirmedAt: new Date().toISOString() };
  delete order.deliveredAt;
  delete order.orderDate;
  state.orders = [order, ...state.orders.filter((item) => String(item.id) !== id)];
  state.pendingTransfers = (state.pendingTransfers || []).filter((item) => String(item.id) !== id);
  state.confirmedTransferIds = [...new Set([...(state.confirmedTransferIds || []).map(String), id])];
  await writeState(env.DB, state);
  return json({ ok: true, order });
}
