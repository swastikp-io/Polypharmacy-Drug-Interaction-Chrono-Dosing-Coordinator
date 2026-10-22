import type { ActiveIngredient } from '../../../shared/types.js';
import type { IDrugTerminologyProvider, TerminologyMatch } from '../../../shared/ocrTypes.js';
import { normalizeIngredientName } from '../../../shared/calculations.js';

interface TerminologyEntry {
  conceptId: string;
  brandName?: string;
  genericName: string;
  activeIngredients: ActiveIngredient[];
  saltForm: string | null;
  standardStrength: string;
  dosageForm: string;
  releaseFormulation?: string;
  synonyms: string[];
}

/**
 * Standard Geriatric & Polypharmacy Clinical Formulary / Terminology Database.
 * Emulates RxNorm clinical drug concepts with brand/generic mappings,
 * explicit salt forms, and standard dosages.
 */
const CLINICAL_TERMINOLOGY_DATABASE: TerminologyEntry[] = [
  {
    conceptId: 'RXNORM-316049',
    brandName: 'Tylenol Extra Strength',
    genericName: 'Acetaminophen',
    activeIngredients: [{ name: 'Acetaminophen', strength: '500 mg' }],
    saltForm: null,
    standardStrength: '500 mg',
    dosageForm: 'Oral Tablet',
    synonyms: ['tylenol', 'paracetamol', 'apap', 'acetaminophen 500mg'],
  },
  {
    conceptId: 'RXNORM-1049221',
    brandName: 'Percocet 5/325',
    genericName: 'Oxycodone Hydrochloride and Acetaminophen',
    activeIngredients: [
      { name: 'Oxycodone', strength: '5 mg' },
      { name: 'Acetaminophen', strength: '325 mg' },
    ],
    saltForm: 'Hydrochloride',
    standardStrength: '5 mg / 325 mg',
    dosageForm: 'Oral Tablet',
    synonyms: ['percocet', 'oxycodone apap', 'oxycodone acetaminophen'],
  },
  {
    conceptId: 'RXNORM-860975',
    brandName: 'Glucophage XR',
    genericName: 'Metformin Hydrochloride',
    activeIngredients: [{ name: 'Metformin', strength: '500 mg' }],
    saltForm: 'Hydrochloride',
    standardStrength: '500 mg',
    dosageForm: 'Extended-Release Tablet',
    releaseFormulation: 'Extended Release (XR)',
    synonyms: ['glucophage', 'metformin', 'metformin hcl', 'metformin er', 'metformin xr'],
  },
  {
    conceptId: 'RXNORM-860976',
    brandName: 'Glucophage',
    genericName: 'Metformin Hydrochloride',
    activeIngredients: [{ name: 'Metformin', strength: '500 mg' }],
    saltForm: 'Hydrochloride',
    standardStrength: '500 mg',
    dosageForm: 'Oral Tablet',
    releaseFormulation: 'Immediate Release (IR)',
    synonyms: ['metformin ir', 'metformin regular'],
  },
  {
    conceptId: 'RXNORM-29046',
    brandName: 'Prinivil',
    genericName: 'Lisinopril',
    activeIngredients: [{ name: 'Lisinopril', strength: '10 mg' }],
    saltForm: 'Dihydrate',
    standardStrength: '10 mg',
    dosageForm: 'Oral Tablet',
    synonyms: ['zestril', 'lisinopril', 'prinivil'],
  },
  {
    conceptId: 'RXNORM-197361',
    brandName: 'Norvasc',
    genericName: 'Amlodipine Besylate',
    activeIngredients: [{ name: 'Amlodipine', strength: '5 mg' }],
    saltForm: 'Besylate',
    standardStrength: '5 mg',
    dosageForm: 'Oral Tablet',
    synonyms: ['norvasc', 'amlodipine', 'amlodipine besylate'],
  },
  {
    conceptId: 'RXNORM-153665',
    brandName: 'Lipitor',
    genericName: 'Atorvastatin Calcium',
    activeIngredients: [{ name: 'Atorvastatin', strength: '20 mg' }],
    saltForm: 'Calcium Trihydrate',
    standardStrength: '20 mg',
    dosageForm: 'Oral Tablet',
    synonyms: ['lipitor', 'atorvastatin', 'atorvastatin calcium'],
  },
  {
    conceptId: 'RXNORM-1364430',
    brandName: 'Eliquis',
    genericName: 'Apixaban',
    activeIngredients: [{ name: 'Apixaban', strength: '5 mg' }],
    saltForm: null,
    standardStrength: '5 mg',
    dosageForm: 'Oral Tablet',
    synonyms: ['eliquis', 'apixaban'],
  },
  {
    conceptId: 'RXNORM-866411',
    brandName: 'Lopressor',
    genericName: 'Metoprolol Tartrate',
    activeIngredients: [{ name: 'Metoprolol', strength: '25 mg' }],
    saltForm: 'Tartrate',
    standardStrength: '25 mg',
    dosageForm: 'Oral Tablet',
    releaseFormulation: 'Immediate Release (IR)',
    synonyms: ['lopressor', 'metoprolol tartrate', 'metoprolol'],
  },
  {
    conceptId: 'RXNORM-866412',
    brandName: 'Toprol-XL',
    genericName: 'Metoprolol Succinate',
    activeIngredients: [{ name: 'Metoprolol', strength: '25 mg' }],
    saltForm: 'Succinate',
    standardStrength: '25 mg',
    dosageForm: 'Extended-Release Tablet',
    releaseFormulation: 'Extended Release (XL)',
    synonyms: ['toprol', 'toprol xl', 'metoprolol succinate', 'metoprolol er'],
  },
  {
    conceptId: 'RXNORM-202978',
    brandName: 'Lasix',
    genericName: 'Furosemide',
    activeIngredients: [{ name: 'Furosemide', strength: '40 mg' }],
    saltForm: null,
    standardStrength: '40 mg',
    dosageForm: 'Oral Tablet',
    synonyms: ['lasix', 'furosemide'],
  },
  {
    conceptId: 'RXNORM-60206',
    brandName: 'Ambien',
    genericName: 'Zolpidem Tartrate',
    activeIngredients: [{ name: 'Zolpidem', strength: '5 mg' }],
    saltForm: 'Tartrate',
    standardStrength: '5 mg',
    dosageForm: 'Oral Tablet',
    synonyms: ['ambien', 'zolpidem', 'zolpidem tartrate'],
  },
  {
    conceptId: 'RXNORM-966224',
    brandName: 'Synthroid',
    genericName: 'Levothyroxine Sodium',
    activeIngredients: [{ name: 'Levothyroxine', strength: '75 mcg' }],
    saltForm: 'Sodium',
    standardStrength: '75 mcg (0.075 mg)',
    dosageForm: 'Oral Tablet',
    synonyms: ['synthroid', 'levothyroxine', 'levoxyl', 'tirosint', 'l-thyroxine'],
  },
  {
    conceptId: 'RXNORM-213469',
    brandName: 'Caltrate 600+D3',
    genericName: 'Calcium Carbonate and Cholecalciferol',
    activeIngredients: [
      { name: 'Calcium Carbonate', strength: '600 mg elemental' },
      { name: 'Vitamin D3', strength: '800 IU' },
    ],
    saltForm: 'Carbonate',
    standardStrength: '600 mg / 800 IU',
    dosageForm: 'Oral Tablet',
    synonyms: ['caltrate', 'calcium carbonate', 'calcium with d'],
  },
  {
    conceptId: 'RXNORM-312940',
    brandName: 'Zoloft',
    genericName: 'Sertraline Hydrochloride',
    activeIngredients: [{ name: 'Sertraline', strength: '50 mg' }],
    saltForm: 'Hydrochloride',
    standardStrength: '50 mg',
    dosageForm: 'Oral Tablet',
    synonyms: ['zoloft', 'sertraline', 'sertraline hcl'],
  },
  {
    conceptId: 'RXNORM-203597',
    brandName: 'Celebrex',
    genericName: 'Celecoxib',
    activeIngredients: [{ name: 'Celecoxib', strength: '100 mg' }],
    saltForm: null,
    standardStrength: '100 mg',
    dosageForm: 'Oral Capsule',
    synonyms: ['celebrex', 'celecoxib'],
  },
  {
    conceptId: 'RXNORM-2556',
    brandName: 'Celexa',
    genericName: 'Citalopram Hydrobromide',
    activeIngredients: [{ name: 'Citalopram', strength: '20 mg' }],
    saltForm: 'Hydrobromide',
    standardStrength: '20 mg',
    dosageForm: 'Oral Tablet',
    synonyms: ['celexa', 'citalopram', 'citalopram hbr'],
  },
  {
    conceptId: 'RXNORM-20352',
    brandName: 'Zyprexa',
    genericName: 'Olanzapine',
    activeIngredients: [{ name: 'Olanzapine', strength: '5 mg' }],
    saltForm: null,
    standardStrength: '5 mg',
    dosageForm: 'Oral Tablet',
    synonyms: ['zyprexa', 'olanzapine'],
  },
  {
    conceptId: 'RXNORM-310965',
    brandName: 'Hydroxyzine Pamoate',
    genericName: 'Hydroxyzine Pamoate',
    activeIngredients: [{ name: 'Hydroxyzine', strength: '25 mg' }],
    saltForm: 'Pamoate',
    standardStrength: '25 mg',
    dosageForm: 'Oral Capsule',
    synonyms: ['vistaril', 'hydroxyzine'],
  },
  {
    conceptId: 'RXNORM-310966',
    brandName: 'Apresoline',
    genericName: 'Hydralazine Hydrochloride',
    activeIngredients: [{ name: 'Hydralazine', strength: '25 mg' }],
    saltForm: 'Hydrochloride',
    standardStrength: '25 mg',
    dosageForm: 'Oral Tablet',
    synonyms: ['apresoline', 'hydralazine', 'hydralazine hcl'],
  },
  {
    conceptId: 'RXNORM-7052',
    brandName: 'Naprosyn',
    genericName: 'Naproxen',
    activeIngredients: [{ name: 'Naproxen', strength: '250 mg' }],
    saltForm: null,
    standardStrength: '250 mg',
    dosageForm: 'Oral Tablet',
    synonyms: ['naprosyn', 'naproxen', 'aleve'],
  },
  {
    conceptId: 'RXNORM-7053',
    brandName: 'Anaprox',
    genericName: 'Naproxen Sodium',
    activeIngredients: [{ name: 'Naproxen', strength: '275 mg' }],
    saltForm: 'Sodium',
    standardStrength: '275 mg',
    dosageForm: 'Oral Tablet',
    synonyms: ['anaprox', 'naproxen sodium'],
  },
];

