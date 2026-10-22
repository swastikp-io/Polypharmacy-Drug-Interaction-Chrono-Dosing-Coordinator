import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Beaker,
  Pill,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import type {
  Patient,
  PatientComprehensiveProfile,
  VerificationStatus,
} from '../shared/types.js';
import { api } from './api/apiClient.js';
import { PatientDashboard } from './components/PatientDashboard.js';
import { PatientSelector } from './components/PatientSelector.js';
import { SafetyNotice } from './components/SafetyNotice.js';
import { SyntheticDataPanel } from './components/dev/SyntheticDataPanel.js';

export const App: React.FC = () => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [profile, setProfile] = useState<PatientComprehensiveProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDevPanelOpen, setIsDevPanelOpen] = useState(false);

  // Load patients on mount
  useEffect(() => {
    loadPatients();
  }, []);

  // Load patient profile when selectedPatientId changes
  useEffect(() => {
    if (selectedPatientId) {
      loadPatientProfile(selectedPatientId);
    }
  }, [selectedPatientId]);

  const loadPatients = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await api.getPatients();
      setPatients(data);
      if (data.length > 0 && !selectedPatientId) {
        setSelectedPatientId(data[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load patient records');
    } finally {
      setIsLoading(false);
    }
  };

  const loadPatientProfile = async (patientId: string) => {
    try {
      setIsRefreshing(true);
      const data = await api.getPatientComprehensive(patientId);
      setProfile(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load patient clinical profile');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Patient CRUD Handlers
  const handleAddPatient = async (data: any) => {
    const created = await api.createPatient(data);
    await loadPatients();
    setSelectedPatientId(created.id);
  };

  const handleUpdatePatient = async (id: string, data: any) => {
    await api.updatePatient(id, data);
    await loadPatients();
    await loadPatientProfile(id);
  };

  // Medication Handlers
  const handleAddMedication = async (data: any) => {
    await api.createMedication(data);
    if (selectedPatientId) await loadPatientProfile(selectedPatientId);
  };

  const handleUpdateMedication = async (id: string, data: any) => {
    await api.updateMedication(id, data);
    if (selectedPatientId) await loadPatientProfile(selectedPatientId);
  };

  const handleDeleteMedication = async (id: string) => {
    await api.deleteMedication(id);
    if (selectedPatientId) await loadPatientProfile(selectedPatientId);
  };

  const handleUpdateMedicationVerification = async (
    id: string,
    status: VerificationStatus
  ) => {
    await api.updateMedicationVerification(id, status, 'Clinical Pharmacist');
    if (selectedPatientId) await loadPatientProfile(selectedPatientId);
  };

  // Allergy Handlers
  const handleAddAllergy = async (data: any) => {
    await api.createAllergy(data);
    if (selectedPatientId) await loadPatientProfile(selectedPatientId);
  };

  const handleUpdateAllergy = async (id: string, data: any) => {
    await api.updateAllergy(id, data);
    if (selectedPatientId) await loadPatientProfile(selectedPatientId);
  };

  const handleDeleteAllergy = async (id: string) => {
    await api.deleteAllergy(id);
    if (selectedPatientId) await loadPatientProfile(selectedPatientId);
  };

  const handleUpdateAllergyVerification = async (
    id: string,
    status: VerificationStatus
  ) => {
    await api.updateAllergyVerification(id, status, 'Clinical Pharmacist');
    if (selectedPatientId) await loadPatientProfile(selectedPatientId);
  };

  // Diagnosis Handlers
  const handleAddDiagnosis = async (data: any) => {
    await api.createDiagnosis(data);
    if (selectedPatientId) await loadPatientProfile(selectedPatientId);
  };

  const handleUpdateDiagnosis = async (id: string, data: any) => {
    await api.updateDiagnosis(id, data);
    if (selectedPatientId) await loadPatientProfile(selectedPatientId);
  };

  const handleDeleteDiagnosis = async (id: string) => {
    await api.deleteDiagnosis(id);
    if (selectedPatientId) await loadPatientProfile(selectedPatientId);
  };

  const handleUpdateDiagnosisVerification = async (
    id: string,
    status: VerificationStatus
  ) => {
    await api.updateDiagnosisVerification(id, status, 'Clinical Pharmacist');
    if (selectedPatientId) await loadPatientProfile(selectedPatientId);
  };

  // Lab Measurement Handlers
  const handleAddLab = async (data: any) => {
    await api.createLab(data);
    if (selectedPatientId) await loadPatientProfile(selectedPatientId);
  };

  const handleUpdateLab = async (id: string, data: any) => {
    await api.updateLab(id, data);
    if (selectedPatientId) await loadPatientProfile(selectedPatientId);
  };

  const handleDeleteLab = async (id: string) => {
    await api.deleteLab(id);
    if (selectedPatientId) await loadPatientProfile(selectedPatientId);
  };

  const handleUpdateLabVerification = async (
    id: string,
    status: VerificationStatus
  ) => {
    await api.updateLabVerification(id, status, 'Clinical Pharmacist');
    if (selectedPatientId) await loadPatientProfile(selectedPatientId);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* 1. Mandatory Safety Banner */}
      <SafetyNotice />

      {/* 2. Top App Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 py-3 sm:px-6 lg:px-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="p-2 bg-clinical-600 text-white rounded-lg shadow-xs">
              <Pill className="w-5 h-5" aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                Polypharmacy Drug-Interaction &amp; Chrono-Dosing Coordinator
              </h1>
              <p className="text-2xs sm:text-xs text-slate-500 font-medium">
                Phase 1: Local-First Geriatric Medication Reconciliation &amp; CDS Prototype
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsDevPanelOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 text-2xs font-bold tracking-tight shadow-2xs transition-colors"
              title="Open Synthetic Dataset & Clinical Test Lab"
            >
              <Beaker className="w-3.5 h-3.5 text-indigo-600" aria-hidden="true" />
              <span>Synthetic Test Lab</span>
            </button>
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-2xs font-bold uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              SQLite Local-First
            </span>

            {selectedPatientId && (
              <button
                type="button"
                onClick={() => loadPatientProfile(selectedPatientId)}
                disabled={isRefreshing}
                aria-label="Refresh patient data"
                title="Refresh clinical profile"
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <RefreshCw
                  className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-clinical-600' : ''}`}
                  aria-hidden="true"
                />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 3. Main Dashboard Body */}
      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8 flex-1 w-full space-y-6">
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-900 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <h3 className="font-bold">System Communication Error</h3>
              <p>{error}</p>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="py-24 text-center space-y-3">
            <RefreshCw className="w-8 h-8 mx-auto text-clinical-600 animate-spin" aria-hidden="true" />
            <p className="text-sm font-semibold text-slate-600">Initializing Local Clinical Database...</p>
          </div>
        ) : (
          <>
            {/* Patient Selector Strip */}
            <PatientSelector
              patients={patients}
              selectedPatient={profile ? profile.patient : null}
              onSelectPatient={(id) => setSelectedPatientId(id)}
              onAddPatient={handleAddPatient}
              onUpdatePatient={handleUpdatePatient}
            />

            {/* Comprehensive Dashboard */}
            {profile && (
              <PatientDashboard
                patient={profile.patient}
                medications={profile.medications}
                allergies={profile.allergies}
                diagnoses={profile.diagnoses}
                labMeasurements={profile.labMeasurements}
                auditLogs={profile.auditLogs}
                duplicateIngredients={profile.duplicateIngredients}
                onAddMedication={handleAddMedication}
                onUpdateMedication={handleUpdateMedication}
                onDeleteMedication={handleDeleteMedication}
                onUpdateMedicationVerification={handleUpdateMedicationVerification}
                onAddAllergy={handleAddAllergy}
                onUpdateAllergy={handleUpdateAllergy}
                onDeleteAllergy={handleDeleteAllergy}
                onUpdateAllergyVerification={handleUpdateAllergyVerification}
                onAddDiagnosis={handleAddDiagnosis}
                onUpdateDiagnosis={handleUpdateDiagnosis}
                onDeleteDiagnosis={handleDeleteDiagnosis}
                onUpdateDiagnosisVerification={handleUpdateDiagnosisVerification}
                onAddLab={handleAddLab}
                onUpdateLab={handleUpdateLab}
                onDeleteLab={handleDeleteLab}
                onUpdateLabVerification={handleUpdateLabVerification}
              />
            )}
          </>
        )}
      </main>

      <SyntheticDataPanel
        isOpen={isDevPanelOpen}
        onClose={() => setIsDevPanelOpen(false)}
        patients={patients}
        selectedPatientId={selectedPatientId}
        onSelectPatient={(id) => {
          setSelectedPatientId(id);
          setIsDevPanelOpen(false);
        }}
        onDataChanged={async () => {
          await loadPatients();
          if (selectedPatientId) {
            await loadPatientProfile(selectedPatientId);
          }
        }}
      />
      {/* 4. Footer */}
      <footer className="bg-white border-t border-slate-200 mt-12 py-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-500" aria-hidden="true" />
            <span>
              Synthetic Data Prototype • Phase 1 Architecture • Not for direct clinical diagnosis or prescription alteration.
            </span>
          </div>
          <div>
            <span>Local SQLite Persistence &amp; Zod Schema Validation Active</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
