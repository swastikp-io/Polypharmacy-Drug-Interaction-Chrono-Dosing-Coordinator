import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertOctagon,
  AlertTriangle,
  Award,
  CheckCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Lock,
  RefreshCw,
  RotateCcw,
  UserCheck,
  X,
} from 'lucide-react';
import { api } from '../../api/apiClient.js';
import type {
  ApprovalRecord,
  ReviewCategory,
  ReviewRequest,
  ReviewResolution,
  ReviewerRole,
} from '../../../shared/orchestrationTypes.js';

interface ReviewQueueTabProps {
  patientId: string;
  onRefreshParent?: () => void;
}

const CATEGORY_LABELS: Record<ReviewCategory, { label: string; color: string; desc: string }> = {
  medication_identity_clarification: {
    label: 'Medication Identity Clarification',
    color: 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]',
    desc: 'Uncertain drug order, unverified candidate, or brand/generic ambiguity requiring verification.',
  },
  missing_prescription_instructions: {
    label: 'Missing Prescription Instructions',
    color: 'bg-[#FFEDD5] text-[#9A3412] border-[#FED7AA]',
    desc: 'Missing dosage, route, frequency, or administration instructions.',
  },
  potentially_significant_interaction: {
    label: 'Potentially Significant Interaction',
    color: 'bg-[#FEE2E2] text-[#991B1B] border-[#FECACA]',
    desc: 'Severe pharmacokinetic/pharmacodynamic conflict requiring clinical pharmacist sign-off.',
  },
  insufficient_clinical_evidence: {
    label: 'Insufficient Clinical Evidence',
    color: 'bg-[#F3E8FF] text-[#6B21A8] border-[#E9D5FF]',
    desc: 'Clinical database gap or missing evidence requiring practitioner assessment.',
  },
  conflicting_scheduling_constraints: {
    label: 'Conflicting Scheduling Constraints',
    color: 'bg-[#D7DEFF] text-[#1747E8] border-[#C0CEFF]',
    desc: 'Mandatory absorption or food-drug constraint clash that cannot be auto-resolved.',
  },
  schedule_review: {
    label: 'Circadian Schedule Approval',
    color: 'bg-[#ECFDF5] text-[#065F46] border-[#A7F3D0]',
    desc: 'Proposed 24-hour diurnal administration draft ready for final clinician sign-off.',
  },
};

