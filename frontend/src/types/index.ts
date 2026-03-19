// StacksCare shared TypeScript types

export type RecordType =
  | "consultation"
  | "lab_result"
  | "prescription"
  | "imaging"
  | "other";

/** Mirrors the Clarity health-record tuple returned by get-record */
export interface HealthRecord {
  recordId: number;
  owner: string;
  ipfsHash: string;
  recordType: RecordType;
  timestamp: number;
}

/** A doctor/address that has been granted access to a specific record */
export interface AccessGrant {
  recordId: number;
  doctor: string;
  grantedAt?: number;
}

/** AI analysis response from the backend */
export interface AnalysisResult {
  success: boolean;
  analysis: string;
  model?: string;
}

export const RECORD_TYPE_LABELS: Record<RecordType, string> = {
  consultation: "Consultation",
  lab_result: "Lab Result",
  prescription: "Prescription",
  imaging: "Imaging / X-Ray",
  other: "Other",
};

export const RECORD_TYPE_ICONS: Record<RecordType, string> = {
  consultation: "🩺",
  lab_result: "🧪",
  prescription: "💊",
  imaging: "🩻",
  other: "📋",
};
