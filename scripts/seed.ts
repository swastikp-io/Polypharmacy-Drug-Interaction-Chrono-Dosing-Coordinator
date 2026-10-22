import { createDatabaseConnection } from '../src/server/db/database.js';
import { seedSyntheticData, resetSyntheticDataset } from '../src/server/db/seeds.js';

async function main() {
  const isReset = process.argv.includes('--reset');
  console.log(`[Seed CLI] Initializing database connection...`);
  const db = createDatabaseConnection();

  if (isReset) {
    console.log(`[Seed CLI] Initiating synthetic test dataset reset...`);
    const summary = resetSyntheticDataset(db, 'CONFIRM_RESET_TEST_DATASET');
    console.log(`[Seed CLI] Reset successful:`);
    console.log(`  - Deleted synthetic patients: ${summary.deletedPatientsCount}`);
    console.log(`  - Deleted synthetic medications: ${summary.deletedMedicationsCount}`);
    console.log(`  - Deleted synthetic labs: ${summary.deletedLabsCount}`);
    console.log(`  - Reset timestamp: ${summary.resetAt}`);
  } else {
    console.log(`[Seed CLI] Seeding synthetic clinical data idempotently...`);
    const summary = seedSyntheticData(db);
    console.log(`[Seed CLI] Seed finished:`);
    console.log(`  - Patients seeded this run: ${summary.patientsSeeded}`);
    console.log(`  - Medications seeded this run: ${summary.medicationsSeeded}`);
    console.log(`  - Labs seeded this run: ${summary.labsSeeded}`);
    console.log(`  - Total synthetic patients in DB: ${summary.totalSyntheticPatients}`);
    console.log(`  - Total synthetic medications in DB: ${summary.totalSyntheticMedications}`);
    console.log(`  - Idempotent run (no duplicates created): ${summary.isIdempotentRun ? 'YES' : 'NO'}`);
  }

  db.close();
  console.log(`[Seed CLI] Done.`);
}

main().catch((err) => {
  console.error('[Seed CLI] Fatal error:', err);
  process.exit(1);
});
