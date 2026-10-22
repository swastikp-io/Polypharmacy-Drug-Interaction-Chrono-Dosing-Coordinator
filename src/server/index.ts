import { createApp } from './app.js';
import { db } from './db/database.js';
import { seedSyntheticData } from './db/seeds.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

// Seed initial synthetic patient profiles if database is empty
try {
  seedSyntheticData(db);
  console.log('[Database] Synthetic patient profiles verified/seeded successfully.');
} catch (err) {
  console.error('[Database] Failed to seed initial data:', err);
}

const app = createApp(db);

const server = app.listen(PORT, () => {
  console.log(`[Polypharmacy Coordinator Server] running on http://localhost:${PORT}`);
  console.log(`[Prototype Notice] Local-first clinical prototype active. Synthetic data only.`);
});

process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down gracefully...');
  server.close(() => {
    try {
      db.close();
      console.log('[Database] SQLite connection closed.');
    } catch {
      // Ignored
    }
    process.exit(0);
  });
});
