import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from './db.js';

export async function migrate(connectionString) {
  const db = createDatabase(connectionString);
  const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');
  try {
    await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const files = (await fs.readdir(directory)).filter((file) => file.endsWith('.sql')).sort();
    for (const file of files) {
      await db.transaction(async (client) => {
        await client.query('SELECT pg_advisory_xact_lock(87421001)');
        const applied = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
        if (applied.rowCount) return;
        await client.query(await fs.readFile(path.join(directory, file), 'utf8'));
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      });
      console.log(`Applied migration ${file}`);
    }
  } finally {
    await db.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  await migrate(process.env.DATABASE_URL);
}