export const ReviewQueueTab: React.FC<ReviewQueueTabProps> = ({
  patientId,
  onRefreshParent,
}) => {
  const [reviews, setReviews] = useState<ReviewRequest[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [selectedReview, setSelectedReview] = useState<ReviewRequest | null>(null);
  const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(null);

  // Modal State
  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [decision, setDecision] = useState<'approved' | 'rejected' | 'modified'>('approved');
  const [reviewerIdentity, setReviewerIdentity] = useState('Dr. Sarah Lin, PharmD');
  const [reviewerRole, setReviewerRole] = useState<ReviewerRole>('clinical_pharmacist');
  const [reviewerNotes, setReviewerNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const fetchReviews = async () => {
    setLoading(true);
    setError(null);
    try {
      const pendingList = await api.getPendingReviews();
      setReviews(pendingList || []);

      if (pendingList && pendingList.length > 0) {
        const wfId = pendingList[0].workflowId;
        setActiveWorkflowId(wfId);
        try {
          const approvalList = await api.getWorkflowApprovals(wfId);
          setApprovals(approvalList || []);
        } catch {
          setApprovals([]);
        }
      } else {
        setApprovals([]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load clinical review queue.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, [patientId]);

  const handleOpenResolveModal = (review: ReviewRequest) => {
    setSelectedReview(review);
    setDecision('approved');
    setReviewerNotes('');
    setModalError(null);
    setResolveModalOpen(true);
  };

  const handleSubmitResolution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReview) return;

    // AI Clinician Prevention (Rule 4)
    const lowerIdentity = reviewerIdentity.toLowerCase();
    if (
      lowerIdentity.includes('claude') ||
      lowerIdentity.includes('gpt') ||
      lowerIdentity.includes('assistant') ||
      lowerIdentity.includes('bot') ||
      lowerIdentity.includes('llm') ||
      lowerIdentity.includes('agent')
    ) {
      setModalError(
        'Rule 4 Violation: AI actors cannot impersonate clinicians or sign off on clinical reviews. Please provide a verified human clinician name.'
      );
      return;
    }

    if (!reviewerIdentity.trim()) {
      setModalError('Reviewer identity is required.');
      return;
    }

    setIsSubmitting(true);
    setModalError(null);

    try {
      const resolution: ReviewResolution = {
        status: decision,
        reviewerIdentity: reviewerIdentity.trim(),
        reviewerRole,
        reviewerNotes: reviewerNotes.trim() || undefined,
        targetVersion: selectedReview.targetArtifactVersion ?? selectedReview.itemVersion,
      };

      await api.resolveReviewRequest(selectedReview.workflowId, selectedReview.id, resolution);

      setResolveModalOpen(false);
      setSelectedReview(null);
      await fetchReviews();
      if (onRefreshParent) {
        onRefreshParent();
      }
    } catch (err: any) {
      setModalError(err.message || 'Failed to submit clinical review resolution.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredReviews = reviews.filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
    return true;
  });

  const pendingCount = reviews.filter((r) => r.status === 'pending').length;
  const approvedCount = reviews.filter((r) => r.status === 'approved').length;
  const invalidatedCount = reviews.filter((r) => r.status === 'invalidated').length;

  return (
    <div className="space-y-5">
      {/* 1. Swiss Editorial Header */}
      <div className="bg-white border border-[#E6E3E1] rounded-sm p-5 shadow-editorial relative overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#1747E8] bg-[#F0F3FF] px-2 py-0.5 rounded-sm border border-[#D7DEFF]">
                Clinical Safety Gate
              </span>
              <span className="text-xs text-[#777777]">Human-In-The-Loop Governance</span>
            </div>
            <h2 className="text-lg font-bold text-[#171717] tracking-tight">
              Clinical Review Queue &amp; Approval Authority
            </h2>
            <p className="text-xs text-[#525252] leading-relaxed">
              Mandatory clinician review checkpoints. Candidate medications, pharmacokinetic conflicts, circadian schedule drafts, and clinical evidence gaps require authorized human practitioner sign-off before downstream execution.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchReviews}
              disabled={loading}
              className="px-3 py-1.5 rounded-sm text-xs font-semibold text-[#171717] bg-[#FAF9F8] hover:bg-white border border-[#E6E3E1] hover:border-[#1747E8] flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#777777] ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh Queue</span>
            </button>
          </div>
        </div>

        {/* Safety Protocol Rule Highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mt-4 pt-3 border-t border-[#E6E3E1] text-[11px] text-[#525252]">
          <div className="flex items-center gap-1.5 p-2 bg-[#FAF9F8] rounded-sm border border-[#E6E3E1]">
            <Lock className="w-3.5 h-3.5 text-[#B45309] flex-shrink-0" />
            <span><strong>Rules 1 &amp; 2:</strong> Unverified meds blocked; evidence gaps never masked.</span>
          </div>
          <div className="flex items-center gap-1.5 p-2 bg-[#FAF9F8] rounded-sm border border-[#E6E3E1]">
            <AlertTriangle className="w-3.5 h-3.5 text-[#DC2626] flex-shrink-0" />
            <span><strong>Rule 3:</strong> Unresolved conflicts block schedule release.</span>
          </div>
          <div className="flex items-center gap-1.5 p-2 bg-[#FAF9F8] rounded-sm border border-[#E6E3E1]">
            <UserCheck className="w-3.5 h-3.5 text-[#1747E8] flex-shrink-0" />
            <span><strong>Rules 4 &amp; 7:</strong> AI clinician signoff strictly barred.</span>
          </div>
          <div className="flex items-center gap-1.5 p-2 bg-[#FAF9F8] rounded-sm border border-[#E6E3E1]">
            <RotateCcw className="w-3.5 h-3.5 text-[#777777] flex-shrink-0" />
            <span><strong>Rules 5 &amp; 6:</strong> Stale artifact auto-invalidation logged.</span>
          </div>
        </div>
      </div>

      {/* 2. Compact Editorial Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className={`p-3.5 rounded-sm border shadow-editorial flex items-center justify-between ${
          pendingCount > 0
            ? 'bg-[#FEF3C7]/40 border-[#FDE68A]'
            : 'bg-white border-[#E6E3E1]'
        }`}>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#92400E]">Pending Attention</div>
            <div className="text-2xl font-bold text-[#171717] tabular-nums mt-0.5">{pendingCount}</div>
            <div className="text-[11px] text-[#777777]">Awaiting clinician review</div>
          </div>
          <div className="w-9 h-9 rounded-sm bg-[#FEF3C7] border border-[#FDE68A] flex items-center justify-center text-[#B45309]">
            <Clock className="w-4 h-4" />
          </div>
        </div>

        <div className="p-3.5 rounded-sm border bg-white border-[#E6E3E1] shadow-editorial flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#065F46]">Approved Decisions</div>
            <div className="text-2xl font-bold text-[#171717] tabular-nums mt-0.5">{approvedCount}</div>
            <div className="text-[11px] text-[#777777]">Authorized by clinician</div>
          </div>
          <div className="w-9 h-9 rounded-sm bg-[#ECFDF5] border border-[#A7F3D0] flex items-center justify-center text-[#059669]">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>

        <div className="p-3.5 rounded-sm border bg-white border-[#E6E3E1] shadow-editorial flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#777777]">Immutable Records</div>
            <div className="text-2xl font-bold text-[#171717] tabular-nums mt-0.5">{approvals.length}</div>
            <div className="text-[11px] text-[#777777]">
              {invalidatedCount > 0 ? (
                <span className="text-[#DC2626] font-semibold">{invalidatedCount} invalidated</span>
              ) : (
                'SQLite audit log active'
              )}
            </div>
          </div>
          <div className="w-9 h-9 rounded-sm bg-[#FAF9F8] border border-[#E6E3E1] flex items-center justify-center text-[#525252]">
            <Award className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* 3. Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white border border-[#E6E3E1] rounded-sm shadow-editorial">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-bold text-[#777777] uppercase tracking-wider mr-1">
            Status:
          </span>
          {(['all', 'pending', 'approved', 'rejected', 'invalidated'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`px-2.5 py-1 rounded-sm text-xs font-semibold capitalize transition-colors ${
                statusFilter === s
                  ? 'bg-[#1747E8] text-white'
                  : 'bg-[#FAF9F8] text-[#525252] border border-[#E6E3E1] hover:bg-white hover:text-[#171717]'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="category-select" className="text-[10px] font-bold text-[#777777] uppercase tracking-wider">
            Category:
          </label>
          <select
            id="category-select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="text-xs bg-[#FAF9F8] border border-[#E6E3E1] rounded-sm px-2.5 py-1 text-[#171717] font-medium focus:bg-white focus:border-[#1747E8] focus:ring-1 focus:ring-[#1747E8] transition-colors"
          >
            <option value="all">All Categories ({reviews.length})</option>
            <option value="medication_identity_clarification">Medication Identity Clarification</option>
            <option value="missing_prescription_instructions">Missing Prescription Instructions</option>
            <option value="potentially_significant_interaction">Potentially Significant Interaction</option>
            <option value="insufficient_clinical_evidence">Insufficient Clinical Evidence</option>
            <option value="conflicting_scheduling_constraints">Conflicting Scheduling Constraints</option>
            <option value="schedule_review">Circadian Schedule Approval</option>
          </select>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-3 bg-[#FEE2E2] border border-[#FECACA] text-[#991B1B] rounded-sm text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-[#DC2626] flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 4. Queue Items List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs font-bold text-[#171717] uppercase tracking-wider">
          <span>Active Review Items ({filteredReviews.length})</span>
          {activeWorkflowId && (
            <span className="text-[10px] font-mono text-[#777777] font-normal">
              Workflow: {activeWorkflowId}
            </span>
          )}
        </div>

        {loading ? (
          <div className="p-10 text-center bg-white border border-[#E6E3E1] rounded-sm">
            <RefreshCw className="w-6 h-6 animate-spin text-[#1747E8] mx-auto mb-2" />
            <p className="text-xs text-[#777777]">Loading clinical review items...</p>
          </div>
        ) : filteredReviews.length === 0 ? (
          <div className="p-10 text-center bg-white border border-[#E6E3E1] rounded-sm pattern-dots-subtle shadow-editorial">
            <CheckCircle className="w-8 h-8 text-[#059669] mx-auto mb-2" />
            <h4 className="text-sm font-bold text-[#171717]">No Items In Queue</h4>
            <p className="text-xs text-[#777777] mt-1 max-w-md mx-auto">
              All clinical gates for this status filter are clear. When unverified candidates, PK conflicts, or schedule conflicts arise, they appear here.
            </p>
          </div>
        ) : (
          filteredReviews.map((review) => {
            const catInfo = CATEGORY_LABELS[review.category] || {
              label: review.category,
              color: 'bg-[#FAF9F8] text-[#171717] border-[#E6E3E1]',
              desc: '',
            };

            const isPending = review.status === 'pending';

            return (
              <article
                key={review.id}
                className={`p-4 rounded-sm border bg-white shadow-editorial transition-all ${
                  isPending
                    ? 'border-[#FDE68A] ring-1 ring-[#FDE68A]/60'
                    : 'border-[#E6E3E1]'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                  <div className="space-y-2 flex-1 max-w-3xl">
                    {/* Header tags: Category & Status */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-sm text-[11px] font-bold border ${catInfo.color}`}>
                        {catInfo.label}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wider ${
                          review.status === 'pending'
                            ? 'bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]'
                            : review.status === 'approved'
                              ? 'bg-[#ECFDF5] text-[#065F46] border border-[#A7F3D0]'
                              : review.status === 'rejected'
                                ? 'bg-[#FEE2E2] text-[#991B1B] border border-[#FECACA]'
                                : 'bg-[#FAF9F8] text-[#525252] border border-[#E6E3E1]'
                        }`}
                      >
                        {review.status}
                      </span>
                      <span className="text-[10px] text-[#777777] font-mono">
                        v{review.targetArtifactVersion ?? review.itemVersion} ({review.targetArtifactType || review.targetEntityType})
                      </span>
                    </div>

                    {/* 1. What requires review & 2. Why unresolved */}
                    <h4 className="text-sm font-bold text-[#171717] tracking-tight">
                      {review.reason}
                    </h4>

                    {/* 3. Evidence / Missing Info */}
                    {review.missingOrConflictingInfo && (
                      <div className="p-2.5 rounded-sm bg-[#FAF9F8] border border-[#E6E3E1] text-xs text-[#171717] flex items-start gap-2">
                        <AlertCircle className="w-3.5 h-3.5 text-[#B45309] mt-0.5 flex-shrink-0" />
                        <div>
                          <strong className="text-[#92400E]">Clinical Context / Missing Info:</strong>{' '}
                          <span>{review.missingOrConflictingInfo}</span>
                        </div>
                      </div>
                    )}

                    {/* 4. Requested Action */}
                    <div className="text-xs text-[#525252]">
                      <strong className="text-[#171717]">Permitted Action:</strong> {review.requestedReviewerAction}
                    </div>

                    {review.supportingEvidenceReferences && review.supportingEvidenceReferences.length > 0 && (
                      <div className="text-[11px] text-[#777777] flex items-center gap-1.5">
                        <ExternalLink className="w-3 h-3 text-[#777777]" />
                        <span>Evidence Reference: {review.supportingEvidenceReferences.join(', ')}</span>
                      </div>
                    )}

                    {review.reviewerIdentity && (
                      <div className="text-[11px] text-[#525252] pt-1 flex items-center gap-2 border-t border-[#E6E3E1]">
                        <UserCheck className="w-3.5 h-3.5 text-[#059669]" />
                        <span>
                          Resolved by <strong>{review.reviewerIdentity}</strong> ({review.reviewerRole || 'Clinician'}) at {new Date(review.resolvedAt || '').toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* 5. Resolution Action Button */}
                  <div className="flex flex-col items-start md:items-end gap-2 flex-shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-[#E6E3E1]">
                    <span className="text-[10px] text-[#777777] tabular-nums">
                      Created: {new Date(review.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>

                    {isPending ? (
                      <button
                        type="button"
                        onClick={() => handleOpenResolveModal(review)}
                        className="px-3.5 py-1.5 rounded-sm text-xs font-bold bg-[#1747E8] hover:bg-[#1238C7] text-white flex items-center gap-1.5 shadow-editorial transition-colors focus:ring-2 focus:ring-[#1747E8]"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>Resolve Review</span>
                      </button>
                    ) : (
                      <span className="text-xs text-[#777777] italic">Resolved</span>
                    )}
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>

      {/* 5. Immutable Approval Records Table (Rule 6) */}
      <div className="bg-white border border-[#E6E3E1] rounded-sm p-4 shadow-editorial space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E6E3E1] pb-2.5">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-[#1747E8]" />
            <h3 className="text-xs font-bold text-[#171717] uppercase tracking-wider">
              Immutable Approval Records (Audit Trail)
            </h3>
          </div>
          <span className="text-[10px] text-[#777777]">
            Recorded in persistent SQLite database separately from workflow state
          </span>
        </div>

        {approvals.length === 0 ? (
          <p className="text-xs text-[#777777] py-3 text-center italic">
            No permanent approval records logged for this session yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs text-left">
              <thead className="bg-[#FAF9F8] text-[#777777] font-semibold border-b border-[#E6E3E1] text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="py-2 px-3">Approval ID</th>
                  <th className="py-2 px-3">Category</th>
                  <th className="py-2 px-3">Decision</th>
                  <th className="py-2 px-3">Reviewer &amp; Role</th>
                  <th className="py-2 px-3">Target Artifact</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E6E3E1] text-[#171717]">
                {approvals.map((appr) => (
                  <tr key={appr.approvalId} className="hover:bg-[#FAF9F8]/60 transition-colors">
                    <td className="py-2 px-3 font-mono text-[10px] text-[#777777]">{appr.approvalId}</td>
                    <td className="py-2 px-3 font-medium">{CATEGORY_LABELS[appr.category]?.label || appr.category}</td>
                    <td className="py-2 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wider ${
                          appr.decision === 'approved'
                            ? 'bg-[#ECFDF5] text-[#065F46] border border-[#A7F3D0]'
                            : appr.decision === 'rejected'
                              ? 'bg-[#FEE2E2] text-[#991B1B] border border-[#FECACA]'
                              : 'bg-[#D7DEFF] text-[#1747E8] border border-[#C0CEFF]'
                        }`}
                      >
                        {appr.decision}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <div className="font-semibold text-[#171717]">{appr.reviewerIdentity}</div>
                      <div className="text-[10px] text-[#777777] capitalize">{appr.reviewerRole?.replace('_', ' ')}</div>
                    </td>
                    <td className="py-2 px-3 text-[11px] font-mono text-[#525252]">
                      {appr.targetArtifactType} (v{appr.targetArtifactVersion})
                    </td>
                    <td className="py-2 px-3">
                      {appr.validUntilStale ? (
                        <span className="px-1.5 py-0.5 rounded-sm text-[10px] font-bold bg-[#ECFDF5] text-[#065F46] border border-[#A7F3D0]">
                          Fresh &amp; Valid
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded-sm text-[10px] font-bold bg-[#FEE2E2] text-[#991B1B] border border-[#FECACA]">
                          Invalidated / Stale
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-[11px] text-[#777777] tabular-nums">
                      {new Date(appr.decidedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 6. Resolve Review Modal */}
      {resolveModalOpen && selectedReview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="resolve-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#171717]/50 backdrop-blur-xs p-4"
        >
          <div className="bg-white rounded-sm border border-[#E6E3E1] shadow-xl w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between p-4 border-b border-[#E6E3E1] bg-[#FAF9F8]">
              <div className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-[#1747E8]" />
                <h3 id="resolve-modal-title" className="text-sm font-bold text-[#171717]">
                  Resolve Clinical Review Request
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setResolveModalOpen(false)}
                className="p-1 text-[#777777] hover:text-[#171717] rounded-sm transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitResolution} className="p-5 space-y-4">
              {modalError && (
                <div className="p-3 bg-[#FEE2E2] border border-[#FECACA] text-[#991B1B] rounded-sm text-xs flex items-start gap-2">
                  <AlertOctagon className="w-4 h-4 text-[#DC2626] flex-shrink-0 mt-0.5" />
                  <div>
                    <strong>Verification Blocked:</strong> {modalError}
                  </div>
                </div>
              )}

              {/* Item Summary */}
              <div className="p-3 bg-[#FAF9F8] rounded-sm border border-[#E6E3E1] text-xs space-y-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#777777]">Target Clinical Finding</div>
                <div className="font-bold text-[#171717]">{selectedReview.reason}</div>
                <div className="text-[#525252] font-mono text-[11px]">
                  Target Version: v{selectedReview.targetArtifactVersion ?? selectedReview.itemVersion}
                </div>
              </div>

              {/* Decision Choice */}
              <div>
                <label className="text-xs font-bold text-[#171717] block mb-1.5">
                  Clinical Determination
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setDecision('approved')}
                    className={`py-2 px-3 text-xs font-bold rounded-sm border transition-all ${
                      decision === 'approved'
                        ? 'bg-[#ECFDF5] text-[#065F46] border-[#059669] ring-1 ring-[#059669]'
                        : 'bg-white text-[#525252] border-[#E6E3E1] hover:bg-[#FAF9F8]'
                    }`}
                  >
                    Approve / Sign Off
                  </button>
                  <button
                    type="button"
                    onClick={() => setDecision('modified')}
                    className={`py-2 px-3 text-xs font-bold rounded-sm border transition-all ${
                      decision === 'modified'
                        ? 'bg-[#D7DEFF] text-[#1747E8] border-[#1747E8] ring-1 ring-[#1747E8]'
                        : 'bg-white text-[#525252] border-[#E6E3E1] hover:bg-[#FAF9F8]'
                    }`}
                  >
                    Approve Modified
                  </button>
                  <button
                    type="button"
                    onClick={() => setDecision('rejected')}
                    className={`py-2 px-3 text-xs font-bold rounded-sm border transition-all ${
                      decision === 'rejected'
                        ? 'bg-[#FEE2E2] text-[#991B1B] border-[#DC2626] ring-1 ring-[#DC2626]'
                        : 'bg-white text-[#525252] border-[#E6E3E1] hover:bg-[#FAF9F8]'
                    }`}
                  >
                    Reject Order
                  </button>
                </div>
              </div>

              {/* Reviewer Identity & Role */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="reviewer-name" className="text-xs font-bold text-[#171717] block mb-1">
                    Licensed Clinician Name *
                  </label>
                  <input
                    id="reviewer-name"
                    type="text"
                    required
                    value={reviewerIdentity}
                    onChange={(e) => setReviewerIdentity(e.target.value)}
                    placeholder="e.g. Dr. Sarah Lin, PharmD"
                    className="w-full text-xs bg-[#FAF9F8] border border-[#E6E3E1] rounded-sm px-3 py-1.5 text-[#171717] focus:bg-white focus:border-[#1747E8] focus:ring-1 focus:ring-[#1747E8]"
                  />
                  <span className="text-[10px] text-[#777777] mt-0.5 block">
                    AI agent names are blocked by Rule 4 safety gate.
                  </span>
                </div>

                <div>
                  <label htmlFor="reviewer-role" className="text-xs font-bold text-[#171717] block mb-1">
                    Clinical Role *
                  </label>
                  <select
                    id="reviewer-role"
                    value={reviewerRole}
                    onChange={(e) => setReviewerRole(e.target.value as ReviewerRole)}
                    className="w-full text-xs bg-[#FAF9F8] border border-[#E6E3E1] rounded-sm px-3 py-1.5 text-[#171717] font-medium focus:bg-white focus:border-[#1747E8] focus:ring-1 focus:ring-[#1747E8]"
                  >
                    <option value="clinical_pharmacist">Clinical Pharmacist</option>
                    <option value="attending_physician">Attending Physician</option>
                    <option value="medical_director">Medical Director</option>
                    <option value="registered_nurse">Registered Nurse</option>
                  </select>
                </div>
              </div>

              {/* Rationale & Notes */}
              <div>
                <label htmlFor="reviewer-notes" className="text-xs font-bold text-[#171717] block mb-1">
                  Clinical Rationale / Notes (Optional)
                </label>
                <textarea
                  id="reviewer-notes"
                  rows={3}
                  value={reviewerNotes}
                  onChange={(e) => setReviewerNotes(e.target.value)}
                  placeholder="Document specific monitoring, dose justification, or clinical reasoning..."
                  className="w-full text-xs bg-[#FAF9F8] border border-[#E6E3E1] rounded-sm p-2 text-[#171717] focus:bg-white focus:border-[#1747E8] focus:ring-1 focus:ring-[#1747E8]"
                />
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E6E3E1]">
                <button
                  type="button"
                  onClick={() => setResolveModalOpen(false)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-[#525252] bg-[#FAF9F8] hover:bg-[#E6E3E1] border border-[#E6E3E1] rounded-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-[#1747E8] hover:bg-[#1238C7] rounded-sm transition-colors shadow-editorial disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Recording...</span>
                    </>
                  ) : (
                    <span>Submit Resolution</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
