import { normalizeIngredientName } from '../../../shared/calculations.js';
import type { DatasetMetadata, InteractionRule } from '../../../shared/interactionTypes.js';
import type { IInteractionEvidenceProvider } from './types.js';

export const SYNTHETIC_INTERACTION_EVIDENCE_DATASET_METADATA: DatasetMetadata = {
  datasetId: 'SYNTH-DDI-RULES-2026.1',
  datasetName: 'Synthetic Geriatric Pharmacokinetic & Pharmacodynamic Conflict Database',
  version: '2026.1.0',
  publishedDate: '2026-02-15',
  revisionDate: '2026-03-01',
  sourceAuthority: 'Curated Evidence Provider (FDA Boxed Warnings, Beers Criteria 2023, CPIC Guidelines)',
  license: 'Academic Synthetic Clinical Evaluation License',
  completeness: 'curated_test_fixture',
  maintenanceSchedule: 'Quarterly guideline reconciliation',
  staleAfterDays: 180,
};

const SYNTHETIC_INTERACTION_RULES: InteractionRule[] = [
  {
    ruleId: 'rule-ddi-apixaban-naproxen',
    datasetVersion: '2026.1.0',
    category: 'pharmacodynamic',
    severity: 'major',
    evidenceLevel: 'established_clinical',
    ingredientA: 'apixaban',
    ingredientB: 'naproxen',
    mechanism:
      'Additive and synergistic pharmacodynamic inhibition of primary and secondary hemostasis. Apixaban selectively inhibits Factor Xa in the coagulation cascade, while naproxen reversibly inhibits platelet COX-1 (impairing thromboxane A2-mediated platelet aggregation) and causes direct topical/systemic gastrointestinal mucosal injury.',
    clinicalImpact:
      'Markedly elevated risk of major upper gastrointestinal bleeding, systemic hemorrhage, and hematoma formation in older adults. Concomitant use increases bleeding odds by 2- to 3-fold.',
    managementRecommendation:
      'Avoid concomitant NSAID therapy with oral Factor Xa inhibitors unless absolutely unavoidable. If anti-inflammatory analgesia is required, evaluate non-NSAID alternatives (e.g. acetaminophen within daily limits, topical lidocaine) or co-prescribe gastroprotection (PPI) under strict clinical monitoring.',
    sourceCitation:
      'FDA Eliquis Prescribing Information (Section 7.2); AGS Beers Criteria 2023 Update (Table 4: High-Risk Medications in Older Adults); J Am Coll Cardiol. 2020;76(19):2203-2214.',
    publicationDate: '2023-05-04',
    requiresClinicalReview: true,
  },
  {
    ruleId: 'rule-ddi-oxycodone-zolpidem',
    datasetVersion: '2026.1.0',
    category: 'pharmacodynamic',
    severity: 'contraindicated',
    evidenceLevel: 'established_clinical',
    ingredientA: 'oxycodone',
    ingredientB: 'zolpidem',
    mechanism:
      'Profound additive central nervous system and respiratory depression. Concomitant stimulation of central mu-opioid receptors and positive allosteric modulation of GABA-A receptors suppresses brainstem respiratory rhythm generation and impairs nocturnal airway patency.',
    clinicalImpact:
      'High risk of profound sedation, respiratory arrest, coma, nocturnal falls, hip fractures, and fatal overdose in geriatric individuals.',
    managementRecommendation:
      'Strictly avoid concurrent prescription of opioids and sedative-hypnotics in older adults. Taper sedative-hypnotic and initiate non-pharmacological cognitive behavioral therapy for insomnia (CBT-I).',
    sourceCitation:
      'FDA Boxed Warning on Combined CNS Depressants (2016; updated 2023); CDC Clinical Practice Guideline for Prescribing Opioids for Pain (MMWR 2022); Beers Criteria 2023.',
    publicationDate: '2023-01-10',
    requiresClinicalReview: true,
  },
  {
    ruleId: 'rule-ddi-lisinopril-spironolactone',
    datasetVersion: '2026.1.0',
    category: 'pharmacodynamic',
    severity: 'major',
    evidenceLevel: 'established_clinical',
    ingredientA: 'lisinopril',
    ingredientB: 'spironolactone',
    mechanism:
      'Synergistic blockade of the renin-angiotensin-aldosterone system (RAAS). Lisinopril inhibits angiotensin-converting enzyme reducing circulating aldosterone, while spironolactone competitively blocks mineralocorticoid receptors in the distal renal tubule, halting potassium excretion.',
    clinicalImpact:
      'Severe, life-threatening hyperkalemia (serum potassium > 5.5–6.0 mEq/L) predisposing to fatal cardiac dysrhythmias, conduction blocks, and acute renal decompensation, especially in older adults with baseline CKD.',
    managementRecommendation:
      'Requires baseline and serial monitoring of serum potassium and serum creatinine/eGFR at 1 week, 4 weeks, and quarterly thereafter. Spironolactone dose should generally not exceed 25 mg/day in combination with an ACE inhibitor. Avoid potassium supplements.',
    sourceCitation:
      '2022 AHA/ACC/HFSA Guideline for the Management of Heart Failure (Circulation 2022;145:e895–e1032); RALES Trial (N Engl J Med 1999;341:709-717).',
    publicationDate: '2022-04-01',
    patientPrerequisites: {
      requiresRenalData: true,
      requiresAgeThreshold: 65,
    },
    requiresClinicalReview: true,
  },
  {
    ruleId: 'rule-ddi-levothyroxine-calcium-carbonate',
    datasetVersion: '2026.1.0',
    category: 'pharmacokinetic',
    severity: 'moderate',
    evidenceLevel: 'established_clinical',
    ingredientA: 'levothyroxine',
    ingredientB: 'calcium carbonate',
    mechanism:
      'Direct physicochemical chelation and adsorption in the gastrointestinal lumen. Divalent calcium ions form an insoluble, poorly absorbable complex with the levothyroxine molecule in acidic gastric and proximal duodenal environments, reducing oral levothyroxine bioavailability by 20% to 35%.',
    clinicalImpact:
      'Unintended elevation of serum thyroid-stimulating hormone (TSH), therapeutic failure of thyroid replacement, persistent fatigue, dyslipidemia, and refractory hypothyroidism.',
    managementRecommendation:
      'Separate administration timing by a minimum of 4 hours. Administer levothyroxine first thing in the morning on an empty stomach with plain water at least 30–60 minutes before breakfast; schedule calcium carbonate with midday or evening meals.',
    sourceCitation:
      'American Thyroid Association (ATA) Guidelines for Hypothyroidism (Thyroid. 2014;24(12):1670-1751); JAMA. 2000;283(21):2822-2825.',
    publicationDate: '2021-08-15',
    actionableWindowHours: 4,
    requiresClinicalReview: true,
  },
  {
    ruleId: 'rule-ddi-apixaban-clarithromycin',
    datasetVersion: '2026.1.0',
    category: 'pharmacokinetic',
    severity: 'major',
    evidenceLevel: 'established_clinical',
    ingredientA: 'apixaban',
    ingredientB: 'clarithromycin',
    mechanism:
      'Potent dual pharmacokinetic inhibition of CYP3A4 and P-glycoprotein (P-gp). Clarithromycin is a mechanism-based, irreversible inactivator of CYP3A4 and a competitive P-gp inhibitor, simultaneously blocking intestinal efflux and hepatic/intestinal oxidative clearance of apixaban.',
    clinicalImpact:
      'Significant increase in systemic apixaban exposure (AUC increased by ~100%, Cmax increased by ~60%), substantially increasing the risk of major and fatal hemorrhages.',
    managementRecommendation:
      'If clarithromycin must be co-administered with apixaban 5 mg twice daily, reduce apixaban dose by 50% to 2.5 mg twice daily (per FDA package insert). In patients already receiving apixaban 2.5 mg BID, avoid co-administration of strong dual inhibitors.',
    sourceCitation:
      'FDA Eliquis Prescribing Information (Section 7.1: Strong Dual Inhibitors of CYP3A4 and P-gp); Clin Pharmacokinet. 2016;55(8):991-1002.',
    publicationDate: '2021-11-20',
    requiresClinicalReview: true,
  },
  {
    ruleId: 'rule-ddi-atorvastatin-amlodipine',
    datasetVersion: '2026.1.0',
    category: 'pharmacokinetic',
    severity: 'minor',
    evidenceLevel: 'theoretical_mechanism',
    ingredientA: 'atorvastatin',
    ingredientB: 'amlodipine',
    mechanism:
      'Weak competitive CYP3A4 metabolic sharing. Both agents are substrates for hepatic cytochrome P450 3A4; amlodipine acts as a very weak inhibitor, yielding a minor (~18%) increase in atorvastatin systemic exposure without significant alteration of amlodipine kinetics.',
    clinicalImpact:
      'Usually clinically well tolerated. In patients on maximum atorvastatin doses (80 mg/day) with hepatic insufficiency, slight increase in statin-associated muscle symptoms (SAMS) may theoretically occur.',
    managementRecommendation:
      'No routine dose adjustment required. Monitor periodically for unexplained muscle tenderness or weakness during routine primary care follow-up.',
    sourceCitation:
      'Clinical Pharmacokinetics 2006;45(11):1089-1103; FDA Lipitor Prescribing Information.',
    publicationDate: '2020-03-12',
    requiresClinicalReview: false,
  },
  {
    ruleId: 'rule-ddi-sertraline-naproxen',
    datasetVersion: '2026.1.0',
    category: 'pharmacodynamic',
    severity: 'moderate',
    evidenceLevel: 'probable',
    ingredientA: 'sertraline',
    ingredientB: 'naproxen',
    mechanism:
      'Additive bleeding liability. Selective serotonin reuptake inhibitors (SSRIs) block the serotonin transporter on platelets, depleting intra-platelet 5-HT stores and blunting platelet aggregation response to vascular injury. Concomitant NSAID inhibition of platelet COX-1 and gastric prostaglandin synthesis multiplies mucosal bleeding hazard.',
    clinicalImpact:
      'Approximately 3- to 4-fold elevated incidence of upper gastrointestinal bleeding compared to unexposed individuals, with the highest risk in older adults (> 65 years).',
    managementRecommendation:
      'Evaluate clinical necessity of NSAID. Consider alternative non-NSAID analgesia. If concomitant treatment is required, co-prescribe a proton pump inhibitor (PPI) for gastric protection and counsel on signs of melena or hematemesis.',
    sourceCitation:
      'BMJ. 2014;349:g5268; Pharmacotherapy. 2014;34(8):832-843; Canadian Medical Association Journal (CMAJ) 2015.',
    publicationDate: '2022-09-18',
    patientPrerequisites: {
      requiresAgeThreshold: 65,
    },
    requiresClinicalReview: true,
  },
  {
    ruleId: 'rule-ddi-clopidogrel-omeprazole',
    datasetVersion: '2026.1.0',
    category: 'pharmacokinetic',
    severity: 'moderate',
    evidenceLevel: 'probable',
    ingredientA: 'clopidogrel',
    ingredientB: 'omeprazole',
    mechanism:
      'Inhibition of bioactivation via CYP2C19. Clopidogrel is a prodrug requiring two-step hepatic oxidation by CYP2C19 to form its active thiol metabolite. Omeprazole competitively inhibits CYP2C19, reducing active metabolite formation and ex vivo platelet inhibition by ~40%.',
    clinicalImpact:
      'Controversial clinical significance: while ex vivo platelet assays show reduced antiplatelet response, large randomized trials (COGENT) demonstrated no statistically significant difference in ischemic cardiovascular events but significant reduction in GI bleeding.',
    managementRecommendation:
      'Evidence is conflicting. If acid suppression is clinically indicated in a patient on clopidogrel, guidelines suggest considering PPIs with lower CYP2C19 affinity (e.g. pantoprazole) or an H2RA (famotidine) to minimize theoretical interaction concerns.',
    sourceCitation:
      'FDA Safety Communication on Plavix/Prilosec (2009; updated 2016); COGENT Trial (N Engl J Med 2010;363:1909-1917); ACC/AHA Guideline Consensus.',
    publicationDate: '2021-06-10',
    requiresClinicalReview: true,
  },
];

