export type IdentityReadingStatus =
  | 'draft_extracted'
  | 'reviewed_confirmed'
  | 'reviewed_corrected'
  | 'extraction_failed';

export type IdentityReadingSex = 'M' | 'F' | 'X' | null;

export interface IdentityReadingMedia {
  id: number | null;
  documentId: string | null;
  name: string | null;
  mime: string | null;
  url: string | null;
  alternativeText: string | null;
  absoluteUrl: string | null;
}

export interface ExtractedIdentityPayload {
  documentType: string;
  run: string | null;
  givenNames: string | null;
  surnames: string | null;
  fullName: string | null;
  documentNumber: string | null;
  birthDate: string | null;
  birthDateRaw: string | null;
  expiryDate: string | null;
  expiryDateRaw: string | null;
  sex: IdentityReadingSex;
  nationality: string | null;
  rawVisibleText: string | null;
  confidence: number | null;
  warnings: string[];
}

export interface ConfirmIdentityReadingPayload {
  run: string | null;
  givenNames: string | null;
  surnames: string | null;
  fullName: string | null;
  documentNumber: string | null;
  birthDate: string | null;
  expiryDate: string | null;
  sex: IdentityReadingSex;
  nationality: string | null;
  reviewNotes: string | null;
}

export interface IdentityReadingSummary {
  id: number;
  documentId: string;
  status: IdentityReadingStatus;
  run: string | null;
  givenNames: string | null;
  surnames: string | null;
  fullName: string | null;
  documentNumber: string | null;
  createdAt: string;
  updatedAt: string;
  confidence: number | null;
  modelName: string;
}

export interface IdentityReadingDetail extends IdentityReadingSummary {
  birthDate: string | null;
  expiryDate: string | null;
  sex: IdentityReadingSex;
  nationality: string | null;
  rawVisibleText: string | null;
  warnings: string[];
  reviewNotes: string | null;
  sourceImage: IdentityReadingMedia | null;
  promptSnapshot: IdentityReadingPromptSnapshot | null;
  aiExtractedPayload: Record<string, unknown> | null;
  finalPayload: Record<string, unknown> | null;
}

export interface IdentityReadingExtractResponse {
  id: number;
  status: IdentityReadingStatus;
  modelName: string;
  image: IdentityReadingMedia | null;
  extractedPayload: ExtractedIdentityPayload;
  warnings: string[];
}

export interface AvailableOcrModel {
  id: string;
  label: string;
  ownedBy: string | null;
  isDefault: boolean;
}

export interface IdentityReadingModelsResponse {
  defaultModelName: string;
  models: AvailableOcrModel[];
}

export interface IdentityReadingPromptResponse {
  endpoint: string;
  defaultModelName: string;
  documentType: string;
  systemPrompt: string;
  userPrompt: string;
}

export interface IdentityReadingPromptSnapshot extends IdentityReadingPromptResponse {
  selectedModelName: string;
}

export interface IdentityReadingPurgeResponse {
  deletedReadings: number;
  deletedFiles: number;
}

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> | null = null,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}
