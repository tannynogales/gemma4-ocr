export const IDENTITY_READING_UID = 'api::identity-reading.identity-reading';
export const DEFAULT_DOCUMENT_TYPE = 'chile_identity_card_front';

export type IdentityReadingStatus =
  | 'draft_extracted'
  | 'reviewed_confirmed'
  | 'reviewed_corrected'
  | 'extraction_failed';

export type IdentityReadingSex = 'M' | 'F' | 'X' | null;

export interface RawModelExtractionPayload {
  documentType?: string | null;
  run?: string | null;
  givenNames?: string | null;
  surnames?: string | null;
  fullName?: string | null;
  documentNumber?: string | null;
  birthDate?: string | null;
  expiryDate?: string | null;
  sex?: string | null;
  nationality?: string | null;
  rawVisibleText?: string | null;
  confidence?: number | string | null;
  warnings?: string[] | null;
  [key: string]: unknown;
}

export interface NormalizedExtractionPayload {
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

export interface ConfirmIdentityReadingInput {
  run?: string | null;
  givenNames?: string | null;
  surnames?: string | null;
  fullName?: string | null;
  documentNumber?: string | null;
  birthDate?: string | null;
  expiryDate?: string | null;
  sex?: string | null;
  nationality?: string | null;
  reviewNotes?: string | null;
}

export interface FinalIdentityPayload {
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

export interface IdentityReadingMediaSummary {
  id: number | null;
  documentId: string | null;
  name: string | null;
  mime: string | null;
  url: string | null;
  alternativeText: string | null;
}

export interface IdentityReadingListItem {
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

export interface IdentityReadingDetailItem extends IdentityReadingListItem {
  birthDate: string | null;
  expiryDate: string | null;
  sex: IdentityReadingSex;
  nationality: string | null;
  rawVisibleText: string | null;
  warnings: string[];
  reviewNotes: string | null;
  sourceImage: IdentityReadingMediaSummary | null;
  promptSnapshot: IdentityReadingPromptSnapshot | null;
  aiExtractedPayload: Record<string, unknown> | null;
  finalPayload: Record<string, unknown> | null;
}

export interface IdentityReadingExtractResponse {
  id: number;
  status: IdentityReadingStatus;
  modelName: string;
  image: IdentityReadingMediaSummary | null;
  extractedPayload: NormalizedExtractionPayload;
  warnings: string[];
}

export interface LmStudioModelOption {
  id: string;
  label: string;
  ownedBy: string | null;
  isDefault: boolean;
}

export interface IdentityReadingModelsResponse {
  defaultModelName: string;
  models: LmStudioModelOption[];
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

export interface IdentityReadingDocument {
  id: number;
  documentId: string;
  run: string | null;
  givenNames: string | null;
  surnames: string | null;
  fullName: string | null;
  documentNumber: string | null;
  birthDate: string | null;
  expiryDate: string | null;
  sex: IdentityReadingSex;
  nationality: string | null;
  rawVisibleText: string | null;
  modelName: string;
  promptSnapshot?: IdentityReadingPromptSnapshot | null;
  confidence: number | null;
  status: IdentityReadingStatus;
  warnings: string[] | null;
  reviewNotes: string | null;
  sourceImage?: unknown;
  aiExtractedPayload?: Record<string, unknown> | null;
  finalPayload?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface LmStudioResult {
  modelName: string;
  rawText: string;
  payload: RawModelExtractionPayload;
  usage: Record<string, unknown> | null;
}
