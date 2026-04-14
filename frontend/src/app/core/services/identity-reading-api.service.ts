import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { catchError, map, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  type AvailableOcrModel,
  type ConfirmIdentityReadingPayload,
  type IdentityReadingDetail,
  type IdentityReadingExtractResponse,
  type IdentityReadingMedia,
  type IdentityReadingModelsResponse,
  type IdentityReadingPurgeResponse,
  type IdentityReadingPromptResponse,
  type IdentityReadingSummary,
  ApiRequestError,
} from '../models/identity-reading.models';

type ApiEnvelope<T> = {
  data: T;
};

type ServerErrorBody = {
  error?: {
    status?: number;
    name?: string;
    message?: string;
    details?: Record<string, unknown> | null;
  };
};

@Injectable({
  providedIn: 'root',
})
export class IdentityReadingApiService {
  private readonly httpClient = inject(HttpClient);
  private readonly apiBaseUrl = environment.apiBaseUrl.replace(/\/+$/, '');
  private readonly apiUrl = `${this.apiBaseUrl}/api`;

  extract(
    file: File,
    modelName: string,
    promptOverride?: Pick<IdentityReadingPromptResponse, 'systemPrompt' | 'userPrompt'> | null,
  ) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('modelName', modelName);

    if (promptOverride) {
      formData.append('systemPrompt', promptOverride.systemPrompt);
      formData.append('userPrompt', promptOverride.userPrompt);
    }

    return this.httpClient
      .post<ApiEnvelope<IdentityReadingExtractResponse>>(
        `${this.apiUrl}/identity-readings/extract`,
        formData,
      )
      .pipe(
        map((response) => ({
          ...response.data,
          image: this.normalizeMedia(response.data.image),
        })),
        catchError((error) => throwError(() => this.mapHttpError(error))),
      );
  }

  listModels() {
    return this.httpClient
      .get<ApiEnvelope<IdentityReadingModelsResponse>>(`${this.apiUrl}/identity-readings/models`)
      .pipe(
        map((response) => ({
          defaultModelName: response.data.defaultModelName,
          models: response.data.models as AvailableOcrModel[],
        })),
        catchError((error) => throwError(() => this.mapHttpError(error))),
      );
  }

  getPrompt() {
    return this.httpClient
      .get<ApiEnvelope<IdentityReadingPromptResponse>>(`${this.apiUrl}/identity-readings/prompt`)
      .pipe(
        map((response) => response.data),
        catchError((error) => throwError(() => this.mapHttpError(error))),
      );
  }

  purgeAllReadings(confirmationText: string) {
    const params = new HttpParams().set('confirmationText', confirmationText);

    return this.httpClient
      .delete<ApiEnvelope<IdentityReadingPurgeResponse>>(`${this.apiUrl}/identity-readings/purge`, {
        params,
      })
      .pipe(
        map((response) => response.data),
        catchError((error) => throwError(() => this.mapHttpError(error))),
      );
  }

  confirm(id: number, payload: ConfirmIdentityReadingPayload) {
    return this.httpClient
      .post<ApiEnvelope<IdentityReadingDetail>>(
        `${this.apiUrl}/identity-readings/${id}/confirm`,
        payload,
      )
      .pipe(
        map((response) => this.normalizeDetail(response.data)),
        catchError((error) => throwError(() => this.mapHttpError(error))),
      );
  }

  listReadings() {
    return this.httpClient
      .get<{ data: IdentityReadingSummary[] }>(`${this.apiUrl}/identity-readings`)
      .pipe(
        map((response) =>
          response.data.map((reading) => ({
            ...reading,
            confidence: this.normalizeConfidence(reading.confidence),
          })),
        ),
        catchError((error) => throwError(() => this.mapHttpError(error))),
      );
  }

  getReading(id: number) {
    return this.httpClient
      .get<ApiEnvelope<IdentityReadingDetail>>(`${this.apiUrl}/identity-readings/${id}`)
      .pipe(
        map((response) => this.normalizeDetail(response.data)),
        catchError((error) => throwError(() => this.mapHttpError(error))),
      );
  }

  toAbsoluteMediaUrl(url: string | null | undefined): string | null {
    if (!url) {
      return null;
    }

    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }

    return `${this.apiBaseUrl}${url}`;
  }

  private normalizeDetail(reading: IdentityReadingDetail): IdentityReadingDetail {
    return {
      ...reading,
      confidence: this.normalizeConfidence(reading.confidence),
      sourceImage: this.normalizeMedia(reading.sourceImage),
    };
  }

  private normalizeMedia(media: IdentityReadingMedia | null): IdentityReadingMedia | null {
    if (!media) {
      return null;
    }

    return {
      ...media,
      absoluteUrl: this.toAbsoluteMediaUrl(media.url),
    };
  }

  private normalizeConfidence(value: number | null): number | null {
    if (typeof value !== 'number') {
      return value;
    }

    return Number(value.toFixed(4));
  }

  private mapHttpError(error: unknown): ApiRequestError {
    if (!(error instanceof HttpErrorResponse)) {
      return new ApiRequestError(500, 'UNEXPECTED_CLIENT_ERROR', 'Ocurrió un error inesperado.');
    }

    const serverBody = error.error as ServerErrorBody | undefined;
    const serverError = serverBody?.error;

    return new ApiRequestError(
      (serverError?.status ?? error.status) || 500,
      serverError?.name ?? 'HTTP_ERROR',
      serverError?.message ?? 'No fue posible completar la solicitud al backend.',
      serverError?.details ?? null,
    );
  }
}
