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
  Filter,
  Lock,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  UserCheck,
  X,
  XCircle,
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
    color: 'bg-amber-100 text-amber-900 border-amber-300',
    desc: 'Uncertain drug order, unverified candidate, or brand/generic ambiguity requiring verification.',
  },
  missing_prescription_instructions: {
    label: 'Missing Prescription Instructions',
    color: 'bg-orange-100 text-orange-900 border-orange-300',
    desc: 'Missing dosage, route, frequency, or administration instructions.',
  },
  potentially_significant_interaction: {
    label: 'Potentially Significant Interaction',
    color: 'bg-red-100 text-red-900 border-red-300',
    desc: 'Severe pharmacokinetic/pharmacodynamic conflict requiring clinical pharmacist sign-off.',
  },
  insufficient_clinical_evidence: {
    label: 'Insufficient Clinical Evidence',
    color: 'bg-purple-100 text-purple-900 border-purple-300',
    desc: 'Clinical database gap or missing evidence requiring practitioner assessment.',
  },
  conflicting_scheduling_constraints: {
    label: 'Conflicting Scheduling Constraints',
    color: 'bg-blue-100 text-blue-900 border-blue-300',
    desc: 'Mandatory absorption or food-drug constraint clash that cannot be auto-resolved.',
  },
  schedule_review: {
    label: 'Circadian Schedule Approval',
    color: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    desc: 'Proposed 24-hour diurnal administration draft ready for final clinician sign-off.',
  },
};

