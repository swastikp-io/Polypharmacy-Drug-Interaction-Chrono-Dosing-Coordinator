import React, { useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Edit3,
  Pill,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import type { CandidateMedication, TerminologyMatch } from '../../../shared/ocrTypes.js';
import type { MedicationStatus, VerificationStatus } from '../../../shared/types.js';

interface CandidateMedicationCardProps {
  candidate: CandidateMedication;
  isSelected: boolean;
  onSelect: () => void;
  onConfirmReconcile: (reconciledData: any) => Promise<void>;
  onDismiss: () => void;
}

export const CandidateMedicationCard: React.FC<CandidateMedicationCardProps> = ({
  candidate,
  isSelected,
  onSelect,
  onConfirmReconcile,
  onDismiss,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isConfidenceExpanded, setIsConfidenceExpanded] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);

  // Editable Form State
  const [brand, setBrand] = useState(candidate.brand);
  const [genericName, setGenericName] = useState(candidate.genericName);
  const [strength, setStrength] = useState(candidate.strength);
  const [salt, setSalt] = useState(candidate.salt || 'Unknown');
  const [dosageForm, setDosageForm] = useState(candidate.dosageForm);
  const [route, setRoute] = useState(candidate.route);
  const [prescribedDose, setPrescribedDose] = useState(candidate.prescribedDose);
  const [frequency, setFrequency] = useState(candidate.frequency);
  const [administrationInstructions, setAdministrationInstructions] = useState(
    candidate.administrationInstructions
  );
  const [prescriber, setPrescriber] = useState(candidate.prescriber || 'Unknown');
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>('confirmed');
  const [orderStatus, setOrderStatus] = useState<MedicationStatus>('active');
  const [actor, setActor] = useState('Clinical Pharmacist Reviewer');

  // Terminology override
  const [selectedTermMatch, setSelectedTermMatch] = useState<TerminologyMatch | null>(
    candidate.selectedTerminologyMatch || null
  );

  const criticalAmbiguities = candidate.ambiguities.filter((a) => a.severity === 'critical');
  const warningAmbiguities = candidate.ambiguities.filter((a) => a.severity === 'warning');

  const handleApplyTerminology = (match: TerminologyMatch) => {
    setSelectedTermMatch(match);
    if (match.brandName) setBrand(match.brandName);
    setGenericName(match.genericName);
    if (match.standardStrength) setStrength(match.standardStrength);
    if (match.saltForm) setSalt(match.saltForm);
    if (match.dosageForm) setDosageForm(match.dosageForm);
  };

  const handleReconcileSubmit = async () => {
    if (!brand.trim() || !genericName.trim() || !prescribedDose.trim()) {
      alert('Brand name, generic name, and prescribed dose are required.');
      return;
    }

    setIsReconciling(true);
    try {
      await onConfirmReconcile({
        candidateId: candidate.id,
        documentId: candidate.documentId,
        brand: brand.trim(),
        genericName: genericName.trim(),
        activeIngredients: selectedTermMatch?.activeIngredients || [
          { name: genericName.trim(), strength: strength.trim() },
        ],
        salt: salt.trim() || 'Unknown',
        strength: strength.trim() || prescribedDose.trim(),
        formulation: dosageForm.trim(),
        route: route.trim(),
        prescribedDose: prescribedDose.trim(),
        frequency: frequency.trim(),
        administrationInstructions: administrationInstructions.trim(),
        prescriber: prescriber.trim() || 'Unknown',
        source: candidate.source,
        status: orderStatus,
        verificationStatus,
        actor: actor.trim(),
      });
    } finally {
      setIsReconciling(false);
    }
  };

  const overallConfPercent = Math.round(candidate.fieldConfidence.overall * 100);

  return (
    <article
      onClick={onSelect}
      className={`rounded-2xl border transition-all p-4 sm:p-5 shadow-xs bg-white space-y-4 cursor-pointer ${
        isSelected
          ? 'border-clinical-500 ring-2 ring-clinical-500/20 shadow-md'
          : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      {/* Top Status & Confidence Row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="p-1.5 bg-clinical-50 text-clinical-600 rounded-lg">
            <Pill className="w-4 h-4" aria-hidden="true" />
          </span>
          <span className="text-xs font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
            Page {candidate.pageNumber}, Line {candidate.sourceLineIndex}
          </span>
          <span className="text-2xs uppercase tracking-wider font-semibold text-slate-400">
            {candidate.reconciliationStatus === 'accepted' ? (
              <span className="text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded">Reconciled</span>
            ) : (
              'Candidate Extracted'
            )}
          </span>
        </div>

        {/* Optical Confidence Badge */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsConfidenceExpanded(!isConfidenceExpanded);
            }}
            title="View field-level confidence scores"
            aria-label="Toggle field-level confidence details"
            className={`px-2.5 py-0.5 rounded-full text-xs font-bold border flex items-center gap-1 transition-colors ${
              overallConfPercent >= 85
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                : overallConfPercent >= 65
                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                  : 'bg-red-50 text-red-800 border-red-300'
            }`}
          >
            <span>{overallConfPercent}% Confidence</span>
            {isConfidenceExpanded ? (
              <ChevronUp className="w-3 h-3" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-3 h-3" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Field Confidence Breakdown Accordion */}
      {isConfidenceExpanded && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-2 animate-in fade-in duration-150"
        >
          <div className="font-bold text-slate-700 text-2xs uppercase tracking-wider">
            Field-Level Optical Confidence
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-2xs">
            <div>
              <span className="text-slate-400 block">Drug Brand:</span>
              <strong className="text-slate-800">{Math.round(candidate.fieldConfidence.brand * 100)}%</strong>
            </div>
            <div>
              <span className="text-slate-400 block">Dose / Strength:</span>
              <strong className="text-slate-800">{Math.round(candidate.fieldConfidence.strength * 100)}%</strong>
            </div>
            <div>
              <span className="text-slate-400 block">Frequency:</span>
              <strong className="text-slate-800">{Math.round(candidate.fieldConfidence.frequency * 100)}%</strong>
            </div>
            <div>
              <span className="text-slate-400 block">Form &amp; Route:</span>
              <strong className="text-slate-800">{Math.round(candidate.fieldConfidence.dosageForm * 100)}%</strong>
            </div>
          </div>
        </div>
      )}

      {/* Critical Ambiguity Alerts (e.g. Missing Dose, LASA, Duplicate Ingredient) */}
      {criticalAmbiguities.length > 0 && (
        <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
          {criticalAmbiguities.map((amb) => (
            <div
              key={amb.id}
              className="p-3 rounded-xl border border-red-300 bg-red-50 text-xs text-red-950 space-y-1.5"
            >
              <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-red-800 text-2xs">
                <AlertOctagon className="w-3.5 h-3.5 text-red-600 flex-shrink-0" aria-hidden="true" />
                <span>Critical Safety Flag: {amb.issueType.replace(/_/g, ' ')}</span>
              </div>
              <p className="font-medium text-xs leading-relaxed">{amb.description}</p>
              {amb.candidates && amb.candidates.length > 0 && (
                <div className="pt-1 flex flex-wrap items-center gap-1 text-2xs">
                  <span className="text-red-700 font-semibold">Options to verify:</span>
                  {amb.candidates.map((c, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded bg-white border border-red-200 text-red-900 font-bold"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Warning Ambiguity Alerts */}
      {warningAmbiguities.length > 0 && (
        <div className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
          {warningAmbiguities.map((amb) => (
            <div
              key={amb.id}
              className="p-2.5 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-950 flex items-start gap-2"
            >
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <div className="text-2xs leading-relaxed">
                <strong className="capitalize">{amb.field}: </strong>
                {amb.description}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Raw Extracted Snippet Quote */}
      <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-2xs text-slate-600 flex items-start gap-2">
        <span className="font-semibold text-slate-400 select-none uppercase tracking-wider flex-shrink-0">
          Raw OCR:
        </span>
        <span className="font-mono text-slate-800 italic truncate">&quot;{candidate.sourceSnippet}&quot;</span>
      </div>

      {/* Main Extracted Entities Form / View */}
      {isEditing ? (
        <div
          onClick={(e) => e.stopPropagation()}
          className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-xs"
        >
          <div className="flex items-center justify-between pb-1 border-b border-slate-200">
            <span className="font-bold text-slate-800 uppercase tracking-wider text-2xs">
              Edit Candidate Fields
            </span>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="text-clinical-700 font-semibold text-2xs hover:underline"
            >
              Done Editing
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-2xs font-semibold text-slate-700 mb-0.5">Brand Name</label>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="w-full px-2.5 py-1 text-xs rounded border border-slate-300"
              />
            </div>
            <div>
              <label className="block text-2xs font-semibold text-slate-700 mb-0.5">Generic Name</label>
              <input
                type="text"
                value={genericName}
                onChange={(e) => setGenericName(e.target.value)}
                className="w-full px-2.5 py-1 text-xs rounded border border-slate-300"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-2xs font-semibold text-slate-700 mb-0.5">Strength</label>
              <input
                type="text"
                value={strength}
                onChange={(e) => setStrength(e.target.value)}
                placeholder="e.g. 500 mg"
                className="w-full px-2 py-1 text-xs rounded border border-slate-300"
              />
            </div>
            <div>
              <label className="block text-2xs font-semibold text-slate-700 mb-0.5">Salt Form</label>
              <input
                type="text"
                value={salt}
                onChange={(e) => setSalt(e.target.value)}
                placeholder="e.g. Besylate"
                className="w-full px-2 py-1 text-xs rounded border border-slate-300"
              />
            </div>
            <div>
              <label className="block text-2xs font-semibold text-slate-700 mb-0.5">Formulation</label>
              <input
                type="text"
                value={dosageForm}
                onChange={(e) => setDosageForm(e.target.value)}
                className="w-full px-2 py-1 text-xs rounded border border-slate-300"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-2xs font-semibold text-slate-700 mb-0.5">Route</label>
              <input
                type="text"
                value={route}
                onChange={(e) => setRoute(e.target.value)}
                className="w-full px-2 py-1 text-xs rounded border border-slate-300"
              />
            </div>
            <div>
              <label className="block text-2xs font-semibold text-slate-700 mb-0.5">Prescriber</label>
              <input
                type="text"
                value={prescriber}
                onChange={(e) => setPrescriber(e.target.value)}
                className="w-full px-2 py-1 text-xs rounded border border-slate-300"
              />
            </div>
            <div>
              <label className="block text-2xs font-semibold text-slate-700 mb-0.5">Order Status</label>
              <select
                value={orderStatus}
                onChange={(e) => setOrderStatus(e.target.value as MedicationStatus)}
                className="w-full px-2 py-1 text-xs rounded border border-slate-300 bg-white"
              >
                <option value="active">active</option>
                <option value="prn">prn</option>
                <option value="on-hold">on-hold</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-2xs font-semibold text-slate-700 mb-0.5">Prescribed Dose</label>
              <input
                type="text"
                value={prescribedDose}
                onChange={(e) => setPrescribedDose(e.target.value)}
                className="w-full px-2.5 py-1 text-xs rounded border border-slate-300"
              />
            </div>
            <div>
              <label className="block text-2xs font-semibold text-slate-700 mb-0.5">Frequency</label>
              <input
                type="text"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                className="w-full px-2.5 py-1 text-xs rounded border border-slate-300"
              />
            </div>
          </div>

          <div>
            <label className="block text-2xs font-semibold text-slate-700 mb-0.5">
              Administration Instructions (Sig)
            </label>
            <input
              type="text"
              value={administrationInstructions}
              onChange={(e) => setAdministrationInstructions(e.target.value)}
              className="w-full px-2.5 py-1 text-xs rounded border border-slate-300"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-2 text-xs">
          <div className="flex items-baseline justify-between">
            <div>
              <h4 className="text-base font-bold text-slate-900 inline">{brand}</h4>
              <span className="text-xs text-slate-500 ml-1.5 font-medium">({genericName})</span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
              }}
              className="text-2xs font-semibold text-clinical-600 hover:text-clinical-800 flex items-center gap-1"
            >
              <Edit3 className="w-3 h-3" aria-hidden="true" />
              <span>Edit Fields</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-2xs bg-slate-50/70 p-2.5 rounded-lg border border-slate-100">
            <div>
              <span className="text-slate-400 block font-semibold uppercase">Strength</span>
              <span className="font-bold text-slate-800">{strength || 'MISSING'}</span>
            </div>
            <div>
              <span className="text-slate-400 block font-semibold uppercase">Salt Form</span>
              <span className="font-medium text-slate-700">{salt}</span>
            </div>
            <div>
              <span className="text-slate-400 block font-semibold uppercase">Form / Route</span>
              <span className="font-medium text-slate-700">{dosageForm} • {route}</span>
            </div>
            <div>
              <span className="text-slate-400 block font-semibold uppercase">Dose</span>
              <span className="font-bold text-clinical-900">{prescribedDose}</span>
            </div>
          </div>

          <div className="flex items-start gap-1.5 text-xs text-slate-700 pt-0.5">
            <Clock className="w-3.5 h-3.5 text-clinical-600 mt-0.5 flex-shrink-0" aria-hidden="true" />
            <div>
              <strong className="text-slate-900">{frequency}: </strong>
              <span>{administrationInstructions}</span>
            </div>
          </div>
        </div>
      )}

      {/* Terminology Matcher Selector */}
      {candidate.terminologyMatches.length > 0 && (
        <div className="bg-clinical-50/50 p-2.5 rounded-lg border border-clinical-200 text-xs space-y-1.5" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between text-2xs font-bold text-clinical-950 uppercase tracking-wider">
            <span className="flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-clinical-600" aria-hidden="true" />
              Standard Formulary Concept Mapping
            </span>
            <span>{candidate.terminologyMatches.length} Matches</span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {candidate.terminologyMatches.map((m) => (
              <button
                key={m.conceptId}
                type="button"
                onClick={() => handleApplyTerminology(m)}
                className={`px-2 py-1 rounded text-2xs font-medium border transition-colors ${
                  selectedTermMatch?.conceptId === m.conceptId
                    ? 'bg-clinical-600 text-white border-clinical-700 shadow-2xs'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-clinical-50'
                }`}
              >
                {m.term}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Reconciliation Action Bar (Requires Explicit User Confirmation) */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <label htmlFor={`verif-select-${candidate.id}`} className="text-2xs font-semibold text-slate-500">
              Save as:
            </label>
            <select
              id={`verif-select-${candidate.id}`}
              value={verificationStatus}
              onChange={(e) => setVerificationStatus(e.target.value as VerificationStatus)}
              className="px-2 py-1 text-2xs rounded border border-slate-300 bg-white font-medium"
            >
              <option value="confirmed">Confirmed</option>
              <option value="unverified">Unverified (Pending MD check)</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <label htmlFor={`actor-input-${candidate.id}`} className="text-2xs font-semibold text-slate-500">
              Reviewer:
            </label>
            <input
              id={`actor-input-${candidate.id}`}
              type="text"
              value={actor}
              onChange={(e) => setActor(e.target.value)}
              className="px-2 py-1 text-2xs rounded border border-slate-300 w-36"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onDismiss}
            aria-label={`Dismiss candidate order ${brand}`}
            className="px-3 py-1.5 text-xs text-slate-600 hover:text-red-700 hover:bg-red-50 rounded-lg font-medium transition-colors"
          >
            Dismiss
          </button>

          <button
            type="button"
            disabled={isReconciling || candidate.reconciliationStatus === 'accepted'}
            onClick={handleReconcileSubmit}
            className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white shadow-xs transition-colors disabled:opacity-50 ${
              candidate.reconciliationStatus === 'accepted'
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : 'bg-clinical-600 hover:bg-clinical-700'
            }`}
          >
            {candidate.reconciliationStatus === 'accepted' ? (
              <>
                <Check className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Reconciled &amp; Saved</span>
              </>
            ) : (
              <>
                <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{isReconciling ? 'Saving...' : 'Confirm & Save Order'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </article>
  );
};
