import type {
  CircadianSlotId,
  ConstraintEvidence,
  ConstraintParameter,
  FoodRelation,
} from '../../../shared/chronoTypes.js';

export interface AuthoritativeCircadianRule {
  ruleId: string;
  ingredientMatch: string; // substring or normalized ingredient name
  targetSlot?: CircadianSlotId;
  foodRelation: FoodRelation;
  offsetMinutes?: number;
  windowDurationMinutes?: number;
  minSeparationFromIngredientClass?: {
    ingredientClass: string;
    matchingIngredients: string[];
    minSeparationHours: number;
    rationale: string;
    citation: string;
  };
  contraindicatedSlots?: CircadianSlotId[];
  contraindicationReason?: string;
  evidence: ConstraintEvidence;
  administrationNotes: string;
  specialPrecautions?: string[];
}

export const AUTHORITATIVE_CHRONO_RULES: AuthoritativeCircadianRule[] = [
  // 1. LEVOTHYROXINE
  {
    ruleId: 'chrono-rule-levothyroxine',
    ingredientMatch: 'levothyroxine',
    targetSlot: 'slot_wake_fasted',
    foodRelation: 'empty_stomach',
    offsetMinutes: -60,
    windowDurationMinutes: 45,
    minSeparationFromIngredientClass: {
      ingredientClass: 'multivalent_cation',
      matchingIngredients: ['calcium', 'iron', 'ferrous', 'magnesium', 'aluminum', 'sucralfate'],
      minSeparationHours: 4,
      rationale:
        'Multivalent cations (calcium, iron, aluminum, magnesium) bind levothyroxine in the gut lumen, forming an insoluble, unabsorbable chelate that decreases T4 bioavailability by up to 80%.',
      citation: 'FDA Synthroid Package Insert; ATA Guidelines for Hypothyroidism in Adults',
    },
    evidence: {
      sourceAuthority: 'FDA Approved Product Labeling / American Thyroid Association',
      citation: 'Endocrine Practice 2014;20(12):1240-1250; Synthroid Prescribing Information',
      evidenceStrength: 'established_clinical',
      rationale:
        'Absorption of levothyroxine requires gastric acidity and is maximized on an empty stomach. Co-ingestion with food, coffee, or polyvalent cations dramatically decreases absorption.',
      datasetVersion: '2026.1-chrono-synth',
    },
    administrationNotes:
      'Take with a full 8 oz glass of plain water at least 60 minutes before breakfast. Must be separated from calcium or iron supplements by at least 4 hours.',
    specialPrecautions: [
      'Do not take with coffee, juice, or calcium-fortified milk.',
      'Separate from multivalent cations (calcium/iron) by >= 4 hours.',
    ],
  },

  // 2. LOOP & THIAZIDE DIURETICS
  {
    ruleId: 'chrono-rule-furosemide-diuretic',
    ingredientMatch: 'furosemide',
    targetSlot: 'slot_breakfast',
    foodRelation: 'with_meal',
    contraindicatedSlots: ['slot_bedtime'],
    contraindicationReason:
      'Diuretic administration in the evening or at bedtime induces brisk nocturia, recurrent nighttime awakenings, sleep fragmentation, acute orthostatic hypotension in the dark, and catastrophic fall and hip fracture hazards in older adults.',
    evidence: {
      sourceAuthority: 'American Geriatrics Society Beers Criteria 2023',
      citation: 'J Am Geriatr Soc 2023;71(7):2052-2081; Lexicomp Geriatric Dosing',
      evidenceStrength: 'established_clinical',
      rationale:
        'Peak diuresis occurs 1-2 hours after oral dose and persists 6-8 hours. Morning scheduling confines diuresis to waking hours and minimizes nighttime falls.',
      datasetVersion: '2026.1-chrono-synth',
    },
    administrationNotes:
      'Administer strictly in the morning (approx 08:00). If prescribed twice daily, schedule the second dose no later than 14:00 (midday).',
    specialPrecautions: [
      'Avoid evening or bedtime administration to protect against nocturia and fall risk.',
      'Monitor morning standing blood pressure and serum potassium.',
    ],
  },
  {
    ruleId: 'chrono-rule-hydrochlorothiazide',
    ingredientMatch: 'hydrochlorothiazide',
    targetSlot: 'slot_breakfast',
    foodRelation: 'with_meal',
    contraindicatedSlots: ['slot_bedtime'],
    contraindicationReason:
      'Thiazide diuretics cause nocturnal diuresis and orthostasis if administered near bedtime.',
    evidence: {
      sourceAuthority: 'American Geriatrics Society Beers Criteria 2023',
      citation: 'J Am Geriatr Soc 2023;71(7):2052-2081',
      evidenceStrength: 'established_clinical',
      rationale: 'Diuretic action should be completed prior to patient bedtime.',
      datasetVersion: '2026.1-chrono-synth',
    },
    administrationNotes: 'Administer with breakfast in the morning.',
    specialPrecautions: ['Do not administer at bedtime.'],
  },

  // 3. CALCIUM / IRON SUPPLEMENTS
  {
    ruleId: 'chrono-rule-calcium-supplement',
    ingredientMatch: 'calcium',
    targetSlot: 'slot_midday_lunch',
    foodRelation: 'with_meal',
    minSeparationFromIngredientClass: {
      ingredientClass: 'thyroid_hormone',
      matchingIngredients: ['levothyroxine', 'liothyronine'],
      minSeparationHours: 4,
      rationale:
        'Calcium carbonate directly binds levothyroxine in gastric fluid, reducing thyroid absorption. Minimum 4-hour temporal separation is mandatory.',
      citation: 'Thyroid 2011;21(3):235-241; FDA Synthroid Label',
    },
    evidence: {
      sourceAuthority: 'Institute of Medicine / Dietary Reference Intakes',
      citation: 'Am J Clin Nutr 2007;86(6):1654-1662; Lexicomp Drug Information',
      evidenceStrength: 'established_clinical',
      rationale:
        'Calcium carbonate requires gastric acid and meal bolus for optimal dissolution and absorption. Doses exceeding 500-600 mg elemental calcium saturate active transport and should be divided with meals.',
      datasetVersion: '2026.1-chrono-synth',
    },
    administrationNotes:
      'Take with meals (lunch and/or dinner). Splitting daily dose maximizes fractional absorption efficiency and protects morning thyroid medication.',
    specialPrecautions: [
      'Take with food to facilitate dissolution and minimize constipation.',
      'Maintain at least 4 hours separation from morning levothyroxine.',
    ],
  },
  {
    ruleId: 'chrono-rule-iron-supplement',
    ingredientMatch: 'iron',
    targetSlot: 'slot_midday_lunch',
    foodRelation: 'before_meal',
    minSeparationFromIngredientClass: {
      ingredientClass: 'thyroid_hormone',
      matchingIngredients: ['levothyroxine'],
      minSeparationHours: 4,
      rationale: 'Ferrous iron binds levothyroxine into an insoluble complex in the gut.',
      citation: 'Ann Intern Med 1992;117(12):1010-1013',
    },
    evidence: {
      sourceAuthority: 'British Journal of Haematology Guidelines',
      citation: 'Br J Haematol 2021;195(4):506-518',
      evidenceStrength: 'established_clinical',
      rationale:
        'Iron absorption is highest on an empty stomach or with acidic fluids (vitamin C), but causes GI upset in many older adults. Must be separated from levothyroxine by >= 4h.',
      datasetVersion: '2026.1-chrono-synth',
    },
    administrationNotes:
      'Separate from levothyroxine and calcium by at least 4 hours. Take with water or citrus juice.',
    specialPrecautions: ['Separate from thyroid hormone by >= 4 hours.'],
  },

  // 4. METFORMIN
  {
    ruleId: 'chrono-rule-metformin',
    ingredientMatch: 'metformin',
    targetSlot: 'slot_breakfast',
    foodRelation: 'with_meal',
    evidence: {
      sourceAuthority: 'American Diabetes Association Standards of Care 2024',
      citation: 'Diabetes Care 2024;47(Suppl 1):S158-S178; Glucophage Prescribing Information',
      evidenceStrength: 'established_clinical',
      rationale:
        'Administration with meals significantly reduces gastrointestinal adverse effects (nausea, abdominal cramping, diarrhea) and moderates postprandial glucose excursions.',
      datasetVersion: '2026.1-chrono-synth',
    },
    administrationNotes:
      'Take with or immediately after meals (breakfast and dinner for BID regimens). Extended-release tablets must be swallowed whole.',
    specialPrecautions: [
      'Always take with food to minimize GI intolerance.',
      'Do not crush, chew, or split extended-release tablets.',
    ],
  },

  // 5. STATINS (SHORT-ACTING VS LONG-ACTING)
  {
    ruleId: 'chrono-rule-simvastatin-short-acting',
    ingredientMatch: 'simvastatin',
    targetSlot: 'slot_bedtime',
    foodRelation: 'independent',
    evidence: {
      sourceAuthority: 'Atherosclerosis Clinical Pharmacokinetics',
      citation: 'Atherosclerosis 2002;163(2):413-415; FDA Zocor Prescribing Information',
      evidenceStrength: 'established_clinical',
      rationale:
        'Short-acting statins (half-life 2-3 hours) must be taken at bedtime because hepatic HMG-CoA reductase enzyme activity and endogenous cholesterol synthesis peak between midnight and 04:00.',
      datasetVersion: '2026.1-chrono-synth',
    },
    administrationNotes: 'Administer once daily at bedtime with water.',
    specialPrecautions: ['Bedtime administration optimizes nocturnal HMG-CoA reductase inhibition.'],
  },
  {
    ruleId: 'chrono-rule-atorvastatin-long-acting',
    ingredientMatch: 'atorvastatin',
    targetSlot: 'slot_bedtime', // Standard practice, but can be taken any time
    foodRelation: 'independent',
    evidence: {
      sourceAuthority: 'FDA Product Information / Clinical Pharmacokinetics',
      citation: 'Clin Pharmacokinet 2003;42(13):1141-1160; Lipitor Prescribing Information',
      evidenceStrength: 'established_clinical',
      rationale:
        'Atorvastatin has an elimination half-life of 14 hours and active circulating metabolites extending inhibition to 20-30 hours. Circadian efficacy is maintained regardless of time of day.',
      datasetVersion: '2026.1-chrono-synth',
    },
    administrationNotes:
      'Can be taken at any consistent time of day with or without food. Prescribed bedtime timing maintained for adherence consistency.',
    specialPrecautions: ['Maintain consistent daily timing.'],
  },

  // 6. SEDATIVE-HYPNOTICS
  {
    ruleId: 'chrono-rule-zolpidem-sedative',
    ingredientMatch: 'zolpidem',
    targetSlot: 'slot_bedtime',
    foodRelation: 'independent',
    contraindicatedSlots: ['slot_wake_fasted', 'slot_breakfast', 'slot_midday_lunch'],
    contraindicationReason:
      'Daytime administration of hypnotic Z-drugs causes severe psychomotor retardation, confusion, motor incoordination, and catastrophic falls.',
    evidence: {
      sourceAuthority: 'FDA Boxed Warning / AGS Beers Criteria 2023',
      citation: 'FDA Drug Safety Communication 2019; J Am Geriatr Soc 2023;71(7):2052-2081',
      evidenceStrength: 'established_clinical',
      rationale:
        'Administer immediately prior to bedtime. Patient must have a full 7-8 hours available for sleep before being active.',
      datasetVersion: '2026.1-chrono-synth',
    },
    administrationNotes:
      'Take immediately prior to turning off lights while in bed. Do not take while ambulatory. Use lowest effective dose in older adults.',
    specialPrecautions: [
      'Take immediately before sleep; ambulatory ingestion creates severe fall hazard.',
      'High risk Beers Criteria medication in older adults.',
    ],
  },

  // 7. ANTIHYPERTENSIVES / BETA-BLOCKERS
  {
    ruleId: 'chrono-rule-lisinopril-ace',
    ingredientMatch: 'lisinopril',
    targetSlot: 'slot_breakfast',
    foodRelation: 'independent',
    evidence: {
      sourceAuthority: 'AHA/ACC Clinical Practice Guidelines on Hypertension',
      citation: 'Hypertension 2018;71(6):e13-e115; Prinivil Prescribing Information',
      evidenceStrength: 'established_clinical',
      rationale:
        'Morning administration aligns peak ACE inhibition with the early morning sympathetic surge in systemic vascular resistance and blood pressure upon waking.',
      datasetVersion: '2026.1-chrono-synth',
    },
    administrationNotes: 'Take once daily in the morning with water.',
    specialPrecautions: ['Monitor morning blood pressure and serum potassium.'],
  },
  {
    ruleId: 'chrono-rule-amlodipine-ccb',
    ingredientMatch: 'amlodipine',
    targetSlot: 'slot_breakfast',
    foodRelation: 'independent',
    evidence: {
      sourceAuthority: 'American Journal of Hypertension',
      citation: 'Am J Hypertens 2012;25(7):748-756; Norvasc Prescribing Information',
      evidenceStrength: 'established_clinical',
      rationale:
        'Amlodipine has a prolonged half-life (30-50 hours). Morning administration maintains 24-hour hemodynamic control with minimal diurnal fluctuation.',
      datasetVersion: '2026.1-chrono-synth',
    },
    administrationNotes: 'Take once daily in the morning with or without food.',
    specialPrecautions: ['Check for peripheral ankle edema.'],
  },
  {
    ruleId: 'chrono-rule-metoprolol-beta-blocker',
    ingredientMatch: 'metoprolol',
    targetSlot: 'slot_breakfast',
    foodRelation: 'with_meal',
    evidence: {
      sourceAuthority: 'FDA Product Label / Clinical Pharmacokinetics',
      citation: 'Lopressor Prescribing Information; Clin Pharmacokinet 1986;11(3):215-234',
      evidenceStrength: 'established_clinical',
      rationale:
        'Food significantly enhances the systemic bioavailability of metoprolol tartrate by up to 50%. Must be taken with or immediately after meals.',
      datasetVersion: '2026.1-chrono-synth',
    },
    administrationNotes:
      'Take with or immediately after meals (breakfast and dinner for twice-daily orders).',
    specialPrecautions: [
      'Take with food to ensure consistent bioavailability.',
      'Check heart rate prior to administration.',
    ],
  },

  // 8. DIRECT ORAL ANTICOAGULANTS (DOACs)
  {
    ruleId: 'chrono-rule-apixaban-doac',
    ingredientMatch: 'apixaban',
    targetSlot: 'slot_breakfast',
    foodRelation: 'independent',
    evidence: {
      sourceAuthority: 'FDA Approved Product Label / CHEST Guidelines',
      citation: 'Eliquis Prescribing Information; Chest 2018;154(5):1211-1285',
      evidenceStrength: 'established_clinical',
      rationale:
        'Twice-daily dosing with approximately 12-hour separation is required to maintain steady-state factor Xa inhibition without excessive peak-to-trough variation.',
      datasetVersion: '2026.1-chrono-synth',
    },
    administrationNotes:
      'Take twice daily approximately 12 hours apart (e.g., breakfast 08:00 and dinner 20:00). Do not skip doses.',
    specialPrecautions: [
      'Maintain strict 12-hour dosing interval.',
      'Do NOT crush without clinical pharmacist guidance.',
    ],
  },

  // 9. BISPHOSPHONATES
  {
    ruleId: 'chrono-rule-alendronate-bisphosphonate',
    ingredientMatch: 'alendronate',
    targetSlot: 'slot_wake_fasted',
    foodRelation: 'empty_stomach',
    offsetMinutes: -60,
    windowDurationMinutes: 45,
    minSeparationFromIngredientClass: {
      ingredientClass: 'all_oral_agents',
      matchingIngredients: ['calcium', 'iron', 'food', 'any'],
      minSeparationHours: 1,
      rationale:
        'Alendronate oral bioavailability is < 1% and virtually zero if taken with food, calcium, or coffee. Patient must remain upright for >= 30-60 min to prevent esophageal ulceration.',
      citation: 'FDA Fosamax Prescribing Information; Clin Ther 2000;22(12):1495-1528',
    },
    evidence: {
      sourceAuthority: 'FDA Prescribing Information / Endocrine Society',
      citation: 'J Clin Endocrinol Metab 2020;105(3):587-594',
      evidenceStrength: 'established_clinical',
      rationale:
        'Severe chemical esophagitis risk requires waking administration with 8 oz water, fasting, and remaining strictly upright.',
      datasetVersion: '2026.1-chrono-synth',
    },
    administrationNotes:
      'Take first thing in the morning with 8 oz plain water. Do not lie down and do not eat or take other meds for at least 30-60 minutes.',
    specialPrecautions: [
      'Remain upright for >= 30-60 minutes to prevent chemical esophagitis.',
      'Take with plain water only.',
    ],
  },

  // 10. PARKINSONIAN AGENTS (CARBIDOPA / LEVODOPA)
  {
    ruleId: 'chrono-rule-carbidopa-levodopa',
    ingredientMatch: 'levodopa',
    targetSlot: 'slot_wake_fasted',
    foodRelation: 'empty_stomach',
    offsetMinutes: -45,
    windowDurationMinutes: 45,
    evidence: {
      sourceAuthority: 'Movement Disorder Society Guidelines / FDA Sinemet Label',
      citation: 'Mov Disord. 2018;33(8):1201-1207; FDA Sinemet Prescribing Information',
      evidenceStrength: 'established_clinical',
      rationale:
        'Large neutral amino acids (LNAAs) from dietary protein compete directly with levodopa for carrier-mediated intestinal transport (LAT1) and transport across the blood-brain barrier. Taking 45-60 minutes before meals maximizes CNS bioavailability and prevents motor fluctuations ("delayed-on" and "dose failure").',
      datasetVersion: '2026.1-chrono-synth',
    },
    administrationNotes:
      'Take 45-60 minutes before meals on an empty stomach with a full glass of water. If severe nausea occurs early in therapy, take with a low-protein carbohydrate snack, never high-protein meals.',
    specialPrecautions: [
      'Separate from dietary protein (meat, dairy, eggs, protein shakes) by at least 1 hour.',
      'Take on an empty stomach to optimize central bioavailability.',
    ],
  },
];

export function findAuthoritativeRule(genericName: string): AuthoritativeCircadianRule | undefined {
  const normalized = genericName.toLowerCase();
  return AUTHORITATIVE_CHRONO_RULES.find((rule) => normalized.includes(rule.ingredientMatch));
}
