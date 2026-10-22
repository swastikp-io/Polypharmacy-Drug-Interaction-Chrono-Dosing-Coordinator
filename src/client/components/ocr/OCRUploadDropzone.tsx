import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  FileText,
  FileUp,
  Image as ImageIcon,
  Lock,
  Sparkles,
  Upload,
} from 'lucide-react';

interface OCRUploadDropzoneProps {
  onFileUpload: (file: File) => void;
  onSyntheticPresetSelect: (presetKey: string) => void;
  isLoading: boolean;
}

export const SYNTHETIC_PRESCRIPTION_PRESETS = [
  {
    key: 'standard_polypharmacy',
    title: 'Printed Geriatric Polypharmacy Order',
    badge: 'Clean Scan',
    badgeColor: 'bg-emerald-100 text-emerald-800',
    description: 'Dr. Patel prescription for Metformin XR 500mg, Lisinopril 10mg, and Amlodipine 5mg.',
    text: `===PRESCRIPTION_START===
Memorial Geriatric Health Clinic
Dr. Robert Patel, MD - NPI: 1827492011
Date: 2026-10-15
Patient: Eleanor Vance | MRN: SYNTH-84920 | DOB: 1948-03-14

1. Glucophage XR (Metformin Hydrochloride) 500 mg
   Extended-Release Tablet
   Sig: Take 1 tablet by mouth twice daily with morning and evening meals.
   Disp: #60 (Sixty) Refills: 3

2. Prinivil (Lisinopril) 10 mg
   Oral Tablet
   Sig: Take 1 tablet by mouth once daily in the morning with water.
   Disp: #30 (Thirty) Refills: 3

3. Norvasc (Amlodipine Besylate) 5 mg
   Oral Tablet
   Sig: Take 1 tablet by mouth once daily in the morning.
   Disp: #30 (Thirty) Refills: 3
===PRESCRIPTION_END===`,
  },
  {
    key: 'duplicate_apap_hazard',
    title: 'Discharge Oxycodone/APAP Order',
    badge: 'Duplicate Ingredient Risk',
    badgeColor: 'bg-red-100 text-red-800',
    description: 'Post-op knee discharge order containing Acetaminophen, hazardous if patient takes Tylenol.',
    text: `===PRESCRIPTION_START===
Valley Orthopedic Surgical Pavilion
Dr. Linda Chen, MD (Orthopedic Surgery)
Date: 2026-10-18
Patient: Eleanor Vance | MRN: SYNTH-84920

Rx: Percocet 5/325 (Oxycodone Hydrochloride and Acetaminophen 5 mg / 325 mg)
Oral Tablet
Sig: Take 1 tablet by mouth every 6 hours as needed for severe breakthrough surgical pain.
Warning: Contains acetaminophen. Do not exceed 3000mg cumulative APAP per 24 hours.
Disp: #20 (Twenty) Refills: 0
===PRESCRIPTION_END===`,
  },
  {
    key: 'lasa_ambiguity',
    title: 'Look-Alike / Sound-Alike (LASA) Order',
    badge: 'LASA Critical Warning',
    badgeColor: 'bg-purple-100 text-purple-800',
    description: 'Celexa 20mg order with potential confusion against Celebrex or Zyprexa.',
    text: `===PRESCRIPTION_START===
Senior Behavioral Health Associates
Dr. Arthur Miller, MD
Date: 2026-10-12
Patient: Margaret Chen | MRN: SYNTH-92841

Rx: Celexa 20 mg
Oral Tablet
Sig: Take 1 tablet by mouth once daily in the morning with food.
Disp: #30 (Thirty) Refills: 2
===PRESCRIPTION_END===`,
  },
  {
    key: 'missing_dose',
    title: 'Incomplete Prescription (Missing Dose)',
    badge: 'Missing Dose Hazard',
    badgeColor: 'bg-amber-100 text-amber-800',
    description: 'Prescription text specifies Metformin but omits strength. Tests safety rule: never infer dose.',
    text: `===PRESCRIPTION_START===
Community Family Practice
Dr. James Wilson, MD
Date: 2026-10-01

Rx: Metformin Oral Tablet
Sig: Take 1 tablet by mouth twice daily with meals.
Disp: #60 Refills: 1
===PRESCRIPTION_END===`,
  },
  {
    key: 'missing_unit',
    title: 'Bare Number Order (Missing Unit)',
    badge: 'Missing Unit Hazard',
    badgeColor: 'bg-amber-100 text-amber-800',
    description: 'Specifies "Norvasc 5" without unit (mg). Tests safety rule: unit cannot be assumed.',
    text: `===PRESCRIPTION_START===
Primary Care Clinic
Dr. Sarah Jenkins, MD
Date: 2026-10-05

Rx: Norvasc 5
Sig: Take 1 tablet once daily.
Disp: #30 Refills: 1
===PRESCRIPTION_END===`,
  },
  {
    key: 'degraded_scan',
    title: 'Degraded / Low-Quality Scan',
    badge: 'Low OCR Confidence',
    badgeColor: 'bg-slate-200 text-slate-800',
    description: 'Simulated optical blur, noise, and low resolution triggering field-level confidence warnings.',
    text: `===PRESCRIPTION_START===
Hospital Clinic Low_Quality Scan
Dr. Robert Patel, MD
Rx: Atorvastatin Calcium 20 mg tablet
Sig: Take 1 tablet at bedtime with water??
===PRESCRIPTION_END===`,
  },
];

