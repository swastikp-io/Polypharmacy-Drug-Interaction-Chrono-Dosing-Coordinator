# Polypharmacy Drug-Interaction & Chrono-Dosing Coordinator

> **CLINICAL PROTOTYPE NOTICE:**  
> This system is a **local-first clinical decision-support prototype** for demonstration and architectural evaluation with **synthetic data only**. It is **NOT** a substitute for professional clinical judgment, comprehensive medication reconciliation, or direct physician/pharmacist review. The system does not automatically modify prescriptions or formulate medical advice. Missing values explicitly remain unknown.

---

## Overview

Older adults managing multiple chronic conditions frequently face high-risk polypharmacy regimens characterized by unintentional duplicate active ingredients, severe drug-drug interactions, renal and hepatic clearance thresholds, and suboptimal administration timing.

The **Polypharmacy Drug-Interaction & Chrono-Dosing Coordinator** provides a local-first medication reconciliation and clinical decision-support prototype. It establishes:
1. **Patient Dashboard & Synthetic Geriatric Profiles**: Preloaded with complex polypharmacy scenarios (e.g., dual acetaminophen prescribing, CKD Stage 3b, heart failure, osteoporosis with thyroid hormone absorption conflicts).
2. **Phase 2: Prescription OCR & Normalization Agent**: Local-first optical character extraction and pharmacological entity parsing for printed prescriptions and PDF orders. Features side-by-side source document viewing, field-level confidence scoring, RxNorm terminology mapping, ISMP Look-Alike / Sound-Alike (LASA) hazard detection, and explicit pharmacist reconciliation.
3. **Phase 3: Pharmacokinetic Conflict Engine**: Deterministic clinical rule engine powered by validated, versioned reference datasets. Features drug-pair matching via normalized ingredient IDs, separate PK vs. PD vs. duplicate therapy categorization, established clinical trial vs. theoretical mechanism distinctions, explicit renal/hepatic data gap tracking, grounded LLM explanation scaffolding, and safe provider outage handling.
4. **Granular Medication Data Model**: Captures brand, generic name, active ingredients with individual strengths, salt form, total strength, formulation, route, prescribed dose, frequency, administration instructions, prescriber, and source.
4. **Clinical Context Records**: Allergies, chronic problem list / diagnoses (ICD-10), and renal/hepatic laboratory measurements with units, reference ranges, collection dates, and sources.
5. **Explicit Epistemic Verification States**: Every medication, allergy, diagnosis, and lab measurement maintains an explicit state (`confirmed`, `unverified`, or `unknown`). Missing values remain unknown rather than assumed.
6. **Audited Data Operations**: Every creation, update, verification state toggle, and deletion generates an immutable audit trail entry with actor, timestamp, summary, and previous/new state diffs.
7. **Clinical Calculations & Duplicate Ingredient Engine**: Isolated from UI components; performs alias-aware duplicate ingredient detection, Cockcroft-Gault creatinine clearance (CrCl) estimation, and KDIGO eGFR staging.
8. **Future Agent Service Layer & Typed Contracts**: Defines typed interfaces, data structures, and deterministic prototypes for three future agent services:
   - **Agent 1: `DrugInteractionAgent`**: Evaluates drug-drug interactions, duplicate active ingredients, and drug-allergy contraindications.
   - **Agent 2: `ChronoDosingAgent`**: Optimizes 24-hour circadian administration timelines and flags absorption conflicts (e.g., levothyroxine vs. calcium carbonate).
   - **Agent 3: `RenalHepaticDosingAgent`**: Assesses organ clearance thresholds (e.g., metformin in CKD, NSAIDs, apixaban dose reductions) and AGS Beers Criteria deprescribing opportunities.

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Lucide Icons
- **Backend**: Node.js, Express, TypeScript, Better-SQLite3
- **Validation**: Zod (shared schemas across client and server)
- **Testing**: Vitest, Supertest
- **Persistence**: SQLite with WAL mode (`data/polypharmacy.db` or in-memory for testing)

---

## Architecture & Code Organization

