import path from 'node:path';

import type { File as FormidableFile } from 'formidable';

import { formatControllerErrorResponse } from './errors';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png'] as const;
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png'] as const;

const normalizeFileCollection = (files: unknown): FormidableFile[] => {
  if (!files || typeof files !== 'object') {
    return [];
  }

  const fileMap = files as Record<string, unknown>;

  return Object.values(fileMap).flatMap((value) => {
    if (Array.isArray(value)) {
      return value as FormidableFile[];
    }

    return value ? [value as FormidableFile] : [];
  });
};

export const getFirstUploadedFile = (files: unknown): FormidableFile => {
  const uploadedFiles = normalizeFileCollection(files);
  const [file] = uploadedFiles;

  if (!file) {
    throw formatControllerErrorResponse.validation(
      'Debes enviar una imagen de la cédula en el campo multipart.',
    );
  }

  return file;
};

export const validateUploadedImageFile = (
  file: FormidableFile,
  maxUploadSizeBytes: number,
): void => {
  const declaredMimeType = String(file.mimetype ?? '').toLowerCase();
  const fileName = String(file.originalFilename ?? 'upload');
  const extension = path.extname(fileName).toLowerCase();

  if (file.size > maxUploadSizeBytes) {
    throw formatControllerErrorResponse.payloadTooLarge(
      `La imagen supera el tamaño máximo permitido de ${Math.round(
        maxUploadSizeBytes / (1024 * 1024),
      )} MB.`,
      {
        size: file.size,
        maxUploadSizeBytes,
      },
    );
  }

  if (!ALLOWED_MIME_TYPES.includes(declaredMimeType as (typeof ALLOWED_MIME_TYPES)[number])) {
    throw formatControllerErrorResponse.validation(
      'Sólo se permiten archivos JPG o PNG.',
      {
        mimetype: declaredMimeType,
        allowedMimeTypes: ALLOWED_MIME_TYPES,
      },
    );
  }

  if (!ALLOWED_EXTENSIONS.includes(extension as (typeof ALLOWED_EXTENSIONS)[number])) {
    throw formatControllerErrorResponse.validation(
      'La extensión del archivo no es válida. Usa .jpg, .jpeg o .png.',
      {
        filename: fileName,
        extension,
        allowedExtensions: ALLOWED_EXTENSIONS,
      },
    );
  }
};
