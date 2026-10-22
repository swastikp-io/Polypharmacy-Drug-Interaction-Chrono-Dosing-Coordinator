import React, { useState } from 'react';
import {
  calculateAge,
  calculateCockcroftGaultCrCl,
  classifyEGFR,
} from '../../shared/calculations.js';
import type { LabMeasurement, Patient, VerificationStatus } from '../../shared/types.js';
import { LabMeasurementModal } from './LabMeasurementModal.js';
import { VerificationBadge } from './VerificationBadge.js';
import { Edit2, FlaskConical, Plus, Trash2 } from 'lucide-react';

interface LabMeasurementListProps {
  labs: LabMeasurement[];
  patient: Patient;
  onAddLab: (data: any) => Promise<void>;
  onUpdateLab: (id: string, data: any) => Promise<void>;
  onDeleteLab: (id: string) => Promise<void>;
  onUpdateVerification: (id: string, status: VerificationStatus) => Promise<void>;
}

export const LabMeasurementList: React.FC<LabMeasurementListProps> = ({
  labs,
  patient,
  onAddLab,
  onUpdateLab,
  onDeleteLab,
  onUpdateVerification,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLab, setEditingLab] = useState<LabMeasurement | null>(null);

  const handleOpenAdd = () => {
    setEditingLab(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (lab: LabMeasurement) => {
    setEditingLab(lab);
    setIsModalOpen(true);
  };

  const handleSave = async (data: any) => {
    if (editingLab) {
      await onUpdateLab(editingLab.id, data);
    } else {
      await onAddLab(data);
    }
  };

  // Derive latest renal markers for clinical summary preview
  const egfrLab = labs
    .filter((l) => l.category === 'renal' && l.testName.toLowerCase().includes('egfr'))
    .sort((a, b) => new Date(b.collectionDate).getTime() - new Date(a.collectionDate).getTime())[0];

  const crLab = labs
    .filter((l) => l.category === 'renal' && l.testName.toLowerCase().includes('creatinine'))
    .sort((a, b) => new Date(b.collectionDate).getTime() - new Date(a.collectionDate).getTime())[0];

  const patientAge = calculateAge(patient.dateOfBirth);
  const estimatedCrCl = calculateCockcroftGaultCrCl({
    age: patientAge,
    weightKg: patient.weightKg,
    serumCreatinineMgDl: crLab ? crLab.value : null,
    gender: patient.gender,
  });

  const renalStage = classifyEGFR(egfrLab ? egfrLab.value : null);

  const renalLabs = labs.filter((l) => l.category === 'renal');
  const hepaticLabs = labs.filter((l) => l.category === 'hepatic');
  const otherLabs = labs.filter((l) => l.category === 'other');

  const renderLabTable = (items: LabMeasurement[], title: string) => (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
        <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">{title}</h4>
      </div>
      {items.length === 0 ? (
        <div className="p-4 text-xs text-slate-500 italic">No {title.toLowerCase()} measurements recorded.</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {items.map((lab) => (
            <div
              key={lab.id}
              className="p-3.5 hover:bg-slate-50/60 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 text-sm">{lab.testName}</span>
                  <span
                    className={`px-2 py-0.5 rounded text-2xs font-bold uppercase tracking-wider ${
                      lab.interpretation === 'high' || lab.interpretation === 'low'
                        ? 'bg-amber-100 text-amber-900'
                        : lab.interpretation === 'critical'
                          ? 'bg-red-100 text-red-900'
                          : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {lab.interpretation}
                  </span>
                  <VerificationBadge
                    status={lab.verificationStatus}
                    size="sm"
                    interactive
                    onStatusChange={(nextStatus) => onUpdateVerification(lab.id, nextStatus)}
                  />
                </div>
                <div className="text-slate-600 flex flex-wrap items-center gap-3">
                  <span>
                    Result: <strong className="text-clinical-950 font-mono text-sm">{lab.value}</strong>{' '}
                    <span className="font-medium text-slate-500">{lab.unit}</span>
                  </span>
                  <span>• Reference: <span className="font-mono">{lab.referenceRange}</span></span>
                  <span>• Date: {lab.collectionDate}</span>
                </div>
                {lab.notes && <div className="text-2xs text-slate-500 italic">&quot;{lab.notes}&quot;</div>}
                <div className="text-2xs text-slate-400">Source: {lab.source}</div>
              </div>

              <div className="flex items-center gap-1.5 self-end sm:self-center">
                <button
                  type="button"
                  onClick={() => handleOpenEdit(lab)}
                  aria-label={`Edit ${lab.testName}`}
                  className="p-1 text-slate-400 hover:text-clinical-700 rounded"
                >
                  <Edit2 className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Delete lab measurement for ${lab.testName}?`)) {
                      onDeleteLab(lab.id);
                    }
                  }}
                  aria-label={`Delete ${lab.testName}`}
                  className="p-1 text-slate-400 hover:text-red-600 rounded"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Action Header */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Renal &amp; Hepatic Laboratory Panel</h3>
          <p className="text-xs text-slate-500">
            Biomarkers governing pharmacokinetic elimination, clearance estimates, and Beers dosing limits.
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenAdd}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-clinical-600 rounded-lg hover:bg-clinical-700 shadow-xs flex-shrink-0"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          <span>Add Lab Result</span>
        </button>
      </div>

      {/* Clinical Clearance Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Renal Function Card */}
        <div className="bg-clinical-50/60 border border-clinical-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-clinical-900 uppercase tracking-wider flex items-center gap-1.5">
              <FlaskConical className="w-4 h-4 text-clinical-600" aria-hidden="true" />
              Renal Clearance Assessment
            </span>
            <span className="px-2 py-0.5 rounded text-xs font-bold bg-clinical-200 text-clinical-900">
              {renalStage.stage}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs pt-1">
            <div className="bg-white p-2 rounded border border-clinical-100">
              <span className="text-2xs text-slate-500 uppercase block font-semibold">Latest eGFR</span>
              <span className="text-sm font-bold text-slate-900">
                {egfrLab ? `${egfrLab.value} ${egfrLab.unit}` : 'Unknown'}
              </span>
            </div>
            <div className="bg-white p-2 rounded border border-clinical-100">
              <span className="text-2xs text-slate-500 uppercase block font-semibold">Estimated CrCl (Cockcroft-Gault)</span>
              <span className="text-sm font-bold text-slate-900">
                {estimatedCrCl !== null ? `${estimatedCrCl} mL/min` : 'Unknown'}
              </span>
            </div>
          </div>

          <p className="text-xs text-clinical-800 leading-relaxed font-medium">
            {renalStage.clinicalInterpretation}
          </p>
        </div>

        {/* Hepatic Function Card */}
        <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
              <FlaskConical className="w-4 h-4 text-amber-600" aria-hidden="true" />
              Hepatic Function Panel
            </span>
            <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-200 text-amber-900">
              {hepaticLabs.some((l) => l.interpretation === 'high') ? 'Elevated Transaminases' : 'Stable'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs pt-1">
            <div className="bg-white p-2 rounded border border-amber-100">
              <span className="text-2xs text-slate-500 uppercase block font-semibold">ALT</span>
              <span className="text-sm font-bold text-slate-900">
                {labs.find((l) => l.testName.toLowerCase().includes('alt'))?.value ?? 'Unknown'}{' '}
                <span className="text-2xs text-slate-500">U/L</span>
              </span>
            </div>
            <div className="bg-white p-2 rounded border border-amber-100">
              <span className="text-2xs text-slate-500 uppercase block font-semibold">AST</span>
              <span className="text-sm font-bold text-slate-900">
                {labs.find((l) => l.testName.toLowerCase().includes('ast'))?.value ?? 'Unknown'}{' '}
                <span className="text-2xs text-slate-500">U/L</span>
              </span>
            </div>
            <div className="bg-white p-2 rounded border border-amber-100">
              <span className="text-2xs text-slate-500 uppercase block font-semibold">Bilirubin</span>
              <span className="text-sm font-bold text-slate-900">
                {labs.find((l) => l.testName.toLowerCase().includes('bilirubin'))?.value ?? 'Unknown'}{' '}
                <span className="text-2xs text-slate-500">mg/dL</span>
              </span>
            </div>
          </div>

          <p className="text-xs text-amber-800 leading-relaxed font-medium">
            {hepaticLabs.some((l) => l.interpretation === 'high')
              ? 'Hepatic transaminases exceed reference range. Cumulative acetaminophen and CYP metabolism require careful monitoring.'
              : 'Hepatic parameters are within expected limits. Monitor if prescribing hepatotoxic agents.'}
          </p>
        </div>
      </div>

      {/* Detailed Tables */}
      <div className="space-y-4">
        {renderLabTable(renalLabs, 'Renal Function Measurements')}
        {renderLabTable(hepaticLabs, 'Hepatic Function Measurements')}
        {otherLabs.length > 0 && renderLabTable(otherLabs, 'Other Diagnostic Labs')}
      </div>

      <LabMeasurementModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        patientId={patient.id}
        initialData={editingLab}
      />
    </div>
  );
};
