import type { CircadianSlotId, FoodRelation } from '../../shared/chronoTypes.js';

export interface ScheduleScenarioFixture {
  scenarioId: string;
  title: string;
  description: string;
  patientId: string;
  testMedicationIds: string[];
  expectedSlotAssignments: Array<{
    medicationGenericSubstring: string;
    expectedSlotId: CircadianSlotId;
    expectedFoodRelation: FoodRelation;
  }>;
  expectedConstraints: Array<{
    constraintType: string;
    descriptionSubstring: string;
  }>;
  expectedConflicts: Array<{
    conflictType: string;
    severity: 'critical' | 'warning' | 'info';
    descriptionSubstring: string;
  }>;
  expectedAssertions: {
    canConstructSafely: boolean;
    requiresReview: boolean;
    minSeparationHours?: number;
    hasMealRelation: boolean;
    hasBedtimePlacement: boolean;
    hasMorningPlacement: boolean;
    hasUnresolvedFoodInteraction: boolean;
    isMissingFrequency: boolean;
  };
  notes: string;
}

export const SYNTHETIC_SCHEDULE_FIXTURES: ScheduleScenarioFixture[] = [
  {
    scenarioId: 'fix-sched-01-meal-relative',
    title: 'Meal-Relative Administration Instructions',
    description:
      'Tests synchronization with patient daily routine meals: Glipizide scheduled strictly with morning breakfast to prevent hypoglycemia; Metformin scheduled with breakfast and dinner to minimize GI intolerance.',
    patientId: 'p7777777-7777-7777-7777-777777777777', // Evelyn Montgomery
    testMedicationIds: ['med-p7-2', 'med-p7-1'],
    expectedSlotAssignments: [
      {
        medicationGenericSubstring: 'Glipizide',
        expectedSlotId: 'slot_breakfast',
        expectedFoodRelation: 'with_meal',
      },
    ],
    expectedConstraints: [
      {
        constraintType: 'meal_relation',
        descriptionSubstring: 'with breakfast meal',
      },
    ],
    expectedConflicts: [],
    expectedAssertions: {
      canConstructSafely: true,
      requiresReview: false,
      hasMealRelation: true,
      hasBedtimePlacement: false,
      hasMorningPlacement: true,
      hasUnresolvedFoodInteraction: false,
      isMissingFrequency: false,
    },
    notes: 'Verifies correct anchoring to breakfast time (08:00) with "with_meal" relation.',
  },
  {
    scenarioId: 'fix-sched-02-morning-and-bedtime',
    title: 'Circadian Polar Placement: Morning Diuretic vs Bedtime Sedative/Alpha-Blocker',
    description:
      'Furosemide must be placed in the morning (slot_breakfast) to avoid nocturia and nocturnal falls; Zolpidem and Tamsulosin placed strictly in bedtime slot (slot_bedtime) for nocturnal sedation and orthostasis avoidance.',
    patientId: 'p2222222-2222-2222-2222-222222222222', // Arthur Pendelton
    testMedicationIds: ['med-p2-3', 'med-p2-5'],
    expectedSlotAssignments: [
      {
        medicationGenericSubstring: 'Furosemide',
        expectedSlotId: 'slot_breakfast',
        expectedFoodRelation: 'with_meal',
      },
      {
        medicationGenericSubstring: 'Zolpidem',
        expectedSlotId: 'slot_bedtime',
        expectedFoodRelation: 'independent',
      },
    ],
    expectedConstraints: [
      {
        constraintType: 'circadian_timing',
        descriptionSubstring: 'morning slot to prevent nocturia',
      },
      {
        constraintType: 'circadian_timing',
        descriptionSubstring: 'bedtime slot',
      },
    ],
    expectedConflicts: [],
    expectedAssertions: {
      canConstructSafely: true,
      requiresReview: true, // Zolpidem requires geriatric caution
      hasMealRelation: false,
      hasBedtimePlacement: true,
      hasMorningPlacement: true,
      hasUnresolvedFoodInteraction: false,
      isMissingFrequency: false,
    },
    notes: 'Verifies circadian polarization: morning fluid clearance vs bedtime sleep induction.',
  },
  {
    scenarioId: 'fix-sched-03-validated-minimum-interval',
    title: 'Validated Minimum Interval Separation (Levothyroxine vs Calcium >= 4h)',
    description:
      'Levothyroxine placed in wake fasted slot (07:00); Calcium Carbonate placed in lunch slot (12:30). Engine validates interval separation >= 4 hours (actual: 5.5 hours), satisfying chelation avoidance constraint.',
    patientId: 'p3333333-3333-3333-3333-333333333333', // Margaret Chen
    testMedicationIds: ['med-p3-1', 'med-p3-2'],
    expectedSlotAssignments: [
      {
        medicationGenericSubstring: 'Levothyroxine',
        expectedSlotId: 'slot_wake_fasted',
        expectedFoodRelation: 'empty_stomach',
      },
      {
        medicationGenericSubstring: 'Calcium Carbonate',
        expectedSlotId: 'slot_midday_lunch',
        expectedFoodRelation: 'with_meal',
      },
    ],
    expectedConstraints: [
      {
        constraintType: 'interval_separation',
        descriptionSubstring: 'Separate by >= 4 hours',
      },
    ],
    expectedConflicts: [],
    expectedAssertions: {
      canConstructSafely: true,
      requiresReview: false,
      minSeparationHours: 4,
      hasMealRelation: true,
      hasBedtimePlacement: false,
      hasMorningPlacement: true,
      hasUnresolvedFoodInteraction: false,
      isMissingFrequency: false,
    },
    notes: 'Gold-standard pharmacokinetic timing separation test.',
  },
  {
    scenarioId: 'fix-sched-04-incompatible-timing',
    title: 'Incompatible Timing Constraints (Bedtime Fasted vs Bedtime with Snack)',
    description:
      'Simulates a scenario where Drug A requires bedtime on an empty stomach (>= 2h post food) while Drug B requires bedtime with a substantial snack to prevent nausea. Engine identifies mutually exclusive constraints in slot_bedtime.',
    patientId: 'p8888888-8888-8888-8888-888888888888', // Samuel O'Reilly
    testMedicationIds: ['med-test-bedtime-fasted', 'med-test-bedtime-food'],
    expectedSlotAssignments: [],
    expectedConstraints: [
      {
        constraintType: 'meal_relation',
        descriptionSubstring: 'empty stomach',
      },
      {
        constraintType: 'meal_relation',
        descriptionSubstring: 'with food',
      },
    ],
    expectedConflicts: [
      {
        conflictType: 'incompatible_food_relation',
        severity: 'critical',
        descriptionSubstring: 'Conflicting food requirements in slot_bedtime',
      },
    ],
    expectedAssertions: {
      canConstructSafely: false,
      requiresReview: true,
      hasMealRelation: true,
      hasBedtimePlacement: true,
      hasMorningPlacement: false,
      hasUnresolvedFoodInteraction: false,
      isMissingFrequency: false,
    },
    notes: 'Constraint solver must detect irreconcilable single-slot timing directives.',
  },
  {
    scenarioId: 'fix-sched-05-unresolved-food-interaction',
    title: 'Unresolved Food Interaction: High-Fat / Dietary Avoidance Advisory',
    description:
      'Medication order includes instruction "Avoid high-fat meals and grapefruit juice". Engine schedules dose and attaches explicit dietary advisory to the scheduled dose item.',
    patientId: 'p1111111-1111-1111-1111-111111111111', // Eleanor Vance
    testMedicationIds: ['med-p1-6'],
    expectedSlotAssignments: [
      {
        medicationGenericSubstring: 'Atorvastatin',
        expectedSlotId: 'slot_bedtime',
        expectedFoodRelation: 'independent',
      },
    ],
    expectedConstraints: [
      {
        constraintType: 'food_avoidance',
        descriptionSubstring: 'Avoid grapefruit',
      },
    ],
    expectedConflicts: [],
    expectedAssertions: {
      canConstructSafely: true,
      requiresReview: false,
      hasMealRelation: false,
      hasBedtimePlacement: true,
      hasMorningPlacement: false,
      hasUnresolvedFoodInteraction: true,
      isMissingFrequency: false,
    },
    notes: 'Dietary interaction warnings must be attached to dose instructions.',
  },
  {
    scenarioId: 'fix-sched-06-missing-prescribed-frequency',
    title: 'Missing Prescribed Frequency: Schedule Placement Halt',
    description:
      'Order record lacks frequency ("Take 1 tablet as directed"). Engine cannot calculate doses per day or valid slots; flags medication and halts safe automatic scheduling for this item.',
    patientId: 'p7777777-7777-7777-7777-777777777777', // Evelyn Montgomery
    testMedicationIds: ['med-p7-1'],
    expectedSlotAssignments: [],
    expectedConstraints: [],
    expectedConflicts: [
      {
        conflictType: 'unresolved_frequency',
        severity: 'warning',
        descriptionSubstring: 'Missing prescribed frequency',
      },
    ],
    expectedAssertions: {
      canConstructSafely: false,
      requiresReview: true,
      hasMealRelation: false,
      hasBedtimePlacement: false,
      hasMorningPlacement: false,
      hasUnresolvedFoodInteraction: false,
      isMissingFrequency: true,
    },
    notes: 'Safety guardrail: never guess frequency when building a daily schedule.',
  },
  {
    scenarioId: 'fix-sched-07-schedule-cannot-be-safely-constructed',
    title: 'Schedule Construction Infeasible: Unverified Medication Safety Gate',
    description:
      'Regimen contains unverified newly imported prescriptions with unreviewed duplicate active ingredients. Safety invariant halts generation of accepted schedule, outputting draft status with clinical safety notice.',
    patientId: 'p1111111-1111-1111-1111-111111111111', // Eleanor Vance
    testMedicationIds: ['med-p1-6', 'med-p1-4'],
    expectedSlotAssignments: [],
    expectedConstraints: [],
    expectedConflicts: [
      {
        conflictType: 'unverified_medication_gate',
        severity: 'critical',
        descriptionSubstring: 'Unverified medications cannot be finalized',
      },
    ],
    expectedAssertions: {
      canConstructSafely: false,
      requiresReview: true,
      hasMealRelation: false,
      hasBedtimePlacement: false,
      hasMorningPlacement: false,
      hasUnresolvedFoodInteraction: false,
      isMissingFrequency: false,
    },
    notes: 'Deterministic safety gate prevents unverified orders from becoming active schedules.',
  },
  {
    scenarioId: 'fix-sched-08-parkinsonian-protein-separation',
    title: 'Parkinsonian Levodopa Dosing: Dietary Protein Amino Acid Separation',
    description:
      'Carbidopa/Levodopa (Sinemet) 25/100 mg prescribed TID. Large neutral dietary amino acids compete with levodopa for transport across the intestinal mucosa and blood-brain barrier. Engine schedules doses strictly 45–60 min before meals (07:15, 11:45, 17:45).',
    patientId: 'p8888888-8888-8888-8888-888888888888', // Samuel O'Reilly
    testMedicationIds: ['med-p8-1'],
    expectedSlotAssignments: [
      {
        medicationGenericSubstring: 'Carbidopa',
        expectedSlotId: 'slot_wake_fasted',
        expectedFoodRelation: 'empty_stomach',
      },
    ],
    expectedConstraints: [
      {
        constraintType: 'meal_relation',
        descriptionSubstring: 'Take 45-60 minutes before meals to avoid dietary protein competition',
      },
    ],
    expectedConflicts: [],
    expectedAssertions: {
      canConstructSafely: true,
      requiresReview: false,
      hasMealRelation: true,
      hasBedtimePlacement: false,
      hasMorningPlacement: true,
      hasUnresolvedFoodInteraction: false,
      isMissingFrequency: false,
    },
    notes: 'Demonstrates specialized chronotherapeutic dietary coordination in Parkinson disease.',
  },
];

export function getScheduleFixtureById(scenarioId: string): ScheduleScenarioFixture | undefined {
  return SYNTHETIC_SCHEDULE_FIXTURES.find((s) => s.scenarioId === scenarioId);
}
