import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiRequestError, type IdentityReadingSummary } from '../../../core/models/identity-reading.models';
import { IdentityReadingApiService } from '../../../core/services/identity-reading-api.service';
import { StatusBadgeComponent } from '../../../shared/components/status-badge.component';

@Component({
  selector: 'app-history-page',
  standalone: true,
  imports: [DatePipe, RouterLink, StatusBadgeComponent],
  templateUrl: './history-page.component.html',
  styleUrl: './history-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoryPageComponent {
  private readonly apiService = inject(IdentityReadingApiService);
  readonly purgeConfirmationExpected = 'BORRAR TODO';

  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly readings = signal<IdentityReadingSummary[]>([]);
  readonly purgeModalOpen = signal(false);
  readonly purgeConfirmationText = signal('');
  readonly purgeErrorMessage = signal<string | null>(null);
  readonly purging = signal(false);

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);

    try {
      const readings = await firstValueFrom(this.apiService.listReadings());
      this.readings.set(readings);
    } catch (error) {
      this.errorMessage.set(
        error instanceof ApiRequestError
          ? error.message
          : 'No se pudo cargar el historial.',
      );
    } finally {
      this.loading.set(false);
    }
  }

  openPurgeModal(): void {
    this.purgeModalOpen.set(true);
    this.purgeConfirmationText.set('');
    this.purgeErrorMessage.set(null);
  }

  closePurgeModal(): void {
    if (this.purging()) {
      return;
    }

    this.purgeModalOpen.set(false);
    this.purgeConfirmationText.set('');
    this.purgeErrorMessage.set(null);
  }

  onPurgeConfirmationInput(event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    this.purgeConfirmationText.set(inputElement.value);
    this.purgeErrorMessage.set(null);
  }

  async purgeAll(): Promise<void> {
    if (this.purging()) {
      return;
    }

    this.purging.set(true);
    this.purgeErrorMessage.set(null);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    try {
      const response = await firstValueFrom(
        this.apiService.purgeAllReadings(this.purgeConfirmationText()),
      );

      this.readings.set([]);
      this.successMessage.set(
        `Se eliminaron ${response.deletedReadings} registros y ${response.deletedFiles} archivos.`,
      );
      this.purgeModalOpen.set(false);
      this.purgeConfirmationText.set('');
      this.purgeErrorMessage.set(null);
    } catch (error) {
      const message =
        error instanceof ApiRequestError ? error.message : 'No se pudo borrar el historial.';

      this.purgeErrorMessage.set(message);
    } finally {
      this.purging.set(false);
    }
  }

  displayName(reading: IdentityReadingSummary): string {
    return (
      reading.fullName ??
      ([reading.givenNames, reading.surnames].filter(Boolean).join(' ') || 'Sin nombre detectado')
    );
  }
}
