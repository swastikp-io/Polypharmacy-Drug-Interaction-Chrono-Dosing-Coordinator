import { computeChangedFields } from '../../shared/calculations.js';
import type { AuditAction, AuditLog, EntityType } from '../../shared/types.js';
import type { AuditLogRepository } from '../repositories/auditLogRepository.js';

export class AuditService {
  constructor(private auditRepo: AuditLogRepository) {}

  logCreate(
    patientId: string,
    entityType: EntityType,
    entityId: string,
    actor: string,
    summary: string,
    createdRecord: any
  ): AuditLog {
    return this.auditRepo.record({
      patientId,
      entityType,
      entityId,
      action: 'CREATE',
      actor,
      summary,
      previousState: null,
      newState: createdRecord,
      changedFields: Object.keys(createdRecord),
    });
  }

  logUpdate(
    patientId: string,
    entityType: EntityType,
    entityId: string,
    actor: string,
    summary: string,
    previousRecord: any,
    updatedRecord: any
  ): AuditLog {
    const changed = computeChangedFields(previousRecord, updatedRecord);
    return this.auditRepo.record({
      patientId,
      entityType,
      entityId,
      action: 'UPDATE',
      actor,
      summary,
      previousState: previousRecord,
      newState: updatedRecord,
      changedFields: changed,
    });
  }

  logStatusChange(
    patientId: string,
    entityType: EntityType,
    entityId: string,
    actor: string,
    summary: string,
    previousStatus: string,
    newStatus: string
  ): AuditLog {
    return this.auditRepo.record({
      patientId,
      entityType,
      entityId,
      action: 'STATUS_CHANGE',
      actor,
      summary,
      previousState: { verificationStatus: previousStatus },
      newState: { verificationStatus: newStatus },
      changedFields: ['verificationStatus'],
    });
  }

  logDelete(
    patientId: string,
    entityType: EntityType,
    entityId: string,
    actor: string,
    summary: string,
    deletedRecord: any
  ): AuditLog {
    return this.auditRepo.record({
      patientId,
      entityType,
      entityId,
      action: 'DELETE',
      actor,
      summary,
      previousState: deletedRecord,
      newState: null,
      changedFields: Object.keys(deletedRecord || {}),
    });
  }
}
