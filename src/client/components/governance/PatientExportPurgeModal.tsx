import React, { useState } from 'react';
import { ArrowDownToLine, Trash2, X, AlertTriangle, Check, ShieldAlert } from 'lucide-react';
import { api } from '../../api/apiClient.js';

interface PatientExportPurgeModalProps {
  isOpen: boolean;
  patientId: string;
  patientName: string;
  mrn: string;
  onClose: () => void;
  onPatientPurged: () => void;
}

export const PatientExportPurgeModal: React.FC<PatientExportPurgeModalProps> = ({
  isOpen,
  patientId,
  patientName,
  mrn,
  onClose,
  onPatientPurged,
}) => {
  const [activeAction, setActiveAction] = useState<'export' | 'purge'>('export');
  const [confirmationToken, setConfirmationToken] = useState('');
  const [purgeReason, setPurgeReason] = useState('Patient requested complete medical record de-identification.');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const expectedToken = `PURGE_${patientId}`;

  const handleExport = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.exportPatientDossier(patientId);
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `patient-dossier-${mrn}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setMessage(`Successfully exported patient dossier for ${patientName}.`);
    } catch (err: any) {
      setError(err.message || 'Failed to export patient dossier');
    } finally {
      setLoading(false);
    }
  };

  const handlePurge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmationToken !== expectedToken) {
      setError(`Confirmation token must match "${expectedToken}" exactly.`);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await api.purgePatientData(patientId, confirmationToken, purgeReason);
      onPatientPurged();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to purge patient data');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="governance-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <header className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-lg ${activeAction === 'export' ? 'bg-clinical-100 text-clinical-700' : 'bg-red-100 text-red-700'}`}>
              {activeAction === 'export' ? (
                <ArrowDownToLine className="w-5 h-5" aria-hidden="true" />
              ) : (
                <Trash2 className="w-5 h-5" aria-hidden="true" />
              )}
            </div>
            <div>
              <h2 id="governance-modal-title" className="text-base font-bold text-slate-900">
                Patient Data Governance &amp; Portability
              </h2>
              <p className="text-xs text-slate-500">
                Manage data for {patientName} ({mrn})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </header>

        <div className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs text-red-800">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-600" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {message && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-xs text-emerald-800">
              <Check className="w-4 h-4 flex-shrink-0 text-emerald-600" aria-hidden="true" />
              <span>{message}</span>
            </div>
          )}

          {/* Action Selector */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveAction('export')}
              className={`py-2 rounded-md transition-all flex items-center justify-center gap-1.5 ${
                activeAction === 'export'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ArrowDownToLine className="w-4 h-4" aria-hidden="true" />
              <span>Export Dossier (JSON)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveAction('purge')}
              className={`py-2 rounded-md transition-all flex items-center justify-center gap-1.5 ${
                activeAction === 'purge'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'text-red-700 hover:bg-red-50'
              }`}
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
              <span>Purge Patient Data</span>
            </button>
          </div>

          {/* Action View: Export */}
          {activeAction === 'export' && (
            <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
              <p>
                Exporting creates a cryptographically signed, complete JSON bundle containing:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-2xs text-slate-700">
                <li>Patient demographics, primary physician, and care setting</li>
                <li>Full 12-field medication list with active ingredients and verification statuses</li>
                <li>Documented drug allergies and chronic problem list</li>
                <li>Renal and hepatic lab measurements with collection dates</li>
                <li>Complete immutable audit trail ledger with timestamps and actors</li>
              </ul>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={loading}
                  className="w-full py-2.5 px-4 bg-clinical-600 hover:bg-clinical-700 text-white rounded-lg font-semibold flex items-center justify-center gap-2 shadow-xs transition-colors disabled:opacity-50"
                >
                  <ArrowDownToLine className="w-4 h-4" aria-hidden="true" />
                  <span>{loading ? 'Exporting...' : 'Download Complete Patient Dossier'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Action View: Purge */}
          {activeAction === 'purge' && (
            <form onSubmit={handlePurge} className="space-y-3 text-xs">
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2.5 text-xs text-red-950">
                <ShieldAlert className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <div className="leading-relaxed">
                  <strong>Permanent Data Deletion:</strong> This action will irrevocably cascade-delete all
                  prescriptions, allergy records, lab panels, and circadian schedules for {patientName}.
                </div>
              </div>

              <div>
                <label htmlFor="purge-reason" className="block text-xs font-semibold text-slate-700 mb-1">
                  Clinical / Administrative Reason for Deletion
                </label>
                <textarea
                  id="purge-reason"
                  rows={2}
                  value={purgeReason}
                  onChange={(e) => setPurgeReason(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                />
              </div>

              <div>
                <label htmlFor="confirm-token" className="block text-xs font-semibold text-slate-700 mb-1">
                  Type <code className="bg-slate-100 text-red-700 px-1 py-0.5 rounded font-mono font-bold">{expectedToken}</code> to confirm:
                </label>
                <input
                  id="confirm-token"
                  type="text"
                  value={confirmationToken}
                  onChange={(e) => setConfirmationToken(e.target.value)}
                  placeholder={expectedToken}
                  required
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading || confirmationToken !== expectedToken}
                  className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold flex items-center justify-center gap-2 shadow-xs transition-colors disabled:opacity-40"
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                  <span>{loading ? 'Purging Records...' : 'Permanently Delete Patient Records'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
