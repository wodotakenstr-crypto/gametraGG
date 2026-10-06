import { json, readState, validState, writeState } from "../../../../_shared/state.js";

export async function onRequestPost({ params, env }) {
  const state = await readState(env.DB);
  if (!validState(state)) return json({ error: "Estado operativo no inicializado." }, 404);
  const id = String(params.orderId);
  const transfer = (state.pendingTransfers || []).find((item) => String(item.id) === id);
  if (!transfer) return json({ error: "Transferencia pendiente no encontrada." }, 404);

  const date = transfer.orderDate || transfer.createdAt?.slice(0, 10) || state.activeDate;
  const order = { ...transfer, status: "Entregado", paymentConfirmedAt: new Date().toISOString() };
  delete order.deliveredAt;
  delete order.orderDate;
  const archives = state.dailyArchives || [];
  const archiveIndex = archives.findIndex((archive) => archive.date === date);
  if (archiveIndex >= 0) {
    const archive = archives[archiveIndex];
    if (!archive.orders.some((item) => String(item.id) === id)) archive.orders.push(order);
  } else {
    archives.push({ id: `${date}-${Date.now()}`, date, archivedAt: new Date().toISOString(), orders: [order], expenses: [] });
  }
  state.dailyArchives = archives;
  state.pendingTransfers = (state.pendingTransfers || []).filter((item) => String(item.id) !== id);
  state.confirmedTransferIds = [...new Set([...(state.confirmedTransferIds || []).map(String), id])];
  await writeState(env.DB, state);
  return json({ ok: true, date });
}
