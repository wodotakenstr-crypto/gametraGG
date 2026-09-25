import { json, readState, validState, writeState } from "../../_shared/state.js";

export async function onRequestPatch({ request, env }) {
  const { latitude, longitude, updatedAt } = await request.json().catch(() => ({}));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -56 || latitude > -17 || longitude < -76 || longitude > -66) {
    return json({ error: "Solo se aceptan ubicaciones dentro de Chile." }, 400);
  }
  const state = await readState(env.DB);
  if (!validState(state)) return json({ error: "Estado operativo no inicializado." }, 404);
  state.driverLocation = { latitude, longitude, updatedAt: typeof updatedAt === "string" ? updatedAt : new Date().toISOString() };
  await writeState(env.DB, state);
  return json({ ok: true });
}
