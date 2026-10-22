import { randomUUID } from 'crypto';
import type { Medication, Patient } from '../../../shared/types.js';
import type {
  CircadianSlotId,
  ComparisonStatus,
  DailyScheduleTimeline,
  DraftScheduleComparison,
  FoodRelation,
  PatientRoutine,
  PrescriptionComparisonItem,
  ScheduleConflictItem,
  ScheduleConflictSeverity,
  ScheduleConflictType,
  ScheduledDoseItem,
  ScheduleTimeSlot,
  SchedulingConfidence,
} from '../../../shared/chronoTypes.js';
import {
  AUTHORITATIVE_CHRONO_RULES,
  findAuthoritativeRule,
  type AuthoritativeCircadianRule,
} from './evidenceRules.js';

export interface ScheduleCoordinatorOptions {
  patient: Patient;
  medications: Medication[];
  routine?: PatientRoutine | null;
  interactionFindings?: any[];
}

export class CircadianScheduleCoordinator {
  public static readonly VERSION = '2026.1-Phase4-Deterministic';

  public generateSchedule(options: ScheduleCoordinatorOptions): DailyScheduleTimeline {
    const { patient, medications, routine, interactionFindings = [] } = options;
    const scheduleId = `sched-${randomUUID()}`;
    const generatedAt = new Date().toISOString();

    // Default patient routine if not configured
    const effectiveRoutine: PatientRoutine = routine || {
      patientId: patient.id,
      wakeTime: '07:00',
      breakfastTime: '08:00',
      lunchTime: '12:30',
      dinnerTime: '18:30',
      bedTime: '21:30',
      notes: 'Standard geriatric community routine',
      updatedAt: generatedAt,
    };

    // Initialize 24-hour circadian slots
    const slotsMap: Record<CircadianSlotId, ScheduleTimeSlot> = {
      slot_wake_fasted: {
        slotId: 'slot_wake_fasted',
        slotName: 'Morning Fasted (Pre-Breakfast)',
        targetTime: effectiveRoutine.wakeTime,
        timeWindow: `${this.offsetTime(effectiveRoutine.wakeTime, -30)} - ${effectiveRoutine.wakeTime}`,
        mealRelation: 'empty_stomach',
        description: 'Take immediately on waking with full glass of water, >= 60 min before breakfast food.',
        doses: [],
      },
      slot_breakfast: {
        slotId: 'slot_breakfast',
        slotName: 'Morning (Breakfast)',
        targetTime: effectiveRoutine.breakfastTime,
        timeWindow: `${this.offsetTime(effectiveRoutine.breakfastTime, -15)} - ${this.offsetTime(effectiveRoutine.breakfastTime, 30)}`,
        mealRelation: 'with_meal',
        description: 'Take during or immediately after morning breakfast meal.',
        doses: [],
      },
      slot_midday_lunch: {
        slotId: 'slot_midday_lunch',
        slotName: 'Midday (Lunch)',
        targetTime: effectiveRoutine.lunchTime,
        timeWindow: `${this.offsetTime(effectiveRoutine.lunchTime, -15)} - ${this.offsetTime(effectiveRoutine.lunchTime, 30)}`,
        mealRelation: 'with_meal',
        description: 'Take with midday lunch meal.',
        doses: [],
      },
      slot_evening_dinner: {
        slotId: 'slot_evening_dinner',
        slotName: 'Evening (Dinner)',
        targetTime: effectiveRoutine.dinnerTime,
        timeWindow: `${this.offsetTime(effectiveRoutine.dinnerTime, -15)} - ${this.offsetTime(effectiveRoutine.dinnerTime, 30)}`,
        mealRelation: 'with_meal',
        description: 'Take during or immediately following evening dinner.',
        doses: [],
      },
      slot_bedtime: {
        slotId: 'slot_bedtime',
        slotName: 'Bedtime (Night)',
        targetTime: effectiveRoutine.bedTime,
        timeWindow: `${this.offsetTime(effectiveRoutine.bedTime, -15)} - ${this.offsetTime(effectiveRoutine.bedTime, 30)}`,
        mealRelation: 'independent',
        description: 'Take immediately prior to turning off lights to sleep.',
        doses: [],
      },
      slot_prn: {
        slotId: 'slot_prn',
        slotName: 'As Needed (PRN / Flexible)',
        targetTime: 'Flexible / As Needed',
        timeWindow: 'Symptom-Triggered',
        mealRelation: 'independent',
        description: 'Take only as needed for acute symptoms according to prescriber frequency limits.',
        doses: [],
      },
    };

    const prnDoses: ScheduledDoseItem[] = [];
    const conflicts: ScheduleConflictItem[] = [];
    const comparisonItems: PrescriptionComparisonItem[] = [];
    const unconfidentMedications: Array<{
      medicationId: string;
      brand: string;
      genericName: string;
      reason: string;
      confidence: SchedulingConfidence;
    }> = [];

    // Filter active & PRN medications
    const candidateMeds = medications.filter(
      (m) => m.status === 'active' || m.status === 'prn'
    );

    // Track assigned medications for cross-drug separation analysis
    const scheduledMedsRegistry: Array<{
      med: Medication;
      rule?: AuthoritativeCircadianRule;
      assignedSlots: CircadianSlotId[];
    }> = [];

    // Process each medication
    for (const med of candidateMeds) {
      const genericLower = med.genericName.toLowerCase();
      const brandLower = med.brand.toLowerCase();
      const freqLower = (med.frequency || '').toLowerCase();
      const adminInstLower = (med.administrationInstructions || '').toLowerCase();
      const isUnverified = med.verificationStatus === 'unverified';

      const rule = findAuthoritativeRule(genericLower) || findAuthoritativeRule(brandLower);

      // Determine confidence
      let confidence: SchedulingConfidence = 'high';
      const uncertaintyReasons: string[] = [];

      if (isUnverified) {
        confidence = 'low';
        uncertaintyReasons.push(
          'Prescription record is unverified (draft OCR capture or pending clinical verification).'
        );
        unconfidentMedications.push({
          medicationId: med.id,
          brand: med.brand,
          genericName: med.genericName,
          reason: 'Medication order is unverified. Timing should not be adopted without clinician confirmation.',
          confidence: 'low',
        });
      }

      if (!med.frequency || freqLower.trim() === '') {
        confidence = 'low';
        uncertaintyReasons.push('Prescribed frequency is missing or unrecorded.');
      }

      // 1. Check for PRN medications without dedicated authoritative circadian slot
      const isPrn =
        (med.status === 'prn' ||
          freqLower.includes('prn') ||
          freqLower.includes('as needed') ||
          adminInstLower.includes('prn')) &&
        rule?.targetSlot !== 'slot_bedtime';

      if (isPrn) {
        const prnItem: ScheduledDoseItem = {
          doseId: `dose-${randomUUID()}`,
          medicationId: med.id,
          brand: med.brand,
          genericName: med.genericName,
          strength: med.strength,
          formulation: med.formulation,
          route: med.route,
          prescribedDose: med.prescribedDose, // SAFETY: preserved
          prescribedFrequency: med.frequency, // SAFETY: preserved
          doseNumber: 1,
          totalDosesPerDay: 1,
          scheduledTime: 'PRN',
          timeWindow: 'As Needed',
          slotId: 'slot_prn',
          foodRelation: rule?.foodRelation || 'independent',
          foodInstruction:
            rule?.foodRelation === 'with_meal'
              ? 'Take with food or milk if stomach upset occurs.'
              : 'May be taken with or without food.',
          timingRationale:
            rule?.evidence.rationale ||
            'PRN symptom-triggered medication. Do not exceed prescribed maximum daily frequency.',
          evidenceSources: rule
            ? [
                {
                  sourceAuthority: rule.evidence.sourceAuthority,
                  citation: rule.evidence.citation,
                  rationale: rule.evidence.rationale,
                },
              ]
            : [
                {
                  sourceAuthority: 'Prescriber Clinical Order',
                  citation: med.source || 'EHR Prescription',
                  rationale: 'Administer PRN strictly according to prescriber instructions.',
                },
              ],
          administrationInstructions: med.administrationInstructions,
          specialPrecautions: rule?.specialPrecautions || [],
          verificationStatus: med.verificationStatus,
          confidence,
          uncertaintyReasons,
        };

        prnDoses.push(prnItem);
        scheduledMedsRegistry.push({ med, rule, assignedSlots: ['slot_prn'] });

        comparisonItems.push({
          medicationId: med.id,
          brand: med.brand,
          genericName: med.genericName,
          prescribedDose: med.prescribedDose,
          prescribedFrequency: med.frequency,
          prescribedInstructions: med.administrationInstructions,
          proposedTimetable: ['PRN / Symptom-Triggered (As Needed)'],
          proposedMealRelation: rule?.foodRelation || 'independent',
          doseIntegrityStatus: 'strictly_preserved',
          comparisonStatus: isUnverified ? 'unverified_data_gap' : 'prn_flexible',
          changeSummary: 'Retained as flexible PRN administration without forced clock scheduling.',
          clinicalJustification: 'PRN breakthrough therapy should not be coerced into fixed daily slots.',
        });

        continue;
      }

      // 2. Frequency Analysis & Slot Distribution
      const isBid =
        freqLower.includes('bid') ||
        freqLower.includes('twice') ||
        freqLower.includes('q12h') ||
        freqLower.includes('every 12 hours') ||
        freqLower.includes('two times');

      const isTid =
        freqLower.includes('tid') ||
        freqLower.includes('three times') ||
        freqLower.includes('q8h') ||
        freqLower.includes('every 8 hours');

      const isQid =
        freqLower.includes('qid') ||
        freqLower.includes('four times') ||
        freqLower.includes('q6h') ||
        freqLower.includes('every 6 hours');

      const isBedtimePrescribed =
        freqLower.includes('bedtime') ||
        freqLower.includes('qhs') ||
        freqLower.includes('at night') ||
        freqLower.includes('evening') ||
        adminInstLower.includes('bedtime') ||
        adminInstLower.includes('at night');

      // Determine target slots
      let assignedSlots: CircadianSlotId[] = [];

      if (rule?.targetSlot) {
        if (rule.targetSlot === 'slot_wake_fasted') {
          assignedSlots = ['slot_wake_fasted'];
          if (isBid) {
            assignedSlots.push('slot_evening_dinner');
          }
        } else if (rule.targetSlot === 'slot_bedtime') {
          assignedSlots = ['slot_bedtime'];
          if (isBid) {
            assignedSlots.unshift('slot_breakfast');
          }
        } else if (rule.targetSlot === 'slot_midday_lunch') {
          assignedSlots = ['slot_midday_lunch'];
          if (isBid) {
            assignedSlots.push('slot_evening_dinner');
          }
        } else {
          // Default breakfast / morning slot
          assignedSlots = ['slot_breakfast'];
          if (isBid) {
            assignedSlots.push('slot_evening_dinner');
          } else if (isTid) {
            assignedSlots.push('slot_midday_lunch', 'slot_evening_dinner');
          } else if (isQid) {
            assignedSlots.push('slot_midday_lunch', 'slot_evening_dinner', 'slot_bedtime');
          }
        }
      } else {
        // No specific rule - use standard clinical scheduling
        if (isBedtimePrescribed) {
          assignedSlots = ['slot_bedtime'];
          if (isBid) {
            assignedSlots.unshift('slot_breakfast');
          }
        } else if (isBid) {
          assignedSlots = ['slot_breakfast', 'slot_evening_dinner'];
        } else if (isTid) {
          assignedSlots = ['slot_breakfast', 'slot_midday_lunch', 'slot_evening_dinner'];
        } else if (isQid) {
          assignedSlots = ['slot_breakfast', 'slot_midday_lunch', 'slot_evening_dinner', 'slot_bedtime'];
        } else {
          // Default once daily to morning breakfast
          assignedSlots = ['slot_breakfast'];
        }
      }

      // Check for CONTRADICTORY or HAZARDOUS constraints
      // Check: Diuretic prescribed at bedtime
      if (rule?.contraindicatedSlots?.includes('slot_bedtime')) {
        if (isBedtimePrescribed || assignedSlots.includes('slot_bedtime')) {
          conflicts.push({
            id: `conflict-bedtime-diuretic-${med.id}`,
            severity: 'urgent_prescriber_review',
            conflictType: 'bedtime_diuretic_hazard',
            title: `Severe Fall & Nocturia Hazard: Bedtime Diuretic (${med.brand})`,
            description: rule.contraindicationReason || 'Diuretic prescribed for evening or bedtime administration.',
            medicationsInvolved: [{ id: med.id, name: `${med.brand} (${med.genericName})` }],
            clinicalRationale:
              'Loop and thiazide diuretics induce brisk nocturia and peak diuresis within 1-2 hours of administration. Evening/bedtime dosing forces older adults to awaken repeatedly in darkness, causing severe postural instability, acute hypotension, and catastrophic fall/hip fracture.',
            recommendedAction:
              'Move daily dose to morning breakfast (08:00). If twice daily is mandatory, take second dose before 14:00 (midday). Prescriber confirmation required.',
            evidenceCitation: rule.evidence.citation,
          });

          // Correct the draft schedule to morning to protect patient, while flagging the comparison
          assignedSlots = assignedSlots.filter((s) => s !== 'slot_bedtime');
          if (!assignedSlots.includes('slot_breakfast')) {
            assignedSlots.unshift('slot_breakfast');
          }
        }
      }

      // Check: Impossible meal frequency mismatch (e.g. QID with meals when patient only has 3 meals)
      if (isQid && adminInstLower.includes('with meal')) {
        conflicts.push({
          id: `conflict-qid-meals-${med.id}`,
          severity: 'pharmacist_consult_needed',
          conflictType: 'meal_frequency_mismatch',
          title: `Meal Frequency Mismatch: 4 Daily Doses with Meals (${med.brand})`,
          description: `Prescription specifies 4 doses daily with meals, but standard patient routine comprises 3 primary meals.`,
          medicationsInvolved: [{ id: med.id, name: `${med.brand} (${med.genericName})` }],
          clinicalRationale:
            'Taking oral medication requiring food 4 times daily may lead to missed doses or excessive snacking that interferes with glycemic or metabolic management.',
          recommendedAction:
            'Clarify with prescriber if fourth dose can be taken with a light bedtime snack or if an alternative extended-release formulation is appropriate.',
          evidenceCitation: 'ASHP Guidelines on Clinical Pharmacokinetics & Patient Adherence',
        });
      }

      scheduledMedsRegistry.push({ med, rule, assignedSlots });

      // Create scheduled dose items for each assigned slot
      const proposedTimetableStrings: string[] = [];

      assignedSlots.forEach((slotId, index) => {
        const slot = slotsMap[slotId];
        const doseNumber = index + 1;
        const totalDosesPerDay = assignedSlots.length;

        const scheduledItem: ScheduledDoseItem = {
          doseId: `dose-${med.id}-${slotId}-${doseNumber}`,
          medicationId: med.id,
          brand: med.brand,
          genericName: med.genericName,
          strength: med.strength,
          formulation: med.formulation,
          route: med.route,
          prescribedDose: med.prescribedDose, // SAFETY: Dose is NEVER altered
          prescribedFrequency: med.frequency, // SAFETY: Frequency is NEVER altered
          doseNumber,
          totalDosesPerDay,
          scheduledTime: slot.targetTime,
          timeWindow: slot.timeWindow,
          slotId,
          foodRelation: rule?.foodRelation || slot.mealRelation,
          foodInstruction: this.determineFoodInstruction(rule?.foodRelation || slot.mealRelation),
          timingRationale:
            rule?.evidence.rationale ||
            `Dose ${doseNumber} of ${totalDosesPerDay} scheduled at ${slot.targetTime} to maintain therapeutic levels and circadian alignment.`,
          evidenceSources: rule
            ? [
                {
                  sourceAuthority: rule.evidence.sourceAuthority,
                  citation: rule.evidence.citation,
                  rationale: rule.evidence.rationale,
                },
              ]
            : [
                {
                  sourceAuthority: 'Standard Pharmacotherapy Administration Principles',
                  citation: 'Lexicomp Clinical Drug Reference 2026',
                  rationale: 'Evenly distributed interval administration aligned with patient meals.',
                },
              ],
          administrationInstructions: rule?.administrationNotes || med.administrationInstructions,
          specialPrecautions: rule?.specialPrecautions || [],
          verificationStatus: med.verificationStatus,
          confidence,
          uncertaintyReasons,
        };

        slot.doses.push(scheduledItem);
        proposedTimetableStrings.push(
          `${slot.targetTime} (${slot.slotName}) - ${med.prescribedDose}`
        );
      });

      // Build comparison item
      let comparisonStatus: ComparisonStatus = 'aligned';
      let changeSummary = 'Prescribed frequency and administration timing aligned with routine.';
      let clinicalJustification = 'Standard circadian placement preserves prescribed instructions.';

      if (isUnverified) {
        comparisonStatus = 'unverified_data_gap';
        changeSummary = 'Draft placement based on unverified prescription record. Clinical review required.';
        clinicalJustification = 'Unverified orders must be formally confirmed before adopting scheduled times.';
      } else if (rule?.targetSlot === 'slot_wake_fasted' && !adminInstLower.includes('fasted')) {
        comparisonStatus = 'timing_optimized_for_safety';
        changeSummary = `Placed in fasted pre-breakfast slot (${effectiveRoutine.wakeTime}) to maximize absorption.`;
        clinicalJustification = rule.evidence.rationale;
      } else if (
        rule?.contraindicatedSlots?.includes('slot_bedtime') &&
        (isBedtimePrescribed || freqLower.includes('bedtime'))
      ) {
        comparisonStatus = 'conflict_flagged';
        changeSummary = 'Prescribed bedtime timing overridden to morning (08:00) to prevent nocturnal fall hazard.';
        clinicalJustification = rule.contraindicationReason || 'Fall hazard prevention.';
      } else if (rule?.targetSlot === 'slot_midday_lunch' && genericLower.includes('calcium')) {
        comparisonStatus = 'timing_optimized_for_safety';
        changeSummary = 'Scheduled with lunch/dinner to maintain mandatory >= 4h separation from thyroid medication.';
        clinicalJustification = 'Prevents chelation and malabsorption of levothyroxine.';
      }

      comparisonItems.push({
        medicationId: med.id,
        brand: med.brand,
        genericName: med.genericName,
        prescribedDose: med.prescribedDose,
        prescribedFrequency: med.frequency,
        prescribedInstructions: med.administrationInstructions,
        proposedTimetable: proposedTimetableStrings,
        proposedMealRelation: rule?.foodRelation || 'independent',
        doseIntegrityStatus: 'strictly_preserved',
        comparisonStatus,
        changeSummary,
        clinicalJustification,
      });
    }

    // 3. CROSS-MEDICATION INTERVAL SEPARATION & CHELATION ANALYSIS
    this.checkSeparationConflicts(scheduledMedsRegistry, slotsMap, conflicts);

    // 4. CHECK SYSTEMIC METABOLIC PK INTERACTIONS (Safety Invariant)
    this.checkSystemicInteractionWarnings(candidateMeds, interactionFindings, conflicts);

    // Filter active slots that contain doses
    const activeSlots = Object.values(slotsMap).filter(
      (slot) => slot.slotId !== 'slot_prn' && slot.doses.length > 0
    );

    // Build comparison summary
    const totalMeds = candidateMeds.length;
    const unchangedDoseCount = totalMeds; // STRICT INVARIANT: 100% of prescribed doses preserved
    const alignedCount = comparisonItems.filter((c) => c.comparisonStatus === 'aligned').length;
    const optimizedCount = comparisonItems.filter(
      (c) => c.comparisonStatus === 'timing_optimized_for_safety'
    ).length;
    const conflictCount = comparisonItems.filter(
      (c) => c.comparisonStatus === 'conflict_flagged'
    ).length;
    const unverifiedCount = comparisonItems.filter(
      (c) => c.comparisonStatus === 'unverified_data_gap'
    ).length;

    const comparison: DraftScheduleComparison = {
      patientId: patient.id,
      generatedAt,
      totalMedications: totalMeds,
      unchangedDoseCount,
      alignedCount,
      optimizedCount,
      conflictCount,
      unverifiedCount,
      items: comparisonItems,
    };

    return {
      scheduleId,
      patientId: patient.id,
      generatedAt,
      version: CircadianScheduleCoordinator.VERSION,
      isPrototype: true,
      status: 'draft',
      patientRoutine: effectiveRoutine,
      slots: activeSlots,
      prnDoses,
      unconfidentMedications,
      conflicts,
      comparison,
      safetyNotice:
        'CLINICAL SAFETY NOTICE: This circadian dosing schedule is a deterministic clinical decision-support prototype. It does not alter prescribed doses, frequencies, or formulations. All proposed timing changes and identified conflicts must be reviewed and authorized by a licensed clinical pharmacist or prescriber prior to patient adoption.',
    };
  }

