import type {
  ConflictEngineResult,
  FindingExplanation,
  InteractionFinding,
  RegimenExplanationResult,
} from '../../../shared/interactionTypes.js';

export class InteractionExplanationService {
  /**
   * Generates deterministic, evidence-grounded clinical explanations.
   * Can be used directly or provided as a grounded payload to an LLM assistant.
   */
  generateExplanation(result: ConflictEngineResult): RegimenExplanationResult {
    const highPriorityAlerts: string[] = [];
    const findingsExplanations: FindingExplanation[] = [];

    for (const finding of result.findings) {
      if (finding.severity === 'contraindicated' || finding.severity === 'major') {
        highPriorityAlerts.push(
          `[${finding.severity.toUpperCase()} / ${finding.category.toUpperCase()}] ${finding.medicationA.brand} + ${finding.medicationB.brand}: ${finding.clinicalImpact}`
        );
      }

      findingsExplanations.push(this.formatFindingExplanation(finding));
    }

    const dataGapsChecklist = result.dataGaps.map(
      (gap) => `[${gap.severity.toUpperCase()}] ${gap.title}: ${gap.suggestedAction}`
    );

    const executiveSummary =
      result.findings.length === 0
        ? result.dataGaps.length > 0
          ? `No drug interactions documented in the current reference dataset for this regimen; however, ${result.dataGaps.length} critical clinical data gap(s) must be evaluated before confirming regimen safety.`
          : 'No drug-drug interactions, duplicate active ingredients, or pharmacokinetic conflicts identified in the validated reference dataset.'
        : `Identified ${result.findings.length} interaction conflict(s) (${result.summary.bySeverity.contraindicated} contraindicated, ${result.summary.bySeverity.major} major, ${result.summary.bySeverity.moderate} moderate) and ${result.dataGaps.length} clinical data gap(s).`;

    // Strict LLM scaffolding prompt ensuring LLMs cannot hallucinate ungrounded advice
    const llmScaffoldingPrompt = {
      systemPrompt:
        'You are a Clinical Pharmacotherapy Communication Assistant. You MUST strictly adhere to the provided deterministic clinical findings. Do NOT invent new drug interactions, fabricate pharmacokinetic pathways, or suggest unvalidated dose changes. Base all explanations solely on the provided structured JSON context.',
      groundedContextJson: JSON.stringify({
        patientId: result.patientId,
        engineVersion: result.engineVersion,
        datasetVersion: result.providerStatus.datasetMetadata.version,
        findingsCount: result.findings.length,
        findings: result.findings.map((f) => ({
          category: f.category,
          severity: f.severity,
          drugs: `${f.medicationA.brand} (${f.medicationA.ingredient}) + ${f.medicationB.brand} (${f.medicationB.ingredient})`,
          mechanism: f.mechanism,
          clinicalImpact: f.clinicalImpact,
          recommendation: f.managementRecommendation,
          evidenceCitation: f.sourceCitation,
          datasetVersion: f.datasetVersion,
        })),
        dataGaps: result.dataGaps.map((g) => ({
          gapType: g.gapType,
          title: g.title,
          suggestedAction: g.suggestedAction,
        })),
      }),
      instruction:
        'Translate the above verified pharmacokinetic and pharmacodynamic findings into an empathetic, clear consultation note for the patient and a concise handover for the attending physician. Highlight the required review actions.',
    };

    return {
      patientId: result.patientId,
      executiveSummary,
      highPriorityAlerts,
      findingsExplanations,
      dataGapsChecklist,
      llmScaffoldingPrompt,
    };
  }

  private formatFindingExplanation(finding: InteractionFinding): FindingExplanation {
    const medA = `${finding.medicationA.brand} (${finding.medicationA.genericName})`;
    const medB = `${finding.medicationB.brand} (${finding.medicationB.genericName})`;

    let patientExplanation = '';
    if (finding.category === 'duplicate_therapy') {
      patientExplanation = `Both ${finding.medicationA.brand} and ${finding.medicationB.brand} contain the exact same active medicine (${finding.medicationA.ingredient}). Taking both at the same time can lead to an accidental overdose without realizing it.`;
    } else if (finding.category === 'pharmacokinetic') {
      patientExplanation = `When you take ${medA} and ${medB} together, one medicine changes how your body breaks down or absorbs the other. This can make the drug level in your blood too high or prevent it from working properly. ${finding.managementRecommendation}`;
    } else {
      patientExplanation = `${medA} and ${medB} work in ways that multiply each other's effects or side effects in your body. ${finding.clinicalImpact} Talk with your doctor or pharmacist about whether these medicines should be adjusted or spaced apart.`;
    }

    const actionChecklist = [
      finding.managementRecommendation,
      `Clinical Review Priority: ${finding.requiredReview.replace(/_/g, ' ').toUpperCase()}`,
      `Rule Provenance: ${finding.ruleId} (Dataset v${finding.datasetVersion})`,
    ];

    return {
      findingId: finding.findingId,
      clinicianSummary: `${finding.category.toUpperCase()} (${finding.severity.toUpperCase()}): ${finding.mechanism}`,
      patientPlainLanguageExplanation: patientExplanation,
      actionChecklist,
      evidenceCitation: finding.sourceCitation,
    };
  }
}
