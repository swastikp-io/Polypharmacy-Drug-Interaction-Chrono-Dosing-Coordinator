import React, { useState } from 'react';
import {
  AlertCircle,
  AlertOctagon,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileScan,
  FileText,
  Layers,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type { CandidateMedication, OCRDocumentResult, TerminologyMatch } from '../../../shared/ocrTypes.js';
import type { Medication, MedicationStatus, VerificationStatus } from '../../../shared/types.js';
import { api } from '../../api/apiClient.js';
import { CandidateMedicationCard } from './CandidateMedicationCard.js';
import { DocumentViewer } from './DocumentViewer.js';
import { OCRUploadDropzone, SYNTHETIC_PRESCRIPTION_PRESETS } from './OCRUploadDropzone.js';

interface PrescriptionOCRWorkspaceProps {
  patientId: string;
  patientName: string;
  activeMedications: Medication[];
  onMedicationReconciled: () => Promise<void>;
}

export const PrescriptionOCRWorkspace: React.FC<PrescriptionOCRWorkspaceProps> = ({
  patientId,
  patientName,
  activeMedications,
  onMedicationReconciled,
}) => {
  const [currentDocument, setCurrentDocument] = useState<OCRDocumentResult | null>(null);
  const [candidateMedications, setCandidateMedications] = useState<CandidateMedication[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [showManualEntryModal, setShowManualEntryModal] = useState(false);

  // Manual entry modal state
  const [manualBrand, setManualBrand] = useState('');
  const [manualGeneric, setManualGeneric] = useState('');
  const [manualSalt, setManualSalt] = useState('Unknown');
  const [manualStrength, setManualStrength] = useState('');
  const [manualFormulation, setManualFormulation] = useState('Oral Tablet');
  const [manualRoute, setManualRoute] = useState('Oral');
  const [manualDose, setManualDose] = useState('1 tablet');
  const [manualFreq, setManualFreq] = useState('Once daily');
  const [manualSig, setManualSig] = useState('');
  const [manualPrescriber, setManualPrescriber] = useState('Dr. Robert Patel, MD');
  const [manualStatus, setManualStatus] = useState<MedicationStatus>('active');
  const [manualVerification, setManualVerification] = useState<VerificationStatus>('confirmed');
  const [manualTermQuery, setManualTermQuery] = useState('');
  const [manualTermResults, setManualTermResults] = useState<TerminologyMatch[]>([]);
  const [isSearchingTerm, setIsSearchingTerm] = useState(false);

  // Find currently selected candidate
  const selectedCandidate = candidateMedications.find((c) => c.id === selectedCandidateId) || null;

  // Aggregate document ambiguity statistics
  const totalCriticalAmbiguities = candidateMedications.reduce(
    (acc, c) => acc + c.ambiguities.filter((a) => a.severity === 'critical').length,
    0
  );
  const totalWarningAmbiguities = candidateMedications.reduce(
    (acc, c) => acc + c.ambiguities.filter((a) => a.severity === 'warning').length,
    0
  );
  const confirmedCount = candidateMedications.filter(
    (c) => c.reconciliationStatus === 'accepted'
  ).length;

  const duplicateIngredientCandidates = candidateMedications.filter(
    (c) => c.duplicateIngredientWarnings && c.duplicateIngredientWarnings.length > 0
  );

  const handleFileUpload = async (file: File) => {
    setIsProcessing(true);
    setGeneralError(null);
    setSuccessBanner(null);

    try {
      const result = await api.uploadPrescription(file, patientId);
      setCurrentDocument(result.document);
      setCandidateMedications(result.candidateMedications);
      if (result.candidateMedications.length > 0) {
        setSelectedCandidateId(result.candidateMedications[0].id);
      }
    } catch (err: any) {
      setGeneralError(err.message || 'Failed to process prescription document with local OCR engine.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSyntheticPresetSelect = async (presetKey: string) => {
    const preset = SYNTHETIC_PRESCRIPTION_PRESETS.find((p) => p.key === presetKey);
    if (!preset) return;

    // Create a synthetic image buffer with PNG magic bytes and embedded prescription text
    const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const encoder = new TextEncoder();
    const textBytes = encoder.encode(preset.text);
    const combined = new Uint8Array(pngHeader.length + textBytes.length);
    combined.set(pngHeader, 0);
    combined.set(textBytes, pngHeader.length);

    const file = new File([combined], `${preset.key}.png`, { type: 'image/png' });
    await handleFileUpload(file);
  };

  const handleConfirmReconcile = async (reconciledData: any) => {
    setGeneralError(null);
    setSuccessBanner(null);

    try {
      await api.reconcileCandidateMedication({
        ...reconciledData,
        patientId,
      });

      // Mark candidate as accepted in local state
      setCandidateMedications((prev) =>
        prev.map((c) =>
          c.id === reconciledData.candidateId
            ? {
                ...c,
                reconciliationStatus: 'accepted' as const,
                reconciledVerificationStatus: reconciledData.verificationStatus || 'confirmed',
              }
            : c
        )
      );

      setSuccessBanner(
        `Successfully reconciled and confirmed "${reconciledData.brand}" into verified patient chart.`
      );

      // Trigger parent reload of patient medications and audit trail
      await onMedicationReconciled();
    } catch (err: any) {
      setGeneralError(err.message || 'Failed to reconcile candidate medication into patient chart.');
      throw err;
    }
  };

  const handleDismissCandidate = (candidateId: string) => {
    setCandidateMedications((prev) => prev.filter((c) => c.id !== candidateId));
    if (selectedCandidateId === candidateId) {
      const remaining = candidateMedications.filter((c) => c.id !== candidateId);
      setSelectedCandidateId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  const handleClearSession = async () => {
    if (currentDocument) {
      try {
        await api.deleteDocument(currentDocument.documentId);
      } catch {
        // Safe temp file cleanup error tolerated
      }
    }
    setCurrentDocument(null);
    setCandidateMedications([]);
    setSelectedCandidateId(null);
    setGeneralError(null);
    setSuccessBanner(null);
  };

  // Terminology search in manual entry modal
  const handleSearchManualTerm = async () => {
    if (!manualTermQuery.trim()) return;
    setIsSearchingTerm(true);
    try {
      const results = await api.searchTerminology(manualTermQuery.trim());
      setManualTermResults(results);
    } catch (err: any) {
      setGeneralError('Failed to search drug terminology.');
    } finally {
      setIsSearchingTerm(false);
    }
  };

  const handleSelectManualTerm = (match: TerminologyMatch) => {
    if (match.brandName) setManualBrand(match.brandName);
    setManualGeneric(match.genericName);
    if (match.saltForm) setManualSalt(match.saltForm);
    if (match.standardStrength) setManualStrength(match.standardStrength);
    if (match.dosageForm) setManualFormulation(match.dosageForm);
    setManualTermResults([]);
  };

  const handleSaveManualMedication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualBrand.trim() || !manualGeneric.trim() || !manualDose.trim()) {
      alert('Brand name, Generic name, and Prescribed Dose are required.');
      return;
    }

    try {
      await api.createMedication({
        patientId,
        brand: manualBrand.trim(),
        genericName: manualGeneric.trim(),
        activeIngredients: [
          { name: manualGeneric.trim(), strength: manualStrength.trim() || manualDose.trim() },
        ],
        salt: manualSalt.trim() || 'Unknown',
        strength: manualStrength.trim() || manualDose.trim(),
        formulation: manualFormulation.trim(),
        route: manualRoute.trim(),
        prescribedDose: manualDose.trim(),
        frequency: manualFreq.trim(),
        administrationInstructions: manualSig.trim() || `Take ${manualDose} ${manualFreq}.`,
        prescriber: manualPrescriber.trim() || 'Unknown',
        source: 'Manual Clinical Intake Form (OCR Fallback)',
        status: manualStatus,
        verificationStatus: manualVerification,
        actor: 'Clinical Pharmacist Reviewer',
      });

      setShowManualEntryModal(false);
      setSuccessBanner(`Manually entered medication "${manualBrand}" saved successfully.`);
      await onMedicationReconciled();

      // Reset form
      setManualBrand('');
      setManualGeneric('');
      setManualStrength('');
      setManualSig('');
    } catch (err: any) {
      setGeneralError(err.message || 'Failed to save manual medication.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Clinical Safety Banner */}
      <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-sm border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-clinical-500/20 text-clinical-400 rounded-lg">
                <FileScan className="w-5 h-5" aria-hidden="true" />
              </span>
              <h2 className="text-base font-bold tracking-tight">
                Phase 2: Prescription OCR &amp; Normalization Agent
              </h2>
              <span className="px-2 py-0.5 rounded-full text-2xs font-semibold bg-clinical-900 border border-clinical-700 text-clinical-300">
                Local-First • Zero Cloud Upload
              </span>
            </div>
            <p className="text-xs text-slate-300 max-w-3xl">
              Extracts candidates from printed scripts or PDF orders, maps to standard RxNorm drug terminology, detects Look-Alike / Sound-Alike (LASA) safety hazards, flags missing doses, and requires explicit clinical pharmacist verification.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowManualEntryModal(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5 text-clinical-400" aria-hidden="true" />
              <span>Manual Entry (OCR Fallback)</span>
            </button>
            {currentDocument && (
              <button
                type="button"
                onClick={handleClearSession}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-red-950/50 hover:bg-red-900/70 text-red-300 border border-red-800/80 transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-400" aria-hidden="true" />
                <span>Clear Document</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Global Alerts / Feedback */}
      {generalError && (
        <aside
          aria-label="Error Alert"
          className="p-4 bg-red-50 border-l-4 border-red-600 text-red-900 rounded-r-xl flex items-center justify-between gap-3 text-xs shadow-xs"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" aria-hidden="true" />
            <span className="font-medium">{generalError}</span>
          </div>
          <button
            type="button"
            onClick={() => setGeneralError(null)}
            className="text-red-700 hover:text-red-900 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </aside>
      )}

      {successBanner && (
        <aside
          aria-label="Success Alert"
          className="p-4 bg-emerald-50 border-l-4 border-emerald-600 text-emerald-950 rounded-r-xl flex items-center justify-between gap-3 text-xs shadow-xs"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" aria-hidden="true" />
            <span className="font-medium">{successBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessBanner(null)}
            className="text-emerald-800 hover:text-emerald-950 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </aside>
      )}

      {/* Screen 1: Document Upload / Dropzone (if no active document loaded) */}
      {!currentDocument && (
        <div className="space-y-4">
          <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-xs">
            <div className="mb-4">
              <h3 className="text-sm font-bold text-slate-900">
                Prescription Ingestion for {patientName}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Upload a scanned prescription image (PNG, JPEG, WEBP) or PDF order document. Or run with synthetic test fixtures below.
              </p>
            </div>

            <OCRUploadDropzone
              onFileUpload={handleFileUpload}
              onSyntheticPresetSelect={handleSyntheticPresetSelect}
              isLoading={isProcessing}
            />
          </div>
        </div>
      )}

      {/* Screen 2: Side-by-Side Review Workspace (when document is active) */}
      {currentDocument && (
        <div className="space-y-4">
          {/* Document Metadata & Status Bar */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleClearSession}
                className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                title="Return to upload screen"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900 truncate max-w-sm">
                    {currentDocument.fileName}
                  </h3>
                  <span className="px-2 py-0.5 rounded text-2xs font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                    {currentDocument.fileType}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-2xs text-slate-500 mt-1">
                  <span>Pages: {currentDocument.pageCount}</span>
                  <span>•</span>
                  <span>Extracted: {new Date(currentDocument.extractedAt).toLocaleTimeString()}</span>
                  <span>•</span>
                  <span>OCR Engine: {currentDocument.engineName}</span>
                </div>
              </div>
            </div>

            {/* Metrics Chips */}
            <div className="flex items-center gap-2">
              <div
                className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 ${
                  currentDocument.overallConfidence >= 0.8
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : currentDocument.overallConfidence >= 0.6
                      ? 'bg-amber-50 border-amber-200 text-amber-800'
                      : 'bg-red-50 border-red-200 text-red-800'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>OCR Confidence: {Math.round(currentDocument.overallConfidence * 100)}%</span>
              </div>

              {totalCriticalAmbiguities > 0 && (
                <div className="px-3 py-1.5 rounded-xl border bg-purple-50 border-purple-200 text-purple-900 text-xs font-semibold flex items-center gap-1.5">
                  <AlertOctagon className="w-3.5 h-3.5 text-purple-600" />
                  <span>{totalCriticalAmbiguities} Critical Hazard(s)</span>
                </div>
              )}

              {totalWarningAmbiguities > 0 && (
                <div className="px-3 py-1.5 rounded-xl border bg-amber-50 border-amber-200 text-amber-900 text-xs font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  <span>{totalWarningAmbiguities} Warning(s)</span>
                </div>
              )}

              <div className="px-3 py-1.5 rounded-xl border bg-slate-50 border-slate-200 text-slate-700 text-xs font-semibold">
                <span>{candidateMedications.length} Candidates</span>
                {confirmedCount > 0 && (
                  <span className="ml-1 text-emerald-700 font-bold">({confirmedCount} Reconciled)</span>
                )}
              </div>
            </div>
          </div>

          {/* Duplicate Active Ingredient Warning Alert Bar */}
          {duplicateIngredientCandidates.length > 0 && (
            <div className="p-4 bg-red-50 border-l-4 border-red-600 text-red-950 rounded-r-xl flex items-start gap-3 text-xs shadow-xs">
              <AlertOctagon className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="font-bold">
                  Duplicate Active Ingredient Co-Prescription Alert ({activeMedications.length} active baseline orders):
                </strong>
                <p className="mt-0.5 text-red-900">
                  Extracted medication order contains active chemical ingredients identical to medicines already actively prescribed for this patient. Review candidates to avoid cumulative toxicity overdose (e.g. Acetaminophen toxicity).
                </p>
              </div>
            </div>
          )}

          {/* Critical Ambiguity / Safety Warning Alert Bar */}
          {totalCriticalAmbiguities > 0 && (
            <div className="p-4 bg-purple-50 border-l-4 border-purple-600 text-purple-950 rounded-r-xl flex items-start gap-3 text-xs shadow-xs">
              <AlertTriangle className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="font-bold">
                  Clinical Look-Alike / Sound-Alike (LASA) or Missing Dose Hazards Detected:
                </strong>
                <p className="mt-0.5 text-purple-900">
                  This document contains medication names with known high-risk look-alike/sound-alike pairs or incomplete dosage instructions. In accordance with clinical safety guidelines, these candidates require manual selection of the intended pharmaceutical entity before saving.
                </p>
              </div>
            </div>
          )}

          {/* Two-Column Side-by-Side Review Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Left Column: Source Document Viewer (5 cols) */}
            <div className="lg:col-span-5 space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-600 px-1">
                <span className="font-bold flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-clinical-600" />
                  Source Document &amp; Coordinate Alignment
                </span>
                <span className="text-2xs text-slate-400">
                  {selectedCandidate
                    ? `Highlighting line ${selectedCandidate.sourceLineIndex || '—'}`
                    : 'Select a candidate card to locate in scan'}
                </span>
              </div>

              <DocumentViewer
                document={currentDocument}
                selectedLineIndex={selectedCandidate?.sourceLineIndex}
                selectedPageNumber={selectedCandidate?.pageNumber || 1}
              />
            </div>

            {/* Right Column: Editable Candidate Medication List (7 cols) */}
            <div className="lg:col-span-7 space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-700 px-1">
                <span className="font-bold flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-clinical-600" />
                  Extracted Candidates ({candidateMedications.length})
                </span>
                <span className="text-2xs text-slate-500">
                  Click card to focus source line • Review &amp; Confirm
                </span>
              </div>

              {candidateMedications.length === 0 ? (
                <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-500 space-y-3">
                  <FileScan className="w-10 h-10 mx-auto text-slate-300" />
                  <p className="text-sm font-semibold text-slate-800">No Medication Candidates Extracted</p>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    The local OCR engine could not identify structured prescription orders from this scan. You may use manual entry to add the prescription directly.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowManualEntryModal(true)}
                    className="px-4 py-2 bg-clinical-600 hover:bg-clinical-700 text-white rounded-xl text-xs font-semibold transition-colors"
                  >
                    Enter Prescription Manually
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {candidateMedications.map((candidate) => (
                    <CandidateMedicationCard
                      key={candidate.id}
                      candidate={candidate}
                      isSelected={selectedCandidateId === candidate.id}
                      onSelect={() => setSelectedCandidateId(candidate.id)}
                      onConfirmReconcile={handleConfirmReconcile}
                      onDismiss={() => handleDismissCandidate(candidate.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Manual Entry Fallback Modal */}
      {showManualEntryModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl p-6 space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-clinical-100 text-clinical-600 rounded-lg">
                  <Plus className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Manual Prescription Entry (OCR Fallback)
                  </h3>
                  <p className="text-2xs text-slate-500">
                    Direct entry for unreadable scans, handwritten orders, or manual chart reconciliation.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowManualEntryModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Terminology Search Quick-Fill */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-2xs">
                <span className="font-bold text-slate-700 flex items-center gap-1">
                  <Search className="w-3.5 h-3.5 text-clinical-600" />
                  Fast RxNorm Terminology Lookup
                </span>
                <span className="text-slate-500">Auto-populates standard salt and dosage form</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Search drug (e.g. Metformin, Lisinopril, Percocet)..."
                  value={manualTermQuery}
                  onChange={(e) => setManualTermQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleSearchManualTerm())}
                  className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-clinical-500"
                />
                <button
                  type="button"
                  onClick={handleSearchManualTerm}
                  disabled={isSearchingTerm}
                  className="px-3 py-1.5 bg-clinical-600 text-white rounded-lg text-xs font-semibold hover:bg-clinical-700 disabled:opacity-50"
                >
                  {isSearchingTerm ? 'Searching...' : 'Lookup'}
                </button>
              </div>

              {manualTermResults.length > 0 && (
                <div className="border border-slate-200 rounded-lg bg-white divide-y divide-slate-100 max-h-40 overflow-y-auto">
                  {manualTermResults.map((match) => (
                    <button
                      key={match.conceptId}
                      type="button"
                      onClick={() => handleSelectManualTerm(match)}
                      className="w-full text-left p-2 hover:bg-clinical-50 text-xs flex items-center justify-between transition-colors"
                    >
                      <div>
                        <span className="font-bold text-slate-900">
                          {match.brandName || match.genericName}
                        </span>
                        <span className="text-slate-500 text-2xs ml-1.5">
                          ({match.genericName} • {match.saltForm})
                        </span>
                      </div>
                      <span className="text-2xs text-clinical-600 font-semibold">Select &rarr;</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Manual Form */}
            <form onSubmit={handleSaveManualMedication} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Brand Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={manualBrand}
                    onChange={(e) => setManualBrand(e.target.value)}
                    placeholder="e.g. Glucophage XR"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-clinical-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Generic Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={manualGeneric}
                    onChange={(e) => setManualGeneric(e.target.value)}
                    placeholder="e.g. Metformin"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-clinical-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Salt Form</label>
                  <input
                    type="text"
                    value={manualSalt}
                    onChange={(e) => setManualSalt(e.target.value)}
                    placeholder="e.g. Hydrochloride or Unknown"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-clinical-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Strength</label>
                  <input
                    type="text"
                    value={manualStrength}
                    onChange={(e) => setManualStrength(e.target.value)}
                    placeholder="e.g. 500 mg"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-clinical-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Dosage Form</label>
                  <input
                    type="text"
                    value={manualFormulation}
                    onChange={(e) => setManualFormulation(e.target.value)}
                    placeholder="e.g. Extended-Release Tablet"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-clinical-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Route</label>
                  <input
                    type="text"
                    value={manualRoute}
                    onChange={(e) => setManualRoute(e.target.value)}
                    placeholder="e.g. Oral"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-clinical-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Prescribed Dose <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={manualDose}
                    onChange={(e) => setManualDose(e.target.value)}
                    placeholder="e.g. 1 tablet (500mg)"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-clinical-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Frequency</label>
                  <input
                    type="text"
                    value={manualFreq}
                    onChange={(e) => setManualFreq(e.target.value)}
                    placeholder="e.g. Twice daily with meals"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-clinical-500"
                  />
                </div>
              </div>

              <div className="text-xs">
                <label className="block font-semibold text-slate-700 mb-1">
                  Sig / Administration Instructions
                </label>
                <textarea
                  rows={2}
                  value={manualSig}
                  onChange={(e) => setManualSig(e.target.value)}
                  placeholder="e.g. Take 1 tablet by mouth twice daily with morning and evening meals."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-clinical-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Prescriber</label>
                  <input
                    type="text"
                    value={manualPrescriber}
                    onChange={(e) => setManualPrescriber(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Order Status</label>
                  <select
                    value={manualStatus}
                    onChange={(e) => setManualStatus(e.target.value as MedicationStatus)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  >
                    <option value="active">active</option>
                    <option value="prn">prn</option>
                    <option value="on-hold">on-hold</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Verification Status
                  </label>
                  <select
                    value={manualVerification}
                    onChange={(e) =>
                      setManualVerification(e.target.value as VerificationStatus)
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-semibold text-clinical-700"
                  >
                    <option value="confirmed">confirmed (Pharmacist Verified)</option>
                    <option value="unverified">unverified (Pending Review)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowManualEntryModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-clinical-600 hover:bg-clinical-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Save Manual Medication Record</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
