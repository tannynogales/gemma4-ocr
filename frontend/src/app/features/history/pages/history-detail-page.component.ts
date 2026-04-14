import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe, JsonPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiRequestError, type IdentityReadingDetail } from '../../../core/models/identity-reading.models';
import { IdentityReadingApiService } from '../../../core/services/identity-reading-api.service';
import { StatusBadgeComponent } from '../../../shared/components/status-badge.component';

type DetailHelpTopicKey =
  | 'summary'
  | 'confidence'
  | 'warnings'
  | 'promptSnapshot'
  | 'systemPrompt'
  | 'userPrompt'
  | 'aiPayload'
  | 'finalPayload'
  | 'rawVisibleText';

type DetailHelpTopic = {
  title: string;
  paragraphs: string[];
};

const DETAIL_HELP_TOPICS: Record<DetailHelpTopicKey, DetailHelpTopic> = {
  summary: {
    title: 'Resumen',
    paragraphs: [
      'Este bloque muestra los campos principales del registro tal como quedaron guardados en la ficha.',
      'Incluye datos como RUN, número de documento, fechas, sexo, nacionalidad, modelo usado y confianza detectada.',
    ],
  },
  confidence: {
    title: 'Confianza',
    paragraphs: [
      'La confianza es el score que el modelo devolvió para indicar qué tan seguro cree estar de la extracción.',
      'El backend normaliza ese valor a escala 0-1. Si el modelo envía un número entre 0 y 1, se guarda tal cual; si envía un número entre 1 y 100, se divide por 100.',
      'En esta pantalla se muestra como porcentaje. Por ejemplo, 1.0 se ve como 100% y 0.82 se ve como 82%.',
      'No es una garantía de exactitud ni reemplaza la revisión humana. Es una señal orientativa del modelo, no una validación real contra ground truth.',
    ],
  },
  warnings: {
    title: 'Warnings',
    paragraphs: [
      'Son advertencias generadas durante la extracción.',
      'Pueden venir del modelo o agregarse en backend cuando la POC detecta problemas como RUN inválido, fechas no normalizables o un tipo de documento distinto al esperado.',
    ],
  },
  promptSnapshot: {
    title: 'Configuración final usada',
    paragraphs: [
      'Este bloque muestra el snapshot exacto de la configuración usada en esta extracción.',
      'Incluye los prompts y también parámetros como temperature, max tokens y recovery pass.',
      'Si comparas esta POC con una prueba manual en LM Studio, recuerda que la POC puede haber hecho más de una llamada: pase principal, recovery y crop del número de documento.',
    ],
  },
  systemPrompt: {
    title: 'System Prompt',
    paragraphs: [
      'Es la instrucción general de comportamiento que Strapi le envía al modelo.',
      'Le indica el formato de salida esperado y cómo debe comportarse frente a ambigüedad o campos faltantes.',
    ],
  },
  userPrompt: {
    title: 'User Prompt',
    paragraphs: [
      'Es la tarea concreta que se le pide al modelo en esta POC.',
      'Define qué campos debe extraer y cómo debe mapearlos desde la cédula hacia el JSON.',
    ],
  },
  aiPayload: {
    title: 'Payload extraído por IA',
    paragraphs: [
      'Es el bloque técnico que guarda el backend con el resultado previo a la confirmación del usuario.',
      'Normalmente incluye el payload crudo parseado del modelo, la versión normalizada por backend, la respuesta cruda del modelo, metadatos de uso y, si aplica, los pasos de recovery pass o crop de número de documento. Si la extracción falla, aquí se guarda el error.',
      'Esto sirve para entender por qué la POC pudo obtener un mejor resultado que una prueba manual de una sola llamada en LM Studio.',
    ],
  },
  finalPayload: {
    title: 'Payload final confirmado',
    paragraphs: [
      'Es la versión final confirmada o corregida por el usuario.',
      'Ya no representa lo que dijo la IA originalmente, sino los datos que quedaron persistidos como resultado final del proceso.',
    ],
  },
  rawVisibleText: {
    title: 'Texto visible detectado',
    paragraphs: [
      'Es el texto visible crudo que el modelo logró leer desde la imagen.',
      'El backend lo normaliza un poco para ordenar espacios y saltos de línea, pero sigue siendo una referencia textual, no el resultado final validado.',
    ],
  },
};

@Component({
  selector: 'app-history-detail-page',
  standalone: true,
  imports: [DatePipe, DecimalPipe, JsonPipe, RouterLink, StatusBadgeComponent],
  templateUrl: './history-detail-page.component.html',
  styleUrl: './history-detail-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoryDetailPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly apiService = inject(IdentityReadingApiService);

  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly flashMessage = signal<string | null>(null);
  readonly reading = signal<IdentityReadingDetail | null>(null);
  readonly activeHelpTopicKey = signal<DetailHelpTopicKey | null>(null);
  readonly activeHelpTopic = computed(() => {
    const topicKey = this.activeHelpTopicKey();
    return topicKey ? DETAIL_HELP_TOPICS[topicKey] : null;
  });

  constructor() {
    const message = history.state?.flashMessage;
    this.flashMessage.set(typeof message === 'string' ? message : null);
    void this.load();
  }

  async load(): Promise<void> {
    const rawId = this.route.snapshot.paramMap.get('id');
    const id = Number(rawId);

    if (!Number.isInteger(id) || id <= 0) {
      this.loading.set(false);
      this.errorMessage.set('El identificador del registro no es válido.');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);

    try {
      const reading = await firstValueFrom(this.apiService.getReading(id));
      this.reading.set(reading);
    } catch (error) {
      this.errorMessage.set(
        error instanceof ApiRequestError
          ? error.message
          : 'No se pudo cargar el detalle del registro.',
      );
    } finally {
      this.loading.set(false);
    }
  }

  displayName(reading: IdentityReadingDetail): string {
    return (
      reading.fullName ??
      ([reading.givenNames, reading.surnames].filter(Boolean).join(' ') || 'Sin nombre detectado')
    );
  }

  openHelp(topicKey: DetailHelpTopicKey): void {
    this.activeHelpTopicKey.set(topicKey);
  }

  closeHelp(): void {
    this.activeHelpTopicKey.set(null);
  }
}
