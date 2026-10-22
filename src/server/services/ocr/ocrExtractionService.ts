import { randomUUID } from 'crypto';
import type { ActiveIngredient } from '../../../shared/types.js';
import type {
  AmbiguityIssue,
  CandidateMedication,
  FieldConfidence,
  OCRDocumentResult,
  OCRTextLine,
} from '../../../shared/ocrTypes.js';

// Regex patterns for pharmacological parsing
const STRENGTH_REGEX = /(\d+(?:\.\d+)?)\s*(mg|mcg|g|ml|iu|units?|%)\b/gi;
const BARE_NUMBER_WITHOUT_UNIT_REGEX = /\b(\d{2,4})\b(?!\s*(?:mg|mcg|g|ml|iu|units?|%|am|pm|tab|cap|pills?|hours?|daily|times|days?|tablets?|capsules?))\b/i;
const SALT_REGEX = /\b(hydrochloride|hcl|besylate|tartrate|succinate|sodium|potassium|calcium|fumarate|maleate|sulfate|pamoate|citrate|phosphate|acetate|bromide|dihydrate|trihydrate)\b/i;
const FORM_REGEX = /\b(tablets?|capsules?|solution|suspension|syrup|inhaler|patch|cream|ointment|drops?|suppository|injection|tabs?|caps?)\b/i;
const RELEASE_REGEX = /\b(extended[- ]release|immediate[- ]release|delayed[- ]release|controlled[- ]release|sustained[- ]release|xr|er|xl|sr|dr|ir)\b/i;
const ROUTE_REGEX = /\b(oral|by mouth|po|sublingual|topical|inhalation|subcutaneous|intravenous|iv|im|rectal|ophthalmic|otic)\b/i;
const FREQUENCY_REGEX = /\b(once daily|twice daily|three times daily|four times daily|bid|tid|qid|qhs|qam|qpm|every (\d+) hours|at bedtime|as needed|prn|with meals|before breakfast|every morning|daily)\b/i;
const PRESCRIBER_REGEX = /(?:Dr\.|Doctor|Prescriber:?|MD|DO|NP|PA)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+)/i;

export class OCRExtractionService {
  /**
   * Extracts candidate medication entities from raw OCR document lines.
   * Strictly keeps extraction separate from terminology concept mapping.
   */
  extractCandidates(doc: OCRDocumentResult): CandidateMedication[] {
    const candidates: CandidateMedication[] = [];
    if (!doc || !doc.pages || doc.pages.length === 0) return candidates;

    // Detect prescriber in document header if present
    let detectedPrescriber = 'Unknown Prescriber';
    for (const page of doc.pages) {
      for (const line of page.lines.slice(0, 8)) {
        const pMatch = line.text.match(PRESCRIBER_REGEX);
        if (pMatch && pMatch[0]) {
          detectedPrescriber = pMatch[0].trim();
          break;
        }
      }
      if (detectedPrescriber !== 'Unknown Prescriber') break;
    }

    for (const page of doc.pages) {
      let i = 0;
      while (i < page.lines.length) {
        const line = page.lines[i];
        const trimmed = line.text.trim();

        // Skip non-clinical header/footer lines
        if (
          !trimmed ||
          trimmed.startsWith('---') ||
          trimmed.toLowerCase().startsWith('patient:') ||
          trimmed.toLowerCase().startsWith('date:') ||
          trimmed.toLowerCase().startsWith('rx number:') ||
          trimmed.toLowerCase().startsWith('pharmacy:') ||
          trimmed.toLowerCase().startsWith('clinic:')
        ) {
          i++;
          continue;
        }

        // Check if line indicates a prescription entry
        const isMedicationLine = this.isCandidateLine(trimmed);

        if (isMedicationLine) {
          // Lookahead up to 3 lines to capture Sig / Instructions
          const multiLineSnippet: string[] = [trimmed];
          let nextIdx = i + 1;

          while (nextIdx < page.lines.length && nextIdx <= i + 3) {
            const nextText = page.lines[nextIdx].text.trim();
            if (!nextText || this.isCandidateLine(nextText)) {
              break; // Stop at next medication line
            }
            multiLineSnippet.push(nextText);
            nextIdx++;
          }

          const combinedSnippet = multiLineSnippet.join(' ');
          const candidate = this.parseCandidateFromSnippet(
            doc.documentId,
            page.pageNumber,
            line.lineIndex,
            combinedSnippet,
            line,
            detectedPrescriber
          );

          candidates.push(candidate);
          i = nextIdx;
        } else {
          i++;
        }
      }
    }

    return candidates;
  }

