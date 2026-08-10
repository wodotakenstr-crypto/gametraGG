const { createPostgresPool } = require("../storage");

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL es obligatorio.");
  const pool = createPostgresPool(process.env.DATABASE_URL);
  try {
    const result = await pool.query("SELECT state FROM gametrade.app_state WHERE id = $1", [1]);
    if (!result.rowCount) throw new Error("No existe el estado de GameTrade. Ejecuta npm run db:migrate.");
    process.stdout.write(`${JSON.stringify(result.rows[0].state, null, 2)}\n`);
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error("La exportación falló:", error.message);
  process.exit(1);
});
