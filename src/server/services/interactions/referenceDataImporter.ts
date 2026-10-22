import type {
  DatasetMetadata,
  DrugReferenceEntry,
  InteractionRule,
} from '../../../shared/interactionTypes.js';
import type { IReferenceDataImporter } from './types.js';

export interface DataSourceProductionRequirements {
  sourceName: string;
  officialProvider: string;
  accessUrl: string;
  licensingTerms: string;
  licenseRestrictions: string;
  updateCadence: string;
  completenessEvaluation: string;
  productionReadinessChecklist: string[];
}

/**
 * Audit and documentation of real data source requirements for production clinical use.
 * Fulfills clinical governance requirement:
 * "Identify the licensing, completeness and update requirements of every real data source before production use."
 */
export const REAL_DATA_SOURCES_GOVERNANCE: DataSourceProductionRequirements[] = [
  {
    sourceName: 'RxNorm Clinical Drug Terminology',
    officialProvider: 'U.S. National Library of Medicine (NLM / NIH)',
    accessUrl: 'https://www.nlm.nih.gov/research/umls/rxnorm/',
    licensingTerms: 'UMLS Metathesaurus License (Free with required registration & attributable terms)',
    licenseRestrictions:
      'Includes proprietary code sets (e.g. CPT, First Databank, Medispan, SNOMED CT) that require separate commercial agreements if used outside standard research/evaluation.',
    updateCadence: 'Monthly release on the first Monday of every month',
    completenessEvaluation:
      'Comprehensive for all U.S. prescription and selected OTC NDC products. Does not include international proprietary brand names or natural herbal supplements.',
    productionReadinessChecklist: [
      'Obtain active UMLS License Agreement from NLM',
      'Implement monthly automated ingest pipeline for RxNorm RRF zip distributions',
      'Validate active ingredient CUI (RxCUI) mappings against clinical formulary',
      'Audit synonym collision handling for combination drug products',
    ],
  },
  {
    sourceName: 'FDA Structured Product Labeling (SPL) & DailyMed',
    officialProvider: 'U.S. Food and Drug Administration / NLM',
    accessUrl: 'https://dailymed.nlm.nih.gov/dailymed/',
    licensingTerms: 'Public Domain (U.S. Government Work; 17 U.S.C. § 105)',
    licenseRestrictions: 'None. Free for commercial and non-commercial utilization.',
    updateCadence: 'Daily updates as drug manufacturers submit revisions to the FDA',
    completenessEvaluation:
      'Gold standard for FDA Boxed Warnings, contraindications, and labeled drug interaction tables. Narrative text requires natural language processing or structured SPL XML parsing.',
    productionReadinessChecklist: [
      'Implement DailyMed REST API client or weekly XML bulk dump processor',
      'Extract Section 7 (Drug Interactions) and Section 4 (Contraindications)',
      'Validate extraction accuracy against manual pharmacist verification',
    ],
  },
  {
    sourceName: 'Clinical Pharmacogenetics Implementation Consortium (CPIC®)',
    officialProvider: 'CPIC Consortium / St. Jude Children\'s Research Hospital & Stanford University',
    accessUrl: 'https://cpicpgx.org/',
    licensingTerms: 'Creative Commons Attribution 4.0 International (CC-BY 4.0)',
    licenseRestrictions: 'Free for use with appropriate citation and notice of modification.',
    updateCadence: 'Periodic peer-reviewed guideline publications as new genetic evidence matures',
    completenessEvaluation:
      'Deep, peer-reviewed pharmacogenomic gene-drug interaction guidelines (e.g. CYP2D6, CYP2C19, CYP2C9, SLCO1B1). Highly targeted to approximately 80 actionable gene-drug pairs.',
    productionReadinessChecklist: [
      'Ingest CPIC JSON/API tables for CYP metabolizer phenotypes',
      'Map gene-drug guidelines to normalized patient lab genotype fields',
    ],
  },
  {
    sourceName: 'CredibleMeds® QTDrugs Database',
    officialProvider: 'AZCERT, Inc. (Non-profit Arizona Center for Education and Research on Therapeutics)',
    accessUrl: 'https://crediblemeds.org/',
    licensingTerms: 'Commercial licensing agreement required for clinical decision support software integration',
    licenseRestrictions: 'Cannot be mirrored, parsed, or distributed in commercial software without an executed AZCERT license.',
    updateCadence: 'Continuous ongoing review as FDA post-marketing reports emerge',
    completenessEvaluation:
      'Authoritative evidence database for Torsades de Pointes (TdP) and QT interval prolongation categories (Known Risk, Possible Risk, Conditional Risk).',
    productionReadinessChecklist: [
      'Negotiate and execute AZCERT Institutional License Agreement',
      'Implement automated delta-sync to update QT hazard tiers',
    ],
  },
];

export class ReferenceDataImporter implements IReferenceDataImporter {
  sourceName = 'Clinical Reference Data JSON Importer';

  async importReferenceData(rawJson: string): Promise<{
    entries: DrugReferenceEntry[];
    rules: InteractionRule[];
    metadata: DatasetMetadata;
  }> {
    let parsed: any;
    try {
      parsed = JSON.parse(rawJson);
    } catch (err: any) {
      throw new Error(`Failed to parse reference data JSON: ${err.message}`);
    }

    if (!parsed.metadata) {
      throw new Error('Imported dataset is missing required "metadata" object.');
    }

    const metadata: DatasetMetadata = {
      datasetId: parsed.metadata.datasetId || 'imported-custom',
      datasetName: parsed.metadata.datasetName || 'Imported Reference Dataset',
      version: parsed.metadata.version || '1.0.0',
      publishedDate: parsed.metadata.publishedDate || new Date().toISOString().split('T')[0],
      revisionDate: parsed.metadata.revisionDate || new Date().toISOString().split('T')[0],
      sourceAuthority: parsed.metadata.sourceAuthority || 'Custom Import',
      license: parsed.metadata.license || 'Proprietary',
      completeness: parsed.metadata.completeness || 'sample_subset',
      maintenanceSchedule: parsed.metadata.maintenanceSchedule || 'Manual updates',
      staleAfterDays: parsed.metadata.staleAfterDays || 180,
    };

    const entries: DrugReferenceEntry[] = Array.isArray(parsed.entries) ? parsed.entries : [];
    const rules: InteractionRule[] = Array.isArray(parsed.rules) ? parsed.rules : [];

    return {
      entries,
      rules,
      metadata,
    };
  }
}