export class LocalInteractionEvidenceProvider implements IInteractionEvidenceProvider {
  name = 'Local Synthetic Interaction Evidence Provider';
  private rulesList = SYNTHETIC_INTERACTION_RULES;
  private isOutageSimulated = false;

  isAvailable(): boolean {
    return !this.isOutageSimulated;
  }

  setOutageSimulation(active: boolean): void {
    this.isOutageSimulated = active;
  }

  getDatasetMetadata(): DatasetMetadata {
    return SYNTHETIC_INTERACTION_EVIDENCE_DATASET_METADATA;
  }

  async findRulesForPair(ingredientA: string, ingredientB: string): Promise<InteractionRule[]> {
    if (this.isOutageSimulated) {
      throw new Error('InteractionEvidenceProvider is unavailable (simulated outage).');
    }

    const normA = normalizeIngredientName(ingredientA);
    const normB = normalizeIngredientName(ingredientB);

    return this.rulesList.filter(
      (rule) =>
        (rule.ingredientA === normA && rule.ingredientB === normB) ||
        (rule.ingredientA === normB && rule.ingredientB === normA)
    );
  }

  async getAllRules(): Promise<InteractionRule[]> {
    if (this.isOutageSimulated) {
      throw new Error('InteractionEvidenceProvider is unavailable (simulated outage).');
    }
    return [...this.rulesList];
  }
}