export const OCRUploadDropzone: React.FC<OCRUploadDropzoneProps> = ({
  onFileUpload,
  onSyntheticPresetSelect,
  isLoading,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateAndHandleFile = (file: File) => {
    setErrorMessage(null);

    const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf'];
    if (!allowedMimes.includes(file.type.toLowerCase())) {
      setErrorMessage(
        `Unsupported document format (${file.type || 'unknown'}). Please upload a PNG, JPEG, WEBP, or PDF file.`
      );
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage('File exceeds the 10 MB maximum size limit.');
      return;
    }

    onFileUpload(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndHandleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndHandleFile(e.target.files[0]);
    }
  };

  return (
    <div className="space-y-5">
      {/* Privacy Guarantee Alert */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 flex items-center gap-3 text-xs text-emerald-900 shadow-xs">
        <span className="p-1.5 bg-emerald-100 rounded-lg text-emerald-700 flex-shrink-0">
          <Lock className="w-4 h-4" aria-hidden="true" />
        </span>
        <div>
          <span className="font-bold">Zero-Cloud Local Privacy Guarantee: </span>
          <span>
            Prescription images and PDFs are processed strictly within your local environment. Documents are never uploaded to any external AI service, cloud OCR, or third-party server.
          </span>
        </div>
      </div>

      {errorMessage && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-900 rounded-xl text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Main Drag & Drop Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
          isDragOver
            ? 'border-clinical-500 bg-clinical-50/70 scale-[1.005]'
            : 'border-slate-300 hover:border-clinical-400 bg-white hover:bg-slate-50/50'
        } ${isLoading ? 'pointer-events-none opacity-60' : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf"
          onChange={handleFileChange}
          className="hidden"
          aria-label="Upload prescription image or PDF file"
        />

        <div className="max-w-md mx-auto space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-clinical-100 text-clinical-600 flex items-center justify-center">
            {isLoading ? (
              <FileUp className="w-6 h-6 animate-bounce" aria-hidden="true" />
            ) : (
              <Upload className="w-6 h-6" aria-hidden="true" />
            )}
          </div>

          <div>
            <h3 className="text-sm font-bold text-slate-900">
              {isLoading ? 'Processing Local OCR Extraction...' : 'Upload Prescription Image or PDF'}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Drag and drop your scan here, or <span className="text-clinical-600 font-semibold underline">browse files</span>
            </p>
          </div>

          <div className="flex items-center justify-center gap-3 text-2xs text-slate-400 font-medium pt-1">
            <span className="flex items-center gap-1">
              <ImageIcon className="w-3.5 h-3.5" aria-hidden="true" />
              <span>PNG, JPEG, WEBP</span>
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <FileText className="w-3.5 h-3.5" aria-hidden="true" />
              <span>PDF Documents</span>
            </span>
            <span>•</span>
            <span>Max 10 MB</span>
          </div>
        </div>
      </div>

      {/* Synthetic Prescription Fixtures Section */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-clinical-600" aria-hidden="true" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
              Or Select a Synthetic Test Prescription Fixture
            </h4>
          </div>
          <span className="text-2xs text-slate-400">Phase 2 Verification Cases</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
          {SYNTHETIC_PRESCRIPTION_PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              disabled={isLoading}
              onClick={() => onSyntheticPresetSelect(preset.key)}
              className="p-3 text-left rounded-xl border border-slate-200 hover:border-clinical-400 bg-slate-50/50 hover:bg-clinical-50/40 transition-all flex flex-col justify-between space-y-2 focus:outline-none focus:ring-2 focus:ring-clinical-500 disabled:opacity-50"
            >
              <div>
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className={`px-2 py-0.5 rounded text-2xs font-bold ${preset.badgeColor}`}>
                    {preset.badge}
                  </span>
                </div>
                <h5 className="text-xs font-bold text-slate-900 line-clamp-1">{preset.title}</h5>
                <p className="text-2xs text-slate-500 mt-1 line-clamp-2">{preset.description}</p>
              </div>

              <div className="text-2xs text-clinical-700 font-semibold pt-1 border-t border-slate-200/60 flex items-center justify-between">
                <span>Load Synthetic Scan &rarr;</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
