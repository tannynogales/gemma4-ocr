/**
 * identity-reading service
 */

import { factories } from '@strapi/strapi';

import type { File as FormidableFile } from 'formidable';

import {
  type ConfirmIdentityReadingInput,
  type FinalIdentityPayload,
  type IdentityReadingDetailItem,
  type IdentityReadingExtractResponse,
  type IdentityReadingListItem,
  type IdentityReadingModelsResponse,
  type IdentityReadingPurgeResponse,
  type IdentityReadingPromptSnapshot,
  type IdentityReadingPromptResponse,
  type NormalizedExtractionPayload,
  type RawModelExtractionPayload,
  type IdentityReadingDocument,
  type IdentityReadingStatus,
  IDENTITY_READING_UID,
} from '../../../types/identity-reading';
import {
  extractIdentityCardWithLmStudio,
  getLmStudioPromptDefinition,
  listLmStudioModels,
  recoverIdentityCardFieldsWithLmStudio,
  resolveLmStudioModel,
  resolveLmStudioPromptDefinition,
} from '../../../services/lm-studio-service';
import {
  IdentityReadingError,
  asErrorMessage,
  formatControllerErrorResponse,
} from '../utils/errors';
import {
  getFirstUploadedFile,
  validateUploadedImageFile,
} from '../utils/file';
import {
  arePayloadsEquivalent,
  normalizeConfirmPayload,
  normalizeExtractionPayload,
  sanitizeFinalPayloadForStorage,
} from '../utils/normalizers';

type UploadFileEntity = {
  id: number;
  documentId?: string;
  url?: string | null;
  name?: string | null;
  mime?: string | null;
};

const PURGE_CONFIRMATION_TEXT = 'BORRAR TODO';

const buildImageAlternativeText = (): string => {
  const now = new Date().toISOString();
  return `Imagen frontal de cédula chilena cargada el ${now}`;
};

const safeJsonObject = (value: unknown): Record<string, unknown> | null => {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
};

const toMediaSummary = (media: unknown) => {
  const mediaObject = safeJsonObject(media);

  if (!mediaObject) {
    return null;
  }

  return {
    id: typeof mediaObject.id === 'number' ? mediaObject.id : null,
    documentId: typeof mediaObject.documentId === 'string' ? mediaObject.documentId : null,
    name: typeof mediaObject.name === 'string' ? mediaObject.name : null,
    mime: typeof mediaObject.mime === 'string' ? mediaObject.mime : null,
    url: typeof mediaObject.url === 'string' ? mediaObject.url : null,
    alternativeText:
      typeof mediaObject.alternativeText === 'string' ? mediaObject.alternativeText : null,
  };
};

const normalizeConfidenceValue = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsedValue = Number.parseFloat(value);
    return Number.isNaN(parsedValue) ? null : parsedValue;
  }

  return null;
};

const toPromptSnapshot = (value: unknown): IdentityReadingPromptSnapshot | null => {
  const promptSnapshot = safeJsonObject(value);

  if (!promptSnapshot) {
    return null;
  }

  return promptSnapshot as unknown as IdentityReadingPromptSnapshot;
};

const mapReadingToListItem = (reading: IdentityReadingDocument): IdentityReadingListItem => ({
  id: reading.id,
  documentId: reading.documentId,
  status: reading.status,
  run: reading.run,
  givenNames: reading.givenNames,
  surnames: reading.surnames,
  fullName: reading.fullName,
  documentNumber: reading.documentNumber,
  createdAt: reading.createdAt,
  updatedAt: reading.updatedAt,
  confidence: normalizeConfidenceValue(reading.confidence),
  modelName: reading.modelName,
});

