import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeSchema } from '../../src/server/db/database.js';
import { seedSyntheticData } from '../../src/server/db/seeds.js';
import { ClinicalEngineService } from '../src/services/clinicalEngineService.js';
import { dispatchTool, MCP_TOOLS } from '../src/tools/registry.js';

describe('Phase 7+: Synthetic Dataset MCP Tools Integration', () => {
  let db: Database.Database;
  let engine: ClinicalEngineService;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeSchema(db);
    seedSyntheticData(db);
    engine = ClinicalEngineService.createWithDb(db);
  });

  it('registers all 6 synthetic dataset management and test tools in MCP_TOOLS', () => {
    const toolNames = MCP_TOOLS.map((t) => t.name);
    expect(toolNames).toContain('list_synthetic_patients');
    expect(toolNames).toContain('get_synthetic_medications');
    expect(toolNames).toContain('load_ocr_fixture');
    expect(toolNames).toContain('run_interaction_fixture');
    expect(toolNames).toContain('run_schedule_fixture');
    expect(toolNames).toContain('get_test_results');
  });

  it('executes list_synthetic_patients and returns exactly 8 synthetic profiles', async () => {
    const response = await dispatchTool('list_synthetic_patients', {}, engine);
    expect(response.isError).toBeFalsy();

    const data = JSON.parse(response.content[0].text);
    expect(data.isSyntheticCohort).toBe(true);
    expect(data.totalCount).toBe(8);
    expect(data.patients.length).toBe(8);

    const names = data.patients.map((p: any) => p.name);
    expect(names).toContain('Eleanor Vance');
    expect(names).toContain('Arthur Pendelton');
    expect(names).toContain('Margaret Chen');
    expect(names).toContain('Harold Finch');
    expect(names).toContain('Beatrice Holloway');
    expect(names).toContain('Walter Sterling');
    expect(names).toContain('Evelyn Montgomery');
    expect(names).toContain("Samuel O'Reilly");
  });

  it('executes get_synthetic_medications for Harold Finch and retrieves CKD 4 medication list', async () => {
    const response = await dispatchTool(
      'get_synthetic_medications',
      { patientId: 'p4444444-4444-4444-4444-444444444444' },
      engine
    );
    expect(response.isError).toBeFalsy();

    const data = JSON.parse(response.content[0].text);
    expect(data.isSyntheticRecord).toBe(true);
    expect(data.patientName).toBe('Harold Finch');
    expect(data.medications.length).toBeGreaterThanOrEqual(4);

    const medNames = data.medications.map((m: any) => m.genericName);
    expect(medNames.some((n: string) => n.includes('Metformin'))).toBe(true);
    expect(medNames.some((n: string) => n.includes('Spironolactone'))).toBe(true);
  });

  it('executes load_ocr_fixture and verifies missing dose detection', async () => {
    const response = await dispatchTool(
      'load_ocr_fixture',
      { fixtureId: 'fix-rx-04-missing-dose' },
      engine
    );
    expect(response.isError).toBeFalsy();

    const data = JSON.parse(response.content[0].text);
    expect(data.fixtureId).toBe('fix-rx-04-missing-dose');
    expect(data.candidateCountPassed).toBe(true);
    expect(data.confidencePassed).toBe(true);

    const candidate = data.candidates[0];
    const missingDose = candidate.ambiguities.find((a: any) => a.issueType === 'missing_dose');
    expect(missingDose).toBeDefined();
    expect(missingDose.severity).toBe('critical');
  });

  it('executes run_interaction_fixture for Apixaban + Naproxen major bleed hazard', async () => {
    const response = await dispatchTool(
      'run_interaction_fixture',
      { fixtureId: 'fix-ix-01-verified-apixaban-naproxen' },
      engine
    );
    expect(response.isError).toBeFalsy();

    const data = JSON.parse(response.content[0].text);
    expect(data.assertionsPassed).toBe(true);
    expect(data.matchedRuleCount).toBe(1);
    expect(data.expectedSeverity).toBe('major');
    expect(data.expectedEvidenceLevel).toBe('established_clinical');
  });

  it('executes run_schedule_fixture for meal-relative Glipizide scenario', async () => {
    const response = await dispatchTool(
      'run_schedule_fixture',
      { scenarioId: 'fix-sched-01-meal-relative' },
      engine
    );
    expect(response.isError).toBeFalsy();

    const data = JSON.parse(response.content[0].text);
    expect(data.scenarioId).toBe('fix-sched-01-meal-relative');
    expect(data.totalScheduledDoses).toBeGreaterThan(0);
    expect(data.activeTimeSlots.length).toBeGreaterThan(0);
  });

  it('executes get_test_results and returns aggregated fixture catalogue', async () => {
    const response = await dispatchTool('get_test_results', { category: 'all' }, engine);
    expect(response.isError).toBeFalsy();

    const data = JSON.parse(response.content[0].text);
    expect(data.ocr.totalFixtures).toBe(8);
    expect(data.interaction.totalFixtures).toBe(12);
    expect(data.schedule.totalScenarios).toBe(8);
  });
});
