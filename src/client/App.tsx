import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Beaker,
  Database,
  Pill,
  RefreshCw,
  ShieldAlert,
  User,
} from 'lucide-react';
import type {
  Patient,
  PatientComprehensiveProfile,
  VerificationStatus,
} from '../shared/types.js';
import { api } from './api/apiClient.js';
import { PatientDashboard } from './components/PatientDashboard.js';
import { PatientSelector } from './components/PatientSelector.js';
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
    <div className="min-h-screen flex flex-col bg-[#F4F2F0] text-[#171717]">
      {/* Top Application Header */}
      <header className="bg-white border-b border-[#E6E3E1] sticky top-0 z-40 shadow-editorial">
        <div className="max-w-7xl mx-auto px-4 py-2.5 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          {/* Logo & Application Mark */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-sm bg-[#1747E8] text-white flex items-center justify-center font-bold text-sm tracking-tighter shadow-editorial flex-shrink-0">
              <Pill className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-bold text-[#171717] tracking-tight font-sans">
                  Polypharmacy Coordinator
                </h1>
                <span className="hidden md:inline-block px-1.5 py-0.2 rounded-sm text-[10px] font-bold uppercase tracking-wider bg-[#F0F3FF] text-[#1747E8] border border-[#D7DEFF]">
                  CDS Prototype
                </span>
              </div>
              <p className="text-[11px] text-[#777777] font-medium leading-none mt-0.5">
                Geriatric Drug Interactions &amp; Chrono-Dosing
              </p>
            </div>
          </div>

          {/* Context, Synthetic Badge, and Diagnostics */}
          <div className="flex items-center gap-2.5">
            {profile && (
              <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-sm bg-[#FAF9F8] border border-[#E6E3E1] text-xs text-[#525252]">
                <User className="w-3.5 h-3.5 text-[#777777]" />
                <span className="font-semibold text-[#171717]">{profile.patient.name}</span>
                <span className="text-[#777777] font-mono text-[11px]">({profile.patient.mrn})</span>
              </div>
            )}

            {/* Persistent Synthetic / Test Data Badge */}
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wider bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#D97706]" />
              <span>Synthetic Data</span>
            </span>

            {/* Diagnostic / Lab Entry Point */}
            <button
              type="button"
              onClick={() => setIsDevPanelOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm bg-[#FAF9F8] text-[#171717] hover:bg-[#F0F3FF] hover:text-[#1747E8] border border-[#E6E3E1] text-[11px] font-semibold transition-colors"
              title="Open Synthetic Dataset &amp; Clinical Test Lab"
            >
              <Beaker className="w-3.5 h-3.5 text-[#1747E8]" aria-hidden="true" />
              <span className="hidden sm:inline">Test Lab</span>
            </button>

            <span className="hidden xl:inline-flex items-center gap-1 px-2 py-1 rounded-sm text-[10px] font-mono text-[#525252] bg-[#FAF9F8] border border-[#E6E3E1]">
              <Database className="w-3 h-3 text-[#059669]" />
              <span>SQLite</span>
            </span>

            {selectedPatientId && (
              <button
                type="button"
                onClick={() => loadPatientProfile(selectedPatientId)}
                disabled={isRefreshing}
                aria-label="Refresh patient clinical profile"
                title="Refresh clinical profile"
                className="p-1.5 text-[#777777] hover:text-[#171717] hover:bg-[#FAF9F8] rounded-sm transition-colors border border-[#E6E3E1]"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[#1747E8]' : ''}`}
                  aria-hidden="true"
                />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 3. Main Dashboard Body */}
      <main className="max-w-7xl mx-auto px-4 py-5 sm:px-6 lg:px-8 flex-1 w-full space-y-5">
        {error && (
          <div className="p-3.5 bg-[#FEE2E2] border border-[#FECACA] rounded-sm text-xs text-[#991B1B] flex items-start gap-2.5 shadow-editorial">
            <AlertCircle className="w-4 h-4 text-[#DC2626] flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <h3 className="font-bold text-sm">System Communication Error</h3>
              <p className="mt-0.5 text-xs text-[#991B1B]">{error}</p>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="py-24 text-center space-y-3 bg-white border border-[#E6E3E1] rounded-sm shadow-editorial">
            <RefreshCw className="w-8 h-8 mx-auto text-[#1747E8] animate-spin" aria-hidden="true" />
            <p className="text-sm font-semibold text-[#171717]">Initializing Local Clinical Database...</p>
            <p className="text-xs text-[#777777]">Hydrating synthetic patient records and deterministic engines</p>
          </div>
        ) : (
          <>
            {/* Patient Context & Switcher Strip */}
            <PatientSelector
              patients={patients}
              selectedPatient={profile ? profile.patient : null}
              onSelectPatient={(id) => setSelectedPatientId(id)}
              onAddPatient={handleAddPatient}
              onUpdatePatient={handleUpdatePatient}
            />

            {/* Comprehensive Dashboard with 4-Pillar Navigation */}
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
                onMedicationReconciled={async () => {
                  if (selectedPatientId) await loadPatientProfile(selectedPatientId);
                }}
              />
            )}
          </>
        )}
      </main>

      {/* Dev / Synthetic Data Modal */}
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

      {/* 4. Swiss Editorial Footer */}
      <footer className="bg-white border-t border-[#E6E3E1] mt-12 py-5 text-xs text-[#777777]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-[#B45309]" aria-hidden="true" />
            <span className="text-[11px] text-[#525252]">
              Synthetic Data Prototype &bull; Not for direct clinical diagnosis or prescription alteration without licensed clinician oversight.
            </span>
          </div>
          <div className="text-[11px] text-[#777777] font-mono">
            <span>Local SQLite Storage Active</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
