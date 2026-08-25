import { createClient } from 'redis';
import { loadConfig } from './config.js';
import { createDatabase } from './db.js';
import { migrate } from './migrate.js';
import { createApp } from './app.js';
import { createOutboxWorker } from './outbox/outbox.js';
import { createMetaMaintenanceWorker } from './meta/token-maintenance.js';

const config = loadConfig();
await migrate(config.DATABASE_URL);
const db = createDatabase(config.DATABASE_URL);

let redis = null;
if (config.REDIS_URL) {
  redis = createClient({ url: config.REDIS_URL });
  redis.on('error', (err) => console.error('Redis error:', err.message));
  await redis.connect();
}

const app = createApp({ config, db, redis });
const outboxWorker = createOutboxWorker({ db, config });
const metaMaintenanceWorker = createMetaMaintenanceWorker({ db, config });
const server = app.listen(config.PORT, '0.0.0.0', () => {
  console.log(`Control plane listening on port ${config.PORT}`);
});

async function shutdown(signal) {
  console.log(`Received ${signal}; shutting down`);
  outboxWorker.stop();
  metaMaintenanceWorker.stop();
  server.close(async () => {
    if (redis) await redis.quit();
    await db.close();
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
