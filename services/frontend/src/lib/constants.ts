/**
 * Shared constants used across the frontend.
 * Single source of truth for enums, styles, and config values.
 */

// ─── OCR / document processing status ──────────────────────────

export const OCR_STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  processing: "bg-blue-50 text-blue-700 border-blue-200",
  complete: "bg-emerald-50 text-emerald-700 border-emerald-200",
  failed: "bg-red-50 text-red-700 border-red-200",
};

export const OCR_STATUS_COLOR: Record<string, string> = {
  complete: "bg-emerald-500",
  processing: "bg-blue-500",
  pending: "bg-amber-500",
  failed: "bg-red-500",
};

// ─── Document types ────────────────────────────────────────────

export const DOC_TYPES = [
  { value: "maintenance_manual", label: "Maintenance Manual" },
  { value: "spare_parts_catalog", label: "Spare Parts Catalog" },
  { value: "safety_certificate", label: "Safety Certificate" },
  { value: "inspection_report", label: "Inspection Report" },
  { value: "drawing", label: "Technical Drawing" },
  { value: "sds", label: "Safety Data Sheet" },
  { value: "other", label: "Other" },
] as const;

// ─── Vessel types ──────────────────────────────────────────────

export const VESSEL_TYPES = [
  "Bulk Carrier",
  "Container Ship",
  "Tanker",
  "LNG Carrier",
  "Offshore Supply",
  "Tugboat",
  "Passenger",
  "General Cargo",
  "FPSO",
  "Other",
] as const;

// ─── Upload limits ─────────────────────────────────────────────

export const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
export const DIRECT_UPLOAD_LIMIT = 50 * 1024 * 1024; // 50MB
