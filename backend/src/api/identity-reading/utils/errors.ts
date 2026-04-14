type ErrorDetails = Record<string, unknown> | undefined;

type ErrorResponseBody = {
  data: null;
  error: {
    status: number;
    name: string;
    message: string;
    details: ErrorDetails | null;
  };
};

export class IdentityReadingError extends Error {
  status: number;
  code: string;
  details?: ErrorDetails;

  constructor(status: number, code: string, message: string, details?: ErrorDetails) {
    super(message);
    this.name = code;
    this.code = code;
    this.status = status;
    this.details = details;
  }

  toResponseBody(): ErrorResponseBody {
    return {
      data: null,
      error: {
        status: this.status,
        name: this.code,
        message: this.message,
        details: this.details ?? null,
      },
    };
  }
}

export const isIdentityReadingError = (value: unknown): value is IdentityReadingError =>
  value instanceof IdentityReadingError;

export const asErrorMessage = (value: unknown): string => {
  if (value instanceof Error) {
    return value.message;
  }

  if (typeof value === 'string') {
    return value;
  }

  return 'Unknown error';
};

export const formatControllerErrorResponse = {
  validation: (message: string, details?: ErrorDetails) =>
    new IdentityReadingError(400, 'IDENTITY_READING_VALIDATION_ERROR', message, details),
  notFound: (message: string, details?: ErrorDetails) =>
    new IdentityReadingError(404, 'IDENTITY_READING_NOT_FOUND', message, details),
  payloadTooLarge: (message: string, details?: ErrorDetails) =>
    new IdentityReadingError(413, 'IDENTITY_READING_FILE_TOO_LARGE', message, details),
  badGateway: (message: string, details?: ErrorDetails) =>
    new IdentityReadingError(502, 'IDENTITY_READING_LM_STUDIO_ERROR', message, details),
  internal: (message: string, details?: ErrorDetails) =>
    new IdentityReadingError(500, 'IDENTITY_READING_INTERNAL_ERROR', message, details),
};
