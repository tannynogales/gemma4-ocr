import { execFile } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  type IdentityReadingPromptResponse,
  type IdentityReadingModelsResponse,
  type LmStudioModelOption,
  type LmStudioResult,
  type RawModelExtractionPayload,
  DEFAULT_DOCUMENT_TYPE,
} from '../types/identity-reading';
import { formatControllerErrorResponse } from '../api/identity-reading/utils/errors';

const execFileAsync = promisify(execFile);

const SYSTEM_PROMPT = `
Eres un extractor OCR estricto para la cara frontal de una cédula de identidad chilena.
Analiza sólo la imagen proporcionada.
Devuelve únicamente JSON válido y parseable.
No uses markdown.
No uses bloques de código.
No agregues texto antes ni después del JSON.
No incluyas comentarios dentro del JSON.
No inventes datos.
Si un campo no es legible o no aparece, usa null.
Si sospechas baja calidad o ambigüedad, agrégalo en warnings.
Debes distinguir RUN de documentNumber.
Las fechas deben venir en formato YYYY-MM-DD cuando sea posible.
Si no puedes normalizar una fecha, devuelve el texto legible original.
`;

const USER_PROMPT = `
Extrae la información visible de la cédula de identidad adjunta y devuelve exactamente este JSON:
{
  "documentType": "${DEFAULT_DOCUMENT_TYPE}",
  "run": null,
  "givenNames": null,
  "surnames": null,
  "fullName": null,
  "documentNumber": null,
  "birthDate": null,
  "expiryDate": null,
  "sex": null,
  "nationality": null,
  "warnings": []
}

Reglas de mapeo:
- documentType debe ser "${DEFAULT_DOCUMENT_TYPE}".
- run es el RUN principal de la cédula, normalmente visible en la parte inferior izquierda y con dígito verificador.
- documentNumber es el valor asociado a "NUMERO DOCUMENTO" o "NÚMERO DOCUMENTO" y no debe confundirse con el RUN.
- Nunca copies el RUN en documentNumber.
- givenNames corresponde a NOMBRES.
- surnames corresponde a APELLIDOS.
- fullName debe ser la concatenación de givenNames y surnames.
- birthDate y expiryDate deben venir en formato YYYY-MM-DD.
- Si la fecha visible está en formato textual como "14 ABR 1988", conviértela a "1988-04-14".
- Si un valor es ambiguo, devuelve null en ese campo y explica la ambigüedad en warnings.
`;

const RECOVERY_SYSTEM_PROMPT = `
Eres un extractor OCR estricto para la cara frontal de una cédula de identidad chilena.
Analiza sólo la imagen proporcionada.
Devuelve únicamente JSON válido y parseable.
No uses markdown.
No uses bloques de código.
No agregues texto antes ni después del JSON.
No incluyas comentarios dentro del JSON.
No inventes datos.
Si un campo no es legible o ambiguo, usa null.
`;

const stripTrailingSlash = (value: string): string => value.replace(/\/+$/, '');
const getBaseUrl = (): string =>
  stripTrailingSlash(process.env.LM_STUDIO_BASE_URL?.trim() || 'http://localhost:1234/v1');

const getDefaultModelName = (): string =>
  process.env.LM_STUDIO_MODEL?.trim() || 'google/gemma-4-e2b';

const getResponseUrl = (): string => `${getBaseUrl()}/chat/completions`;
const getModelsUrl = (): string => `${getBaseUrl()}/models`;

export const getLmStudioPromptDefinition = (): IdentityReadingPromptResponse => ({
  endpoint: getResponseUrl(),
  defaultModelName: getDefaultModelName(),
  documentType: DEFAULT_DOCUMENT_TYPE,
  systemPrompt: SYSTEM_PROMPT.trim(),
  userPrompt: USER_PROMPT.trim(),
});

const normalizePromptSegment = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : fallback;
};

export const resolveLmStudioPromptDefinition = (
  overrides: {
    systemPrompt?: unknown;
    userPrompt?: unknown;
  } = {},
): IdentityReadingPromptResponse => {
  const defaultPromptDefinition = getLmStudioPromptDefinition();

  return {
    ...defaultPromptDefinition,
    systemPrompt: normalizePromptSegment(
      overrides.systemPrompt,
      defaultPromptDefinition.systemPrompt,
    ),
    userPrompt: normalizePromptSegment(overrides.userPrompt, defaultPromptDefinition.userPrompt),
  };
};

const prettifyModelLabel = (modelId: string): string => {
  const normalizedId = modelId.split('/').pop() ?? modelId;

  return normalizedId
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
};

