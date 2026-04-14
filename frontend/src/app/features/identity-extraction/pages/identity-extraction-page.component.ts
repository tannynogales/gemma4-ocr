import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../../environments/environment';
import {
  ApiRequestError,
  type AvailableOcrModel,
  type ConfirmIdentityReadingPayload,
  type IdentityReadingExtractResponse,
  type IdentityReadingPromptResponse,
} from '../../../core/models/identity-reading.models';
import { IdentityReadingApiService } from '../../../core/services/identity-reading-api.service';
import { ReviewFormComponent } from '../components/review-form.component';

type EditablePromptPayload = Pick<
  IdentityReadingPromptResponse,
  'systemPrompt' | 'userPrompt'
>;

@Component({
  selector: 'app-identity-extraction-page',
  standalone: true,
  imports: [RouterLink, ReviewFormComponent],
  templateUrl: './identity-extraction-page.component.html',
  styleUrl: './identity-extraction-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IdentityExtractionPageComponent {
  private readonly apiService = inject(IdentityReadingApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);

  readonly maxUploadSizeMb = environment.maxUploadSizeMb;
  readonly selectedFile = signal<File | null>(null);
  readonly previewUrl = signal<string | null>(null);
  readonly extracting = signal(false);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly errorHint = signal<string | null>(null);
  readonly errorDetails = signal<string[]>([]);
  readonly errorRawResponse = signal<string | null>(null);
  readonly modelErrorMessage = signal<string | null>(null);
  readonly loadingModels = signal(false);
  readonly availableModels = signal<AvailableOcrModel[]>([]);
  readonly selectedModelName = signal<string | null>(null);
  readonly promptModalOpen = signal(false);
  readonly loadingPrompt = signal(false);
  readonly promptErrorMessage = signal<string | null>(null);
  readonly promptDefinition = signal<IdentityReadingPromptResponse | null>(null);
  readonly promptSystemDraft = signal('');
  readonly promptUserDraft = signal('');
  readonly failedReadingId = signal<number | null>(null);
  readonly currentDraft = signal<IdentityReadingExtractResponse | null>(null);
  readonly selectedModel = computed(() => {
    const selectedModelName = this.selectedModelName();

    return this.availableModels().find((model) => model.id === selectedModelName) ?? null;
  });
  readonly hasCustomPrompt = computed(() => {
    const promptDefinition = this.promptDefinition();

    if (!promptDefinition) {
      return false;
    }

    return (
      this.promptSystemDraft().trim() !== promptDefinition.systemPrompt.trim() ||
      this.promptUserDraft().trim() !== promptDefinition.userPrompt.trim()
    );
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.revokePreviewUrl());
    void this.loadModels();
  }

  onFileSelected(event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    const file = inputElement.files?.[0] ?? null;

    this.resetExtractionError();
    this.currentDraft.set(null);

    if (!file) {
      this.clearFileSelection();
      return;
    }

    if (!['image/jpeg', 'image/jpg', 'image/png'].includes(file.type)) {
      this.errorMessage.set('Sólo se permiten archivos JPG o PNG.');
      this.clearFileSelection();
      return;
    }

    if (file.size > this.maxUploadSizeMb * 1024 * 1024) {
      this.errorMessage.set(
        `La imagen supera el máximo permitido de ${this.maxUploadSizeMb} MB.`,
      );
      this.clearFileSelection();
      return;
    }

    this.selectedFile.set(file);
    this.setPreviewUrl(URL.createObjectURL(file));
  }

  onModelSelected(event: Event): void {
    const selectElement = event.target as HTMLSelectElement;
    const modelName = selectElement.value.trim();

    this.resetExtractionError();
    this.selectedModelName.set(modelName || null);
  }

  async loadModels(): Promise<void> {
    if (this.loadingModels()) {
      return;
    }

    this.loadingModels.set(true);
    this.modelErrorMessage.set(null);

    try {
      const response = await firstValueFrom(this.apiService.listModels());
      const currentSelection = this.selectedModelName();
      const nextSelection =
        (currentSelection &&
          response.models.some((model) => model.id === currentSelection) &&
          currentSelection) ||
        response.models.find((model) => model.isDefault)?.id ||
        response.defaultModelName ||
        response.models[0]?.id ||
        null;

      this.availableModels.set(response.models);
      this.selectedModelName.set(nextSelection);
    } catch (error) {
      this.availableModels.set([]);
      this.selectedModelName.set(null);

      if (error instanceof ApiRequestError) {
        this.modelErrorMessage.set(error.message);
      } else {
        this.modelErrorMessage.set(
          'No fue posible obtener los modelos disponibles desde el backend.',
        );
      }
    } finally {
      this.loadingModels.set(false);
    }
  }

  async openPromptModal(): Promise<void> {
    this.promptModalOpen.set(true);

    if (this.promptDefinition() || this.loadingPrompt()) {
      return;
    }

    this.loadingPrompt.set(true);
    this.promptErrorMessage.set(null);

    try {
      const response = await firstValueFrom(this.apiService.getPrompt());
      this.promptDefinition.set(response);
      this.promptSystemDraft.set(response.systemPrompt);
      this.promptUserDraft.set(response.userPrompt);
    } catch (error) {
      if (error instanceof ApiRequestError) {
        this.promptErrorMessage.set(error.message);
      } else {
        this.promptErrorMessage.set('No fue posible cargar el prompt desde el backend.');
      }
    } finally {
      this.loadingPrompt.set(false);
    }
  }

  closePromptModal(): void {
    this.promptModalOpen.set(false);
  }

  onSystemPromptInput(event: Event): void {
    const textArea = event.target as HTMLTextAreaElement;
    this.promptSystemDraft.set(textArea.value);
  }

  onUserPromptInput(event: Event): void {
    const textArea = event.target as HTMLTextAreaElement;
    this.promptUserDraft.set(textArea.value);
  }

  resetPromptToOriginal(): void {
    const promptDefinition = this.promptDefinition();

    if (!promptDefinition) {
      return;
    }

    this.promptSystemDraft.set(promptDefinition.systemPrompt);
    this.promptUserDraft.set(promptDefinition.userPrompt);
  }

  async extract(): Promise<void> {
    const file = this.selectedFile();
    const modelName = this.selectedModelName();

    if (!file || this.extracting()) {
      return;
    }

    if (!modelName) {
      this.errorMessage.set('Selecciona un modelo disponible antes de extraer.');
      return;
    }

    this.resetExtractionError();
    const promptOverride = this.buildPromptOverride();

    if (this.promptDefinition() && !promptOverride) {
      return;
    }

    this.extracting.set(true);
    this.currentDraft.set(null);

    try {
      const response = await firstValueFrom(
        this.apiService.extract(file, modelName, promptOverride),
      );
      this.currentDraft.set(response);
    } catch (error) {
      this.handleApiError(error);
    } finally {
      this.extracting.set(false);
    }
  }

  async confirm(payload: ConfirmIdentityReadingPayload): Promise<void> {
    const draft = this.currentDraft();

    if (!draft || this.saving()) {
      return;
    }

    this.saving.set(true);
    this.errorMessage.set(null);

    try {
      const savedReading = await firstValueFrom(this.apiService.confirm(draft.id, payload));
      await this.router.navigate(['/historial', savedReading.id], {
        state: { flashMessage: 'Registro guardado correctamente.' },
      });
    } catch (error) {
      this.handleApiError(error);
    } finally {
      this.saving.set(false);
    }
  }

  retryExtraction(): void {
    this.currentDraft.set(null);
    void this.extract();
  }

  private clearFileSelection(): void {
    this.selectedFile.set(null);
    this.currentDraft.set(null);
    this.revokePreviewUrl();
  }

  private setPreviewUrl(url: string): void {
    this.revokePreviewUrl();
    this.previewUrl.set(url);
  }

  private revokePreviewUrl(): void {
    const currentPreviewUrl = this.previewUrl();

    if (currentPreviewUrl) {
      URL.revokeObjectURL(currentPreviewUrl);
    }

    this.previewUrl.set(null);
  }

  private resetExtractionError(): void {
    this.errorMessage.set(null);
    this.errorHint.set(null);
    this.errorDetails.set([]);
    this.errorRawResponse.set(null);
    this.failedReadingId.set(null);
  }

  private buildPromptOverride(): EditablePromptPayload | null {
    const promptDefinition = this.promptDefinition();

    if (!promptDefinition) {
      return null;
    }

    const systemPrompt = this.promptSystemDraft().trim();
    const userPrompt = this.promptUserDraft().trim();

    if (!systemPrompt || !userPrompt) {
      this.errorMessage.set('El prompt no puede quedar vacío.');
      this.errorHint.set('Usa "Reset al original" para recuperar el prompt base.');
      return null;
    }

    return {
      systemPrompt,
      userPrompt,
    };
  }

  private buildErrorHint(
    error: ApiRequestError,
    upstreamMessage: string | null,
    rawResponse: string | null,
  ): string | null {
    const normalizedUpstreamMessage = upstreamMessage?.toLowerCase() ?? '';

    if (normalizedUpstreamMessage.includes('load') || normalizedUpstreamMessage.includes('loading')) {
      return 'LM Studio todavía está cargando el modelo. Espera a que llegue a 100% y reintenta.';
    }

    if (typeof error.details?.['timeoutMs'] === 'number') {
      return 'LM Studio tardó demasiado en responder. Reintenta o prueba con un modelo más liviano.';
    }

    if (rawResponse && !rawResponse.trim().endsWith('}')) {
      return 'El modelo respondió, pero dejó el JSON incompleto. Suele pasar cuando el modelo aún se está estabilizando o cuando este modelo no mantiene bien el formato.';
    }

    if (error.status === 502) {
      return 'El backend sí alcanzó a LM Studio, pero la respuesta no fue utilizable. Si vuelve a pasar, prueba con google/gemma-4-e2b.';
    }

    return null;
  }

  private extractUpstreamMessage(details: Record<string, unknown> | null): string | null {
    if (!details) {
      return null;
    }

    if (typeof details['message'] === 'string' && details['message'].trim().length > 0) {
      return details['message'];
    }

    const responseBody = details['responseBody'];

    if (!responseBody || typeof responseBody !== 'object') {
      return null;
    }

    const upstreamError = (responseBody as Record<string, unknown>)['error'];

    if (typeof upstreamError === 'string' && upstreamError.trim().length > 0) {
      return upstreamError;
    }

    if (upstreamError && typeof upstreamError === 'object') {
      const message = (upstreamError as Record<string, unknown>)['message'];
      return typeof message === 'string' && message.trim().length > 0 ? message : null;
    }

    return null;
  }

  private handleApiError(error: unknown): void {
    if (error instanceof ApiRequestError) {
      this.errorMessage.set(error.message);

      const readingId = Number(error.details?.['readingId']);
      const rawResponse =
        typeof error.details?.['rawResponse'] === 'string'
          ? error.details['rawResponse'].slice(0, 1200)
          : null;
      const upstreamMessage = this.extractUpstreamMessage(error.details);
      const detailLines: string[] = [
        `Estado HTTP: ${error.status}`,
        `Código: ${error.code}`,
      ];

      if (this.selectedModelName()) {
        detailLines.push(`Modelo solicitado: ${this.selectedModelName()}`);
      }

      if (upstreamMessage) {
        detailLines.push(`LM Studio: ${upstreamMessage}`);
      }

      if (typeof error.details?.['parseError'] === 'string') {
        detailLines.push(`Parseo JSON: ${error.details['parseError']}`);
      }

      if (typeof error.details?.['timeoutMs'] === 'number') {
        detailLines.push(`Timeout configurado: ${error.details['timeoutMs']} ms`);
      }

      if (Array.isArray(error.details?.['availableModels'])) {
        detailLines.push(
          `Modelos visibles: ${(error.details?.['availableModels'] as unknown[]).join(', ')}`,
        );
      }

      if (typeof error.details?.['reason'] === 'string') {
        detailLines.push(`Motivo técnico: ${error.details['reason']}`);
      }

      this.errorHint.set(this.buildErrorHint(error, upstreamMessage, rawResponse));
      this.errorDetails.set(detailLines);
      this.errorRawResponse.set(rawResponse);
      this.failedReadingId.set(Number.isInteger(readingId) ? readingId : null);
      return;
    }

    this.errorMessage.set('Ocurrió un error inesperado al comunicarse con el backend.');
  }
}
