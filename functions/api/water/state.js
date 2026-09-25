import { json, readState, validState, writeState } from "../../_shared/state.js";

export async function onRequestGet({ env }) {
  return json(await readState(env.DB));
}

export async function onRequestPut({ request, env }) {
  const incoming = await request.json().catch(() => null);
  if (!validState(incoming)) return json({ error: "Estado operativo inválido." }, 400);

  const current = await readState(env.DB);
  const incomingReset = Date.parse(incoming.dayResetAt || "");
  const currentReset = Date.parse(current?.dayResetAt || "");
  if (validState(current) && Number.isFinite(currentReset) && (!Number.isFinite(incomingReset) || incomingReset < currentReset)) {
    return json({ ok: true, ignored: true });
  }

  if (validState(current) && incoming.dayResetAt === current.dayResetAt) {
    const deletedOrderIds = new Set((current.deletedOrderIds || []).map(String));
    incoming.orders = incoming.orders.filter((order) => !deletedOrderIds.has(String(order.id)));
    incoming.deletedOrderIds = [...deletedOrderIds];
    const incomingOrderIds = new Set(incoming.orders.map((order) => order.id));
    incoming.orders = [
      ...current.orders.filter((order) => !incomingOrderIds.has(order.id)),
      ...incoming.orders
    ];
  }

  await writeState(env.DB, incoming);
  return json({ ok: true });
}