const isEmbeddingsModel = (modelId: string): boolean =>
  /(embed|embedding)/i.test(modelId);

const toFallbackModelList = (): IdentityReadingModelsResponse => {
  const defaultModelName = getDefaultModelName();

  return {
    defaultModelName,
    models: [
      {
        id: defaultModelName,
        label: prettifyModelLabel(defaultModelName),
        ownedBy: null,
        isDefault: true,
      },
    ],
  };
};

const extractJsonCandidate = (value: string): string => {
  const fencedJsonMatch = value.match(/```json\s*([\s\S]*?)```/i);

  if (fencedJsonMatch?.[1]) {
    return fencedJsonMatch[1].trim();
  }

  const startIndex = value.indexOf('{');

  if (startIndex === -1) {
    throw formatControllerErrorResponse.badGateway(
      'LM Studio respondió, pero no entregó un JSON utilizable.',
      {
        rawResponse: value,
      },
    );
  }

  return value.slice(startIndex).trim();
};

const repairTruncatedJson = (value: string): string | null => {
  const trimmedValue = value.trim();

  if (!trimmedValue.startsWith('{')) {
    return null;
  }

  const closingStack: string[] = [];
  let insideString = false;
  let isEscaped = false;

  for (const character of trimmedValue) {
    if (insideString) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (character === '\\') {
        isEscaped = true;
        continue;
      }

      if (character === '"') {
        insideString = false;
      }

      continue;
    }

    if (character === '"') {
      insideString = true;
      continue;
    }

    if (character === '{') {
      closingStack.push('}');
      continue;
    }

    if (character === '[') {
      closingStack.push(']');
      continue;
    }

    if (character === '}' || character === ']') {
      const expectedClosingCharacter = closingStack.pop();

      if (expectedClosingCharacter !== character) {
        return null;
      }
    }
  }

  if (insideString || isEscaped) {
    return null;
  }

  return `${trimmedValue}${closingStack.reverse().join('')}`;
};

const extractFirstJsonObject = (value: string): string => {
  const jsonCandidate = extractJsonCandidate(value);
  const endIndex = jsonCandidate.lastIndexOf('}');

  if (endIndex !== -1) {
    return jsonCandidate.slice(0, endIndex + 1);
  }

  const repairedJson = repairTruncatedJson(jsonCandidate);

  if (repairedJson) {
    return repairedJson;
  }

  throw formatControllerErrorResponse.badGateway(
    'LM Studio respondió, pero no entregó un JSON utilizable.',
    {
      rawResponse: value,
      reason: 'MODEL_RETURNED_TRUNCATED_JSON',
    },
  );
};

const parseModelPayload = (value: string): RawModelExtractionPayload => {
  const jsonString = extractFirstJsonObject(value);

  try {
    return JSON.parse(jsonString) as RawModelExtractionPayload;
  } catch (error) {
    throw formatControllerErrorResponse.badGateway(
      'LM Studio devolvió contenido que no pudo parsearse como JSON.',
      {
        rawResponse: value,
        parseError: error instanceof Error ? error.message : 'Unknown parse error',
      },
    );
  }
};

const extractAssistantText = (responseBody: Record<string, unknown>): string => {
  const choices = Array.isArray(responseBody.choices) ? responseBody.choices : [];
  const firstChoice = choices[0] as Record<string, unknown> | undefined;
  const message = firstChoice?.message as Record<string, unknown> | undefined;
  const content = message?.content;

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }

        if (item && typeof item === 'object' && 'text' in item) {
          return String((item as { text?: unknown }).text ?? '');
        }

        return '';
      })
      .join('\n')
      .trim();
  }

  throw formatControllerErrorResponse.badGateway(
    'LM Studio respondió sin contenido de texto interpretable.',
    { responseBody },
  );
};

const getResponseHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const apiKey = process.env.LM_STUDIO_API_KEY?.trim();

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  return headers;
};

