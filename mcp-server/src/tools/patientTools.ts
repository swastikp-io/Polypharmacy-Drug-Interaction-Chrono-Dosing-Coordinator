import type { ClinicalEngineService } from '../services/clinicalEngineService.js';
import {
  ListPatientsInputSchema,
  GetPatientMedicationsInputSchema,
  type ListPatientsInput,
  type GetPatientMedicationsInput,
} from '../schemas/patientSchemas.js';

export function handleListPatients(
  rawArgs: unknown,
  engine: ClinicalEngineService
) {
  const args = ListPatientsInputSchema.parse(rawArgs || {});
  let patients = engine.patientRepo.findAll();

  if (args.search) {
    const q = args.search.toLowerCase();
    patients = patients.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.mrn.toLowerCase().includes(q) ||
        p.careSetting.toLowerCase().includes(q)
    );
  }

  return {
    patients: patients.map((p) => ({
      id: p.id,
      mrn: p.mrn,
      name: p.name,
      dateOfBirth: p.dateOfBirth,
      gender: p.gender,
      careSetting: p.careSetting,
      primaryPhysician: p.primaryPhysician,
    })),
    total: patients.length,
  };
}

export function handleGetPatientMedications(
  rawArgs: unknown,
  engine: ClinicalEngineService
) {
  const args = GetPatientMedicationsInputSchema.parse(rawArgs);
  const patient = engine.patientRepo.findById(args.patientId);

  if (!patient) {
    throw new Error(`Patient record with ID "${args.patientId}" was not found.`);
  }

  let meds = engine.medRepo.findByPatientId(args.patientId);

  if (args.confirmedOnly) {
    meds = meds.filter((m) => m.verificationStatus === 'confirmed');
  }

  return {
    patientId: patient.id,
    patientName: patient.name,
    mrn: patient.mrn,
    confirmedOnly: args.confirmedOnly,
    medications: meds.map((m) => ({
      id: m.id,
      brand: m.brand,
      genericName: m.genericName,
      activeIngredients: m.activeIngredients,
      salt: m.salt,
      strength: m.strength,
      formulation: m.formulation,
      route: m.route,
      prescribedDose: m.prescribedDose,
      frequency: m.frequency,
      administrationInstructions: m.administrationInstructions,
      prescriber: m.prescriber,
      source: m.source,
      status: m.status,
      verificationStatus: m.verificationStatus,
      indication: m.indication,
    })),
    count: meds.length,
    epistemicNotice:
      meds.some((m) => m.verificationStatus !== 'confirmed')
        ? 'CAUTION: Regimen contains unverified or preliminary prescription records.'
        : 'All returned medication orders are verified confirmed truth.',
  };
}
