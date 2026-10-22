import crypto, { randomUUID } from 'crypto';
import type {
  ArtifactDependencyGraphState,
  ArtifactFreshnessStatus,
  HistoricalArtifactRecord,
  WorkflowArtifactNode,
  WorkflowArtifactType,
  WorkflowContext,
} from '../../../shared/orchestrationTypes.js';
import type { ArtifactHistoryRepository } from '../../repositories/artifactHistoryRepository.js';

export const DOWNSTREAM_DEPENDENCY_MAP: Record<
  WorkflowArtifactType,
  readonly WorkflowArtifactType[]
> = {
  prescription_image: ['ocr_extraction', 'confirmed_medications', 'interaction_findings', 'scheduling_constraints', 'draft_schedule', 'human_approval'],
  ocr_extraction: ['confirmed_medications', 'interaction_findings', 'scheduling_constraints', 'draft_schedule', 'human_approval'],
  confirmed_medications: ['interaction_findings', 'scheduling_constraints', 'draft_schedule', 'human_approval'],
  interaction_findings: ['draft_schedule', 'human_approval'],
  scheduling_constraints: ['draft_schedule', 'human_approval'],
  draft_schedule: ['human_approval'],
  human_approval: [],
};

export const UPSTREAM_DEPENDENCY_MAP: Record<
  WorkflowArtifactType,
  readonly WorkflowArtifactType[]
> = {
  prescription_image: [],
  ocr_extraction: ['prescription_image'],
  confirmed_medications: ['ocr_extraction'],
  interaction_findings: ['confirmed_medications'],
  scheduling_constraints: ['confirmed_medications'],
  draft_schedule: ['scheduling_constraints', 'confirmed_medications', 'interaction_findings'],
  human_approval: ['interaction_findings', 'draft_schedule'],
};

/**
 * Deterministically stringifies any JavaScript object with sorted keys.
 */