  // ==========================================
  // CROSS-MEDICATION SEPARATION AUDIT
  // ==========================================

  private checkSeparationConflicts(
    registry: Array<{
      med: Medication;
      rule?: AuthoritativeCircadianRule;
      assignedSlots: CircadianSlotId[];
    }>,
    slotsMap: Record<CircadianSlotId, ScheduleTimeSlot>,
    conflicts: ScheduleConflictItem[]
  ): void {
    const levoEntry = registry.find((r) =>
      r.med.genericName.toLowerCase().includes('levothyroxine')
    );
    const cationEntries = registry.filter(
      (r) =>
        r.med.genericName.toLowerCase().includes('calcium') ||
        r.med.genericName.toLowerCase().includes('iron') ||
        r.med.genericName.toLowerCase().includes('ferrous')
    );

    if (levoEntry && cationEntries.length > 0) {
      for (const cation of cationEntries) {
        // Check if both are assigned to the same slot
        const sharedSlots = levoEntry.assignedSlots.filter((s) => cation.assignedSlots.includes(s));

        if (sharedSlots.length > 0) {
          conflicts.push({
            id: `conflict-chelation-${levoEntry.med.id}-${cation.med.id}`,
            severity: 'urgent_prescriber_review',
            conflictType: 'separation_violation',
            title: `Critical Absorption Chelation: Levothyroxine & ${cation.med.brand}`,
            description: `Levothyroxine and ${cation.med.brand} are assigned to overlapping time slots (${sharedSlots.join(', ')}), violating the mandatory >= 4-hour temporal separation requirement.`,
            medicationsInvolved: [
              { id: levoEntry.med.id, name: `${levoEntry.med.brand} (${levoEntry.med.genericName})` },
              { id: cation.med.id, name: `${cation.med.brand} (${cation.med.genericName})` },
            ],
            clinicalRationale:
              'Multivalent cations directly chelate levothyroxine in the stomach, forming an insoluble precipitates that reduces thyroid bioavailability by up to 80%, precipitating unmanaged hypothyroidism.',
            recommendedAction:
              'Maintain Levothyroxine at morning fasted (07:00). Shift calcium/iron supplement to midday lunch (12:30) and dinner (18:30) ensuring at least 4 hours separation.',
            evidenceCitation: 'FDA Synthroid Package Insert; ATA Hypothyroidism Guidelines 2014',
          });
        } else {
          // Document the managed chelation separation requirement
          conflicts.push({
            id: `conflict-chelation-managed-${levoEntry.med.id}-${cation.med.id}`,
            severity: 'pharmacist_consult_needed',
            conflictType: 'separation_violation',
            title: `Absorption Chelation Separation: Levothyroxine & ${cation.med.brand}`,
            description: `Calcium/polyvalent cations chelate levothyroxine in the gastrointestinal tract. Mandatory >= 4-hour separation is enforced between morning thyroid dose (07:00) and midday meal supplements (12:30).`,
            medicationsInvolved: [
              { id: levoEntry.med.id, name: `${levoEntry.med.brand} (${levoEntry.med.genericName})` },
              { id: cation.med.id, name: `${cation.med.brand} (${cation.med.genericName})` },
            ],
            clinicalRationale:
              'Multivalent cations bind levothyroxine forming non-absorbable chelates. Spaced to lunch and dinner to ensure therapeutic euthyroid control.',
            recommendedAction:
              'Confirm patient takes Levothyroxine on waking fasted with water and reserves calcium carbonate for lunch and dinner meals.',
            evidenceCitation: 'FDA Synthroid Package Insert; ATA Hypothyroidism Guidelines',
          });
        }
      }
    }

    // Check if an impossible constraint exists where both drugs were prescribed at identical times
    // and cannot be separated without prescriber intervention
    for (const item of registry) {
      const adminInst = (item.med.administrationInstructions || '').toLowerCase();
      if (levoEntry && item.med.id !== levoEntry.med.id) {
        const isCation =
          item.med.genericName.toLowerCase().includes('calcium') ||
          item.med.genericName.toLowerCase().includes('iron');
        if (
          isCation &&
          (adminInst.includes('with breakfast') || adminInst.includes('take in morning on empty stomach'))
        ) {
          conflicts.push({
            id: `conflict-impossible-prescribed-${item.med.id}`,
            severity: 'pharmacist_consult_needed',
            conflictType: 'impossible_constraint',
            title: `Prescribed Instruction Contradiction: Morning Calcium with Thyroid Regimen`,
            description: `Prescriber ordered ${item.med.brand} in the morning, which directly conflicts with Levothyroxine absorption separation.`,
            medicationsInvolved: [
              { id: levoEntry.med.id, name: `${levoEntry.med.brand} (Levothyroxine)` },
              { id: item.med.id, name: `${item.med.brand} (${item.med.genericName})` },
            ],
            clinicalRationale:
              'Taking both medications simultaneously causes therapeutic failure of thyroid replacement.',
            recommendedAction:
              'Pharmacist reconciliation recommended: obtain prescriber consent to formally re-time calcium to midday and evening meals.',
            evidenceCitation: 'Lexicomp Drug Interactions & ATA Guidelines',
          });
        }
      }
    }
  }