```
├── package.json                   # Project configuration and script runners
├── tsconfig.json                  # TypeScript config (Client & Shared)
├── tsconfig.server.json           # TypeScript config (Server & API)
├── vite.config.ts                 # Vite bundler configuration & /api proxy
├── tailwind.config.js             # Clinical design theme & color tokens
├── vitest.config.ts               # Test suite runner configuration
├── data/                          # SQLite database storage directory (polypharmacy.db)
├── scripts/
├── src/
│   ├── shared/                    # Shared domain layer (Zero UI dependencies)
│   │   ├── types.ts               # Core TypeScript interfaces & verification enums
│   │   ├── schemas.ts             # Zod validation schemas for all entities
│   │   └── calculations.ts        # Duplicate ingredient detection, CrCl, eGFR formulas
│   ├── server/                    # Backend API layer
│   │   ├── db/
│   │   │   ├── database.ts        # SQLite initialization, schema migrations, pragmas
│   │   │   └── seeds.ts           # Synthetic geriatric patient profiles
│   │   ├── repositories/          # Data access layer
│   │   │   ├── patientRepository.ts
│   │   │   ├── medicationRepository.ts
│   │   │   ├── allergyRepository.ts
│   │   │   ├── diagnosisRepository.ts
│   │   │   ├── labMeasurementRepository.ts
│   │   │   └── auditLogRepository.ts
│   │   ├── services/              # Business logic & Agent services
│   │   │   ├── auditService.ts    # Audit logging & diff computation
│   │   │   ├── patientService.ts  # Comprehensive patient bundle aggregation
│   │   │   └── agents/            # Future agent typed contracts & deterministic stubs
│   │   │       ├── types.ts
│   │   │       ├── drugInteractionAgent.ts
│   │   │       ├── chronoDosingAgent.ts
│   │   │       └── renalHepaticDosingAgent.ts
│   │   ├── routes/                # Express REST endpoints
│   │   ├── middleware/            # Zod validation & consistent error handlers
│   │   ├── app.ts                 # Express application assembly & static fallback
│   │   └── index.ts               # Server bootstrap & graceful shutdown
│   └── client/                    # Frontend React application
│       ├── api/apiClient.ts       # Typed API client
│       ├── components/
│       │   ├── SafetyNotice.tsx           # Persistent clinical prototype banner
│       │   ├── VerificationBadge.tsx      # Interactive confirmed/unverified/unknown badge
│       │   ├── PatientSelector.tsx        # Synthetic profile switcher
│       │   ├── PatientDashboard.tsx       # KPI summaries & tabbed navigation
│       │   ├── MedicationList.tsx         # 12-field medication order table
│       │   ├── MedicationModal.tsx        # Add/Edit medication with Zod validation
│       │   ├── DuplicateIngredientAlert.tsx# Duplicate ingredient hazard banner & details
│       │   ├── AllergyList.tsx & Modal    # Allergy & adverse reaction management
│       │   ├── DiagnosisList.tsx & Modal  # Chronic problem list management
│       │   ├── LabMeasurementList.tsx     # Renal & hepatic panels + CrCl/eGFR readouts
│       │   ├── AuditTrailView.tsx         # Chronological audit ledger with JSON diffs
│       │   └── AgentContractPreview.tsx   # Interactive future agent contract preview
│       ├── App.tsx
│       └── main.tsx
└── tests/
    ├── domain/
    │   ├── calculations.test.ts   # Duplicate detection, Cockcroft-Gault, eGFR tests
    │   └── schemas.test.ts        # Zod validation boundary tests
    └── server/
        ├── repositories.test.ts   # SQLite CRUD & audit persistence tests
        └── api.test.ts            # API routes, error payloads, and agent endpoints
```

---

## Setup & Running Instructions

### Prerequisites
- Node.js >= 18.x (tested on v24.15.0)
- npm >= 9.x

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Development Mode
Runs both the Express backend (port 3001) and Vite frontend (port 5173) concurrently:
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### 3. Run Test Suite
Executes all 72 unit and integration tests across 10 test suites via Vitest:
- Domain calculations, Cockcroft-Gault CrCl, eGFR KDIGO staging
- Zod entity validation boundaries & epistemic verification schemas
- SQLite persistence, audit trails, and comprehensive profile aggregation
- Phase 2 local OCR adapter, extraction & normalization layers, and reconciliation endpoints
- Phase 3 ingredient normalization, alias resolution, and duplicate ingredient detection
- Phase 3 deterministic conflict engine, PK vs PD categorization, patient context prerequisites, and safe provider outage handling
- REST API integration tests for all patient, medication, OCR, and interaction endpoints

```bash
npm test
```

### 4. Run TypeScript Checks
Validates strict type-safety across both frontend and backend configurations:
```bash
npm run typecheck
```

### 5. Build for Production
Compiles the React frontend into `dist/` and compiles the server TypeScript into `dist/server/`:
```bash
npm run build
```

