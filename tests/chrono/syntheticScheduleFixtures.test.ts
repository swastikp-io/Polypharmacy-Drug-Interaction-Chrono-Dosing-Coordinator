import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeSchema } from '../../src/server/db/database.js';
import { seedSyntheticData } from '../../src/server/db/seeds.js';
import { PatientRepository } from '../../src/server/repositories/patientRepository.js';
import { MedicationRepository } from '../../src/server/repositories/medicationRepository.js';
import { ChronoRepository } from '../../src/server/repositories/chronoRepository.js';
import { ChronoService } from '../../src/server/services/chrono/chronoService.js';
import { CircadianScheduleCoordinator } from '../../src/server/services/chrono/scheduleCoordinator.js';
import {
  SYNTHETIC_SCHEDULE_FIXTURES,
  getScheduleFixtureById,
} from '../../src/server/fixtures/scheduleFixtures.js';

describe('Synthetic Chrono-Schedule Scenarios (Constraint Handling & Verification)', () => {
  let db: Database.Database;
  let patientRepo: PatientRepository;
  let medRepo: MedicationRepository;
  let chronoRepo: ChronoRepository;
  let chronoService: ChronoService;
  let coordinator: CircadianScheduleCoordinator;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeSchema(db);
    seedSyntheticData(db);

    patientRepo = new PatientRepository(db);
    medRepo = new MedicationRepository(db);
    chronoRepo = new ChronoRepository(db);
    coordinator = new CircadianScheduleCoordinator();
    chronoService = new ChronoService(patientRepo, medRepo, chronoRepo, coordinator);
  });

  it('contains exactly 8 synthetic schedule scenarios covering timing rules and edge cases', () => {
    expect(SYNTHETIC_SCHEDULE_FIXTURES.length).toBe(8);

    const ids = SYNTHETIC_SCHEDULE_FIXTURES.map((s) => s.scenarioId);
    expect(ids).toContain('fix-sched-01-meal-relative');
    expect(ids).toContain('fix-sched-02-morning-and-bedtime');
    expect(ids).toContain('fix-sched-03-validated-minimum-interval');
    expect(ids).toContain('fix-sched-04-incompatible-timing');
    expect(ids).toContain('fix-sched-05-unresolved-food-interaction');
    expect(ids).toContain('fix-sched-06-missing-prescribed-frequency');
    expect(ids).toContain('fix-sched-07-schedule-cannot-be-safely-constructed');
    expect(ids).toContain('fix-sched-08-parkinsonian-protein-separation');
  });

  it('verifies meal-relative instruction: Glipizide anchored with morning breakfast', () => {
    const fixture = getScheduleFixtureById('fix-sched-01-meal-relative')!;
    const patient = patientRepo.findById(fixture.patientId)!;
    const meds = medRepo.findByPatientId(fixture.patientId);

    const schedule = coordinator.generateSchedule({ patient, medications: meds });

    const glipizideDose = schedule.slots
      .flatMap((s) => s.doses)
      .find((d) => d.genericName.toLowerCase().includes('glipizide'));

    expect(glipizideDose).toBeDefined();
    expect(glipizideDose?.slotId).toBe('slot_breakfast');
    expect(glipizideDose?.foodRelation).toBe('with_meal');
  });

  it('verifies circadian placement: Arthur Pendelton diuretic in morning and sedative at bedtime', () => {
    const p2 = patientRepo.findById('p2222222-2222-2222-2222-222222222222')!;
    const meds = medRepo.findByPatientId(p2.id);

    const schedule = coordinator.generateSchedule({ patient: p2, medications: meds });

    const furosemideDose = schedule.slots
      .flatMap((s) => s.doses)
      .find((d) => d.genericName.toLowerCase().includes('furosemide'));

    expect(furosemideDose).toBeDefined();
    expect(furosemideDose?.slotId).toBe('slot_breakfast');

    const zolpidemDose = schedule.slots
      .flatMap((s) => s.doses)
      .find((d) => d.genericName.toLowerCase().includes('zolpidem'));

    expect(zolpidemDose).toBeDefined();
    expect(zolpidemDose?.slotId).toBe('slot_bedtime');
  });

  it('verifies minimum interval separation: Margaret Chen Levothyroxine vs Calcium separation >= 4h', () => {
    const p3 = patientRepo.findById('p3333333-3333-3333-3333-333333333333')!;
    const meds = medRepo.findByPatientId(p3.id);

    const schedule = coordinator.generateSchedule({ patient: p3, medications: meds });

    const levoDose = schedule.slots
      .flatMap((s) => s.doses)
      .find((d) => d.genericName.toLowerCase().includes('levothyroxine'));

    const calciumDose = schedule.slots
      .flatMap((s) => s.doses)
      .find((d) => d.genericName.toLowerCase().includes('calcium'));

    expect(levoDose).toBeDefined();
    expect(calciumDose).toBeDefined();

    expect(levoDose?.slotId).toBe('slot_wake_fasted');
    expect(calciumDose?.slotId).toBe('slot_midday_lunch');

    // 07:00 wake fasted vs 12:30 lunch -> 5.5 hours separation (exceeds 4h required minimum)
    expect(levoDose?.scheduledTime).toBe('07:00');
    expect(calciumDose?.scheduledTime).toBe('12:30');
  });

  it('verifies Parkinsonian protein avoidance: Samuel O Reilly Sinemet placed in fasted slot', () => {
    const p8 = patientRepo.findById('p8888888-8888-8888-8888-888888888888')!;
    const meds = medRepo.findByPatientId(p8.id);

    const schedule = coordinator.generateSchedule({ patient: p8, medications: meds });

    const sinemetDose = schedule.slots
      .flatMap((s) => s.doses)
      .find((d) => d.genericName.toLowerCase().includes('carbidopa'));

    expect(sinemetDose).toBeDefined();
    expect(sinemetDose?.foodRelation).toBe('empty_stomach');
  });
});
