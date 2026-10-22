import React, { useState } from 'react';
import {
  Clock,
  Edit2,
  FileText,
  Filter,
  Pill,
  Plus,
  Search,
  Trash2,
  User,
} from 'lucide-react';
import type { Medication, VerificationStatus } from '../../shared/types.js';
import { MedicationModal } from './MedicationModal.js';
import { VerificationBadge } from './VerificationBadge.js';

interface MedicationListProps {
  medications: Medication[];
  patientId: string;
  onAddMedication: (data: any) => Promise<void>;
  onUpdateMedication: (id: string, data: any) => Promise<void>;
  onDeleteMedication: (id: string) => Promise<void>;
  onUpdateVerification: (id: string, status: VerificationStatus) => Promise<void>;
}

export const MedicationList: React.FC<MedicationListProps> = ({
  medications,
  patientId,
  onAddMedication,
  onUpdateMedication,
  onDeleteMedication,
  onUpdateVerification,
}) => {
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMed, setEditingMed] = useState<Medication | null>(null);

  const filteredMeds = medications.filter((m) => {
    const matchesStatus =
      filterStatus === 'all'
        ? true
        : filterStatus === 'active_or_prn'
          ? m.status === 'active' || m.status === 'prn'
          : m.status === filterStatus;

    const query = searchQuery.toLowerCase().trim();
    if (!query) return matchesStatus;

    const matchesSearch =
      m.brand.toLowerCase().includes(query) ||
      m.genericName.toLowerCase().includes(query) ||
      (m.activeIngredients || []).some((ing) => ing.name.toLowerCase().includes(query)) ||
      m.prescriber.toLowerCase().includes(query);

    return matchesStatus && matchesSearch;
  });

  const handleOpenAdd = () => {
    setEditingMed(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (med: Medication) => {
    setEditingMed(med);
    setIsModalOpen(true);
  };

  const handleSave = async (data: any) => {
    if (editingMed) {
      await onUpdateMedication(editingMed.id, data);
    } else {
      await onAddMedication(data);
    }
  };

  return (
    <div className="space-y-4">
      {/* Action Header & Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" aria-hidden="true" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by brand, generic, active ingredient..."
              aria-label="Filter medications by search keyword"
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-clinical-500 focus:border-clinical-500"
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <Filter className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              aria-label="Filter medications by status"
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-clinical-500"
            >
              <option value="all">All Orders ({medications.length})</option>
              <option value="active_or_prn">Active &amp; PRN</option>
              <option value="active">Active Only</option>
              <option value="prn">PRN Only</option>
              <option value="held">Held</option>
              <option value="discontinued">Discontinued</option>
            </select>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenAdd}
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-clinical-600 rounded-lg hover:bg-clinical-700 transition-colors shadow-xs focus:outline-none focus:ring-2 focus:ring-clinical-500"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          <span>Add Prescription / OTC</span>
        </button>
      </div>

      {/* Medication Cards List */}
      {filteredMeds.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
          <Pill className="w-8 h-8 mx-auto text-slate-300 mb-2" aria-hidden="true" />
          <p className="text-sm font-semibold">No medications found matching current filters.</p>
          <p className="text-xs text-slate-400 mt-1">Adjust search parameters or add a new medication order.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5">
          {filteredMeds.map((med) => {
            const isDiscontinued = med.status === 'discontinued';
            return (
              <article
                key={med.id}
                className={`bg-white rounded-xl border transition-all p-4 shadow-xs ${
                  isDiscontinued
                    ? 'border-slate-200 opacity-60 bg-slate-50/50'
                    : 'border-slate-200 hover:border-clinical-300'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                  {/* Left Column: Brand, Generic, Ingredients, Details */}
                  <div className="flex-1 space-y-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-base font-bold text-slate-900">{med.brand}</h4>
                      <span className="text-xs text-slate-600 font-medium">({med.genericName})</span>
                      <span
                        className={`px-2 py-0.5 rounded text-2xs font-bold uppercase tracking-wider ${
                          med.status === 'active'
                            ? 'bg-emerald-100 text-emerald-800'
                            : med.status === 'prn'
                              ? 'bg-blue-100 text-blue-800'
                              : med.status === 'held'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {med.status}
                      </span>
                      <VerificationBadge
                        status={med.verificationStatus}
                        size="sm"
                        interactive
                        onStatusChange={(nextStatus) => onUpdateVerification(med.id, nextStatus)}
                      />
                    </div>

                    {/* Active Ingredients Tags */}
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="text-2xs font-bold uppercase text-slate-400 tracking-wider">
                        Active Ingredients:
                      </span>
                      {(med.activeIngredients || []).map((ing, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 bg-clinical-50 text-clinical-900 border border-clinical-200 rounded font-medium text-xs"
                        >
                          {ing.name} {ing.strength ? `(${ing.strength})` : ''}
                        </span>
                      ))}
                    </div>

                    {/* Detailed Clinical Properties Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-slate-50/80 p-2.5 rounded-lg border border-slate-100">
                      <div>
                        <span className="text-2xs text-slate-400 uppercase font-semibold block">Salt Form</span>
                        <span className="font-medium text-slate-800">{med.salt || 'None / Unknown'}</span>
                      </div>
                      <div>
                        <span className="text-2xs text-slate-400 uppercase font-semibold block">Strength</span>
                        <span className="font-medium text-slate-800">{med.strength}</span>
                      </div>
                      <div>
                        <span className="text-2xs text-slate-400 uppercase font-semibold block">Form &amp; Route</span>
                        <span className="font-medium text-slate-800">
                          {med.formulation} • {med.route}
                        </span>
                      </div>
                      <div>
                        <span className="text-2xs text-slate-400 uppercase font-semibold block">Prescribed Dose</span>
                        <span className="font-bold text-clinical-800">{med.prescribedDose}</span>
                      </div>
                    </div>

                    {/* Administration Instructions */}
                    <div className="flex items-start gap-2 text-xs text-slate-700">
                      <Clock className="w-3.5 h-3.5 text-clinical-600 mt-0.5 flex-shrink-0" aria-hidden="true" />
                      <div>
                        <span className="font-semibold text-slate-900">{med.frequency}: </span>
                        <span>{med.administrationInstructions}</span>
                      </div>
                    </div>

                    {/* Source & Prescriber metadata */}
                    <div className="flex flex-wrap items-center gap-4 text-2xs text-slate-500 pt-1 border-t border-slate-100">
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3 text-slate-400" aria-hidden="true" />
                        <span>Prescriber: <strong>{med.prescriber || 'Unknown'}</strong></span>
                      </span>
                      <span className="flex items-center gap-1">
                        <FileText className="w-3 h-3 text-slate-400" aria-hidden="true" />
                        <span>Source: <strong>{med.source || 'Unknown'}</strong></span>
                      </span>
                      {med.startDate && (
                        <span>Started: <strong>{med.startDate}</strong></span>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Actions */}
                  <div className="flex lg:flex-col items-center justify-end gap-1.5 flex-shrink-0 border-t lg:border-t-0 pt-2 lg:pt-0">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(med)}
                      aria-label={`Edit ${med.brand}`}
                      className="p-1.5 text-slate-500 hover:text-clinical-700 hover:bg-clinical-50 rounded-lg transition-colors"
                      title="Edit order"
                    >
                      <Edit2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Remove ${med.brand} from patient profile?`)) {
                          onDeleteMedication(med.id);
                        }
                      }}
                      aria-label={`Delete ${med.brand}`}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete order"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Medication Create/Edit Modal */}
      <MedicationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        patientId={patientId}
        initialData={editingMed}
      />
    </div>
  );
};