### 6. Start Production Server
Starts the production Express server, serving the SQLite database and the compiled React application on port 3001:
```bash
npm start
```
Open [http://localhost:3001](http://localhost:3001).

---

## Synthetic Patient Scenarios

The system preloads three synthetic profiles illustrating geriatric polypharmacy challenges:

1. **Eleanor Vance (Age 78, Female, MRN: SYNTH-84920)**
   - **Diagnoses**: CKD Stage 3b (eGFR 42 mL/min/1.73m²), Type 2 Diabetes, Hypertension, Knee Osteoarthritis.
   - **Polypharmacy Hazard**: Co-prescribed **Tylenol Extra Strength** (500 mg APAP) and **Percocet 5/325** (325 mg APAP post-arthroscopy).
   - **Clinical Alert**: Duplicate ingredient engine flags cumulative acetaminophen hepatotoxicity hazard; Renal agent warns on Metformin dosing threshold in CKD 3b.

2. **Arthur Pendelton (Age 84, Male, MRN: SYNTH-49211)**
   - **Diagnoses**: Non-valvular Atrial Fibrillation, HFpEF, NASH with elevated transaminases (ALT 68, AST 74), Insomnia.
   - **Medications**: Apixaban, Metoprolol, Furosemide, Zolpidem.
   - **Clinical Alert**: Chrono-Dosing agent requires morning administration for Furosemide to avoid nocturia and fall risk; Organ Clearance agent flags Beers Criteria caution for Zolpidem.

3. **Margaret Chen (Age 72, Female, MRN: SYNTH-92841)**
   - **Diagnoses**: Hypothyroidism, Postmenopausal Osteoporosis, Depression.
   - **Medications**: Levothyroxine (Synthroid 75 mcg), Calcium Carbonate + Vitamin D (Caltrate), Sertraline.
   - **Clinical Alert**: Chrono-Dosing agent detects chelation/absorption interference between Levothyroxine and Calcium Carbonate, requiring a mandatory $\ge 4$-hour separation window.

---

## Phase 2: Prescription OCR & Normalization Agent

Phase 2 introduces a local-first prescription ingestion, optical text extraction, and pharmacological normalization pipeline integrated directly into the patient dashboard.

```
                    ┌────────────────────────────────────────────────────────┐
                    │            Uploaded Prescription Image / PDF           │
                    └───────────────────────────┬────────────────────────────┘
                                                │
                                                ▼
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ [Layer A] OCR Extraction Service (OCRExtractionService)                                   │
│  - IOCREngine Adapter (LocalOCREngine - Zero third-party cloud calls)                     │
│  - Optical extraction & coordinate preservation (pageNumber, lineIndex, boundingBox)      │
│  - Pharmacological tokenization: brand, dose, salt, formulation, route, frequency, sig    │
│  - Field-level optical confidence scoring & syntax ambiguities (missing dose, bare unit)  │
└───────────────────────────────────────────────┬───────────────────────────────────────────┘
                                                │
                                                ▼
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ [Layer B] Terminology & Identity Resolution (DrugNormalizationService)                    │
│  - IDrugTerminologyProvider (LocalRxNormTerminologyProvider)                             │
│  - Maps candidates to standard RxNorm concepts, explicit salt forms, and release profiles │
│  - Detects ISMP Look-Alike / Sound-Alike (LASA) safety hazards without silent auto-choice │
│  - Compares candidates against patient active medications to flag duplicate ingredients   │
└───────────────────────────────────────────────┬───────────────────────────────────────────┘
                                                │
                                                ▼
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ [UI] Side-by-Side Review & Clinical Reconciliation Workspace                              │
│  - Left: Interactive DocumentViewer with zoom & coordinate line highlighting              │
│  - Right: Editable CandidateMedicationCard with confidence drilldown & LASA warnings      │
│  - Manual Entry Fallback modal for unreadable/handwritten scripts                         │
│  - Explicit Clinician Confirmation required to persist record into patient chart + audit  │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

### Safety Invariants & Clinical Guardrails
1. **Never Infer a Missing Dose**: If a prescription specifies a medication name without strength (e.g. `Rx: Metformin Oral Tablet`), the system refuses to guess a default. It flags a `critical` severity ambiguity (`missing_dose`) requiring clinician resolution.
2. **Never Silently Choose Between LASA Pairs**: Candidate orders matching known Institute for Safe Medication Practices (ISMP) Look-Alike / Sound-Alike pairs (e.g., Celexa vs. Celebrex vs. Zyprexa) flag a `critical` hazard and present alternatives. The system never silently assigns a match.
3. **Never Treat OCR as Verified Truth**: Candidates remain preliminary (`pending_review` / `unverified`) until a clinician explicitly reviews, edits, and confirms the order with their credentials.
4. **Duplicate Active Ingredient Co-Prescription Detection**: Cross-checks candidate active ingredients against the patient's existing active regimen (e.g. discharge `Percocet` containing Acetaminophen against baseline `Tylenol`), alerting before an overdose hazard occurs.
5. **Zero-Cloud Local Privacy Guarantee**: All OCR parsing and terminology resolution run entirely in the local environment. Temporary upload files are stored in `data/uploads/temp/` and can be deleted on demand via `DELETE /api/ocr/documents/:id`.

---

## Phase 3: Pharmacokinetic Conflict Engine

Phase 3 implements a deterministic clinical rule engine that can be assisted by an LLM for explanations, but whose clinical findings originate strictly from validated, versioned reference data and explicit rules.

```
                    ┌────────────────────────────────────────────────────────┐
                    │               Active Patient Medication Regimen        │
                    └───────────────────────────┬────────────────────────────┘
                                                │
                                                ▼
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ [Provider Layer] Versioned Evidence & Drug Reference (IDrugReferenceProvider)             │
│  - LocalDrugReferenceProvider (v2026.1.0): Normalized ingredients, CYP/P-gp profiles,     │
│    narrow therapeutic index (NTI) flags, clearance pathways, and alias resolution         │
│  - LocalInteractionEvidenceProvider: Explicit rules with publication dates & citations   │
│  - Safe Provider-Unavailable State: Refuses false safety certification during outages     │
└───────────────────────────────────────────────┬───────────────────────────────────────────┘
                                                │
                                                ▼
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ [Rule Engine] Pharmacokinetic Conflict Engine (PharmacokineticConflictEngine)            │
│  - Category Separation: Pharmacokinetic vs. Pharmacodynamic vs. Duplicate vs. Clearance   │
│  - Evidence Grading: Established Clinical Trial vs. Theoretical Mechanism                 │
│  - Patient Context Evaluation: Conditions on eGFR/CrCl or age ONLY where rule specifies   │
│  - Epistemic Gaps: Flags missing renal/hepatic data and unverified drug identities       │
│  - Stale Dataset Alerting: Flags reference datasets exceeding maintenance threshold       │
└───────────────────────────────────────────────┬───────────────────────────────────────────┘
                                                │
                                                ▼
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ [Explainability Layer] Explanation & LLM Grounding Scaffolding                            │
│  - Rule-grounded clinician summaries and patient plain-language consultation notes        │
│  - Zero-hallucination LLM scaffolding prompt tethered to verified structured findings     │
│  - Interactive Review Workspace with category filters and production data governance      │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

### Clinical Constraints & Invariants
1. **No False CYP Sharing Inference**: Does NOT infer a clinically significant interaction merely because two drugs share a CYP enzyme. Atorvastatin and Amlodipine both undergo CYP3A4 metabolism, but the interaction is classified strictly as `minor` with `theoretical_mechanism` evidence and `routine_monitoring` review.
2. **Never Claim Safety From Incomplete Data**: The engine never reports a regimen is safe merely because no interaction was found in a curated or incomplete dataset. Incomplete datasets and clinical data gaps (e.g. missing baseline creatinine) are explicitly flagged.
3. **Explicit Data Gaps Representation**: Missing kidney function (eGFR/CrCl), missing liver transaminases (ALT/AST), and unverified prescription orders are surfaced as actionable `ClinicalDataGap` items rather than assuming normal organ function.
4. **Safe Provider-Unavailable State**: If reference providers experience an outage or disconnection, the engine immediately activates a fail-safe state: it displays a prominent alert and refuses to generate a clean bill of health.
5. **Production Data Sources Governance**: Includes licensing, completeness, and update frequency audits for production data sources (RxNorm UMLS, DailyMed SPL, CPIC Guidelines, CredibleMeds QTDrugs).

---

## Phase 4: Circadian Schedule Coordinator

Phase 4 implements a constraint-based scheduling engine that coordinates medication administration across the 24-hour diurnal cycle using existing medication records, interaction evidence, and patient routine preferences. Clinical timing constraints originate strictly from validated, evidence-backed reference rules without relying on LLM hallucination.

```
                    ┌────────────────────────────────────────────────────────┐
                    │  Confirmed Prescriptions & Patient Routine Preferences │
                    │  (Wake: 07:00, Breakfast: 08:00, Bedtime: 21:30)       │
                    └───────────────────────────┬────────────────────────────┘
                                                │
                                                ▼
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ [Evidence Rules Layer] Authoritative Circadian & Separation Rules                         │
│  - Diuretic Morning Restriction (08:00): Prevents nocturia, orthostasis, and fall hazard  │
│  - Levothyroxine Morning Fasted (07:00): Mandatory >= 4-hour separation from cations      │
│  - Multivalent Cations (Calcium/Iron): Scheduled with Lunch (12:30) & Dinner (18:30)     │
│  - Short-Acting Statins (Simvastatin) & Sedative-Hypnotics (Zolpidem): Bedtime (21:30)    │
│  - Mucosal Irritants (Metformin, NSAIDs): Scheduled with or immediately after meals       │
│  - Systemic PK Invariant: Warns that spacing does NOT resolve CYP/P-gp enzyme inhibition  │
└───────────────────────────────────────────────┬───────────────────────────────────────────┘
                                                │
                                                ▼
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ [Scheduling Engine] Circadian Schedule Coordinator (CircadianScheduleCoordinator)         │
│  - SAFETY INVARIANT: Strictly preserves prescribed doses, frequencies, and formulations   │
│  - Computes validated meal-relative timing windows (empty_stomach, with_meal, bedtime)    │
│  - Detects impossible/contradictory constraints (e.g. bedtime diuretics, cation clashes)  │
│  - Evaluates epistemic uncertainty: unverified orders flagged with low confidence         │
│  - PRN medications preserved in flexible as-needed status without forced daily slots      │
└───────────────────────────────────────────────┬───────────────────────────────────────────┘
                                                │
                                                ▼
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ [Clinical Review & Audit Layer] Workspace, Comparison Table & SQLite Persistence          │
│  - 24-Hour Visual Timetable: Expandable rationale cards with source citations             │
│  - Side-by-Side Comparison: Prescribed baseline vs. Draft timetable with diff status      │
│  - Patient Routine Customizer: Modifies wake, meal, and bed hours with auto-recalculation │
│  - Formal Clinician Review Dialog: Accept / Reject / Modify with mandatory audit log      │
│  - Complete Audit Trail: Persists schedule revisions in `chrono_schedules` & `audit_logs` │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

### Safety Invariants & Clinical Guardrails
1. **Strict Prescription Integrity Invariant**: The engine **never** modifies prescribed doses, frequencies, or formulations. For example, twice-daily Metformin 500 mg is scheduled as two distinct 500 mg doses at breakfast and dinner; it is never consolidated into 1000 mg or altered in strength.
2. **Systemic Metabolic PK Interaction Non-Separation Warning**: Temporal spacing of administration times does **not** resolve systemic metabolic interactions (e.g., CYP3A4/P-gp inhibition by Clarithromycin with Apixaban). The scheduler raises an urgent clinical alert explicitly stating that systemic enzyme inhibition persists throughout the 24-hour interval and requires alternative drug selection or dosage reduction, not time spacing.
3. **Nocturnal Diuretic Fall-Risk Prevention**: Diuretics (Furosemide, Bumetanide, Hydrochlorothiazide) prescribed near bedtime are flagged as urgent clinical hazards. The engine automatically moves the proposed draft dose to the morning breakfast slot (08:00) to prevent nocturnal polyuria, sleep fragmentation, and catastrophic fall/hip fractures in older adults.
4. **Mandatory Chelation Separation ($\ge 4$ hours)**: Levothyroxine requires gastric acidity and is scheduled on waking fasted ($\ge 60$ min before breakfast). Multivalent cations (Calcium Carbonate, Ferrous Sulfate) are scheduled with lunch (12:30) and dinner (18:30), satisfying the authoritative 4-hour temporal separation requirement.
5. **Epistemic Data Gaps & Low Confidence**: Any medication with unverified status (e.g., preliminary OCR intake) is flagged with `low` confidence and surfaced in the unconfident medications registry. The draft schedule explicitly alerts that clinician verification is required before adoption.
6. **Immutable Audit Trail**: Every schedule generation, routine preference update, and clinician review decision (accepted, rejected, or modified) is persisted in the SQLite `chrono_schedules` and `audit_logs` tables with reviewer credentials, timestamp, and clinical rationale.

### REST Endpoints
- `GET /api/chrono/patient/:patientId/draft`: Generates or retrieves the latest draft 24-hour timetable, side-by-side comparison, and unresolved conflicts.
- `GET /api/chrono/patient/:patientId/routine`: Retrieves the patient's daily meal and sleep routine.
- `PUT /api/chrono/patient/:patientId/routine`: Updates the daily routine, logs an audit entry, and recalculates the draft timetable.
- `POST /api/chrono/patient/:patientId/review`: Submits clinician review decision (`accepted`, `rejected`, `modified`) with rationale and logs an audit record.
- `GET /api/chrono/patient/:patientId/history`: Retrieves the audit history of all past schedule iterations and reviews.

---

## Duplicate-Ingredient Detection Engine

Clinical calculations are maintained in [src/shared/calculations.ts](file:///c:/Users/music/OneDrive/Desktop/Polypharmacy%20Drug-Interaction%20%26%20Chrono-Dosing%20Coordinator/src/shared/calculations.ts).

### Algorithm:
1. Normalizes pharmaceutical ingredient names and aliases (e.g., `Paracetamol` $\to$ `acetaminophen`, `APAP` $\to$ `acetaminophen`, `ASA` $\to$ `aspirin`, `HCTZ` $\to$ `hydrochlorothiazide`).
2. Iterates active, held, and PRN medication orders for the patient.
3. Groups medications sharing normalized chemical entities.
4. If an ingredient appears in $\ge 2$ active medications, calculates cumulative toxicity severity (`high` for narrow therapeutic indices or black-box hepatotoxic/nephrotoxic ingredients like acetaminophen, opioids, and NSAIDs).
5. Produces clinical rationale without fabricating medical advice.

---

## Future Agent Service Contracts (Phase 1 Stubs)

The system exposes clean, typed service contracts and deterministic endpoints under `/api/agents`:

| Agent | Interface | Endpoint | Deterministic Logic |
| :--- | :--- | :--- | :--- |
| **Drug Interaction Agent** | `IDrugInteractionAgentService` | `GET /api/agents/interactions/:patientId` | Duplicate ingredients, verified major DDIs (e.g., Apixaban + NSAID, Opioid + Sedative), documented allergy cross-reactions. |
| **Chrono-Dosing Coordinator** | `IChronoDosingAgentService` | `GET /api/agents/chrono-dosing/:patientId` | Circadian slots (Morning fasted, Breakfast, Midday, Dinner, Bedtime, PRN), absorption conflicts (Levothyroxine vs. Calcium), nocturnal fall risk prevention (morning diuretics). |
| **Renal/Hepatic Clearance Agent** | `IRenalHepaticDosingAgentService` | `GET /api/agents/organ-clearance/:patientId` | Cockcroft-Gault CrCl estimation, KDIGO eGFR staging, Metformin renal cutoff ($< 30$ and $30-44$ mL/min), AGS Beers Criteria deprescribing prompts. |

---

## Phase 5: Agent Orchestration Engine

The typed workflow orchestrator connects the 3 modular clinical agent services into an end-to-end coordinated pipeline governed by a 6-stage finite state machine:

```
[IDLE]
  │
  ▼
[STAGE 1: FETCHING_PATIENT_RECORDS] (Retrieves active meds, problem list, labs)
  │
  ▼
[STAGE 2: OCR_INTAKE] (Optional: triggered when new prescription image/PDF is supplied)
  │
  ▼
[STAGE 3: AWAITING_MEDICATION_CONFIRMATION] (Epistemic Checkpoint: pauses if unverified orders exist)
  │
  ▼
[STAGE 4: EVALUATING_INTERACTIONS] (Deterministic PK Conflict Engine)
  │
  ▼
[STAGE 5: COORDINATING_SCHEDULE] (Diurnal Chrono-Coordinator with 100% dose preservation)
  │
  ▼
[STAGE 6: GENERATING_CONSOLIDATED_REPORT] (Synthesizes clinical dossier & prioritized pharmacist actions)
  │
  ▼
[COMPLETED]
```

### Orchestration Safety Invariants:
1. **Epistemic Checkpoints**: If `requireConfirmedOnly: true` and any active prescription has `verificationStatus !== 'confirmed'`, the workflow transitions to `PAUSED_FOR_CLINICAL_REVIEW`. The pipeline halts to prevent false interaction clearance on preliminary data. Clinicians confirm identities via the UI or `POST /api/orchestration/run/:runId/resume`.
2. **Sanitized Execution Logs**: Workflow logs contain no raw base64 images, no buffer strings, no SQL credentials, and no unredacted personal identifiers.
3. **Deterministic Core with LLM Assistance**: Computations (drug-pair matching, CYP/P-gp clearance, circadian time-slotting) are 100% deterministic code. LLMs provide explanatory text scaffolding only and cannot invent timing constraints or silently discard interactions.
4. **Idempotent Runs & Timeouts**: Runs are cached by `runId` and configurable timeouts default to 10,000ms, failing safely to `FAILED_RECOVERABLE` on timeout or dependency error.

---

## Phase 6: Clinical Dashboard & Safety Hardening

### Holistic Clinical Dashboard
- **Consolidated Dossier Tab**: Executive summary of patient demographics, active confirmed regimen, and complete diagnostic context.
- **Prioritized Pharmacist Review Checklist**: Categorizes actions into `immediate_action` (e.g. duplicate active ingredients, severe DDIs), `pre_administration_signoff` (e.g. 4-hour absorption spacing, bedtime sedative fall hazards), and `routine_monitoring` (e.g. organ clearance gaps).
- **Diurnal Circadian Schedule**: 24-hour diurnal administration timetable displaying 100% prescribed dose preservation and timing rationales.
- **Dataset Provenance Ledger**: Tracks version numbers of the orchestrator, conflict engine, circadian coordinator, and reference datasets.

### Security Hardening & Data Governance
1. **Strict Local-Only Storage**: All patient data, prescription images, and SQLite databases remain strictly local on the deployment machine (`data/`).
2. **Path Traversal Guards (`validateSafePath`)**: Blocks directory traversal (`../`, `..\\`), null-byte injections (`%00`, `\0`), and path escapes outside the designated application boundaries.
3. **Filename Sanitization (`sanitizeFilename`)**: Strips unsafe POSIX and Windows filesystem characters (`<>:"/\|?*`).
4. **Scoped MCP Tools (`/api/orchestration/mcp/call`)**: Strictly allows 6 registered clinical tools validated by Zod (`get_patient_overview`, `get_confirmed_medications`, `run_interaction_analysis`, `get_circadian_timetable`, `get_consolidated_clinical_report`, `confirm_medication_order`). Prohibits arbitrary shell/command execution (`execute_command`, `read_arbitrary_file`, `eval`, `system_shell`).
5. **Confirmation-Token Guarded Mutations**:
   - Medication order confirmation requires token: `"CONFIRM_MUTATION"`.
   - Patient record purge requires exact token: `"PURGE_{patientId}"`.
6. **GDPR / HIPAA Data Portability & Purge**:
   - `GET /api/governance/patient/:patientId/export`: Downloads a complete JSON patient dossier with `Content-Disposition: attachment`.
   - `POST /api/governance/patient/:patientId/purge`: Deletes patient records across all clinical tables while recording a permanent de-identified `PURGE` event in the immutable audit ledger.

---

## Verification & Epistemic States

Every clinical entity records a `verificationStatus`:
- `confirmed`: Verified against discharge summaries, lab panels, or prescriber confirmation.
- `unverified`: Preliminary order, self-reported intake, or unconfirmed allergy.
- `unknown`: Explicitly unconfirmed or missing provenance.

Clinicians can toggle states with one click in the UI, instantly writing a `STATUS_CHANGE` entry to the SQLite audit trail.

---

## Design & Accessibility

- Adheres to good design principles: unobtrusive, honest, down to the last detail, and minimal.
- High-contrast clinical typography using slate and clinical teal palettes with WCAG AA compliance.
- Semantic HTML tags (`<main>`, `<nav>`, `<aside>`, `<article>`, `<dialog>`), keyboard navigation, and explicit `aria-label` attributes.
- Semantic HTML tags with accessibility-first approach and WCAG AA compliance auditing.

---

## Test Suite & Verification Results

The test suite covers domain calculations, Zod schemas, SQLite repositories, REST endpoints, OCR extraction, terminology mapping, LASA warnings, Pharmacokinetic conflict engine, circadian coordination, workflow orchestration state machine, scoped MCP tools, filesystem path traversal guards, and GDPR data governance:

```bash
npm test
```

### Actual Test Run Results:
```
 ✓ tests/interactions/conflictEngine.test.ts (11 tests)
 ✓ tests/ocr/extractionAndNormalization.test.ts (7 tests)
 ✓ tests/orchestration/workflowCoordinator.test.ts (7 tests)
 ✓ tests/server/repositories.test.ts (3 tests)
 ✓ mcp-server/tests/toolHandlers.test.ts (19 tests)
 ✓ tests/ocr/ocrEngine.test.ts (7 tests)
 ✓ tests/domain/calculations.test.ts (8 tests)
 ✓ tests/interactions/interactionApi.test.ts (8 tests)
 ✓ tests/security/safetyAndGovernance.test.ts (9 tests)
 ✓ tests/server/api.test.ts (9 tests)
 ✓ tests/ocr/ocrApi.test.ts (7 tests)
 ✓ tests/chrono/chronoApi.test.ts (9 tests)
 ✓ tests/orchestration/orchestrationApi.test.ts (12 tests)
 ✓ mcp-server/tests/mcpProtocol.test.ts (7 tests)
 ✓ tests/domain/schemas.test.ts (6 tests)
 ✓ tests/chrono/scheduleEngine.test.ts (8 tests)
 ✓ tests/interactions/normalizationAndMatching.test.ts (6 tests)

 Test Files  17 passed (17)
      Tests  143 passed (143)
```

---

## Setup & Running the Application

### 1. Install Dependencies
```bash
npm install
```

### 2. Run TypeScript Typechecks
```bash
npm run typecheck
```

### 3. Run Test Suite
```bash
npm test
```

### 4. Build for Production
```bash
npm run build
```

### 5. Start Development Server
```bash
npm run dev
```
- Client runs at: `http://localhost:5173`
- Server API runs at: `http://localhost:3001`

---

## Phase 7: Local MCP Server for Claude Desktop & LLM Agents

The **Polypharmacy Coordinator MCP Server** exposes the clinical decision-support engines directly to Anthropic's Claude Desktop and other Model Context Protocol (MCP) clients over a local `stdio` JSON-RPC 2.0 transport.

### Architectural Invariants & Protocol Purity
1. **Zero Business Logic Duplication**: Reuses the validated domain repositories (`PatientRepository`, `MedicationRepository`), deterministic engines (`PharmacokineticConflictEngine`, `CircadianScheduleCoordinator`), and security guards (`validateSafePath`, `AuditService`).
2. **Strict Stdio Transport Purity**: All diagnostic, startup, and error logging is routed strictly to `process.stderr`. `process.stdout` is exclusively dedicated to valid JSON-RPC 2.0 protocol frames.
3. **No Clinical Hallucinations**:
   - `get_clinical_evidence` queries versioned reference rules; it never synthesizes or fabricates citations.
   - `propose_medication_schedule` strictly preserves 100% of prescribed doses and frequencies; it returns a draft timetable only.
   - `confirm_medication` requires an explicit security guard token (`"CONFIRM_MUTATION"`) and creates an immutable SQLite audit log entry with diff tracking.
   - Missing lab values and unverified medications remain explicitly flagged as unknown or unverified.

---

### Registered MCP Tools

| Tool Name | Description | Key Parameters | Epistemic Safeguard |
|---|---|---|---|
| `list_patients` | Lists all authorized geriatric patients with MRNs, care settings, and birth dates. | `search` *(optional)* | Minimal synthetic identifiers only. |
| `get_patient_medications` | Retrieves active medication regimen for a patient record. | `patientId` *(required)*, `confirmedOnly` *(default: true)* | Flags unverified medications with warning notices. |
| `parse_prescription` | Processes a prescription image (PNG/JPEG/WEBP) or PDF via local OCR. | `filePath` *(required)*, `patientId` *(optional)* | Confined to `data/`; path traversal attacks are blocked. Returns candidate status only. |
| `get_interaction_report` | Runs deterministic PK/PD evaluation against active meds, labs, and diagnoses. | `patientId` *(required)* | Identifies duplicate active ingredients, severe DDIs, and organ clearance gaps. |
| `get_clinical_evidence` | Retrieves authentic clinical trial citations and guidelines for an ingredient pair or finding. | `ingredientPair` or `findingId` | Never invents citations or clinical literature. |
| `propose_medication_schedule` | Generates a 24-hour draft timetable resolving food/fasting and interval constraints. | `patientId` *(required)* | 100% dose/formulation preservation; draft-only watermark. |
| `get_review_status` | Summarizes workflow orchestration state, unconfirmed orders, and high-priority action items. | `patientId` *(required)* | Explicitly identifies pending clinical confirmations. |
| `confirm_medication` | Clinician-authorized state change marking an order as verified clinical truth. | `medicationId`, `actor`, `confirmationToken`, `justification` | Guarded by `"CONFIRM_MUTATION"`; records audit log. |
| `get_patient_review_report` | Compiles a full consolidated clinical dossier for multidisciplinary review. | `patientId` *(required)* | Structured report with data gaps, conflicts, and provenance. |

---

### Windows Claude Desktop Configuration Guide

To connect Claude Desktop on Windows to the Polypharmacy Coordinator MCP Server:

1. Open your Claude Desktop configuration file located at:
   `%APPDATA%\Claude\claude_desktop_config.json`
   *(e.g., `C:\Users\<username>\AppData\Roaming\Claude\claude_desktop_config.json`)*

2. Add the `polypharmacy-coordinator` server definition using either the **pre-built bundle** (recommended) or the **direct TypeScript execution**:

#### Option A: Pre-built Bundle (Recommended)
First build the production bundle:
```bash
npm run build:mcp
```
Then configure `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "polypharmacy-coordinator": {
      "command": "node",
      "args": [
        "C:\\Users\\music\\OneDrive\\Desktop\\Polypharmacy Drug-Interaction & Chrono-Dosing Coordinator\\mcp-server\\dist\\index.js"
      ]
    }
  }
}
```

#### Option B: Direct TypeScript Execution (Development)
```json
{
  "mcpServers": {
    "polypharmacy-coordinator": {
      "command": "node",
      "args": [
        "C:\\Users\\music\\OneDrive\\Desktop\\Polypharmacy Drug-Interaction & Chrono-Dosing Coordinator\\node_modules\\tsx\\dist\\cli.mjs",
        "C:\\Users\\music\\OneDrive\\Desktop\\Polypharmacy Drug-Interaction & Chrono-Dosing Coordinator\\mcp-server\\src\\index.ts"
      ]
    }
  }
}
```

3. Restart Claude Desktop. The hammer/tools icon will display all 9 registered clinical tools.

---

### Example Interaction Prompts for Claude Desktop

Once connected, you can prompt Claude to coordinate clinical decision-support:

- **Patient Overview**:  
  *"List all patients currently managed by the Polypharmacy Coordinator and check their care settings."*

- **Interaction & Clearance Analysis**:  
  *"Run an interaction report for Arthur Pendelton. Are there any contraindicated drug combinations or missing renal measurements?"*

- **Circadian Optimization**:  
  *"Margaret Chen takes levothyroxine and calcium carbonate. Propose a draft circadian schedule and verify that their administration times are separated."*

- **Authentic Evidence Lookup**:  
  *"Retrieve the clinical evidence citation for the interaction between apixaban and clarithromycin from the reference database."*

- **Prescription Intake**:  
  *"Parse the local prescription document at `data/test-fixtures/synthetic-rx.png` and report any Look-Alike / Sound-Alike (LASA) warnings."*

- **Clinical Order Confirmation**:  
  *"Confirm the unverified medication order for Eleanor Vance after reviewing her discharge summary, using confirmation token CONFIRM_MUTATION."*

---

### Troubleshooting Windows Claude Desktop Integration

- **MCP Server Fails to Launch**: Verify that Node.js is on your Windows PATH (`node -v` in PowerShell). Double-check that Windows backslashes in `claude_desktop_config.json` are escaped as double backslashes (`\\\\`).
- **Path Traversal Errors on Prescription Parsing**: The MCP server restricts file paths to the application repository boundary. Prescription images should be placed within the `data/` directory.
- **Unverified Records Warning**: If Claude reports an interaction or schedule gap, check `get_review_status` to see if preliminary intake orders require clinician verification via `confirm_medication`.
