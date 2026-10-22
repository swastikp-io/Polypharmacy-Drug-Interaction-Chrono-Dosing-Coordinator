import type { DuplicateIngredientGroup, Gender, Medication } from './types.js';

/**
 * Standard dictionary of known synonymous or alternative pharmaceutical ingredient names.
 * Ensures alias resolution without calling external AI.
 */
const INGREDIENT_SYNONYMS: Record<string, string> = {
  paracetamol: 'acetaminophen',
  apap: 'acetaminophen',
  'acetylsalicylic acid': 'aspirin',
  asa: 'aspirin',
  hctz: 'hydrochlorothiazide',
  cholecalciferol: 'vitamin d3',
  ergocalciferol: 'vitamin d2',
  cyanocobalamin: 'vitamin b12',
  'levothyroxine sodium': 'levothyroxine',
};

/**
 * Normalizes an ingredient name for duplicate detection.
 */
export function normalizeIngredientName(name: string): string {
  if (!name) return '';
  const cleaned = name.trim().toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return INGREDIENT_SYNONYMS[cleaned] || cleaned;
}

/**
 * Detects duplicate active ingredients across active/held/PRN medications.
 * Returns groups of duplicate ingredients with clinical rationale and severity.
 */
export function detectDuplicateIngredients(medications: Medication[]): DuplicateIngredientGroup[] {
  // Only evaluate active, PRN, or held medications (ignore discontinued)
  const candidateMeds = medications.filter(
    (m) => m.status === 'active' || m.status === 'prn' || m.status === 'held'
  );

  // Map of normalizedIngredient -> array of medications containing it
  const ingredientMap = new Map<
    string,
    {
      originalName: string;
      medications: Array<{
        id: string;
        brand: string;
        genericName: string;
        strength: string;
        prescribedDose: string;
        frequency: string;
        status: Medication['status'];
        verificationStatus: Medication['verificationStatus'];
        source: string;
      }>;
    }
  >();

  for (const med of candidateMeds) {
    // If activeIngredients is populated, iterate each
    if (Array.isArray(med.activeIngredients) && med.activeIngredients.length > 0) {
      for (const item of med.activeIngredients) {
        if (!item || !item.name) continue;
        const normalized = normalizeIngredientName(item.name);
        if (!normalized) continue;

        if (!ingredientMap.has(normalized)) {
          ingredientMap.set(normalized, {
            originalName: item.name.trim(),
            medications: [],
          });
        }

        const entry = ingredientMap.get(normalized)!;
        // Avoid duplicate med entries if ingredient is listed twice on same med
        if (!entry.medications.some((existing) => existing.id === med.id)) {
          entry.medications.push({
            id: med.id,
            brand: med.brand,
            genericName: med.genericName,
            strength: med.strength,
            prescribedDose: med.prescribedDose,
            frequency: med.frequency,
            status: med.status,
            verificationStatus: med.verificationStatus,
            source: med.source,
          });
        }
      }
    } else if (med.genericName) {
      // Fallback: check generic name if activeIngredients was empty
      const normalized = normalizeIngredientName(med.genericName);
      if (normalized) {
        if (!ingredientMap.has(normalized)) {
          ingredientMap.set(normalized, {
            originalName: med.genericName.trim(),
            medications: [],
          });
        }
        const entry = ingredientMap.get(normalized)!;
        if (!entry.medications.some((existing) => existing.id === med.id)) {
          entry.medications.push({
            id: med.id,
            brand: med.brand,
            genericName: med.genericName,
            strength: med.strength,
            prescribedDose: med.prescribedDose,
            frequency: med.frequency,
            status: med.status,
            verificationStatus: med.verificationStatus,
            source: med.source,
          });
        }
      }
    }
  }

  const duplicates: DuplicateIngredientGroup[] = [];

  for (const [normalized, group] of ingredientMap.entries()) {
    if (group.medications.length > 1) {
      const isHighRisk = [
        'acetaminophen',
        'aspirin',
        'ibuprofen',
        'naproxen',
        'oxycodone',
        'hydrocodone',
        'tramadol',
        'warfarin',
        'apixaban',
        'metformin',
        'digoxin',
        'potassium',
      ].includes(normalized);

      let clinicalRationale = `Patient is co-prescribed ${group.medications.length} products containing "${group.originalName}". In older adults, unintentional duplicate ingredient ingestion creates severe risk of cumulative toxicity or overdose.`;
      if (normalized === 'acetaminophen') {
        clinicalRationale += ` (Black Box / Hepatotoxicity Alert: Cumulative daily dose must not exceed 2,000–3,000 mg in older adults).`;
      } else if (['ibuprofen', 'naproxen', 'aspirin'].includes(normalized)) {
        clinicalRationale += ` (NSAID Alert: Increased risk of acute gastrointestinal bleed and precipitous decline in renal clearance).`;
      }

      duplicates.push({
        ingredientName: group.originalName,
        normalizedName: normalized,
        medications: group.medications,
        totalMedicationCount: group.medications.length,
        severity: isHighRisk ? 'high' : 'moderate',
        clinicalRationale,
      });
    }
  }

  // Sort high severity first, then by count descending
  return duplicates.sort((a, b) => {
    if (a.severity === 'high' && b.severity !== 'high') return -1;
    if (b.severity === 'high' && a.severity !== 'high') return 1;
    return b.totalMedicationCount - a.totalMedicationCount;
  });
}

