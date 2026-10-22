import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Clock,
  Edit2,
  Filter,
  Pill,
  Plus,
  Search,
  Trash2,
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
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    const next = new Set(expandedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setExpandedIds(next);
  };

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
      {/* 1. Swiss Editorial Toolbar */}
      <div className="bg-white border border-[#E6E3E1] rounded-sm p-3.5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-editorial">
        <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#777777]" aria-hidden="true" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by brand, generic, active ingredient..."
              aria-label="Filter medications by search keyword"
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#FAF9F8] rounded-sm border border-[#E6E3E1] text-[#171717] placeholder:text-[#777777] focus:bg-white focus:border-[#1747E8] focus:ring-1 focus:ring-[#1747E8] transition-colors"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-[#777777] flex-shrink-0" aria-hidden="true" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              aria-label="Filter medications by status"
              className="px-2.5 py-1.5 text-xs bg-[#FAF9F8] rounded-sm border border-[#E6E3E1] text-[#171717] font-medium focus:bg-white focus:border-[#1747E8] focus:ring-1 focus:ring-[#1747E8] transition-colors"
            >
              <option value="all">All Statuses ({medications.length})</option>
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
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#1747E8] hover:bg-[#1238C7] rounded-sm transition-colors shadow-editorial focus:outline-none focus:ring-2 focus:ring-[#1747E8]"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          <span>Add Prescription / OTC</span>
        </button>
      </div>

      {/* 2. Medication Rows with Subtle Dividers */}
      {filteredMeds.length === 0 ? (
        <div className="bg-white border border-[#E6E3E1] rounded-sm p-12 text-center pattern-dots-subtle shadow-editorial">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-sm bg-[#F4F2F0] text-[#777777] mb-3 border border-[#E6E3E1]">
            <Pill className="w-6 h-6" aria-hidden="true" />
          </div>
          <h4 className="text-sm font-bold text-[#171717]">No medications match filters</h4>
          <p className="text-xs text-[#777777] mt-1 max-w-sm mx-auto">
            Adjust search criteria or use the &ldquo;Add Prescription&rdquo; action above to add an order.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-[#E6E3E1] rounded-sm divide-y divide-[#E6E3E1] shadow-editorial overflow-hidden">
          {/* Table Header Row (Desktop) */}
          <div className="hidden lg:grid grid-cols-12 gap-3 px-4 py-2 bg-[#FAF9F8] border-b border-[#E6E3E1] text-[11px] font-bold uppercase tracking-wider text-[#777777]">
            <div className="col-span-4">Medication &amp; Generic Name</div>
            <div className="col-span-2">Strength / Form</div>
            <div className="col-span-3">Prescribed Regimen</div>
            <div className="col-span-2 text-center">Status &amp; Verification</div>
            <div className="col-span-1 text-right">Actions</div>
          </div>

          {filteredMeds.map((med) => {
            const isExpanded = expandedIds.has(med.id);
            const isDiscontinued = med.status === 'discontinued';
            const isHeld = med.status === 'held';

            return (
              <article
                key={med.id}
                className={`p-4 transition-colors hover:bg-[#FAF9F8]/70 ${
                  isDiscontinued ? 'opacity-65 bg-[#FAF9F8]/40' : ''
                }`}
              >
                {/* Main Row Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
                  {/* Col 1: Brand & Generic */}
                  <div className="lg:col-span-4 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-bold text-[#171717] tracking-tight">
                        {med.brand}
                      </h4>
                      {med.status !== 'active' && (
                        <span
                          className={`px-1.5 py-0.2 rounded-sm text-[10px] font-bold uppercase tracking-wider ${
                            isHeld
                              ? 'bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]'
                              : isDiscontinued
                                ? 'bg-[#F4F2F0] text-[#777777] border border-[#E6E3E1]'
                                : 'bg-[#D7DEFF] text-[#1747E8] border border-[#C0CEFF]'
                          }`}
                        >
                          {med.status}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#777777] font-medium">
                      {med.genericName}
                    </p>
                  </div>

                  {/* Col 2: Strength & Formulation */}
                  <div className="lg:col-span-2 text-xs text-[#171717] space-y-0.5">
                    <div className="font-semibold tabular-nums">{med.strength}</div>
                    <div className="text-[11px] text-[#777777]">
                      {med.formulation} • {med.route}
                    </div>
                  </div>

                  {/* Col 3: Prescribed Regimen & Frequency */}
                  <div className="lg:col-span-3 text-xs space-y-1">
                    <div className="font-semibold text-[#1747E8]">
                      {med.prescribedDose}
                    </div>
                    <div className="flex items-start gap-1 text-[11px] text-[#525252]">
                      <Clock className="w-3 h-3 text-[#777777] flex-shrink-0 mt-0.5" aria-hidden="true" />
                      <span className="leading-snug">
                        <strong>{med.frequency}:</strong> {med.administrationInstructions}
                      </span>
                    </div>
                  </div>

                  {/* Col 4: Verification Status */}
                  <div className="lg:col-span-2 flex flex-col items-start lg:items-center justify-center gap-1">
                    <VerificationBadge
                      status={med.verificationStatus}
                      size="sm"
                      interactive
                      onStatusChange={(nextStatus) => onUpdateVerification(med.id, nextStatus)}
                    />
                    <button
                      type="button"
                      onClick={() => toggleExpand(med.id)}
                      aria-expanded={isExpanded}
                      aria-label={`${isExpanded ? 'Collapse' : 'Expand'} details for ${med.brand}`}
                      className="inline-flex items-center gap-0.5 text-[11px] text-[#1747E8] hover:text-[#1238C7] font-medium transition-colors mt-0.5"
                    >
                      <span>{isExpanded ? 'Less details' : 'More details'}</span>
                      {isExpanded ? (
                        <ChevronUp className="w-3 h-3" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="w-3 h-3" aria-hidden="true" />
                      )}
                    </button>
                  </div>

                  {/* Col 5: Actions */}
                  <div className="lg:col-span-1 flex items-center justify-end gap-1 pt-1 lg:pt-0 border-t lg:border-t-0 border-[#E6E3E1]">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(med)}
                      aria-label={`Edit ${med.brand}`}
                      className="p-1.5 text-[#525252] hover:text-[#1747E8] hover:bg-[#F0F3FF] rounded-sm transition-colors"
                      title="Edit order"
                    >
                      <Edit2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Remove ${med.brand} from patient profile?`)) {
                          onDeleteMedication(med.id);
                        }
                      }}
                      aria-label={`Delete ${med.brand}`}
                      className="p-1.5 text-[#525252] hover:text-[#DC2626] hover:bg-[#FEE2E2] rounded-sm transition-colors"
                      title="Delete order"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {/* Expandable Details Drawer */}
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-[#E6E3E1] bg-[#FAF9F8] rounded-sm p-3 text-xs space-y-2.5">
                    {/* Active Ingredients List */}
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#777777] block mb-1">
                        Active Pharmaceutical Ingredients
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {(med.activeIngredients || []).map((ing, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center px-2 py-0.5 rounded-sm bg-white border border-[#E6E3E1] text-[11px] text-[#171717] font-medium"
                          >
                            {ing.name} {ing.strength ? `(${ing.strength})` : ''}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Metadata Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-[#E6E3E1]/70 text-[11px]">
                      <div>
                        <span className="text-[#777777] block">Salt Form</span>
                        <span className="font-medium text-[#171717]">{med.salt || 'None / Unknown'}</span>
                      </div>
                      <div>
                        <span className="text-[#777777] block">Prescriber</span>
                        <span className="font-medium text-[#171717]">{med.prescriber || 'Unknown'}</span>
                      </div>
                      <div>
                        <span className="text-[#777777] block">Source</span>
                        <span className="font-medium text-[#171717]">{med.source || 'EMR Intake'}</span>
                      </div>
                      <div>
                        <span className="text-[#777777] block">Start Date</span>
                        <span className="font-medium text-[#171717] tabular-nums">{med.startDate || 'Not specified'}</span>
                      </div>
                    </div>
                  </div>
                )}
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
