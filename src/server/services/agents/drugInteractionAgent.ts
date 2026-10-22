import { detectDuplicateIngredients, normalizeIngredientName } from '../../../shared/calculations.js';
import type {
  AllergyConflictItem,
  DrugInteractionAgentRequest,
  DrugInteractionAgentResponse,
  IDrugInteractionAgentService,
  InteractionItem,
} from './types.js';

/**
 * Verified pharmacological interaction rule set.
 * Phase 1 uses verified deterministic medical rules.
 * Does not fabricate advice or hallucinate undocumented interactions.
 */
interface KnownInteractionRule {
  ingredientA: string;
  ingredientB: string;
  severity: InteractionItem['severity'];
  mechanism: string;
  clinicalImpact: string;
  managementRecommendation: string;
  evidenceSource: string;
}

const VERIFIED_INTERACTION_RULES: KnownInteractionRule[] = [
  {
    ingredientA: 'apixaban',
    ingredientB: 'naproxen',
    severity: 'major',
    mechanism: 'Additive pharmacodynamic inhibition of hemostasis (Factor Xa inhibition + COX-1 platelet inhibition and gastric mucosal injury).',
    clinicalImpact: 'Significantly elevated risk of major gastrointestinal and systemic hemorrhage in older adults.',
    managementRecommendation: 'Avoid concomitant NSAID therapy if possible. If analgesia is required, evaluate topical agents or non-NSAID alternatives with gastroprotection.',
    evidenceSource: 'FDA Package Insert & Beers Criteria 2023 Update',
  },
  {
    ingredientA: 'oxycodone',
    ingredientB: 'zolpidem',
    severity: 'major',
    mechanism: 'Additive central nervous system and respiratory depression via mu-opioid and GABA-A receptor modulation.',
    clinicalImpact: 'Profound sedation, respiratory depression, coma, and severe nocturnal fall/fracture risk in geriatric patients.',
    managementRecommendation: 'Avoid concurrent prescription of opioids and sedative-hypnotics. Re-evaluate sleep hygiene and tapering.',
    evidenceSource: 'FDA Black Box Warning on Combined CNS Depressants',
  },
  {
    ingredientA: 'lisinopril',
    ingredientB: 'spironolactone',
    severity: 'major',
    mechanism: 'Dual suppression of aldosterone axis leading to impaired renal potassium clearance.',
    clinicalImpact: 'Life-threatening hyperkalemia, cardiac arrhythmias, and acute decline in renal function.',
    managementRecommendation: 'Monitor serum potassium and creatinine within 1–2 weeks of initiation or dose change.',
    evidenceSource: 'AHA/ACC Heart Failure Guidelines',
  },
];

export class DrugInteractionAgentService implements IDrugInteractionAgentService {
  async analyzeInteractions(
    request: DrugInteractionAgentRequest
  ): Promise<DrugInteractionAgentResponse> {
    const { patient, medications, allergies } = request;
    const activeMeds = medications.filter((m) => m.status === 'active' || m.status === 'prn');

    // 1. Duplicate Ingredients
    const duplicateIngredients = detectDuplicateIngredients(activeMeds);

    // 2. Drug-Drug Interactions
    const drugInteractions: InteractionItem[] = [];

    for (let i = 0; i < activeMeds.length; i++) {
      for (let j = i + 1; j < activeMeds.length; j++) {
        const medA = activeMeds[i];
        const medB = activeMeds[j];

        const ingNamesA = (medA.activeIngredients || []).map((ing) =>
          normalizeIngredientName(ing.name)
        );
        if (medA.genericName) ingNamesA.push(normalizeIngredientName(medA.genericName));

        const ingNamesB = (medB.activeIngredients || []).map((ing) =>
          normalizeIngredientName(ing.name)
        );
        if (medB.genericName) ingNamesB.push(normalizeIngredientName(medB.genericName));

        for (const rule of VERIFIED_INTERACTION_RULES) {
          const matchA =
            (ingNamesA.includes(rule.ingredientA) && ingNamesB.includes(rule.ingredientB)) ||
            (ingNamesA.includes(rule.ingredientB) && ingNamesB.includes(rule.ingredientA));

          if (matchA) {
            drugInteractions.push({
              id: `ddi-${medA.id}-${medB.id}`,
              medicationA: {
                id: medA.id,
                brand: medA.brand,
                genericName: medA.genericName,
              },
              medicationB: {
                id: medB.id,
                brand: medB.brand,
                genericName: medB.genericName,
              },
              severity: rule.severity,
              mechanism: rule.mechanism,
              clinicalImpact: rule.clinicalImpact,
              managementRecommendation: rule.managementRecommendation,
              evidenceSource: rule.evidenceSource,
              verificationStatus: 'confirmed',
            });
          }
        }
      }
    }

    // 3. Drug-Allergy Conflicts
    const allergyConflicts: AllergyConflictItem[] = [];
    for (const allergy of allergies) {
      const normalizedAllergen = normalizeIngredientName(allergy.allergen);

      for (const med of activeMeds) {
        const medIngs = (med.activeIngredients || []).map((ing) =>
          normalizeIngredientName(ing.name)
        );
        if (med.genericName) medIngs.push(normalizeIngredientName(med.genericName));
        if (med.brand) medIngs.push(normalizeIngredientName(med.brand));

        const hasConflict = medIngs.some(
          (ing) => ing.includes(normalizedAllergen) || normalizedAllergen.includes(ing)
        );

        if (hasConflict) {
          allergyConflicts.push({
            id: `all-conflict-${med.id}-${allergy.id}`,
            medicationId: med.id,
            medicationName: `${med.brand} (${med.genericName})`,
            allergenId: allergy.id,
            allergenName: allergy.allergen,
            reactionType: allergy.reaction,
            severity: allergy.severity === 'life-threatening' ? 'contraindicated' : 'major',
            clinicalWarning: `Patient has documented allergy to "${allergy.allergen}" (${allergy.reaction}, severity: ${allergy.severity}). Prescribing ${med.brand} presents direct hypersensitivity hazard.`,
          });
        }
      }
    }

    const contraindicatedCount =
      drugInteractions.filter((i) => i.severity === 'contraindicated').length +
      allergyConflicts.filter((a) => a.severity === 'contraindicated').length;
    const majorCount =
      drugInteractions.filter((i) => i.severity === 'major').length +
      allergyConflicts.filter((a) => a.severity === 'major').length;
    const moderateCount = drugInteractions.filter((i) => i.severity === 'moderate').length;

    return {
      patientId: patient.id,
      timestamp: new Date().toISOString(),
      agentVersion: 'Phase-1-Deterministic-Stub-v1.0',
      isPrototype: true,
      duplicateIngredients,
      drugInteractions,
      allergyConflicts,
      summary: {
        totalChecked: activeMeds.length,
        contraindicatedCount,
        majorCount,
        moderateCount,
        duplicateIngredientCount: duplicateIngredients.length,
        allergyConflictCount: allergyConflicts.length,
      },
      clinicalDisclaimer:
        'PROTOTYPE AGENT OUTPUT: Generated using verified clinical rule sets on synthetic data. Not a substitute for professional clinical judgment.',
    };
  }
}
