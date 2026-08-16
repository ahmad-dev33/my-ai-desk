import { loadConfig } from './config.js';
import { createDatabase } from './db.js';
import { migrate } from './migrate.js';
import { createApp } from './app.js';

const config = loadConfig();
await migrate(config.DATABASE_URL);
const db = createDatabase(config.DATABASE_URL);
const app = createApp({ config, db });
const server = app.listen(config.PORT, '0.0.0.0', () => {
  console.log(`Control plane listening on port ${config.PORT}`);
});

async function shutdown(signal) {
  console.log(`Received ${signal}; shutting down`);
  server.close(async () => {
    await db.close();
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
