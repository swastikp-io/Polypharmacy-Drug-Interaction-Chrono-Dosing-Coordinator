import {
  calculateAge,
  calculateCockcroftGaultCrCl,
  classifyEGFR,
  normalizeIngredientName,
} from '../../../shared/calculations.js';
import type {
  DeprescribingOpportunity,
  IRenalHepaticDosingAgentService,
  OrganDosingAlert,
  RenalHepaticDosingRequest,
  RenalHepaticDosingResponse,
} from './types.js';

export class RenalHepaticDosingAgentService implements IRenalHepaticDosingAgentService {
  async evaluateClearanceAndDosing(
    request: RenalHepaticDosingRequest
  ): Promise<RenalHepaticDosingResponse> {
    const { patient, medications, labMeasurements } = request;
    const activeMeds = medications.filter((m) => m.status === 'active' || m.status === 'prn');

    // 1. Identify Latest Renal & Hepatic Labs
    const egfrLab = labMeasurements
      .filter((l) => l.category === 'renal' && l.testName.toLowerCase().includes('egfr'))
      .sort((a, b) => new Date(b.collectionDate).getTime() - new Date(a.collectionDate).getTime())[0];

    const crLab = labMeasurements
      .filter((l) => l.category === 'renal' && l.testName.toLowerCase().includes('creatinine'))
      .sort((a, b) => new Date(b.collectionDate).getTime() - new Date(a.collectionDate).getTime())[0];

    const altLab = labMeasurements
      .filter((l) => l.category === 'hepatic' && l.testName.toLowerCase().includes('alt'))
      .sort((a, b) => new Date(b.collectionDate).getTime() - new Date(a.collectionDate).getTime())[0];

    const astLab = labMeasurements
      .filter((l) => l.category === 'hepatic' && l.testName.toLowerCase().includes('ast'))
      .sort((a, b) => new Date(b.collectionDate).getTime() - new Date(a.collectionDate).getTime())[0];

    const biliLab = labMeasurements
      .filter((l) => l.category === 'hepatic' && l.testName.toLowerCase().includes('bilirubin'))
      .sort((a, b) => new Date(b.collectionDate).getTime() - new Date(a.collectionDate).getTime())[0];

    const egfrValue = egfrLab ? egfrLab.value : null;
    const crValue = crLab ? crLab.value : null;
    const patientAge = calculateAge(patient.dateOfBirth);

    const crclValue = calculateCockcroftGaultCrCl({
      age: patientAge,
      weightKg: patient.weightKg,
      serumCreatinineMgDl: crValue,
      gender: patient.gender,
    });

    const renalStageInfo = classifyEGFR(egfrValue);

    // 2. Evaluate Organ Dosing Alerts
    const organAlerts: OrganDosingAlert[] = [];

    for (const med of activeMeds) {
      const generic = normalizeIngredientName(med.genericName);

      // Metformin evaluation
      if (generic.includes('metformin')) {
        if (egfrValue !== null && egfrValue < 30) {
          organAlerts.push({
            id: `organ-metformin-${med.id}`,
            medicationId: med.id,
            brand: med.brand,
            genericName: med.genericName,
            organSystem: 'renal',
            riskLevel: 'contraindicated',
            triggerMeasurement: egfrLab
              ? {
                  testName: egfrLab.testName,
                  value: egfrLab.value,
                  unit: egfrLab.unit,
                  collectionDate: egfrLab.collectionDate,
                  status: egfrLab.verificationStatus,
                }
              : null,
            guidelineThreshold: 'eGFR < 30 mL/min/1.73m²',
            adjustmentRecommendation:
              'Discontinue Metformin immediately. High risk of life-threatening metformin-associated lactic acidosis (MALA) with severe renal clearance reduction.',
            evidenceSource: 'FDA Drug Safety Communication & ADA Guidelines',
          });
        } else if (egfrValue !== null && egfrValue >= 30 && egfrValue < 45) {
          organAlerts.push({
            id: `organ-metformin-${med.id}`,
            medicationId: med.id,
            brand: med.brand,
            genericName: med.genericName,
            organSystem: 'renal',
            riskLevel: 'dose_reduction_required',
            triggerMeasurement: egfrLab
              ? {
                  testName: egfrLab.testName,
                  value: egfrLab.value,
                  unit: egfrLab.unit,
                  collectionDate: egfrLab.collectionDate,
                  status: egfrLab.verificationStatus,
                }
              : null,
            guidelineThreshold: 'eGFR 30–44 mL/min/1.73m²',
            adjustmentRecommendation:
              'Limit maximum daily dosage to 1,000 mg/day (e.g. 500 mg twice daily). Closely monitor renal parameters every 3 months.',
            evidenceSource: 'KDIGO 2023 Clinical Practice Guideline for Diabetes Management in CKD',
          });
        }
      }

      // NSAID in Renal Impairment
      if (
        (generic.includes('naproxen') || generic.includes('ibuprofen') || generic.includes('meloxicam')) &&
        egfrValue !== null &&
        egfrValue < 60
      ) {
        organAlerts.push({
          id: `organ-nsaid-${med.id}`,
          medicationId: med.id,
          brand: med.brand,
          genericName: med.genericName,
          organSystem: 'renal',
          riskLevel: egfrValue < 30 ? 'contraindicated' : 'caution_monitoring',
          triggerMeasurement: egfrLab
            ? {
                testName: egfrLab.testName,
                value: egfrLab.value,
                unit: egfrLab.unit,
                collectionDate: egfrLab.collectionDate,
                status: egfrLab.verificationStatus,
              }
            : null,
          guidelineThreshold: 'eGFR < 60 mL/min/1.73m²',
          adjustmentRecommendation:
            'Avoid systemic NSAID use. Inhibits renal prostaglandins, blunts renin-angiotensin response, and exacerbates acute tubular injury.',
          evidenceSource: 'AGS Beers Criteria 2023 & KDIGO Guidelines',
        });
      }

      // Apixaban Dose Reduction Criteria
      if (generic.includes('apixaban')) {
        let criteriaCount = 0;
        if (patientAge >= 80) criteriaCount++;
        if (patient.weightKg !== null && patient.weightKg <= 60) criteriaCount++;
        if (crValue !== null && crValue >= 1.5) criteriaCount++;

        if (criteriaCount >= 2) {
          organAlerts.push({
            id: `organ-apixaban-${med.id}`,
            medicationId: med.id,
            brand: med.brand,
            genericName: med.genericName,
            organSystem: 'renal',
            riskLevel: 'dose_reduction_required',
            triggerMeasurement: crLab
              ? {
                  testName: crLab.testName,
                  value: crLab.value,
                  unit: crLab.unit,
                  collectionDate: crLab.collectionDate,
                  status: crLab.verificationStatus,
                }
              : null,
            guidelineThreshold: '>= 2 of: Age >= 80, Weight <= 60kg, Serum Cr >= 1.5 mg/dL',
            adjustmentRecommendation:
              'Reduce dose from 5 mg BID to 2.5 mg BID per FDA dosing criteria to avoid elevated hemorrhage risk.',
            evidenceSource: 'ARISTOTLE Trial & Package Insert Labeling',
          });
        }
      }

      // Acetaminophen in Hepatic Impairment
      if (
        generic.includes('acetaminophen') &&
        ((altLab && altLab.value > 65) || (astLab && astLab.value > 65) || (biliLab && biliLab.value > 1.5))
      ) {
        organAlerts.push({
          id: `organ-apap-${med.id}`,
          medicationId: med.id,
          brand: med.brand,
          genericName: med.genericName,
          organSystem: 'hepatic',
          riskLevel: 'caution_monitoring',
          triggerMeasurement: altLab
            ? {
                testName: altLab.testName,
                value: altLab.value,
                unit: altLab.unit,
                collectionDate: altLab.collectionDate,
                status: altLab.verificationStatus,
              }
            : null,
          guidelineThreshold: 'Transaminases > 2x ULN or elevated bilirubin',
          adjustmentRecommendation:
            'Restrict cumulative daily acetaminophen to maximum 2,000 mg/day (or avoid) due to impaired hepatic clearance and glutathione depletion risk.',
          evidenceSource: 'AASLD Acute Liver Failure Guidelines & Geriatric Dosing Protocols',
        });
      }
    }

    // 3. Beers Criteria & Deprescribing Opportunities
    const deprescribingOpportunities: DeprescribingOpportunity[] = [];

    for (const med of activeMeds) {
      const generic = normalizeIngredientName(med.genericName);

      if (generic.includes('zolpidem') || generic.includes('eszopiclone') || generic.includes('zaleplon')) {
        deprescribingOpportunities.push({
          id: `deprescribe-${med.id}`,
          medicationId: med.id,
          brand: med.brand,
          genericName: med.genericName,
          beersCriteriaCategory: 'Sedative-Hypnotics / Nonbenzodiazepine Benzodiazepine Receptor Agonists (Z-drugs)',
          rationale: 'Z-drugs have minimal efficacy in improving sleep latency while significantly escalating risks of motor incoordination, falls, hip fractures, motor vehicle accidents, and delirium in adults >= 65.',
          potentialHarm: 'Elevated fall risk, cognitive decline, dependency, daytime somnolence.',
          deprescribingApproach: 'Recommend structured gradual dose taper alongside Cognitive Behavioral Therapy for Insomnia (CBT-I) and non-pharmacological sleep hygiene protocols.',
          priority: 'high',
        });
      }
    }

    return {
      patientId: patient.id,
      timestamp: new Date().toISOString(),
      agentVersion: 'Phase-1-Deterministic-Stub-v1.0',
      isPrototype: true,
      renalFunction: {
        latestEGFR: egfrValue,
        estimatedCrCl: crclValue,
        stage: renalStageInfo.stage,
        status: egfrLab ? egfrLab.verificationStatus : 'unknown',
      },
      hepaticFunction: {
        latestALT: altLab ? altLab.value : null,
        latestAST: astLab ? astLab.value : null,
        latestBilirubin: biliLab ? biliLab.value : null,
        status: altLab ? altLab.verificationStatus : 'unknown',
      },
      organAlerts,
      deprescribingOpportunities,
      clinicalDisclaimer:
        'PROTOTYPE RENAL/HEPATIC AGENT: Organ clearance evaluations and Beers criteria deprescribing recommendations are advisory decision-support prompts. Do not alter patient medications without licensed clinical review.',
    };
  }
}
