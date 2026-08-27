const express = require("express");
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const port = Number(process.env.PORT || 3000);
const buildPath = path.join(__dirname, "client", "dist");
const statePath = path.join(__dirname, "data", "water-state.json");
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

function validState(state) {
  return state && typeof state === "object" && Array.isArray(state.orders) && Array.isArray(state.clients) && Array.isArray(state.inventory) && Array.isArray(state.expenses);
}

function readFileState() {
  try { return JSON.parse(fs.readFileSync(statePath, "utf8")); } catch { return null; }
}

function writeFileState(state) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

async function readState() {
  if (!pool) return readFileState();
  const result = await pool.query("SELECT state FROM water_app_state WHERE id = 1");
  return result.rows[0]?.state || null;
}

async function writeState(state) {
  if (!pool) return writeFileState(state);
  await pool.query("INSERT INTO water_app_state (id, state, updated_at) VALUES (1, $1::jsonb, now()) ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, updated_at = now()", [JSON.stringify(state)]);
}

app.get("/api/water/state", async (request, response, next) => {
  try { response.json(await readState()); } catch (error) { next(error); }
});

app.put("/api/water/state", async (request, response, next) => {
  if (!validState(request.body)) return response.status(400).json({ error: "Estado operativo inválido." });
  try { await writeState(request.body); response.json({ ok: true }); } catch (error) { next(error); }
});

app.patch("/api/water/location", async (request, response, next) => {
  const { latitude, longitude, updatedAt } = request.body || {};
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return response.status(400).json({ error: "Ubicación inválida." });
  try {
    const state = await readState();
    if (!validState(state)) return response.status(404).json({ error: "Estado operativo no inicializado." });
    state.driverLocation = { latitude, longitude, updatedAt: typeof updatedAt === "string" ? updatedAt : new Date().toISOString() };
    await writeState(state);
    response.json({ ok: true });
  } catch (error) { next(error); }
});

app.use(express.static(buildPath));
app.get("/{*splat}", (request, response) => response.sendFile(path.join(buildPath, "index.html")));
app.use((error, request, response, next) => {
  console.error("Error de De la Roca:", error.message);
  response.status(500).json({ error: "No se pudo guardar la información. Intenta nuevamente." });
});

async function start() {
  if (pool) await pool.query("CREATE TABLE IF NOT EXISTS water_app_state (id smallint PRIMARY KEY, state jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())");
  app.listen(port, "0.0.0.0", () => console.log(`De la Roca disponible en el puerto ${port}`));
}

start().catch((error) => { console.error("De la Roca no pudo iniciar:", error.message); process.exit(1); });
