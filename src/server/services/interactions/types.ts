import type {
  DatasetMetadata,
  DrugReferenceEntry,
  InteractionRule,
  ProviderHealthStatus,
} from '../../../shared/interactionTypes.js';

export interface IDrugReferenceProvider {
  name: string;
  isAvailable(): boolean;
  setOutageSimulation(active: boolean): void;
  getDatasetMetadata(): DatasetMetadata;
  lookupByIngredient(nameOrId: string): Promise<DrugReferenceEntry | null>;
  lookupByAlias(alias: string): Promise<DrugReferenceEntry | null>;
  getAllIngredients(): Promise<DrugReferenceEntry[]>;
}

export interface IInteractionEvidenceProvider {
  name: string;
  isAvailable(): boolean;
  setOutageSimulation(active: boolean): void;
  getDatasetMetadata(): DatasetMetadata;
  findRulesForPair(ingredientA: string, ingredientB: string): Promise<InteractionRule[]>;
  getAllRules(): Promise<InteractionRule[]>;
}

export interface IReferenceDataImporter {
  sourceName: string;
  importReferenceData(rawJson: string): Promise<{
    entries: DrugReferenceEntry[];
    rules: InteractionRule[];
    metadata: DatasetMetadata;
  }>;
}
