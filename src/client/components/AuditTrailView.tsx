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
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'UPDATE':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'STATUS_CHANGE':
        return 'bg-purple-100 text-purple-800 border-purple-300';
      case 'DELETE':
        return 'bg-red-100 text-red-800 border-red-300';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-300';
    }
  };

  return (
    <div className="space-y-4">
      {/* Header & Filter */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <History className="w-4 h-4 text-clinical-600" aria-hidden="true" />
            Clinical Record Audit Trail
          </h3>
          <p className="text-xs text-slate-500">
            Immutable log of record creation, edits, verification changes, and deletions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            aria-label="Filter audit logs by entity type"
            className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-clinical-500"
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
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
          <FileCheck2 className="w-8 h-8 mx-auto text-slate-300 mb-2" aria-hidden="true" />
          <p className="text-sm font-semibold">No audit events match current filter.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredLogs.map((log) => {
            const isExpanded = expandedLogIds.has(log.id);
            const prevObj = log.previousState ? JSON.parse(log.previousState) : null;
            const newObj = log.newState ? JSON.parse(log.newState) : null;

            return (
              <div
                key={log.id}
                className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden transition-colors"
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
                  className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 cursor-pointer hover:bg-slate-50/70"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-slate-400">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4" aria-hidden="true" />
                      ) : (
                        <ChevronRight className="w-4 h-4" aria-hidden="true" />
                      )}
                    </span>

                    <span
                      className={`px-2 py-0.5 rounded text-2xs font-bold uppercase tracking-wider border ${getActionBadge(
                        log.action
                      )}`}
                    >
                      {log.action}
                    </span>

                    <span className="text-2xs font-bold text-slate-500 uppercase tracking-wider">
                      {log.entityType}
                    </span>

                    <span className="text-xs font-semibold text-slate-900">{log.summary}</span>
                  </div>

                  <div className="flex items-center gap-3 text-2xs text-slate-500 pl-7 sm:pl-0">
                    <span>
                      Actor: <strong className="text-slate-700">{log.actor}</strong>
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" aria-hidden="true" />
                      <span>{new Date(log.timestamp).toLocaleString()}</span>
                    </span>
                  </div>
                </div>

                {/* Expandable Diff Panel */}
                {isExpanded && (
                  <div className="px-5 py-4 border-t border-slate-200 bg-slate-50/90 text-xs space-y-3">
                    {log.changedFields && log.changedFields.length > 0 && (
                      <div>
                        <span className="font-semibold text-slate-700">Modified Fields: </span>
                        <div className="inline-flex flex-wrap gap-1 mt-1">
                          {log.changedFields.map((f, i) => (
                            <span
                              key={i}
                              className="px-1.5 py-0.5 bg-white border border-slate-200 text-clinical-800 rounded font-mono text-2xs font-medium"
                            >
                              {f}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                      <div>
                        <span className="text-2xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
                          Previous State
                        </span>
                        <pre className="p-2.5 bg-white rounded border border-slate-200 text-2xs text-slate-700 font-mono overflow-x-auto max-h-48">
                          {prevObj ? JSON.stringify(prevObj, null, 2) : '(None - Record Created)'}
                        </pre>
                      </div>

                      <div>
                        <span className="text-2xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
                          New State
                        </span>
                        <pre className="p-2.5 bg-white rounded border border-slate-200 text-2xs text-slate-700 font-mono overflow-x-auto max-h-48">
                          {newObj ? JSON.stringify(newObj, null, 2) : '(None - Record Deleted)'}
                        </pre>
                      </div>
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