const callLmStudioChatCompletions = async (
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<Record<string, unknown>> => {
  const response = await fetch(getResponseUrl(), {
    method: 'POST',
    headers: getResponseHeaders(),
    body: JSON.stringify(body),
    signal,
  });

  const responseBody = (await response.json().catch(() => null)) as Record<string, unknown> | null;

  if (!response.ok) {
    const errorMessage =
      typeof responseBody?.error === 'object' &&
      responseBody.error &&
      'message' in responseBody.error
        ? String((responseBody.error as { message?: unknown }).message ?? '')
        : `LM Studio respondió con estado ${response.status}.`;

    throw formatControllerErrorResponse.badGateway(
      'LM Studio rechazó la solicitud de extracción.',
      {
        status: response.status,
        message: errorMessage,
        responseBody,
      },
    );
  }

  if (!responseBody) {
    throw formatControllerErrorResponse.badGateway(
      'LM Studio no devolvió un cuerpo JSON válido.',
    );
  }

  return responseBody;
};

const supportsJsonObjectResponseFormat = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const maybeDetails = 'details' in error ? (error as { details?: unknown }).details : null;
  const detailsObject =
    maybeDetails && typeof maybeDetails === 'object'
      ? (maybeDetails as Record<string, unknown>)
      : null;
  const responseBody =
    detailsObject?.responseBody && typeof detailsObject.responseBody === 'object'
      ? (detailsObject.responseBody as Record<string, unknown>)
      : null;
  const responseError =
    responseBody?.error && typeof responseBody.error === 'string'
      ? responseBody.error
      : responseBody?.error &&
          typeof responseBody.error === 'object' &&
          'message' in responseBody.error
        ? String((responseBody.error as { message?: unknown }).message ?? '')
        : '';
  const combinedMessage = [error instanceof Error ? error.message : '', responseError]
    .join(' ')
    .toLowerCase();

  return combinedMessage.includes('response_format') || combinedMessage.includes('json_object');
};

export const listLmStudioModels = async (): Promise<IdentityReadingModelsResponse> => {
  const defaultModelName = getDefaultModelName();

  try {
    const response = await fetch(getModelsUrl(), {
      method: 'GET',
      headers: getResponseHeaders(),
    });
    const responseBody = (await response.json().catch(() => null)) as Record<string, unknown> | null;

    if (!response.ok || !responseBody) {
      return toFallbackModelList();
    }

    const rawModels = Array.isArray(responseBody.data) ? responseBody.data : [];
    const models = rawModels
      .map((entry) => {
        const model = entry as Record<string, unknown>;
        const modelId = typeof model.id === 'string' ? model.id.trim() : '';

        if (!modelId || isEmbeddingsModel(modelId)) {
          return null;
        }

        return {
          id: modelId,
          label: prettifyModelLabel(modelId),
          ownedBy: typeof model.owned_by === 'string' ? model.owned_by : null,
          isDefault: modelId === defaultModelName,
        } satisfies LmStudioModelOption;
      })
      .filter((model): model is LmStudioModelOption => Boolean(model))
      .sort((leftModel, rightModel) => {
        if (leftModel.isDefault) {
          return -1;
        }

        if (rightModel.isDefault) {
          return 1;
        }

        return leftModel.label.localeCompare(rightModel.label, 'es');
      });

    if (models.length === 0) {
      return toFallbackModelList();
    }

    if (!models.some((model) => model.id === defaultModelName)) {
      models.unshift({
        id: defaultModelName,
        label: prettifyModelLabel(defaultModelName),
        ownedBy: null,
        isDefault: true,
      });
    }

    return {
      defaultModelName,
      models,
    };
  } catch {
    return toFallbackModelList();
  }
};

export const resolveLmStudioModel = async (requestedModelName: unknown): Promise<string> => {
  const requestedValue =
    typeof requestedModelName === 'string' && requestedModelName.trim().length > 0
      ? requestedModelName.trim()
      : null;

  if (!requestedValue) {
    return getDefaultModelName();
  }

  const { models } = await listLmStudioModels();

  if (models.some((model) => model.id === requestedValue)) {
    return requestedValue;
  }

  throw formatControllerErrorResponse.validation(
    'El modelo seleccionado no está disponible en LM Studio.',
    {
      requestedModelName: requestedValue,
      availableModels: models.map((model) => model.id),
    },
  );
};