/**
 * Standard Look-Alike / Sound-Alike (LASA) High-Risk Pairs according to ISMP
 * (Institute for Safe Medication Practices).
 */
const ISMP_LASA_PAIRS: Record<string, string[]> = {
  celexa: ['Celebrex (Celecoxib)', 'Zyprexa (Olanzapine)'],
  celebrex: ['Celexa (Citalopram)', 'Zyprexa (Olanzapine)'],
  zyprexa: ['Celexa (Citalopram)', 'Celebrex (Celecoxib)'],
  hydralazine: ['Hydroxyzine (Vistaril)'],
  hydroxyzine: ['Hydralazine (Apresoline)'],
  clonidine: ['Klonopin (Clonazepam)'],
  klonopin: ['Clonidine (Catapres)'],
  metformin: ['Metoprolol'],
  metoprolol: ['Metformin'],
  zantac: ['Zyrtec (Cetirizine)'],
  zyrtec: ['Zantac (Ranitidine)'],
  prilosec: ['Prozac (Fluoxetine)'],
  prozac: ['Prilosec (Omeprazole)'],
};

export class LocalRxNormTerminologyProvider implements IDrugTerminologyProvider {
  name = 'Local-First RxNorm Geriatric Formulary Provider';
  version = '2026.1';

  async search(query: string): Promise<TerminologyMatch[]> {
    if (!query || !query.trim()) return [];

    const cleaned = query.trim().toLowerCase();
    const normalized = normalizeIngredientName(cleaned);

    const matches: TerminologyMatch[] = [];

    // Check for LASA hazard
    const lasaKey = Object.keys(ISMP_LASA_PAIRS).find((key) =>
      cleaned.includes(key) || key.includes(cleaned)
    );
    const lasaAlternatives = lasaKey ? ISMP_LASA_PAIRS[lasaKey] : undefined;

    for (const entry of CLINICAL_TERMINOLOGY_DATABASE) {
      let score = 0;
      let matchType: TerminologyMatch['matchType'] = 'approximate';

      const entryBrand = (entry.brandName || '').toLowerCase();
      const entryGeneric = entry.genericName.toLowerCase();

      if (entryBrand === cleaned || entryGeneric === cleaned) {
        score = 1.0;
        matchType = 'exact';
      } else if (entry.synonyms.some((s) => s === cleaned)) {
        score = 0.95;
        matchType = 'alias';
      } else if (cleaned.includes(entryGeneric) || entryGeneric.includes(cleaned)) {
        score = 0.85;
        matchType = 'brand_to_generic';
      } else if (entryBrand && (cleaned.includes(entryBrand) || entryBrand.includes(cleaned))) {
        score = 0.85;
        matchType = 'brand_to_generic';
      } else if (
        entry.activeIngredients.some((ing) => {
          const n = normalizeIngredientName(ing.name);
          return n === normalized || cleaned.includes(n);
        })
      ) {
        score = 0.8;
        matchType = 'approximate';
      }

      if (score >= 0.7) {
        matches.push({
          conceptId: entry.conceptId,
          term: entry.brandName ? `${entry.brandName} (${entry.genericName})` : entry.genericName,
          brandName: entry.brandName,
          genericName: entry.genericName,
          activeIngredients: entry.activeIngredients,
          saltForm: entry.saltForm,
          standardStrength: entry.standardStrength,
          dosageForm: entry.dosageForm,
          matchScore: score,
          matchType,
          isLASAHazard: Boolean(lasaAlternatives && lasaAlternatives.length > 0),
          lasaAlternatives,
        });
      }
    }

    // Sort by match score descending
    return matches.sort((a, b) => b.matchScore - a.matchScore);
  }