const mapReadingToDetailItem = (reading: IdentityReadingDocument): IdentityReadingDetailItem => ({
  ...mapReadingToListItem(reading),
  birthDate: reading.birthDate,
  expiryDate: reading.expiryDate,
  sex: reading.sex,
  nationality: reading.nationality,
  rawVisibleText: reading.rawVisibleText,
  warnings: Array.isArray(reading.warnings) ? reading.warnings.filter(Boolean) : [],
  reviewNotes: reading.reviewNotes,
  sourceImage: toMediaSummary(reading.sourceImage),
  promptSnapshot: toPromptSnapshot(reading.promptSnapshot),
  aiExtractedPayload: safeJsonObject(reading.aiExtractedPayload),
  finalPayload: safeJsonObject(reading.finalPayload),
});

const buildPromptSnapshot = (
  modelName: string,
  promptDefinition: IdentityReadingPromptResponse,
): IdentityReadingPromptSnapshot => {
  return {
    ...promptDefinition,
    selectedModelName: modelName,
  };
};

const buildDraftData = (
  uploadedFile: UploadFileEntity,
  normalizedPayload: NormalizedExtractionPayload,
  rawModelPayload: RawModelExtractionPayload,
  rawResponseText: string,
  modelName: string,
  promptSnapshot: IdentityReadingPromptSnapshot,
  usage: Record<string, unknown> | null,
  recovery:
    | {
        payload: Partial<RawModelExtractionPayload>;
        rawText: string;
        usage: Record<string, unknown> | null;
      }
    | null = null,
) => ({
  sourceImage: uploadedFile.id,
  run: normalizedPayload.run,
  givenNames: normalizedPayload.givenNames,
  surnames: normalizedPayload.surnames,
  fullName: normalizedPayload.fullName,
  documentNumber: normalizedPayload.documentNumber,
  birthDate: normalizedPayload.birthDate,
  expiryDate: normalizedPayload.expiryDate,
  sex: normalizedPayload.sex,
  nationality: normalizedPayload.nationality,
  rawVisibleText: normalizedPayload.rawVisibleText,
  modelName,
  promptSnapshot,
  confidence: normalizedPayload.confidence,
  status: 'draft_extracted' as IdentityReadingStatus,
  warnings: normalizedPayload.warnings,
  aiExtractedPayload: {
    rawModelPayload,
    normalizedPayload,
    rawResponseText,
    usage,
    recovery,
  },
  finalPayload: null,
});

const buildFailedData = (
  uploadedFile: UploadFileEntity,
  modelName: string,
  promptSnapshot: IdentityReadingPromptSnapshot,
  error: IdentityReadingError,
) => ({
  sourceImage: uploadedFile.id,
  modelName,
  promptSnapshot,
  status: 'extraction_failed' as IdentityReadingStatus,
  reviewNotes: error.message,
  warnings: [],
  aiExtractedPayload: {
    error: {
      code: error.code,
      message: error.message,
      details: error.details ?? null,
    },
  },
  finalPayload: null,
});