const extractPayloadFromImage = async ({
  filepath,
  mimeType,
  modelName,
  systemPrompt,
  userPrompt,
  maxTokens = 1200,
}: {
  filepath: string;
  mimeType: string;
  modelName: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
}): Promise<{
  rawText: string;
  payload: RawModelExtractionPayload;
  usage: Record<string, unknown> | null;
}> => {
  const imageBuffer = await readFile(filepath);
  const timeoutMs = Number.parseInt(process.env.LM_STUDIO_TIMEOUT_MS ?? '90000', 10) || 90000;
  const imageDataUrl = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), timeoutMs);
  const baseRequestBody = {
    model: modelName,
    temperature: 0,
    max_tokens: maxTokens,
    messages: [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: userPrompt,
          },
          {
            type: 'image_url',
            image_url: {
              url: imageDataUrl,
            },
          },
        ],
      },
    ],
  };

  try {
    let responseBody: Record<string, unknown>;

    try {
      responseBody = await callLmStudioChatCompletions(
        {
          ...baseRequestBody,
          response_format: {
            type: 'json_object',
          },
        },
        abortController.signal,
      );
    } catch (error) {
      const shouldRetryWithoutResponseFormat = supportsJsonObjectResponseFormat(error);

      if (!shouldRetryWithoutResponseFormat) {
        throw error;
      }

      responseBody = await callLmStudioChatCompletions(baseRequestBody, abortController.signal);
    }

    const rawText = extractAssistantText(responseBody);
    const payload = parseModelPayload(rawText);
    const usageObject =
      responseBody.usage && typeof responseBody.usage === 'object'
        ? (responseBody.usage as Record<string, unknown>)
        : null;

    return {
      rawText,
      payload,
      usage: usageObject,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw formatControllerErrorResponse.badGateway(
        'LM Studio no respondió antes del timeout configurado.',
        {
          timeoutMs,
          endpoint: getResponseUrl(),
          modelName,
        },
      );
    }

    if (error instanceof Error) {
      throw error;
    }

    throw formatControllerErrorResponse.badGateway(
      'Falló la comunicación con LM Studio.',
      {
        modelName,
      },
    );
  } finally {
    clearTimeout(timeout);
  }
};

const compactIdentifier = (value: string | null | undefined): string =>
  String(value ?? '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '');

const shouldRecoverDocumentNumber = (payload: RawModelExtractionPayload): boolean => {
  const documentNumber = compactIdentifier(
    typeof payload.documentNumber === 'string' ? payload.documentNumber : null,
  );
  const run = compactIdentifier(typeof payload.run === 'string' ? payload.run : null);
  const runDigits = run.slice(0, -1);

  if (!documentNumber) {
    return true;
  }

  return Boolean(run && (documentNumber === run || documentNumber === runDigits));
};

const getImageDimensionsWithSips = async (
  filepath: string,
): Promise<{ width: number; height: number } | null> => {
  try {
    const { stdout } = await execFileAsync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', filepath]);
    const widthMatch = stdout.match(/pixelWidth:\s*(\d+)/);
    const heightMatch = stdout.match(/pixelHeight:\s*(\d+)/);

    if (!widthMatch?.[1] || !heightMatch?.[1]) {
      return null;
    }

    return {
      width: Number.parseInt(widthMatch[1], 10),
      height: Number.parseInt(heightMatch[1], 10),
    };
  } catch {
    return null;
  }
};

const createDocumentNumberCrop = async (filepath: string): Promise<string | null> => {
  const dimensions = await getImageDimensionsWithSips(filepath);

  if (!dimensions) {
    return null;
  }

  const cropHeight = Math.min(
    dimensions.height,
    Math.max(220, Math.round(dimensions.height * 0.29)),
  );
  const cropWidth = Math.min(
    dimensions.width,
    Math.max(360, Math.round(dimensions.width * 0.36)),
  );
  const offsetY = Math.max(
    0,
    Math.min(dimensions.height - cropHeight, Math.round(dimensions.height * 0.38)),
  );
  const offsetX = Math.max(
    0,
    Math.min(dimensions.width - cropWidth, Math.round(dimensions.width * 0.48)),
  );
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'identity-docnum-'));
  const outputPath = path.join(tempDir, 'document-number-crop.jpg');

  try {
    await execFileAsync('sips', [
      '-c',
      String(cropHeight),
      String(cropWidth),
      '--cropOffset',
      String(offsetY),
      String(offsetX),
      filepath,
      '--out',
      outputPath,
    ]);

    return outputPath;
  } catch {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    return null;
  }
};

