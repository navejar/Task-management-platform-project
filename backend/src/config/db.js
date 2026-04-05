const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'taskmanager',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
});

async function waitForDb(maxRetries = 30, delayMs = 5000) {
  for (let i = 1; i <= maxRetries; i++) {
    try {
      await pool.query("SELECT 1");
      console.log("Database is ready");
      return;
    } catch (err) {
      console.log(`DB not ready yet (${i}/${maxRetries}): ${err.message}`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw new Error("Database did not become ready in time");
}

async function startServer() {
  await waitForDb();
  app.listen(5000, () => {
    console.log("Backend listening on port 5000");
  });
}

startServer().catch(err => {
  console.error("Startup failed:", err);
  process.exit(1);
});

module.exports = pool;
