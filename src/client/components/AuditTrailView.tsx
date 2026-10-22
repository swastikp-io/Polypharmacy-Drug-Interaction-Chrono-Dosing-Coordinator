import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Clock, FileCheck2, Filter, History } from 'lucide-react';
import type { AuditLog } from '../../shared/types.js';

interface AuditTrailViewProps {
  auditLogs: AuditLog[];
}

export const AuditTrailView: React.FC<AuditTrailViewProps> = ({ auditLogs }) => {
  const [filterType, setFilterType] = useState<string>('all');
  const [expandedLogIds, setExpandedLogIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    const updated = new Set(expandedLogIds);
    if (updated.has(id)) {
      updated.delete(id);
    } else {
      updated.add(id);
    }
    setExpandedLogIds(updated);
  };

  const filteredLogs = auditLogs.filter((log) => {
    if (filterType === 'all') return true;
    return log.entityType === filterType;
  });

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'CREATE':
        return 'bg-[#ECFDF5] text-[#065F46] border-[#A7F3D0]';
      case 'UPDATE':
        return 'bg-[#D7DEFF] text-[#1747E8] border-[#C0CEFF]';
      case 'STATUS_CHANGE':
        return 'bg-[#F3E8FF] text-[#6B21A8] border-[#E9D5FF]';
      case 'DELETE':
        return 'bg-[#FEE2E2] text-[#991B1B] border-[#FECACA]';
      default:
        return 'bg-[#FAF9F8] text-[#525252] border-[#E6E3E1]';
    }
  };

  return (
    <div className="space-y-4">
      {/* Header & Filter */}
      <div className="bg-white p-4 rounded-sm border border-[#E6E3E1] shadow-editorial flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-[#171717] flex items-center gap-2">
            <History className="w-4 h-4 text-[#1747E8]" aria-hidden="true" />
            <span>Clinical Record Audit Trail</span>
          </h3>
          <p className="text-xs text-[#777777] mt-0.5">
            Immutable log of record creation, edits, verification changes, and deletions in SQLite.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-[#777777]" aria-hidden="true" />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            aria-label="Filter audit logs by entity type"
            className="px-2.5 py-1 text-xs rounded-sm border border-[#E6E3E1] bg-[#FAF9F8] text-[#171717] font-medium focus:bg-white focus:border-[#1747E8] focus:ring-1 focus:ring-[#1747E8]"
          >
            <option value="all">All Entities ({auditLogs.length})</option>
            <option value="medication">Medications</option>
            <option value="allergy">Allergies</option>
            <option value="diagnosis">Diagnoses</option>
            <option value="lab_measurement">Lab Measurements</option>
            <option value="patient">Patient Profile</option>
          </select>
        </div>
      </div>

      {filteredLogs.length === 0 ? (
        <div className="bg-white rounded-sm border border-[#E6E3E1] p-10 text-center pattern-dots-subtle shadow-editorial">
          <FileCheck2 className="w-8 h-8 mx-auto text-[#777777] mb-2" aria-hidden="true" />
          <p className="text-sm font-bold text-[#171717]">No audit events match filter</p>
          <p className="text-xs text-[#777777] mt-1">Actions performed on patient records will be logged immutably here.</p>
        </div>
      ) : (
        <div className="bg-white border border-[#E6E3E1] rounded-sm divide-y divide-[#E6E3E1] shadow-editorial overflow-hidden">
          {filteredLogs.map((log) => {
            const isExpanded = expandedLogIds.has(log.id);
            const prevObj = log.previousState ? JSON.parse(log.previousState) : null;
            const newObj = log.newState ? JSON.parse(log.newState) : null;

            return (
              <div
                key={log.id}
                className="p-3.5 transition-colors hover:bg-[#FAF9F8]/60"
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleExpand(log.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleExpand(log.id);
                    }
                  }}
                  aria-expanded={isExpanded}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 cursor-pointer focus:outline-none"
                >
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="text-[#777777]">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-[#1747E8]" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </span>

                    <span
                      className={`px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wider border ${getActionBadge(
                        log.action
                      )}`}
                    >
                      {log.action}
                    </span>

                    <span className="font-semibold text-xs text-[#171717] capitalize">
                      {log.entityType.replace(/_/g, ' ')}
                    </span>

                    <span className="text-[11px] text-[#777777] font-mono">
                      ID: {log.entityId.slice(0, 10)}...
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-[11px] text-[#777777]">
                    <span className="text-[#171717] font-medium">{log.actor}</span>
                    <span className="flex items-center gap-1 tabular-nums">
                      <Clock className="w-3 h-3 text-[#777777]" />
                      <span>{new Date(log.timestamp).toLocaleString()}</span>
                    </span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-[#E6E3E1] text-xs space-y-2 bg-[#FAF9F8] p-3 rounded-sm">
                    {log.summary && (
                      <div className="text-[11px] text-[#171717]">
                        <strong className="text-[#171717]">Summary:</strong> {log.summary}
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                      {prevObj && (
                        <div className="bg-white p-2.5 rounded-sm border border-[#E6E3E1]">
                          <span className="font-bold text-[#DC2626] block mb-1 uppercase text-[10px]">Previous State:</span>
                          <pre className="text-[10px] font-mono text-[#525252] overflow-x-auto whitespace-pre-wrap">
                            {JSON.stringify(prevObj, null, 2)}
                          </pre>
                        </div>
                      )}
                      {newObj && (
                        <div className="bg-white p-2.5 rounded-sm border border-[#E6E3E1]">
                          <span className="font-bold text-[#059669] block mb-1 uppercase text-[10px]">New State:</span>
                          <pre className="text-[10px] font-mono text-[#525252] overflow-x-auto whitespace-pre-wrap">
                            {JSON.stringify(newObj, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