const ROLE_PERMISSIONS_GUIDE: Record<ReviewerRole, { title: string; allowed: string[] }> = {
  clinical_pharmacist: {
    title: 'Clinical Pharmacist',
    allowed: ['All medication, interaction, evidence, constraint, and schedule reviews.'],
  },
  attending_physician: {
    title: 'Attending Physician',
    allowed: ['All clinical reviews, dose adjustments, and final schedule sign-off.'],
  },
  medical_director: {
    title: 'Medical Director',
    allowed: ['Full authority across all clinical categories.'],
  },
  registered_nurse: {
    title: 'Registered Nurse',
    allowed: ['Scheduling constraints and administration routine reviews. (Cannot override interactions or verify drug identities).'],
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
      // First try to fetch pending reviews across system
      const pendingList = await api.getPendingReviews();
      setReviews(pendingList || []);

      // If there are reviews, grab workflow ID from the first one to fetch approvals
      if (pendingList && pendingList.length > 0) {
        const wfId = pendingList[0].workflowId;
        setActiveWorkflowId(wfId);
        try {
          const approvalList = await api.getWorkflowApprovals(wfId);
          setApprovals(approvalList || []);
        } catch {
          // Approvals might be empty
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

    // Client-side AI prevention check (also enforced strictly on server by Rule 4)
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
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-xl p-5 shadow-sm border border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30 flex-shrink-0 mt-0.5">
              <ShieldCheck className="w-5 h-5 text-indigo-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">
                  Human Review &amp; Clinical Approval Gates
                </h2>
                <span className="px-2 py-0.5 rounded text-2xs font-bold bg-indigo-500/30 text-indigo-200 border border-indigo-400/40">
                  Phase 4 Governance
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
                Deterministic safety gates enforcing human clinician oversight. An unverified medication cannot be treated as confirmed, evidence gaps cannot be masked, and autonomous AI agents are strictly barred from approving clinical regimens.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchReviews}
              disabled={loading}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh Queue</span>
            </button>
          </div>
        </div>

        {/* 7 Rules Safety Summary Pills */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 mt-4 pt-4 border-t border-slate-800/80 text-2xs text-slate-300">
          <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-800/60 border border-slate-700/50">
            <Lock className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
            <span><strong>Rule 1 &amp; 2:</strong> Unverified meds blocked; evidence gaps never masked.</span>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-800/60 border border-slate-700/50">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
            <span><strong>Rule 3:</strong> Unresolved hard constraints block schedule approval.</span>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-800/60 border border-slate-700/50">
            <UserCheck className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
            <span><strong>Rule 4 &amp; 7:</strong> AI signoff forbidden; human role matrix enforced.</span>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-800/60 border border-slate-700/50">
            <RotateCcw className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
            <span><strong>Rule 5 &amp; 6:</strong> Stale artifact invalidation; separate approval records.</span>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3.5 rounded-xl border bg-white border-amber-200 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-2xs font-bold uppercase text-amber-700">Awaiting Action</div>
            <div className="text-2xl font-bold text-amber-900 mt-0.5">{pendingCount}</div>
            <div className="text-2xs text-slate-500">Pending clinician review</div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="p-3.5 rounded-xl border bg-white border-emerald-200 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-2xs font-bold uppercase text-emerald-700">Approved Reviews</div>
            <div className="text-2xl font-bold text-emerald-900 mt-0.5">{approvedCount}</div>
            <div className="text-2xs text-slate-500">Clinician signed off</div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="p-3.5 rounded-xl border bg-white border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-2xs font-bold uppercase text-slate-600">Active Approvals</div>
            <div className="text-2xl font-bold text-slate-900 mt-0.5">{approvals.length}</div>
            <div className="text-2xs text-slate-500">
              {invalidatedCount > 0 ? (
                <span className="text-red-600 font-semibold">{invalidatedCount} invalidated</span>
              ) : (
                'Immutable records logged'
              )}
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
            <Award className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-2xs font-bold text-slate-500 uppercase flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Status:
          </span>
          {(['all', 'pending', 'approved', 'rejected', 'invalidated'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold capitalize transition-colors ${
                statusFilter === s
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="category-select" className="text-2xs font-bold text-slate-500 uppercase">
            Category:
          </label>
          <select
            id="category-select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="text-xs bg-white border border-slate-300 rounded-md px-2.5 py-1 text-slate-800 font-medium focus:ring-1 focus:ring-indigo-500 focus:outline-none"
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
        <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Review Queue Items */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
          <span>Active Review Items ({filteredReviews.length})</span>
          {activeWorkflowId && (
            <span className="text-2xs font-mono text-slate-400 font-normal">
              Workflow: {activeWorkflowId}
            </span>
          )}
        </h3>

        {loading ? (
          <div className="p-8 text-center bg-white border border-slate-200 rounded-xl">
            <RefreshCw className="w-6 h-6 animate-spin text-indigo-600 mx-auto mb-2" />
            <p className="text-xs text-slate-500">Loading clinical review items...</p>
          </div>
        ) : filteredReviews.length === 0 ? (
          <div className="p-8 text-center bg-white border border-slate-200 rounded-xl">
            <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-slate-800">No Review Requests In Queue</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              All clinical gates for this status are clear. If a candidate medication, drug-drug interaction warning, or conflicting scheduling constraint emerges, it will appear here.
            </p>
          </div>
        ) : (
          filteredReviews.map((review) => {
            const catInfo = CATEGORY_LABELS[review.category] || {
              label: review.category,
              color: 'bg-slate-100 text-slate-800 border-slate-300',
              desc: '',
            };

            return (
              <div
                key={review.id}
                className={`p-4 rounded-xl border bg-white shadow-xs transition-all ${
                  review.status === 'pending'
                    ? 'border-amber-300 ring-1 ring-amber-400/30'
                    : 'border-slate-200'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1.5 max-w-3xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2.5 py-0.5 rounded-md text-2xs font-bold border ${catInfo.color}`}
                      >
                        {catInfo.label}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-2xs font-bold uppercase ${
                          review.status === 'pending'
                            ? 'bg-amber-100 text-amber-800'
                            : review.status === 'approved'
                              ? 'bg-emerald-100 text-emerald-800'
                              : review.status === 'rejected'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {review.status}
                      </span>
                      <span className="text-2xs text-slate-400 font-mono">
                        v{review.targetArtifactVersion ?? review.itemVersion} ({review.targetArtifactType || review.targetEntityType})
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-slate-900">{review.reason}</h4>

                    {review.missingOrConflictingInfo && (
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 flex items-start gap-2">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <strong>Clinical Context / Missing Info:</strong>{' '}
                          {review.missingOrConflictingInfo}
                        </div>
                      </div>
                    )}

                    <div className="text-xs text-slate-600">
                      <strong>Requested Action:</strong> {review.requestedReviewerAction}
                    </div>

                    {review.supportingEvidenceReferences && review.supportingEvidenceReferences.length > 0 && (
                      <div className="text-2xs text-slate-500 flex items-center gap-1.5">
                        <ExternalLink className="w-3 h-3 text-slate-400" />
                        <span>Supporting Evidence: {review.supportingEvidenceReferences.join(', ')}</span>
                      </div>
                    )}

                    {review.reviewerIdentity && (
                      <div className="text-2xs text-slate-500 pt-1 flex items-center gap-2">
                        <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                        <span>
                          Reviewed by <strong>{review.reviewerIdentity}</strong> ({review.reviewerRole || 'Clinician'}) at {new Date(review.resolvedAt || '').toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <span className="text-2xs text-slate-400">
                      Created: {new Date(review.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>

                    {review.status === 'pending' ? (
                      <button
                        type="button"
                        onClick={() => handleOpenResolveModal(review)}
                        className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 shadow-xs transition-colors"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>Resolve Review</span>
                      </button>
                    ) : (
                      <span className="text-2xs text-slate-400 italic">Resolved</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Immutable Approval Records Table (Rule 6) */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-indigo-600" />
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Immutable Approval Records (Audit Trail)
            </h3>
          </div>
          <span className="text-2xs text-slate-400">
            Recorded in persistent SQLite database separately from workflow state
          </span>
        </div>

        {approvals.length === 0 ? (
          <p className="text-xs text-slate-500 py-3 text-center italic">
            No permanent approval records logged for this session yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2 px-3">Approval ID</th>
                  <th className="py-2 px-3">Category</th>
                  <th className="py-2 px-3">Decision</th>
                  <th className="py-2 px-3">Reviewer &amp; Role</th>
                  <th className="py-2 px-3">Target Artifact &amp; Version</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {approvals.map((appr) => (
                  <tr key={appr.approvalId} className="hover:bg-slate-50/50">
                    <td className="py-2 px-3 font-mono text-2xs text-slate-500">{appr.approvalId}</td>
                    <td className="py-2 px-3 font-medium">{CATEGORY_LABELS[appr.category]?.label || appr.category}</td>
                    <td className="py-2 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-2xs font-bold capitalize ${
                          appr.decision === 'approved'
                            ? 'bg-emerald-100 text-emerald-800'
                            : appr.decision === 'rejected'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {appr.decision}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <div className="font-semibold">{appr.reviewerIdentity}</div>
                      <div className="text-2xs text-slate-400 capitalize">{appr.reviewerRole?.replace('_', ' ')}</div>
                    </td>
                    <td className="py-2 px-3 text-2xs font-mono">
                      {appr.targetArtifactType} (v{appr.targetArtifactVersion})
                    </td>
                    <td className="py-2 px-3">
                      {appr.validUntilStale ? (
                        <span className="px-2 py-0.5 rounded text-2xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Fresh &amp; Valid
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-2xs font-bold bg-red-50 text-red-700 border border-red-200">
                          Invalidated (Stale)
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-2xs text-slate-500">
                      {new Date(appr.decidedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Resolution Modal */}
      {resolveModalOpen && selectedReview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="resolve-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
        >
          <div className="bg-white rounded-2xl shadow-xl max-w-xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-400" />
                <h3 id="resolve-modal-title" className="text-sm font-bold">
                  Clinical Review Sign-off
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setResolveModalOpen(false)}
                className="text-slate-400 hover:text-white"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitResolution} className="p-5 overflow-y-auto space-y-4">
              {/* Item Summary */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                <div className="text-2xs font-bold uppercase text-slate-500">Target Item</div>
                <div className="text-xs font-bold text-slate-800">{selectedReview.reason}</div>
                <div className="text-2xs text-slate-600">
                  <strong>Requested Action:</strong> {selectedReview.requestedReviewerAction}
                </div>
                <div className="text-2xs font-mono text-slate-400">
                  Artifact: {selectedReview.targetArtifactType || selectedReview.targetEntityType} (v{selectedReview.targetArtifactVersion ?? selectedReview.itemVersion})
                </div>
              </div>

              {/* AI Warning Banner (Rule 4) */}
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 flex items-start gap-2">
                <Lock className="w-4 h-4 text-amber-700 mt-0.5 flex-shrink-0" />
                <div>
                  <strong>Rule 4 Enforced:</strong> Licensed clinician identity required. Autonomous AI agents cannot sign off on clinical reviews or impersonate clinicians.
                </div>
              </div>

              {modalError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs flex items-center gap-2">
                  <AlertOctagon className="w-4 h-4 text-red-600 flex-shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              {/* Decision Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Clinical Decision
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setDecision('approved')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold border transition-colors flex items-center justify-center gap-1.5 ${
                      decision === 'approved'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Approve</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDecision('modified')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold border transition-colors flex items-center justify-center gap-1.5 ${
                      decision === 'modified'
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <UserCheck className="w-4 h-4" />
                    <span>Modify</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDecision('rejected')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold border transition-colors flex items-center justify-center gap-1.5 ${
                      decision === 'rejected'
                        ? 'bg-red-600 text-white border-red-600 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Reject</span>
                  </button>
                </div>
              </div>

              {/* Reviewer Role (Rule 7) */}
              <div>
                <label htmlFor="reviewer-role-select" className="block text-xs font-bold text-slate-700 mb-1">
                  Licensed Clinical Role (Rule 7 Permissions Matrix)
                </label>
                <select
                  id="reviewer-role-select"
                  value={reviewerRole}
                  onChange={(e) => setReviewerRole(e.target.value as ReviewerRole)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="clinical_pharmacist">Clinical Pharmacist (Authorized for all reviews)</option>
                  <option value="attending_physician">Attending Physician (Authorized for all reviews)</option>
                  <option value="medical_director">Medical Director (Full oversight)</option>
                  <option value="registered_nurse">Registered Nurse (Scheduling &amp; routine constraints only)</option>
                </select>
                <p className="text-2xs text-slate-500 mt-1">
                  {ROLE_PERMISSIONS_GUIDE[reviewerRole].allowed[0]}
                </p>
              </div>

              {/* Reviewer Identity */}
              <div>
                <label htmlFor="reviewer-identity-input" className="block text-xs font-bold text-slate-700 mb-1">
                  Reviewer Name &amp; Credentials
                </label>
                <input
                  id="reviewer-identity-input"
                  type="text"
                  value={reviewerIdentity}
                  onChange={(e) => setReviewerIdentity(e.target.value)}
                  placeholder="e.g. Dr. Sarah Lin, PharmD"
                  required
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              {/* Clinical Notes / Rationale */}
              <div>
                <label htmlFor="reviewer-notes-input" className="block text-xs font-bold text-slate-700 mb-1">
                  Clinical Rationale / Notes (Recorded in Permanent Audit Log)
                </label>
                <textarea
                  id="reviewer-notes-input"
                  value={reviewerNotes}
                  onChange={(e) => setReviewerNotes(e.target.value)}
                  placeholder="Provide clinical justification for this review decision..."
                  rows={3}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setResolveModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-800 border border-slate-300 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 shadow-xs transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Signing off...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Confirm &amp; Record Approval</span>
                    </>
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