function stableStringify(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return '[' + obj.map(stableStringify).join(',') + ']';
  }

  const sortedKeys = Object.keys(obj).sort();
  const entries = sortedKeys.map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`);
  return '{' + entries.join(',') + '}';
}

/**
 * Computes deterministic SHA-256 content hash of artifact data payload.
 */
export function computeArtifactContentHash(data: any): string {
  if (data === undefined || data === null) {
    return crypto.createHash('sha256').update('null').digest('hex');
  }
  const canonical = stableStringify(data);
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * Computes deterministic SHA-256 fingerprint from upstream dependency nodes.
 */
export function computeDependencyFingerprint(
  upstreamNodes: WorkflowArtifactNode[]
): string {
  if (!upstreamNodes || upstreamNodes.length === 0) {
    return 'root-genesis';
  }
  const tokens = upstreamNodes
    .map((node) => `${node.artifactType}:v${node.version}:${node.contentHash}`)
    .sort()
    .join('|');
  return crypto.createHash('sha256').update(tokens).digest('hex');
}

export class ArtifactDependencyGraph {
  constructor(private historyRepo?: ArtifactHistoryRepository) {}

  /**
   * Initialize or ensure artifact graph structure on workflow context
   */
  public ensureGraph(context: WorkflowContext): ArtifactDependencyGraphState {
    if (!context.artifactGraph) {
      context.artifactGraph = {
        nodes: {},
        rootArtifactIds: [],
        lastEvaluatedAt: new Date().toISOString(),
      };
    }
    if (!context.historicalArtifacts) {
      context.historicalArtifacts = [];
    }
    return context.artifactGraph;
  }

  /**
   * Set or update an artifact node with new data, automatically computing contentHash
   * and dependencyFingerprint.
   */
  public recordArtifactNode(
    context: WorkflowContext,
    artifactType: WorkflowArtifactType,
    data: any
  ): WorkflowArtifactNode {
    const graph = this.ensureGraph(context);
    const now = new Date().toISOString();

    const existing = graph.nodes[artifactType];
    const version = existing ? existing.version + 1 : 1;
    const contentHash = computeArtifactContentHash(data);

    // Collect upstream nodes to compute fingerprint
    const upstreamTypes = UPSTREAM_DEPENDENCY_MAP[artifactType];
    const upstreamNodes: WorkflowArtifactNode[] = [];
    for (const uType of upstreamTypes) {
      const uNode = graph.nodes[uType];
      if (uNode) upstreamNodes.push(uNode);
    }
    const dependencyFingerprint = computeDependencyFingerprint(upstreamNodes);

    // If existing node had data and is being replaced, archive prior version
    if (existing && existing.data) {
      this.archiveHistoricalOutput(
        context,
        existing,
        `New version v${version} published for ${artifactType}`
      );
    }

    const node: WorkflowArtifactNode = {
      artifactId: existing ? existing.artifactId : `art-${artifactType}-${randomUUID().slice(0, 8)}`,
      artifactType,
      version,
      status: 'current',
      dependencyFingerprint,
      contentHash,
      upstreamArtifactIds: upstreamNodes.map((n) => n.artifactId),
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
      data,
    };

    graph.nodes[artifactType] = node;
    graph.lastEvaluatedAt = now;

    if (upstreamNodes.length === 0 && !graph.rootArtifactIds.includes(node.artifactId)) {
      graph.rootArtifactIds.push(node.artifactId);
    }

    return node;
  }

  /**
   * Marks an artifact and all its downstream dependent artifacts as stale.
   * Preserves historical outputs for auditability and clears current data.
   */
  public markArtifactStale(
    context: WorkflowContext,
    sourceArtifactType: WorkflowArtifactType,
    reason: string
  ): {
    staleArtifacts: WorkflowArtifactType[];
    archivedRecords: HistoricalArtifactRecord[];
  } {
    const graph = this.ensureGraph(context);
    const downstreamTypes = DOWNSTREAM_DEPENDENCY_MAP[sourceArtifactType];
    const targets: WorkflowArtifactType[] = [sourceArtifactType, ...downstreamTypes];

    const staleArtifacts: WorkflowArtifactType[] = [];
    const archivedRecords: HistoricalArtifactRecord[] = [];
    const now = new Date().toISOString();

    for (const t of targets) {
      const node = graph.nodes[t];
      if (!node) continue;

      if (node.status === 'current') {
        staleArtifacts.push(t);

        // 1. Preserve historical output for auditing
        if (node.data) {
          const record = this.archiveHistoricalOutput(
            context,
            node,
            `Invalidated due to change in upstream artifact "${sourceArtifactType}": ${reason}`
          );
          archivedRecords.push(record);
        }

        // 2. Mark node stale / invalidated
        graph.nodes[t] = {
          ...node,
          version: node.version + 1,
          status: t === 'human_approval' ? 'invalidated' : 'stale',
          invalidatedAt: now,
          invalidationReason: reason,
          updatedAt: now,
          data: undefined, // Clear active data payload to prevent presenting as current
        };
      }
    }

    // 3. Clear matching domain context fields so stale findings cannot be presented as current
    if (targets.includes('interaction_findings')) {
      context.interactionFindings = [];
      context.derivedFindings = undefined;
    }
    if (targets.includes('draft_schedule')) {
      context.proposedSchedules = undefined;
    }
    if (targets.includes('human_approval')) {
      if (context.humanApprovedOutcomes) {
        context.humanApprovedOutcomes.scheduleApproved = false;
        context.humanApprovedOutcomes.decisionRationale = `Approval invalidated due to change in "${sourceArtifactType}": ${reason}`;
      }
    }

    graph.lastEvaluatedAt = now;

    return { staleArtifacts, archivedRecords };
  }

  /**
   * Verifies if an artifact node is strictly fresh and valid.
   */
  public isArtifactCurrent(
    context: WorkflowContext,
    artifactType: WorkflowArtifactType
  ): boolean {
    if (!context.artifactGraph) return false;
    const node = context.artifactGraph.nodes[artifactType];
    if (!node) return false;
    return node.status === 'current' && node.data !== undefined;
  }

  /**
   * Safely retrieves artifact data, returning null if stale or invalidated.
   * Guarantees stale clinical findings are never presented as current.
   */
  public getArtifactData<T = any>(
    context: WorkflowContext,
    artifactType: WorkflowArtifactType
  ): { data: T | null; isCurrent: boolean; status: ArtifactFreshnessStatus } {
    if (!context.artifactGraph) {
      return { data: null, isCurrent: false, status: 'invalidated' };
    }
    const node = context.artifactGraph.nodes[artifactType];
    if (!node) {
      return { data: null, isCurrent: false, status: 'invalidated' };
    }
    if (node.status !== 'current' || node.data === undefined) {
      return { data: null, isCurrent: false, status: node.status };
    }
    return { data: node.data as T, isCurrent: true, status: 'current' };
  }

  /**
   * Returns list of operations that are affected and require recomputation.
   */
  public getOperationsRequiringRecomputation(context: WorkflowContext): string[] {
    const ops: string[] = [];
    if (!context.artifactGraph) return ops;

    const nodes = context.artifactGraph.nodes;

    if (nodes.ocr_extraction && nodes.ocr_extraction.status !== 'current') {
      ops.push('EXTRACT_PRESCRIPTION');
    }
    if (nodes.confirmed_medications && nodes.confirmed_medications.status !== 'current') {
      ops.push('CONFIRM_MEDICATIONS');
    }
    if (nodes.interaction_findings && nodes.interaction_findings.status !== 'current') {
      ops.push('CHECK_INTERACTIONS');
    }
    if (
      (nodes.scheduling_constraints && nodes.scheduling_constraints.status !== 'current') ||
      (nodes.draft_schedule && nodes.draft_schedule.status !== 'current')
    ) {
      ops.push('COORDINATE_SCHEDULE');
    }
    if (nodes.human_approval && nodes.human_approval.status !== 'current') {
      ops.push('RENEW_HUMAN_REVIEW');
    }

    return ops;
  }

  /**
   * Deterministically validates dependency fingerprints of all current nodes.
   * If an upstream fingerprint does not match, marks downstream node stale.
   */
  public validateGraphFingerprints(context: WorkflowContext): {
    allValid: boolean;
    staleNodes: WorkflowArtifactType[];
  } {
    const graph = this.ensureGraph(context);
    const staleNodes: WorkflowArtifactType[] = [];

    for (const [typeKey, nodeVal] of Object.entries(graph.nodes)) {
      const node = nodeVal as WorkflowArtifactNode | undefined;
      if (!node || node.status !== 'current') continue;

      const artType = typeKey as WorkflowArtifactType;
      const upstreamTypes = UPSTREAM_DEPENDENCY_MAP[artType];
      const upstreamNodes: WorkflowArtifactNode[] = [];
      let upstreamStale = false;

      for (const uType of upstreamTypes) {
        const uNode = graph.nodes[uType];
        if (!uNode || uNode.status !== 'current') {
          upstreamStale = true;
          break;
        }
        upstreamNodes.push(uNode);
      }

      if (upstreamStale) {
        this.markArtifactStale(
          context,
          artType,
          `Upstream dependency for "${artType}" is missing or stale`
        );
        staleNodes.push(artType);
        continue;
      }

      const expectedFingerprint = computeDependencyFingerprint(upstreamNodes);
      if (node.dependencyFingerprint !== expectedFingerprint) {
        this.markArtifactStale(
          context,
          artType,
          `Fingerprint mismatch for "${artType}": expected ${expectedFingerprint}, found ${node.dependencyFingerprint}`
        );
        staleNodes.push(artType);
      }
    }

    return {
      allValid: staleNodes.length === 0,
      staleNodes,
    };
  }

  /**
   * Helper to archive historical outputs both in-context and in SQLite repository.
   */
  private archiveHistoricalOutput(
    context: WorkflowContext,
    node: WorkflowArtifactNode,
    reason: string
  ): HistoricalArtifactRecord {
    const now = new Date().toISOString();
    const record: HistoricalArtifactRecord = {
      historyId: `hist-${randomUUID()}`,
      workflowId: context.workflowId,
      artifactId: node.artifactId,
      artifactType: node.artifactType,
      version: node.version,
      archivedAt: now,
      reasonArchived: reason,
      contentHash: node.contentHash,
      dependencyFingerprint: node.dependencyFingerprint,
      data: node.data,
    };

    if (!context.historicalArtifacts) {
      context.historicalArtifacts = [];
    }
    context.historicalArtifacts.push(record);

    if (this.historyRepo) {
      try {
        this.historyRepo.create(record);
      } catch (err: any) {
        console.warn(`[ArtifactDependencyGraph] Non-fatal historical artifact archive error:`, err.message);
      }
    }

    return record;
  }
}
