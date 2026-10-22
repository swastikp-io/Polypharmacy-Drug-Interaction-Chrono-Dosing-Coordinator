import Database from 'better-sqlite3';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/server/app.js';
import { initializeSchema } from '../../src/server/db/database.js';
import { seedSyntheticData } from '../../src/server/db/seeds.js';

describe('Pharmacokinetic Conflict Engine API Endpoints', () => {
  let db: Database.Database;
  let app: any;

  const p1Id = 'p1111111-1111-1111-1111-111111111111'; // Eleanor Vance (CKD 3b, Tylenol + Percocet duplicate APAP)
  const p3Id = 'p3333333-3333-3333-3333-333333333333'; // Margaret Chen (Levothyroxine + Calcium Carbonate)

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    initializeSchema(db);
    seedSyntheticData(db);
    app = createApp(db);
  });

  describe('GET /api/interactions/patient/:id', () => {
    it('evaluates Eleanor Vance and identifies duplicate APAP therapy and clinical data gaps', async () => {
      const res = await request(app).get(`/api/interactions/patient/${p1Id}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.patientId).toBe(p1Id);
      expect(res.body.data.engineVersion).toContain('3.0.0');

      // Duplicate acetaminophen therapy must be found
      expect(res.body.data.findings.some((f: any) => f.category === 'duplicate_therapy')).toBe(true);
      expect(res.body.data.duplicateIngredients.length).toBeGreaterThanOrEqual(1);

      // Provider status must report versioned dataset
      expect(res.body.data.providerStatus.isAvailable).toBe(true);
      expect(res.body.data.providerStatus.datasetMetadata.version).toBe('2026.1.0');
    });

    it('evaluates Margaret Chen and detects Levothyroxine + Calcium Carbonate chelation', async () => {
      const res = await request(app).get(`/api/interactions/patient/${p3Id}?explain=true`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify chelation interaction finding
      const levoFinding = res.body.data.findings.find(
        (f: any) => f.ruleId === 'rule-ddi-levothyroxine-calcium-carbonate'
      );
      expect(levoFinding).toBeDefined();
      expect(levoFinding.category).toBe('pharmacokinetic');
      expect(levoFinding.severity).toBe('moderate');
      expect(levoFinding.managementRecommendation).toContain('4 hours');

      // Verify explanation payload when explain=true
      expect(res.body.explanation).toBeDefined();
      expect(res.body.explanation.executiveSummary).toBeDefined();
      expect(res.body.explanation.findingsExplanations.length).toBeGreaterThanOrEqual(1);
      expect(res.body.explanation.llmScaffoldingPrompt).toBeDefined();
      expect(res.body.explanation.llmScaffoldingPrompt.systemPrompt).toContain('Clinical Pharmacotherapy');
    });

    it('returns 404 for unknown patient ID', async () => {
      const res = await request(app).get('/api/interactions/patient/non-existent-patient-999');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('PATIENT_NOT_FOUND');
    });
  });

  describe('POST /api/interactions/analyze', () => {
    it('evaluates ad-hoc synthetic regimen and returns structured findings', async () => {
      const payload = {
        patient: {
          id: 'p-custom',
          name: 'Test Subject',
          dateOfBirth: '1950-01-01',
          gender: 'male',
        },
        medications: [
          {
            id: 'm1',
            brand: 'Eliquis',
            genericName: 'Apixaban',
            activeIngredients: [{ name: 'Apixaban', strength: '5 mg' }],
            status: 'active',
            verificationStatus: 'confirmed',
          },
          {
            id: 'm2',
            brand: 'Aleve',
            genericName: 'Naproxen',
            activeIngredients: [{ name: 'Naproxen', strength: '220 mg' }],
            status: 'active',
            verificationStatus: 'confirmed',
          },
        ],
        labs: [],
        explain: true,
      };

      const res = await request(app).post('/api/interactions/analyze').send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.findings.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.findings[0].ruleId).toBe('rule-ddi-apixaban-naproxen');
      expect(res.body.explanation).toBeDefined();
    });

    it('returns 400 for invalid payload missing required fields', async () => {
      const res = await request(app).post('/api/interactions/analyze').send({});
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_PAYLOAD');
    });
  });

  describe('Provider Status & Simulated Outage Management', () => {
    it('returns provider health status and dataset metadata', async () => {
      const res = await request(app).get('/api/interactions/providers/status');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isAvailable).toBe(true);
      expect(res.body.data.referenceProvider.metadata.version).toBe('2026.1.0');
      expect(res.body.data.evidenceProvider.metadata.version).toBe('2026.1.0');
    });

    it('toggles outage simulation and activates safe provider-unavailable state', async () => {
      // 1. Activate outage
      const toggleRes = await request(app)
        .post('/api/interactions/providers/toggle-outage')
        .send({ active: true });

      expect(toggleRes.status).toBe(200);
      expect(toggleRes.body.data.simulatedOutageActive).toBe(true);

      // 2. Query patient during outage - must trigger safe unavailable state
      const patientRes = await request(app).get(`/api/interactions/patient/${p1Id}`);
      expect(patientRes.status).toBe(200);
      expect(patientRes.body.data.providerStatus.isAvailable).toBe(false);
      expect(patientRes.body.data.clinicalDisclaimer).toContain('PROVIDER OUTAGE NOTICE');
      expect(patientRes.body.data.findings.length).toBe(0);

      // 3. Restore provider
      const restoreRes = await request(app)
        .post('/api/interactions/providers/toggle-outage')
        .send({ active: false });

      expect(restoreRes.status).toBe(200);
      expect(restoreRes.body.data.simulatedOutageActive).toBe(false);

      // 4. Confirm restored
      const afterRestoreRes = await request(app).get(`/api/interactions/patient/${p1Id}`);
      expect(afterRestoreRes.body.data.providerStatus.isAvailable).toBe(true);
    });
  });

  describe('GET /api/interactions/governance/data-sources', () => {
    it('returns production data sources governance and licensing requirements', async () => {
      const res = await request(app).get('/api/interactions/governance/data-sources');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.sources.length).toBeGreaterThanOrEqual(4);

      const rxnorm = res.body.data.sources.find((s: any) => s.sourceName.includes('RxNorm'));
      expect(rxnorm).toBeDefined();
      expect(rxnorm.licensingTerms).toContain('UMLS');

      const fda = res.body.data.sources.find((s: any) => s.sourceName.includes('FDA'));
      expect(fda).toBeDefined();
      expect(fda.licensingTerms).toContain('Public Domain');
    });
  });
});
