import {
  type ConfirmIdentityReadingInput,
  type FinalIdentityPayload,
  type NormalizedExtractionPayload,
  type RawModelExtractionPayload,
  DEFAULT_DOCUMENT_TYPE,
} from '../../../types/identity-reading';
import { formatControllerErrorResponse } from './errors';

const COMPARABLE_FIELDS = [
  'run',
  'givenNames',
  'surnames',
  'fullName',
  'documentNumber',
  'birthDate',
  'expiryDate',
  'sex',
  'nationality',
] as const;

const toNullableString = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const normalizedValue = String(value).trim();
  return normalizedValue.length > 0 ? normalizedValue : null;
};

const normalizeInlineWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

const normalizeMultilineText = (value: string): string =>
  value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');

const toTitleCase = (value: string): string =>
  value
    .toLocaleLowerCase('es-CL')
    .replace(/(^|[\s'-]+)(\p{L})/gu, (match, prefix: string, letter: string) =>
      `${prefix}${letter.toLocaleUpperCase('es-CL')}`,
    );

const uniqueWarnings = (warnings: Array<string | null | undefined>): string[] =>
  [...new Set(warnings.map((warning) => warning?.trim()).filter((warning): warning is string => Boolean(warning)))];

const normalizeName = (value: unknown): string | null => {
  const stringValue = toNullableString(value);

  return stringValue ? toTitleCase(normalizeInlineWhitespace(stringValue)) : null;
};

export const normalizeRun = (value: unknown): string | null => {
  const rawValue = toNullableString(value);

  if (!rawValue) {
    return null;
  }

  const compactValue = rawValue.replace(/[.\s]/g, '').toUpperCase();
  const digits = compactValue.slice(0, -1).replace(/\D/g, '');
  const verifier = compactValue.slice(-1).replace(/[^0-9K]/g, '');

  if (!digits || !verifier) {
    return compactValue;
  }

  return `${digits}-${verifier}`;
};

export const isValidChileanRun = (value: string): boolean => {
  const normalizedValue = normalizeRun(value);

  if (!normalizedValue) {
    return false;
  }

  const [digits, verifier] = normalizedValue.split('-');

  if (!digits || !verifier || !/^\d+$/.test(digits) || !/^[0-9K]$/.test(verifier)) {
    return false;
  }

  let sum = 0;
  let multiplier = 2;

  for (let index = digits.length - 1; index >= 0; index -= 1) {
    sum += Number.parseInt(digits[index], 10) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const remainder = 11 - (sum % 11);
  const expectedVerifier =
    remainder === 11 ? '0' : remainder === 10 ? 'K' : String(remainder);

  return expectedVerifier === verifier;
};

const normalizeDocumentNumber = (value: unknown): string | null => {
  const stringValue = toNullableString(value);

  return stringValue ? normalizeInlineWhitespace(stringValue).toUpperCase() : null;
};

const normalizeNationality = (value: unknown): string | null => {
  const stringValue = toNullableString(value);

  return stringValue ? toTitleCase(normalizeInlineWhitespace(stringValue)) : null;
};

const normalizeSex = (value: unknown): 'M' | 'F' | 'X' | null => {
  const stringValue = toNullableString(value)?.toUpperCase();

  if (!stringValue) {
    return null;
  }

  if (['M', 'MALE', 'MASCULINO', 'HOMBRE'].includes(stringValue)) {
    return 'M';
  }

  if (['F', 'FEMALE', 'FEMENINO', 'MUJER'].includes(stringValue)) {
    return 'F';
  }

  if (['X', 'NO BINARIO', 'OTRO'].includes(stringValue)) {
    return 'X';
  }

  return null;
};

const padDatePart = (value: number): string => value.toString().padStart(2, '0');

const buildIsoDate = (year: number, month: number, day: number): string | null => {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    year < 1900 ||
    year > 2100 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  const candidate = new Date(Date.UTC(year, month - 1, day));

  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null;
  }

  return `${year}-${padDatePart(month)}-${padDatePart(day)}`;
};

const normalizeDateField = (
  value: unknown,
  label: string,
  warnings: string[],
): { value: string | null; raw: string | null } => {
  const rawValue = toNullableString(value);

  if (!rawValue) {
    return {
      value: null,
      raw: null,
    };
  }

  const normalizedValue = rawValue.replace(/\s+/g, '').replace(/\./g, '/').replace(/-/g, '/');

  if (/^\d{4}\/\d{2}\/\d{2}$/.test(normalizedValue)) {
    const [year, month, day] = normalizedValue.split('/').map(Number);
    const isoDate = buildIsoDate(year, month, day);

    if (isoDate) {
      return { value: isoDate, raw: rawValue };
    }
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(normalizedValue)) {
    const [day, month, year] = normalizedValue.split('/').map(Number);
    const isoDate = buildIsoDate(year, month, day);

    if (isoDate) {
      return { value: isoDate, raw: rawValue };
    }
  }

  warnings.push(
    `No fue posible normalizar la ${label}; se mantuvo como referencia textual en el payload de IA.`,
  );

  return {
    value: null,
    raw: rawValue,
  };
};

const normalizeConfidence = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numericValue =
    typeof value === 'number' ? value : Number.parseFloat(String(value).replace(',', '.'));

  if (Number.isNaN(numericValue)) {
    return null;
  }

  if (numericValue >= 0 && numericValue <= 1) {
    return Number(numericValue.toFixed(4));
  }

  if (numericValue > 1 && numericValue <= 100) {
    return Number((numericValue / 100).toFixed(4));
  }

  return null;
};

const buildFullName = (givenNames: string | null, surnames: string | null): string | null => {
  const fullName = [givenNames, surnames].filter(Boolean).join(' ').trim();
  return fullName || null;
};

export const normalizeExtractionPayload = (
  payload: RawModelExtractionPayload,
): NormalizedExtractionPayload => {
  const warnings = uniqueWarnings(payload.warnings ?? []);
  const run = normalizeRun(payload.run);
  const givenNames = normalizeName(payload.givenNames);
  const surnames = normalizeName(payload.surnames);
  const inferredFullName = buildFullName(givenNames, surnames);
  const birthDate = normalizeDateField(payload.birthDate, 'fecha de nacimiento', warnings);
  const expiryDate = normalizeDateField(payload.expiryDate, 'fecha de vencimiento', warnings);
  const documentType = toNullableString(payload.documentType) ?? DEFAULT_DOCUMENT_TYPE;

  if (documentType !== DEFAULT_DOCUMENT_TYPE) {
    warnings.push(
      `El modelo reportó documentType="${documentType}". La POC está optimizada sólo para cédula chilena frontal.`,
    );
  }

  if (run && !isValidChileanRun(run)) {
    warnings.push('El RUN detectado no pasó la validación de dígito verificador.');
  }

  const normalizedSex = normalizeSex(payload.sex);
  if (toNullableString(payload.sex) && !normalizedSex) {
    warnings.push('No fue posible normalizar el sexo detectado.');
  }

  return {
    documentType: DEFAULT_DOCUMENT_TYPE,
    run,
    givenNames,
    surnames,
    fullName: normalizeName(payload.fullName) ?? inferredFullName,
    documentNumber: normalizeDocumentNumber(payload.documentNumber),
    birthDate: birthDate.value,
    birthDateRaw: birthDate.raw,
    expiryDate: expiryDate.value,
    expiryDateRaw: expiryDate.raw,
    sex: normalizedSex,
    nationality: normalizeNationality(payload.nationality),
    rawVisibleText: payload.rawVisibleText
      ? normalizeMultilineText(String(payload.rawVisibleText))
      : null,
    confidence: normalizeConfidence(payload.confidence),
    warnings: uniqueWarnings(warnings),
  };
};

export const normalizeConfirmPayload = (
  input: ConfirmIdentityReadingInput,
): FinalIdentityPayload => {
  const warnings: string[] = [];
  const run = normalizeRun(input.run);

  if (run && !isValidChileanRun(run)) {
    throw formatControllerErrorResponse.validation(
      'El RUN confirmado no es válido. Revisa el dígito verificador.',
      { run },
    );
  }

  const birthDate = normalizeDateField(input.birthDate, 'fecha de nacimiento', warnings);
  const expiryDate = normalizeDateField(input.expiryDate, 'fecha de vencimiento', warnings);

  if (input.birthDate && !birthDate.value) {
    throw formatControllerErrorResponse.validation(
      'La fecha de nacimiento debe enviarse en formato YYYY-MM-DD.',
      { birthDate: input.birthDate },
    );
  }

  if (input.expiryDate && !expiryDate.value) {
    throw formatControllerErrorResponse.validation(
      'La fecha de vencimiento debe enviarse en formato YYYY-MM-DD.',
      { expiryDate: input.expiryDate },
    );
  }

  const sex = normalizeSex(input.sex);
  if (toNullableString(input.sex) && !sex) {
    throw formatControllerErrorResponse.validation(
      'El campo sexo debe ser M, F o X.',
      { sex: input.sex },
    );
  }

  const givenNames = normalizeName(input.givenNames);
  const surnames = normalizeName(input.surnames);

  return {
    run,
    givenNames,
    surnames,
    fullName: normalizeName(input.fullName) ?? buildFullName(givenNames, surnames),
    documentNumber: normalizeDocumentNumber(input.documentNumber),
    birthDate: birthDate.value,
    expiryDate: expiryDate.value,
    sex,
    nationality: normalizeNationality(input.nationality),
    reviewNotes: toNullableString(input.reviewNotes),
  };
};

const pickComparablePayload = (
  payload: Partial<NormalizedExtractionPayload | FinalIdentityPayload> | null | undefined,
) =>
  COMPARABLE_FIELDS.reduce<Record<string, string | null>>((accumulator, fieldName) => {
    accumulator[fieldName] = (payload?.[fieldName] as string | null | undefined) ?? null;
    return accumulator;
  }, {});

export const arePayloadsEquivalent = (
  extractedPayload: Partial<NormalizedExtractionPayload>,
  finalPayload: FinalIdentityPayload,
): boolean =>
  JSON.stringify(pickComparablePayload(extractedPayload)) ===
  JSON.stringify(pickComparablePayload(finalPayload));

export const sanitizeFinalPayloadForStorage = (
  payload: FinalIdentityPayload,
): Record<string, string | null> => ({
  run: payload.run,
  givenNames: payload.givenNames,
  surnames: payload.surnames,
  fullName: payload.fullName,
  documentNumber: payload.documentNumber,
  birthDate: payload.birthDate,
  expiryDate: payload.expiryDate,
  sex: payload.sex,
  nationality: payload.nationality,
  reviewNotes: payload.reviewNotes,
});