  private isCandidateLine(text: string): boolean {
    const lower = text.toLowerCase().trim();

    // Explicitly reject instruction, dispensing, or warning continuation lines
    if (
      lower.startsWith('sig:') ||
      lower.startsWith('sig ') ||
      lower.startsWith('take ') ||
      lower.startsWith('disp:') ||
      lower.startsWith('disp ') ||
      lower.startsWith('refills:') ||
      lower.startsWith('refill:') ||
      lower.startsWith('warning:') ||
      lower.startsWith('instructions:')
    ) {
      return false;
    }

    // Rx markers or numbered orders (e.g. "Rx: ...", "1. ...", "2. ...")
    if (
      lower.startsWith('rx:') ||
      lower.startsWith('rx ') ||
      /^\d+\.\s+[a-z]/i.test(text)
    ) {
      return true;
    }

    // Contains dosage/strength and looks like an order line (not pure instruction)
    if (STRENGTH_REGEX.test(text) && !lower.startsWith('by mouth') && !lower.startsWith('po')) {
      STRENGTH_REGEX.lastIndex = 0;
      return true;
    }

    return false;
  }

  private parseCandidateFromSnippet(
    documentId: string,
    pageNumber: number,
    lineIndex: number,
    snippet: string,
    sourceLine: OCRTextLine,
    defaultPrescriber: string
  ): CandidateMedication {
    const ambiguities: AmbiguityIssue[] = [];
    const lower = snippet.toLowerCase();

    // 1. Salt detection
    let salt: string | null = null;
    const saltMatch = snippet.match(SALT_REGEX);
    if (saltMatch) {
      const rawSalt = saltMatch[1].toLowerCase();
      salt = rawSalt === 'hcl' ? 'Hydrochloride' : rawSalt.charAt(0).toUpperCase() + rawSalt.slice(1);
    }

    // 2. Strength & Dose Detection
    let strength = '';
    const strengthMatches = snippet.match(STRENGTH_REGEX);
    if (strengthMatches && strengthMatches.length > 0) {
      strength = strengthMatches.join(' / ');
    } else {
      // Check for bare numbers without units in the medication order header
      const orderPart = snippet.split(/(?:\bsig:|\btake\b|\bdisp:|\brefills?:)/i)[0];
      const bareNumMatch = orderPart.match(
        /\b(\d+(?:\.\d+)?)\b(?!\s*(?:mg|mcg|g|ml|iu|units?|%|am|pm|tab|cap|pills?|tablets?|capsules?))\b/i
      );
      if (bareNumMatch) {
        ambiguities.push({
          id: randomUUID(),
          field: 'strength',
          issueType: 'missing_unit',
          severity: 'critical',
          description: `Extracted number "${bareNumMatch[1]}" has no measurement unit (e.g. mg, mcg, mL). Unit cannot be inferred.`,
        });
      } else {
        ambiguities.push({
          id: randomUUID(),
          field: 'strength',
          issueType: 'missing_dose',
          severity: 'critical',
          description: 'No dosage or strength detected on prescription order. Never infer a missing dose.',
        });
      }
    }

    // 3. Formulation & Release Profile
    let dosageForm = 'Tablet';
    const formMatch = snippet.match(FORM_REGEX);
    if (formMatch) {
      dosageForm = formMatch[1].charAt(0).toUpperCase() + formMatch[1].slice(1).toLowerCase();
    } else {
      ambiguities.push({
        id: randomUUID(),
        field: 'dosageForm',
        issueType: 'uncertain_formulation',
        severity: 'warning',
        description: 'Dosage formulation is not explicitly specified (defaulted to Tablet for review).',
      });
    }

    let releaseFormulation: string | null = null;
    const releaseMatch = snippet.match(RELEASE_REGEX);
    if (releaseMatch) {
      const rawRel = releaseMatch[1].toLowerCase();
      if (rawRel.includes('extended') || rawRel === 'xr' || rawRel === 'er' || rawRel === 'xl') {
        releaseFormulation = 'Extended Release (XR)';
      } else if (rawRel.includes('immediate') || rawRel === 'ir') {
        releaseFormulation = 'Immediate Release (IR)';
      } else if (rawRel.includes('delayed') || rawRel === 'dr') {
        releaseFormulation = 'Delayed Release (DR)';
      } else if (rawRel.includes('controlled') || rawRel === 'cr') {
        releaseFormulation = 'Controlled Release (CR)';
      }
    }

    // 4. Route
    let route = 'Oral';
    const routeMatch = snippet.match(ROUTE_REGEX);
    if (routeMatch) {
      const rawRoute = routeMatch[1].toLowerCase();
      if (rawRoute === 'po' || rawRoute === 'by mouth' || rawRoute === 'oral') route = 'Oral';
      else if (rawRoute === 'sublingual') route = 'Sublingual';
      else if (rawRoute === 'topical') route = 'Topical';
      else if (rawRoute === 'inhalation') route = 'Inhalation';
    }

    // 5. Frequency & Sig
    let frequency = 'Once daily';
    const freqMatch = snippet.match(FREQUENCY_REGEX);
    if (freqMatch) {
      const rawFreq = freqMatch[1].toLowerCase();
      if (rawFreq === 'bid') frequency = 'Twice daily';
      else if (rawFreq === 'tid') frequency = 'Three times daily';
      else if (rawFreq === 'qid') frequency = 'Four times daily';
      else if (rawFreq === 'qhs' || rawFreq === 'at bedtime') frequency = 'At bedtime';
      else if (rawFreq === 'prn' || rawFreq === 'as needed') frequency = 'As needed (PRN)';
      else frequency = rawFreq.charAt(0).toUpperCase() + rawFreq.slice(1);
    } else {
      ambiguities.push({
        id: randomUUID(),
        field: 'frequency',
        issueType: 'incomplete_sig',
        severity: 'warning',
        description:
          'Missing prescribed frequency: administration frequency is incomplete or missing in written sig.',
      });
    }

    // Check for contradictory administration instructions (e.g. empty stomach vs with meal)
    const hasEmptyStomach = /empty[- ]stomach/i.test(snippet);
    const hasWithMeals = /with (?:heavy |light )?(?:breakfast |dinner |lunch )?(?:meal|meals|food)/i.test(snippet);
    if (hasEmptyStomach && hasWithMeals) {
      ambiguities.push({
        id: randomUUID(),
        field: 'administrationInstructions',
        issueType: 'incomplete_sig',
        severity: 'warning',
        description:
          'Contradictory meal instructions: sig specifies both "empty stomach" and "with meals". Prescriber clarification required.',
      });
    }

    // 6. Candidate Name Extraction
    // Extract first 1-3 words before strength or form
    let candidateName = snippet
      .replace(/^(?:Rx:?|\d+\.|\*|-)\s*/i, '')
      .split(/(?:\s+(?:\d+|tablet|capsule|take|sig|disp|#|\())/i)[0]
      .trim();

    if (!candidateName) {
      candidateName = 'Unreadable Drug Order';
      ambiguities.push({
        id: randomUUID(),
        field: 'brand',
        issueType: 'unreadable_text',
        severity: 'critical',
        description: 'Unable to parse valid medication title from OCR line.',
      });
    }

    // Attempt to extract generic chemical name in parenthesis (e.g. "Glucophage XR (Metformin Hydrochloride)")
    let genericName = candidateName;
    const parenMatch = snippet.match(/\(([A-Za-z\s]+)\)/);
    if (parenMatch && parenMatch[1] && parenMatch[1].trim().length > 2) {
      const rawGeneric = parenMatch[1].trim();
      const strippedGeneric = rawGeneric.replace(SALT_REGEX, '').trim();
      genericName = strippedGeneric.length > 2 ? strippedGeneric : rawGeneric;
    }

    // Check optical confidence / noise in snippet
    const hasNoise = /[?~^$#@!]{2,}/.test(snippet) || sourceLine.confidence < 0.65;
    if (hasNoise) {
      ambiguities.push({
        id: randomUUID(),
        field: 'brand',
        issueType: 'unreadable_text',
        severity: 'warning',
        description: `Optical OCR confidence is degraded (${Math.round(sourceLine.confidence * 100)}%). Verify spelling against original prescription image.`,
      });
    }

    // 7. Active Ingredients
    const activeIngredients: ActiveIngredient[] = [
      {
        name: genericName,
        strength: strength || '',
      },
    ];

    // Prescribed dose fallback
    const prescribedDose = strength ? `1 ${dosageForm.toLowerCase()} (${strength})` : `1 ${dosageForm.toLowerCase()}`;

    // 8. Field-Level Confidence Calculation
    const fieldConfidence: FieldConfidence = {
      brand: Math.round(sourceLine.confidence * (hasNoise ? 0.7 : 0.95) * 100) / 100,
      genericName: Math.round(sourceLine.confidence * 0.9 * 100) / 100,
      activeIngredients: Math.round(sourceLine.confidence * 0.9 * 100) / 100,
      salt: salt ? 0.9 : 0.5,
      strength: strength ? 0.95 : 0.2,
      dosageForm: formMatch ? 0.95 : 0.6,
      route: routeMatch ? 0.95 : 0.75,
      frequency: freqMatch ? 0.95 : 0.5,
      instructions: Math.round(sourceLine.confidence * 100) / 100,
      overall: Math.round(
        (sourceLine.confidence * 0.4 + (strength ? 0.3 : 0.05) + (freqMatch ? 0.3 : 0.1)) * 100
      ) / 100,
    };

    return {
      id: randomUUID(),
      documentId,
      pageNumber,
      sourceLineIndex: lineIndex,
      sourceSnippet: snippet,
      boundingBox: sourceLine.boundingBox,
      brand: candidateName,
      genericName,
      activeIngredients,
      salt,
      strength,
      dosageForm,
      releaseFormulation,
      route,
      prescribedDose,
      frequency,
      administrationInstructions: snippet,
      prescriber: defaultPrescriber,
      source: `OCR Extraction - Page ${pageNumber}, Line ${lineIndex}`,
      fieldConfidence,
      ambiguities,
      terminologyMatches: [],
      selectedTerminologyMatch: null,
      duplicateIngredientWarnings: [],
      reconciliationStatus: 'pending_review',
    };
  }
}
