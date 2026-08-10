const fs = require("fs");
const path = require("path");
const { createPostgresPool, migrate } = require("../storage");

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL es obligatorio.");
  const importLocal = process.argv.includes("--import-local");
  const initialState = importLocal
    ? JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "store.json"), "utf8"))
    : { users: [], accounts: [], offers: [], orders: [], messages: [], notifications: [], reviews: [], wallets: [], withdrawals: [], sessions: [] };
  const pool = createPostgresPool(process.env.DATABASE_URL);
  try {
    await migrate(pool, initialState);
    console.log(importLocal ? "Migración completada con importación local deliberada. El estado existente no fue sobrescrito." : "Migración completada con estado vacío. El estado existente no fue sobrescrito.");
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error("La migración falló:", error.message);
  process.exit(1);
});