/**
 * Calculates patient age from ISO date of birth (YYYY-MM-DD).
 */
export function calculateAge(dateOfBirth: string, referenceDate: Date = new Date()): number {
  const dob = new Date(dateOfBirth);
  if (isNaN(dob.getTime())) return 0;

  let age = referenceDate.getFullYear() - dob.getFullYear();
  const m = referenceDate.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && referenceDate.getDate() < dob.getDate())) {
    age--;
  }
  return Math.max(0, age);
}

/**
 * Calculates estimated Creatinine Clearance (Cockcroft-Gault equation in mL/min).
 * Formula: ((140 - age) * weightKg) / (72 * serumCreatinineMgDl) * (gender === 'female' ? 0.85 : 1.0)
 */
export function calculateCockcroftGaultCrCl(params: {
  age: number;
  weightKg: number | null;
  serumCreatinineMgDl: number | null;
  gender: Gender;
}): number | null {
  const { age, weightKg, serumCreatinineMgDl, gender } = params;
  if (!weightKg || !serumCreatinineMgDl || serumCreatinineMgDl <= 0 || age <= 0) {
    return null; // Keep unknown if values missing
  }

  const baseCrCl = ((140 - age) * weightKg) / (72 * serumCreatinineMgDl);
  const factor = gender === 'female' ? 0.85 : 1.0;
  return Math.round(baseCrCl * factor * 10) / 10;
}

/**
 * Classifies eGFR into KDIGO Chronic Kidney Disease stages.
 */
export function classifyEGFR(egfr: number | null): {
  stage: string;
  severity: 'normal' | 'mild' | 'moderate' | 'severe' | 'kidney_failure' | 'unknown';
  clinicalInterpretation: string;
} {
  if (egfr === null || isNaN(egfr)) {
    return {
      stage: 'Unknown',
      severity: 'unknown',
      clinicalInterpretation: 'Renal function measurement not yet recorded or verified.',
    };
  }

  if (egfr >= 90) {
    return {
      stage: 'Stage 1',
      severity: 'normal',
      clinicalInterpretation: 'Normal or high renal clearance (eGFR >= 90 mL/min/1.73m²)',
    };
  }
  if (egfr >= 60) {
    return {
      stage: 'Stage 2',
      severity: 'mild',
      clinicalInterpretation: 'Mildly decreased renal clearance (eGFR 60–89 mL/min/1.73m²)',
    };
  }
  if (egfr >= 45) {
    return {
      stage: 'Stage 3a',
      severity: 'moderate',
      clinicalInterpretation: 'Mild to moderately decreased clearance (eGFR 45–59 mL/min/1.73m²)',
    };
  }
  if (egfr >= 30) {
    return {
      stage: 'Stage 3b',
      severity: 'moderate',
      clinicalInterpretation: 'Moderately to severely decreased clearance (eGFR 30–44 mL/min/1.73m²). Dose adjustments likely.',
    };
  }
  if (egfr >= 15) {
    return {
      stage: 'Stage 4',
      severity: 'severe',
      clinicalInterpretation: 'Severely decreased clearance (eGFR 15–29 mL/min/1.73m²). High drug accumulation hazard.',
    };
  }
  return {
    stage: 'Stage 5',
    severity: 'kidney_failure',
    clinicalInterpretation: 'Kidney failure (eGFR < 15 mL/min/1.73m²). Contraindicated or nephrology review needed.',
  };
}

/**
 * Computes list of modified field keys between previous and new object states.
 */
export function computeChangedFields(
  prev: Record<string, any> | null,
  next: Record<string, any> | null
): string[] {
  if (!prev && !next) return [];
  if (!prev) return Object.keys(next || {});
  if (!next) return Object.keys(prev || {});

  const allKeys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  const changed: string[] = [];

  for (const key of allKeys) {
    if (key === 'updatedAt' || key === 'createdAt') continue;
    const valA = JSON.stringify(prev[key]);
    const valB = JSON.stringify(next[key]);
    if (valA !== valB) {
      changed.push(key);
    }
  }

  return changed;
}
