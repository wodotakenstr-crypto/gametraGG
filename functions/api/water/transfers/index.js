import { json, readState, validState, writeState } from "../../../_shared/state.js";

export async function onRequestPost({ request, env }) {
  const { order, orderDate } = await request.json().catch(() => ({}));
  if (!order || order.payment !== "Transferencia" || order.id === undefined) return json({ error: "Transferencia inválida." }, 400);
  const state = await readState(env.DB);
  if (!validState(state)) return json({ error: "Estado operativo no inicializado." }, 404);
  const id = String(order.id);
  const transfer = { ...order, status: "Entregado", deliveredAt: new Date().toISOString(), orderDate: orderDate || order.createdAt?.slice(0, 10) || state.activeDate };
  state.orders = state.orders.filter((item) => String(item.id) !== id);
  state.pendingTransfers = [...(state.pendingTransfers || []).filter((item) => String(item.id) !== id), transfer];
  await writeState(env.DB, state);
  return json({ ok: true, transfer });
}
