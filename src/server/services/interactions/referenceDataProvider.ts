import { normalizeIngredientName } from '../../../shared/calculations.js';
import type { DatasetMetadata, DrugReferenceEntry } from '../../../shared/interactionTypes.js';
import type { IDrugReferenceProvider } from './types.js';

export const SYNTHETIC_DRUG_REFERENCE_DATASET_METADATA: DatasetMetadata = {
  datasetId: 'SYNTH-DRUG-REF-2026.1',
  datasetName: 'Synthetic Geriatric Pharmacological Reference Provider',
  version: '2026.1.0',
  publishedDate: '2026-02-15',
  revisionDate: '2026-03-01',
  sourceAuthority: 'Curated Geriatric Reference Model (FDA SPL & CPIC Alignments)',
  license: 'Academic Synthetic Clinical Evaluation License',
  completeness: 'curated_test_fixture',
  maintenanceSchedule: 'Quarterly revision and validation schedule',
  staleAfterDays: 180,
};

const SYNTHETIC_DRUG_ENTRIES: DrugReferenceEntry[] = [
  {
    ingredientId: 'ing-apixaban',
    canonicalName: 'apixaban',
    displayName: 'Apixaban',
    aliases: ['eliquis', 'apixabanum'],
    pharmacologicalClass: ['DOAC', 'Direct Factor Xa Inhibitor', 'Anticoagulant'],
    narrowTherapeuticIndex: true,
    primaryClearanceRoutes: ['renal', 'hepatic_cyp', 'hepatic_biliary'],
    enzymeTransporterProfile: [
      {
        target: 'CYP3A4',
        role: 'substrate',
        strength: 'moderate',
        clinicalRelevance: 'established',
        evidenceSource: 'FDA Eliquis Prescribing Information',
      },
      {
        target: 'P-gp',
        role: 'substrate',
        strength: 'strong',
        clinicalRelevance: 'established',
        evidenceSource: 'FDA Eliquis Prescribing Information',
      },
    ],
    blackBoxWarnings: ['Premature discontinuation increases risk of thrombotic events', 'Spinal/epidural hematoma risk'],
    referenceNotes: 'Approximately 27% renally cleared as unchanged drug. Dose reduction required when combined with strong dual CYP3A4/P-gp inhibitors.',
  },
  {
    ingredientId: 'ing-naproxen',
    canonicalName: 'naproxen',
    displayName: 'Naproxen',
    aliases: ['aleve', 'anaprox', 'naprosyn', 'naproxen sodium'],
    pharmacologicalClass: ['NSAID', 'Non-selective COX-1/COX-2 Inhibitor', 'Analgesic'],
    narrowTherapeuticIndex: false,
    primaryClearanceRoutes: ['hepatic_cyp', 'renal'],
    enzymeTransporterProfile: [
      {
        target: 'CYP2C9',
        role: 'substrate',
        strength: 'moderate',
        clinicalRelevance: 'established',
        evidenceSource: 'FDA Naprosyn Label',
      },
    ],
    blackBoxWarnings: ['Cardiovascular thrombotic events', 'Gastrointestinal bleeding, ulceration, and perforation'],
    referenceNotes: 'Potent platelet COX-1 inhibitor. Reversible antiplatelet effect synergizes with anticoagulants.',
  },
  {
    ingredientId: 'ing-metformin',
    canonicalName: 'metformin',
    displayName: 'Metformin',
    aliases: ['glucophage', 'glucophage xr', 'fortamet', 'glumetza', 'metformin hydrochloride'],
    pharmacologicalClass: ['Biguanide', 'Antihyperglycemic'],
    narrowTherapeuticIndex: true,
    primaryClearanceRoutes: ['renal'],
    enzymeTransporterProfile: [
      {
        target: 'OCT2',
        role: 'substrate',
        strength: 'strong',
        clinicalRelevance: 'established',
        evidenceSource: 'ADA Standards of Care',
      },
      {
        target: 'MATE1',
        role: 'substrate',
        strength: 'strong',
        clinicalRelevance: 'established',
        evidenceSource: 'ADA Standards of Care',
      },
    ],
    blackBoxWarnings: ['Lactic acidosis risk, particularly in patients with moderate-to-severe renal impairment'],
    referenceNotes: 'Eliminated 90-100% unchanged via glomerular filtration and tubular secretion. Contraindicated when eGFR < 30 mL/min/1.73m².',
  },
  {
    ingredientId: 'ing-lisinopril',
    canonicalName: 'lisinopril',
    displayName: 'Lisinopril',
    aliases: ['prinivil', 'zestril', 'lisinopril dihydrate'],
    pharmacologicalClass: ['ACE Inhibitor', 'Antihypertensive'],
    narrowTherapeuticIndex: false,
    primaryClearanceRoutes: ['renal'],
    enzymeTransporterProfile: [],
    blackBoxWarnings: ['Fetal toxicity in pregnancy'],
    referenceNotes: '100% excreted unchanged renally. Blunts aldosterone secretion, promoting renal potassium retention.',
  },
  {
    ingredientId: 'ing-spironolactone',
    canonicalName: 'spironolactone',
    displayName: 'Spironolactone',
    aliases: ['aldactone', 'spironolactone'],
    pharmacologicalClass: ['Aldosterone Antagonist', 'Potassium-Sparing Diuretic'],
    narrowTherapeuticIndex: false,
    primaryClearanceRoutes: ['hepatic_cyp', 'renal'],
    enzymeTransporterProfile: [],
    blackBoxWarnings: ['Tumorigenic in chronic animal toxicity models (historical)'],
    referenceNotes: 'High risk of hyperkalemia when combined with ACE inhibitors or ARBs in older adults with CKD.',
  },
  {
    ingredientId: 'ing-oxycodone',
    canonicalName: 'oxycodone',
    displayName: 'Oxycodone',
    aliases: ['roxycodone', 'oxycontin', 'oxycodone hydrochloride', 'percocet'],
    pharmacologicalClass: ['Opioid Agonist', 'Schedule II Controlled Substance', 'Analgesic'],
    narrowTherapeuticIndex: true,
    primaryClearanceRoutes: ['hepatic_cyp', 'renal'],
    enzymeTransporterProfile: [
      {
        target: 'CYP3A4',
        role: 'substrate',
        strength: 'strong',
        clinicalRelevance: 'established',
        evidenceSource: 'FDA OxyContin Labeling',
      },
      {
        target: 'CYP2D6',
        role: 'substrate',
        strength: 'moderate',
        clinicalRelevance: 'established',
        evidenceSource: 'FDA OxyContin Labeling',
      },
    ],
    blackBoxWarnings: ['Addiction, abuse, and misuse', 'Life-threatening respiratory depression', 'Concomitant use with benzodiazepines or CNS depressants'],
  },
  {
    ingredientId: 'ing-zolpidem',
    canonicalName: 'zolpidem',
    displayName: 'Zolpidem',
    aliases: ['ambien', 'ambien cr', 'zolpidem tartrate', 'edluar'],
    pharmacologicalClass: ['Non-benzodiazepine GABA-A Receptor Agonist', 'Sedative-Hypnotic'],
    narrowTherapeuticIndex: false,
    primaryClearanceRoutes: ['hepatic_cyp'],
    enzymeTransporterProfile: [
      {
        target: 'CYP3A4',
        role: 'substrate',
        strength: 'moderate',
        clinicalRelevance: 'established',
        evidenceSource: 'FDA Ambien Labeling',
      },
    ],
    blackBoxWarnings: ['Complex sleep behaviors (e.g. sleep-walking, sleep-driving)'],
    referenceNotes: 'AGS Beers Criteria 2023: Strongly recommended to avoid in older adults due to motor vehicle accidents, nocturnal falls, and delirium.',
  },
  {
    ingredientId: 'ing-acetaminophen',
    canonicalName: 'acetaminophen',
    displayName: 'Acetaminophen (APAP)',
    aliases: ['paracetamol', 'tylenol', 'apap', 'percocet', 'vicodin', 'panadol'],
    pharmacologicalClass: ['Non-opioid Analgesic', 'Antipyretic'],
    narrowTherapeuticIndex: true,
    primaryClearanceRoutes: ['hepatic_cyp'],
    enzymeTransporterProfile: [
      {
        target: 'CYP2E1',
        role: 'substrate',
        strength: 'moderate',
        clinicalRelevance: 'established',
        evidenceSource: 'FDA Hepatotoxicity Advisory Committee',
      },
    ],
    blackBoxWarnings: ['Severe liver injury associated with doses exceeding 4,000 mg/day or accidental duplicate co-prescription'],
    referenceNotes: 'Geriatric recommended daily ceiling is 3,000 mg/day (or 2,000 mg/day in chronic hepatic impairment/frail elderly).',
  },
  {
    ingredientId: 'ing-levothyroxine',
    canonicalName: 'levothyroxine',
    displayName: 'Levothyroxine',
    aliases: ['synthroid', 'levoxyl', 'tirosint', 'unithroid', 'levothyroxine sodium'],
    pharmacologicalClass: ['Thyroid Hormone', 'Synthetic T4'],
    narrowTherapeuticIndex: true,
    primaryClearanceRoutes: ['hepatic_cyp', 'renal'],
    enzymeTransporterProfile: [],
    blackBoxWarnings: ['Do not use for weight reduction'],
    referenceNotes: 'Bioavailability highly sensitive to polyvalent cations (Ca²⁺, Fe²⁺/Fe³⁺, Al³⁺, Mg²⁺) in stomach/duodenum.',
  },
  {
    ingredientId: 'ing-calcium-carbonate',
    canonicalName: 'calcium carbonate',
    displayName: 'Calcium Carbonate',
    aliases: ['caltrate', 'tums', 'oyster shell calcium'],
    pharmacologicalClass: ['Mineral Supplement', 'Antacid', 'Divalent Cation'],
    narrowTherapeuticIndex: false,
    primaryClearanceRoutes: ['other'],
    enzymeTransporterProfile: [],
    referenceNotes: 'Forms non-absorbable insoluble chelates with levothyroxine, bisphosphonates, and tetracyclines.',
  },
  {
    ingredientId: 'ing-atorvastatin',
    canonicalName: 'atorvastatin',
    displayName: 'Atorvastatin',
    aliases: ['lipitor', 'atorvastatin calcium'],
    pharmacologicalClass: ['HMG-CoA Reductase Inhibitor', 'Statin', 'Lipid-Lowering Agent'],
    narrowTherapeuticIndex: false,
    primaryClearanceRoutes: ['hepatic_cyp'],
    enzymeTransporterProfile: [
      {
        target: 'CYP3A4',
        role: 'substrate',
        strength: 'moderate',
        clinicalRelevance: 'established',
        evidenceSource: 'FDA Lipitor Labeling',
      },
      {
        target: 'OATP1B1',
        role: 'substrate',
        strength: 'strong',
        clinicalRelevance: 'established',
        evidenceSource: 'FDA Lipitor Labeling',
      },
    ],
  },
  {
    ingredientId: 'ing-amlodipine',
    canonicalName: 'amlodipine',
    displayName: 'Amlodipine',
    aliases: ['norvasc', 'amlodipine besylate'],
    pharmacologicalClass: ['Dihydropyridine Calcium Channel Blocker', 'Antihypertensive'],
    narrowTherapeuticIndex: false,
    primaryClearanceRoutes: ['hepatic_cyp'],
    enzymeTransporterProfile: [
      {
        target: 'CYP3A4',
        role: 'substrate',
        strength: 'weak',
        clinicalRelevance: 'theoretical',
        evidenceSource: 'Clinical Pharmacokinetics 2006',
      },
      {
        target: 'CYP3A4',
        role: 'inhibitor',
        strength: 'weak',
        clinicalRelevance: 'theoretical',
        evidenceSource: 'Clinical Pharmacokinetics 2006',
      },
    ],
  },
  {
    ingredientId: 'ing-clarithromycin',
    canonicalName: 'clarithromycin',
    displayName: 'Clarithromycin',
    aliases: ['biaxin', 'biaxin xl'],
    pharmacologicalClass: ['Macrolide Antibiotic', 'Strong CYP3A4 Inhibitor'],
    narrowTherapeuticIndex: false,
    primaryClearanceRoutes: ['hepatic_cyp', 'renal'],
    enzymeTransporterProfile: [
      {
        target: 'CYP3A4',
        role: 'inhibitor',
        strength: 'strong',
        clinicalRelevance: 'established',
        evidenceSource: 'FDA Drug Development & Drug Interactions Guidance',
      },
      {
        target: 'P-gp',
        role: 'inhibitor',
        strength: 'strong',
        clinicalRelevance: 'established',
        evidenceSource: 'FDA Drug Development & Drug Interactions Guidance',
      },
    ],
    referenceNotes: 'Potent mechanism-based inactivator of CYP3A4 and P-glycoprotein. Causes marked exposure increases in substrates.',
  },
  {
    ingredientId: 'ing-sertraline',
    canonicalName: 'sertraline',
    displayName: 'Sertraline',
    aliases: ['zoloft', 'sertraline hydrochloride'],
    pharmacologicalClass: ['SSRI', 'Antidepressant'],
    narrowTherapeuticIndex: false,
    primaryClearanceRoutes: ['hepatic_cyp'],
    enzymeTransporterProfile: [
      {
        target: 'CYP2D6',
        role: 'inhibitor',
        strength: 'weak',
        clinicalRelevance: 'minor',
        evidenceSource: 'FDA Zoloft Labeling',
      },
    ],
    blackBoxWarnings: ['Suicidal thoughts and behaviors in young adults (historical pediatric/adolescent)'],
    referenceNotes: 'Serotonin reuptake inhibition depletes platelet granule serotonin, augmenting bleeding risk with NSAIDs or anticoagulants.',
  },
];

