const { AsyncLocalStorage } = require("async_hooks");
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const STORE_ID = 1;
const LOCK_NAME = "gametrade_app_state";
const emptyState = () => ({ users: [], accounts: [], offers: [], orders: [], messages: [], notifications: [], reviews: [], wallets: [], withdrawals: [], sessions: [] });
const schemaSql = `
  CREATE SCHEMA IF NOT EXISTS gametrade;
  CREATE TABLE IF NOT EXISTS gametrade.app_state (
    id smallint PRIMARY KEY CHECK (id = ${STORE_ID}),
    state jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  );`;

function createPostgresPool(databaseUrl) {
  if (!databaseUrl) throw new Error("DATABASE_URL es obligatorio para PostgreSQL.");
  return new Pool({ connectionString: databaseUrl });
}

async function migrate(pool, initialState) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(schemaSql);
    await client.query(
      "INSERT INTO gametrade.app_state (id, state) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO NOTHING",
      [STORE_ID, JSON.stringify(initialState)]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function createStorage({ databaseUrl, storePath, usePostgres }) {
  const contexts = new AsyncLocalStorage();
  const pool = usePostgres ? createPostgresPool(databaseUrl) : null;

  // A clean checkout has no ignored development store yet. Initialize it so the
  // local API is usable without requiring seed data or a manual setup step.
  if (!pool && !fs.existsSync(storePath)) {
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(storePath, JSON.stringify(emptyState(), null, 2));
  }

  function readStore() {
    if (!pool) return JSON.parse(fs.readFileSync(storePath, "utf8"));
    const context = contexts.getStore();
    if (!context) throw new Error("El almacenamiento PostgreSQL solo está disponible durante una solicitud API.");
    return context.state;
  }

  function writeStore(store) {
    if (!pool) {
      fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
      return;
    }
    const context = contexts.getStore();
    if (!context || context.state !== store) throw new Error("Escritura PostgreSQL fuera de una solicitud API.");
    context.dirty = true;
  }

  async function withRequest(handler) {
    if (!pool) return handler();
    const client = await pool.connect();
    const context = { client, state: null, dirty: false };
    try {
      await client.query("BEGIN");
      // The lock covers the read-modify-write cycle before the state is read.
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [LOCK_NAME]);
      const result = await client.query("SELECT state FROM gametrade.app_state WHERE id = $1 FOR UPDATE", [STORE_ID]);
      if (!result.rowCount) throw new Error("No existe el estado de GameTrade. Ejecuta npm run db:migrate.");
      context.state = result.rows[0].state;
      const value = await contexts.run(context, handler);
      if (context.failed) throw context.failed;
      if (context.dirty) {
        await client.query("UPDATE gametrade.app_state SET state = $1::jsonb, updated_at = now() WHERE id = $2", [JSON.stringify(context.state), STORE_ID]);
      }
      await client.query("COMMIT");
      return value;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch (_) { /* transaction may not have started */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async function verify() {
    if (!pool) return;
    const result = await pool.query("SELECT 1 FROM gametrade.app_state WHERE id = $1", [STORE_ID]);
    if (!result.rowCount) throw new Error("No existe el estado de GameTrade. Ejecuta npm run db:migrate.");
  }

  async function close() {
    if (pool) await pool.end();
  }

  function failRequest(error) {
    const context = contexts.getStore();
    if (context) context.failed = error;
  }

  return { readStore, writeStore, withRequest, failRequest, verify, close };
}

module.exports = { createPostgresPool, createStorage, migrate };