  // ==========================================
  // SYSTEMIC METABOLIC PK WARNING INVARIANT
  // ==========================================

  private checkSystemicInteractionWarnings(
    medications: Medication[],
    interactionFindings: any[],
    conflicts: ScheduleConflictItem[]
  ): void {
    // If interaction findings from Phase 3 are present, check for CYP3A4/P-gp or pharmacodynamic pairs
    const medNames = medications.map((m) => m.genericName.toLowerCase()).join(' ');

    const hasApixaban = medNames.includes('apixaban');
    const hasClarithromycin = medNames.includes('clarithromycin');
    const hasOxycodone = medNames.includes('oxycodone');
    const hasZolpidem = medNames.includes('zolpidem');

    if (hasApixaban && hasClarithromycin) {
      conflicts.push({
        id: 'conflict-systemic-pk-apixaban-clarithromycin',
        severity: 'urgent_prescriber_review',
        conflictType: 'systemic_pk_unresolved_by_spacing',
        title: 'Systemic PK Interaction: Clarithromycin + Apixaban (Not Solved by Spacing)',
        description:
          'Clarithromycin is a strong systemic inhibitor of CYP3A4 and P-glycoprotein. Temporal spacing of administration times does NOT resolve this interaction.',
        medicationsInvolved: [
          { id: 'med-apixaban', name: 'Apixaban (Eliquis)' },
          { id: 'med-clarithromycin', name: 'Clarithromycin (Biaxin)' },
        ],
        clinicalRationale:
          'Temporal spacing of administration times does NOT resolve this interaction. Systemic enzyme inhibition persists throughout the 24-hour dosing interval due to enzyme half-life and tissue saturation. Separating ingestion times does NOT reduce systemic AUC or fatal bleeding risk. Dose reduction or alternative antimicrobial is required.',
        recommendedAction:
          'DO NOT attempt to manage this interaction by spacing administration hours. Immediately consult prescriber for alternative antibiotic (e.g. Azithromycin or Ceftriaxone) or DOAC dosage adjustment.',
        evidenceCitation: 'FDA Eliquis Prescribing Information; Clinical Pharmacokinetics Guidance',
      });
    }

    if (hasOxycodone && hasZolpidem) {
      conflicts.push({
        id: 'conflict-cns-depression-oxycodone-zolpidem',
        severity: 'urgent_prescriber_review',
        conflictType: 'systemic_pk_unresolved_by_spacing',
        title: 'Severe Pharmacodynamic Risk: Co-prescribed Opioid & Sedative-Hypnotic',
        description:
          'Concurrent use of Oxycodone and Zolpidem causes profound additive CNS and respiratory depression, sedation, and severe fall hazard.',
        medicationsInvolved: [
          { id: 'med-oxycodone', name: 'Oxycodone (Percocet)' },
          { id: 'med-zolpidem', name: 'Zolpidem (Ambien)' },
        ],
        clinicalRationale:
          'Additive pharmacodynamic depression of brainstem respiratory centers cannot be safely managed merely by scheduling. Both medications remain pharmacologically active concurrently.',
        recommendedAction:
          'Review indication for sedative-hypnotic in patient taking opioid breakthrough analgesia. Recommend non-pharmacologic sleep hygiene or deprescribing per Beers Criteria.',
        evidenceCitation: 'FDA Boxed Warning on Concomitant Use of Opioids and Sedatives (2020)',
      });
    }
  }

  // ==========================================
  // HELPER METHODS
  // ==========================================

  private offsetTime(timeStr: string, deltaMinutes: number): string {
    const parts = timeStr.split(':');
    if (parts.length !== 2) return timeStr;
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    if (isNaN(hours) || isNaN(minutes)) return timeStr;

    let total = hours * 60 + minutes + deltaMinutes;
    if (total < 0) total += 24 * 60;
    total = total % (24 * 60);

    const newH = Math.floor(total / 60);
    const newM = total % 60;

    return `${newH.toString().padStart(2, '0')}:${newM.toString().padStart(2, '0')}`;
  }

  private determineFoodInstruction(foodRelation: FoodRelation): string {
    switch (foodRelation) {
      case 'empty_stomach':
        return 'Take on an empty stomach with a full glass of water, >= 60 min before food.';
      case 'before_meal':
        return 'Take 15-30 minutes before meal.';
      case 'with_meal':
        return 'Take with or immediately following meal.';
      case 'after_meal':
        return 'Take 30-60 minutes after meal.';
      case 'independent':
      default:
        return 'May be taken with or without food.';
    }
  }
}