export const recoverIdentityCardFieldsWithLmStudio = async ({
  filepath,
  mimeType,
  modelName,
  currentPayload,
}: {
  filepath: string;
  mimeType: string;
  modelName: string;
  currentPayload: RawModelExtractionPayload;
}): Promise<{
  payload: Partial<RawModelExtractionPayload>;
  rawText: string;
  usage: Record<string, unknown> | null;
  documentNumberCropRawText?: string | null;
  documentNumberCropUsage?: Record<string, unknown> | null;
} | null> => {
  const needsDocumentNumber = shouldRecoverDocumentNumber(currentPayload);
  const needsNationality =
    currentPayload.nationality === null ||
    currentPayload.nationality === undefined ||
    String(currentPayload.nationality).trim() === '';

  if (!needsDocumentNumber && !needsNationality) {
    return null;
  }

  const recoveryUserPrompt = `
Extrae únicamente los campos faltantes o dudosos de esta cédula y devuelve exactamente este JSON:
{
  "documentNumber": null,
  "nationality": null,
  "warnings": []
}

Reglas:
- documentNumber es el valor visible junto a "NUMERO DOCUMENTO" o "NÚMERO DOCUMENTO".
- documentNumber no puede ser el RUN ni una copia parcial del RUN.
- Si el RUN actual detectado es "${currentPayload.run ?? 'null'}", úsalo sólo para evitar confusiones.
- Conserva el número de documento tal como aparece visible en la cédula.
- nationality es el valor visible junto a "NACIONALIDAD".
- Si no puedes leer con suficiente certeza un campo, devuelve null en ese campo.
`;

  const recovery = await extractPayloadFromImage({
    filepath,
    mimeType,
    modelName,
    systemPrompt: RECOVERY_SYSTEM_PROMPT.trim(),
    userPrompt: recoveryUserPrompt.trim(),
    maxTokens: 400,
  });

  let recoveredDocumentNumber =
    typeof recovery.payload.documentNumber === 'string' || recovery.payload.documentNumber === null
      ? recovery.payload.documentNumber
      : null;
  let documentNumberCropRawText: string | null = null;
  let documentNumberCropUsage: Record<string, unknown> | null = null;

  if (needsDocumentNumber) {
    const mergedDocumentNumberProbe = {
      ...currentPayload,
      documentNumber: recoveredDocumentNumber,
    } satisfies RawModelExtractionPayload;

    if (shouldRecoverDocumentNumber(mergedDocumentNumberProbe)) {
      const cropPath = await createDocumentNumberCrop(filepath);

      if (cropPath) {
        try {
          const cropRecovery = await extractPayloadFromImage({
            filepath: cropPath,
            mimeType: 'image/jpeg',
            modelName,
            systemPrompt: RECOVERY_SYSTEM_PROMPT.trim(),
            userPrompt: `
Devuelve exactamente este JSON:
{
  "documentNumber": null,
  "warnings": []
}

Reglas:
- Este recorte contiene la zona de "NÚMERO DOCUMENTO".
- documentNumber es el valor visible junto a esa etiqueta.
- No es el RUN.
- No es una copia parcial del RUN.
- Si puedes leerlo, conserva los puntos.
- Si no puedes leerlo con certeza, usa null.
`.trim(),
            maxTokens: 250,
          });

          const cropDocumentNumber =
            typeof cropRecovery.payload.documentNumber === 'string' ||
            cropRecovery.payload.documentNumber === null
              ? cropRecovery.payload.documentNumber
              : null;

          if (
            cropDocumentNumber &&
            !shouldRecoverDocumentNumber({
              ...currentPayload,
              documentNumber: cropDocumentNumber,
            })
          ) {
            recoveredDocumentNumber = cropDocumentNumber;
          }

          documentNumberCropRawText = cropRecovery.rawText;
          documentNumberCropUsage = cropRecovery.usage;
        } finally {
          await rm(path.dirname(cropPath), { recursive: true, force: true }).catch(() => undefined);
        }
      }
    }
  }

  return {
    payload: {
      documentNumber: recoveredDocumentNumber,
      nationality:
        typeof recovery.payload.nationality === 'string' || recovery.payload.nationality === null
          ? recovery.payload.nationality
          : null,
      warnings: Array.isArray(recovery.payload.warnings) ? recovery.payload.warnings : [],
    },
    rawText: recovery.rawText,
    usage: recovery.usage,
    documentNumberCropRawText,
    documentNumberCropUsage,
  };
};

export const extractIdentityCardWithLmStudio = async ({
  filepath,
  mimeType,
  modelName,
  promptDefinition,
}: {
  filepath: string;
  mimeType: string;
  modelName: string;
  promptDefinition: Pick<IdentityReadingPromptResponse, 'systemPrompt' | 'userPrompt'>;
}): Promise<LmStudioResult> => {
  const extraction = await extractPayloadFromImage({
    filepath,
    mimeType,
    modelName,
    systemPrompt: promptDefinition.systemPrompt,
    userPrompt: promptDefinition.userPrompt,
  });

  return {
    modelName,
    rawText: extraction.rawText,
    payload: extraction.payload,
    usage: extraction.usage,
  };
};