export class LocalDrugReferenceProvider implements IDrugReferenceProvider {
  name = 'Local Synthetic Drug Reference Provider';
  private entriesMap = new Map<string, DrugReferenceEntry>();
  private aliasMap = new Map<string, string>();
  private isOutageSimulated = false;

  constructor() {
    for (const entry of SYNTHETIC_DRUG_ENTRIES) {
      this.entriesMap.set(entry.canonicalName, entry);
      this.entriesMap.set(entry.ingredientId, entry);
      this.aliasMap.set(entry.canonicalName, entry.canonicalName);

      for (const alias of entry.aliases) {
        this.aliasMap.set(normalizeIngredientName(alias), entry.canonicalName);
      }
    }
  }

  isAvailable(): boolean {
    return !this.isOutageSimulated;
  }

  setOutageSimulation(active: boolean): void {
    this.isOutageSimulated = active;
  }

  getDatasetMetadata(): DatasetMetadata {
    return SYNTHETIC_DRUG_REFERENCE_DATASET_METADATA;
  }

  async lookupByIngredient(nameOrId: string): Promise<DrugReferenceEntry | null> {
    if (this.isOutageSimulated) {
      throw new Error('DrugReferenceProvider is unavailable (simulated outage).');
    }

    const normalized = normalizeIngredientName(nameOrId);
    const direct = this.entriesMap.get(normalized);
    if (direct) return direct;

    const canonical = this.aliasMap.get(normalized);
    if (canonical) {
      return this.entriesMap.get(canonical) || null;
    }

    return null;
  }

  async lookupByAlias(alias: string): Promise<DrugReferenceEntry | null> {
    return this.lookupByIngredient(alias);
  }

  async getAllIngredients(): Promise<DrugReferenceEntry[]> {
    if (this.isOutageSimulated) {
      throw new Error('DrugReferenceProvider is unavailable (simulated outage).');
    }
    // Return unique entries by canonicalName
    const unique = new Map<string, DrugReferenceEntry>();
    for (const entry of SYNTHETIC_DRUG_ENTRIES) {
      unique.set(entry.canonicalName, entry);
    }
    return Array.from(unique.values());
  }
}
