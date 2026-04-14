/**
 * identity-reading controller
 */

import { factories } from '@strapi/strapi';

import {
  type IdentityReadingListItem,
  type IdentityReadingDetailItem,
  type IdentityReadingExtractResponse,
  type IdentityReadingModelsResponse,
  type IdentityReadingPurgeResponse,
  type IdentityReadingPromptResponse,
  IDENTITY_READING_UID,
} from '../../../types/identity-reading';
import {
  formatControllerErrorResponse,
  isIdentityReadingError,
} from '../utils/errors';

const parseNumericId = (rawId: string): number => {
  const parsedId = Number.parseInt(rawId, 10);

  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    throw formatControllerErrorResponse.validation('El identificador del registro no es válido.', {
      id: rawId,
    });
  }

  return parsedId;
};

export default factories.createCoreController(IDENTITY_READING_UID, ({ strapi }) => ({
  async find(ctx) {
    try {
      const service = strapi.service(IDENTITY_READING_UID);
      const data = (await service.listReadings()) as IdentityReadingListItem[];

      ctx.body = {
        data,
        meta: {
          total: data.length,
        },
      };
    } catch (error) {
      if (isIdentityReadingError(error)) {
        ctx.status = error.status;
        ctx.body = error.toResponseBody();
        return;
      }

      throw error;
    }
  },

  async findOne(ctx) {
    try {
      const service = strapi.service(IDENTITY_READING_UID);
      const data = (await service.getReadingById(parseNumericId(ctx.params.id))) as IdentityReadingDetailItem;

      ctx.body = { data };
    } catch (error) {
      if (isIdentityReadingError(error)) {
        ctx.status = error.status;
        ctx.body = error.toResponseBody();
        return;
      }

      throw error;
    }
  },

  async extract(ctx) {
    try {
      const service = strapi.service(IDENTITY_READING_UID);
      const response = (await service.extractFromRequest(
        ctx.request.files,
        (ctx.request.body ?? {}) as Record<string, unknown>,
      )) as IdentityReadingExtractResponse;

      ctx.status = 201;
      ctx.body = {
        data: response,
      };
    } catch (error) {
      if (isIdentityReadingError(error)) {
        ctx.status = error.status;
        ctx.body = error.toResponseBody();
        return;
      }

      throw error;
    }
  },

  async models(ctx) {
    try {
      const service = strapi.service(IDENTITY_READING_UID);
      const data = (await service.listAvailableModels()) as IdentityReadingModelsResponse;

      ctx.body = { data };
    } catch (error) {
      if (isIdentityReadingError(error)) {
        ctx.status = error.status;
        ctx.body = error.toResponseBody();
        return;
      }

      throw error;
    }
  },

  async prompt(ctx) {
    try {
      const service = strapi.service(IDENTITY_READING_UID);
      const data = (await service.getExtractionPrompt()) as IdentityReadingPromptResponse;

      ctx.body = { data };
    } catch (error) {
      if (isIdentityReadingError(error)) {
        ctx.status = error.status;
        ctx.body = error.toResponseBody();
        return;
      }

      throw error;
    }
  },

  async purge(ctx) {
    try {
      const service = strapi.service(IDENTITY_READING_UID);
      const requestInput = {
        ...((ctx.request.query ?? {}) as Record<string, unknown>),
        ...((ctx.request.body ?? {}) as Record<string, unknown>),
      };
      const data = (await service.purgeAllReadings(
        requestInput,
      )) as IdentityReadingPurgeResponse;

      ctx.body = { data };
    } catch (error) {
      if (isIdentityReadingError(error)) {
        ctx.status = error.status;
        ctx.body = error.toResponseBody();
        return;
      }

      throw error;
    }
  },

  async confirm(ctx) {
    try {
      const service = strapi.service(IDENTITY_READING_UID);
      const data = (await service.confirmReading(parseNumericId(ctx.params.id), ctx.request.body ?? {})) as IdentityReadingDetailItem;

      ctx.body = { data };
    } catch (error) {
      if (isIdentityReadingError(error)) {
        ctx.status = error.status;
        ctx.body = error.toResponseBody();
        return;
      }

      throw error;
    }
  },
}));
