import { json, readState, validState, writeState } from "../../../_shared/state.js";

export async function onRequestDelete({ params, env }) {
  const state = await readState(env.DB);
  if (!validState(state)) return json({ error: "Estado operativo no inicializado." }, 404);
  const orderId = String(params.orderId);
  state.orders = state.orders.filter((order) => String(order.id) !== orderId);
  state.deletedOrderIds = [...new Set([...(state.deletedOrderIds || []).map(String), orderId])];
  await writeState(env.DB, state);
  return json({ ok: true });
}