export default factories.createCoreService(IDENTITY_READING_UID, ({ strapi }) => {
  const documents = () => strapi.documents(IDENTITY_READING_UID);

  const uploadImage = async (file: FormidableFile): Promise<UploadFileEntity> => {
    const apiUploadFolderService = strapi.plugin('upload').service('api-upload-folder');
    const uploadService = strapi.plugin('upload').service('upload');
    const apiUploadFolder = await apiUploadFolderService.getAPIUploadFolder();

    const [uploadedFile] = (await uploadService.upload({
      data: {
        fileInfo: {
          alternativeText: buildImageAlternativeText(),
          folder: apiUploadFolder.id,
        },
      },
      files: file,
    })) as UploadFileEntity[];

    if (!uploadedFile?.id) {
      throw formatControllerErrorResponse.internal(
        'No fue posible guardar la imagen en Strapi.',
      );
    }

    return uploadedFile;
  };

  const getReadingDocumentById = async (id: number): Promise<IdentityReadingDocument> => {
    const reading = (await documents().findFirst({
      filters: {
        id: {
          $eq: id,
        },
      },
      populate: {
        sourceImage: true,
      },
    })) as unknown as IdentityReadingDocument | null;

    if (!reading) {
      throw formatControllerErrorResponse.notFound('No se encontró el registro solicitado.', {
        id,
      });
    }

    return reading;
  };

  const getReadingsWithImages = async (): Promise<IdentityReadingDocument[]> => {
    return (await documents().findMany({
      fields: ['documentId'],
      populate: {
        sourceImage: true,
      },
      sort: {
        createdAt: 'desc',
      },
    })) as unknown as IdentityReadingDocument[];
  };

  return {
    async listReadings(): Promise<IdentityReadingListItem[]> {
      const readings = (await documents().findMany({
        fields: [
          'run',
          'givenNames',
          'surnames',
          'fullName',
          'documentNumber',
          'status',
          'confidence',
          'modelName',
          'createdAt',
          'updatedAt',
        ],
        sort: {
          createdAt: 'desc',
        },
      })) as IdentityReadingDocument[];

      return readings.map(mapReadingToListItem);
    },

    async getReadingById(id: number): Promise<IdentityReadingDetailItem> {
      const reading = await getReadingDocumentById(id);
      return mapReadingToDetailItem(reading);
    },

    async listAvailableModels(): Promise<IdentityReadingModelsResponse> {
      return listLmStudioModels();
    },

    async getExtractionPrompt(): Promise<IdentityReadingPromptResponse> {
      return getLmStudioPromptDefinition();
    },

    async purgeAllReadings(input: Record<string, unknown> = {}): Promise<IdentityReadingPurgeResponse> {
      const confirmationText =
        typeof input.confirmationText === 'string' ? input.confirmationText.trim() : '';

      if (confirmationText !== PURGE_CONFIRMATION_TEXT) {
        throw formatControllerErrorResponse.validation(
          `Para borrar todo el historial debes escribir exactamente "${PURGE_CONFIRMATION_TEXT}".`,
          {
            expectedConfirmationText: PURGE_CONFIRMATION_TEXT,
          },
        );
      }

      const readings = await getReadingsWithImages();
      const uploadService = strapi.plugin('upload').service('upload');
      const fileIds = new Set<number>();
      let deletedFiles = 0;

      for (const reading of readings) {
        const sourceImage = safeJsonObject(reading.sourceImage);
        const fileId = typeof sourceImage?.id === 'number' ? sourceImage.id : null;

        if (!fileId || fileIds.has(fileId)) {
          continue;
        }

        fileIds.add(fileId);
      }

      for (const fileId of fileIds) {
        const file = await uploadService.findOne(fileId);

        if (!file) {
          continue;
        }

        await uploadService.remove(file);
        deletedFiles += 1;
      }

      for (const reading of readings) {
        await documents().delete({
          documentId: reading.documentId,
        });
      }

      return {
        deletedReadings: readings.length,
        deletedFiles,
      };
    },

    async extractFromRequest(
      files: unknown,
      body: Record<string, unknown> = {},
    ): Promise<IdentityReadingExtractResponse> {
      const file = getFirstUploadedFile(files);
      const maxUploadSizeBytes =
        (Number.parseInt(process.env.MAX_UPLOAD_SIZE_MB ?? '8', 10) || 8) * 1024 * 1024;

      validateUploadedImageFile(file, maxUploadSizeBytes);

      const uploadedFile = await uploadImage(file);
      const modelName = await resolveLmStudioModel(body.modelName);
      const promptDefinition = resolveLmStudioPromptDefinition({
        systemPrompt: body.systemPrompt,
        userPrompt: body.userPrompt,
      });
      const promptSnapshot = buildPromptSnapshot(modelName, promptDefinition);

      try {
        const extraction = await extractIdentityCardWithLmStudio({
          filepath: file.filepath,
          mimeType: file.mimetype ?? 'application/octet-stream',
          modelName,
          promptDefinition,
        });
        const recovery = await recoverIdentityCardFieldsWithLmStudio({
          filepath: file.filepath,
          mimeType: file.mimetype ?? 'application/octet-stream',
          modelName,
          currentPayload: extraction.payload,
        });
        const mergedRawPayload: RawModelExtractionPayload = {
          ...extraction.payload,
          ...(recovery?.payload ?? {}),
        };
        const normalizedPayload = normalizeExtractionPayload(mergedRawPayload);
        const createdReading = (await documents().create({
          data: buildDraftData(
            uploadedFile,
            normalizedPayload,
            mergedRawPayload,
            extraction.rawText,
            extraction.modelName,
            promptSnapshot,
            extraction.usage,
            recovery,
          ) as any,
          populate: {
            sourceImage: true,
          },
        })) as unknown as IdentityReadingDocument;

        return {
          id: createdReading.id,
          status: createdReading.status,
          modelName: extraction.modelName,
          image: toMediaSummary(createdReading.sourceImage),
          extractedPayload: normalizedPayload,
          warnings: normalizedPayload.warnings,
        };
      } catch (error) {
        const normalizedError =
          error instanceof IdentityReadingError
            ? error
            : formatControllerErrorResponse.badGateway(
                'La extracción con LM Studio falló.',
                {
                  cause: asErrorMessage(error),
                },
              );

        try {
          const failedReading = (await documents().create({
            data: buildFailedData(uploadedFile, modelName, promptSnapshot, normalizedError) as any,
            populate: {
              sourceImage: true,
            },
          })) as unknown as IdentityReadingDocument;

          normalizedError.details = {
            ...(normalizedError.details ?? {}),
            readingId: failedReading.id,
          };
        } catch (persistenceError) {
          strapi.log.error('Failed to persist extraction_failed record', {
            error: asErrorMessage(persistenceError),
          });
        }

        throw normalizedError;
      }
    },

    async confirmReading(
      id: number,
      input: Record<string, unknown>,
    ): Promise<IdentityReadingDetailItem> {
      const existingReading = await getReadingDocumentById(id);

      if (existingReading.status === 'extraction_failed') {
        throw formatControllerErrorResponse.validation(
          'No se puede confirmar un registro cuya extracción falló.',
          { id },
        );
      }

      const normalizedFinalPayload = normalizeConfirmPayload(
        input as ConfirmIdentityReadingInput,
      );
      const aiNormalizedPayload = safeJsonObject(existingReading.aiExtractedPayload)?.normalizedPayload as
        | NormalizedExtractionPayload
        | undefined;
      const nextStatus: IdentityReadingStatus =
        aiNormalizedPayload && arePayloadsEquivalent(aiNormalizedPayload, normalizedFinalPayload)
          ? 'reviewed_confirmed'
          : 'reviewed_corrected';

      const updatedReading = (await documents().update({
        documentId: existingReading.documentId,
        data: {
          run: normalizedFinalPayload.run,
          givenNames: normalizedFinalPayload.givenNames,
          surnames: normalizedFinalPayload.surnames,
          fullName: normalizedFinalPayload.fullName,
          documentNumber: normalizedFinalPayload.documentNumber,
          birthDate: normalizedFinalPayload.birthDate,
          expiryDate: normalizedFinalPayload.expiryDate,
          sex: normalizedFinalPayload.sex,
          nationality: normalizedFinalPayload.nationality,
          reviewNotes: normalizedFinalPayload.reviewNotes,
          rawVisibleText: existingReading.rawVisibleText,
          finalPayload: sanitizeFinalPayloadForStorage(normalizedFinalPayload),
          status: nextStatus,
        } as any,
        populate: {
          sourceImage: true,
        },
      })) as unknown as IdentityReadingDocument | null;

      if (!updatedReading) {
        throw formatControllerErrorResponse.internal(
          'No fue posible actualizar el registro confirmado.',
          { id },
        );
      }

      return mapReadingToDetailItem(updatedReading);
    },
  };
});