  async lookupByConceptId(id: string): Promise<TerminologyMatch | null> {
    const entry = CLINICAL_TERMINOLOGY_DATABASE.find((e) => e.conceptId === id);
    if (!entry) return null;

    const entryBrand = (entry.brandName || '').toLowerCase();
    const lasaKey = Object.keys(ISMP_LASA_PAIRS).find(
      (k) => entryBrand.includes(k) || entry.genericName.toLowerCase().includes(k)
    );

    return {
      conceptId: entry.conceptId,
      term: entry.brandName ? `${entry.brandName} (${entry.genericName})` : entry.genericName,
      brandName: entry.brandName,
      genericName: entry.genericName,
      activeIngredients: entry.activeIngredients,
      saltForm: entry.saltForm,
      standardStrength: entry.standardStrength,
      dosageForm: entry.dosageForm,
      matchScore: 1.0,
      matchType: 'exact',
      isLASAHazard: Boolean(lasaKey),
      lasaAlternatives: lasaKey ? ISMP_LASA_PAIRS[lasaKey] : undefined,
    };
  }

  findLASAPairs(query: string): string[] {
    const cleaned = query.trim().toLowerCase();
    const key = Object.keys(ISMP_LASA_PAIRS).find(
      (k) => cleaned.includes(k) || k.includes(cleaned)
    );
    return key ? ISMP_LASA_PAIRS[key] : [];
  }
}
