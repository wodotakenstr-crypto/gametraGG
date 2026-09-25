export function validState(state) {
  return state && typeof state === "object" && Array.isArray(state.orders) && Array.isArray(state.clients) && Array.isArray(state.inventory) && Array.isArray(state.expenses);
}

export async function readState(database) {
  await database.prepare("CREATE TABLE IF NOT EXISTS water_app_state (id INTEGER PRIMARY KEY, state TEXT NOT NULL, updated_at TEXT NOT NULL)").run();
  const row = await database.prepare("SELECT state FROM water_app_state WHERE id = 1").first();
  return row?.state ? JSON.parse(row.state) : null;
}

export async function writeState(database, state) {
  await database.prepare("INSERT INTO water_app_state (id, state, updated_at) VALUES (1, ?, datetime('now')) ON CONFLICT(id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at").bind(JSON.stringify(state)).run();
}

export function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
