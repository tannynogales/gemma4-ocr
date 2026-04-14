import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

import {
  type ConfirmIdentityReadingPayload,
  type ExtractedIdentityPayload,
} from '../../../core/models/identity-reading.models';
import { runValidator } from '../../../core/utils/run.utils';

const nullify = (value: string | null | undefined): string | null => {
  const trimmedValue = String(value ?? '').trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
};

@Component({
  selector: 'app-review-form',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './review-form.component.html',
  styleUrl: './review-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewFormComponent {
  private readonly formBuilder = inject(FormBuilder);

  readonly extractedPayload = input.required<ExtractedIdentityPayload>();
  readonly saving = input(false);
  readonly confirmRequested = output<ConfirmIdentityReadingPayload>();
  readonly retryRequested = output<void>();

  readonly form = this.formBuilder.group({
    run: ['', [runValidator()]],
    givenNames: ['', [Validators.maxLength(120)]],
    surnames: ['', [Validators.maxLength(120)]],
    fullName: ['', [Validators.maxLength(160)]],
    documentNumber: ['', [Validators.maxLength(50)]],
    birthDate: [''],
    expiryDate: [''],
    sex: [''],
    nationality: ['', [Validators.maxLength(80)]],
    reviewNotes: ['', [Validators.maxLength(500)]],
  });

  readonly confidenceLabel = computed(() => {
    const confidence = this.extractedPayload().confidence;

    if (typeof confidence !== 'number') {
      return 'Sin score';
    }

    return `${Math.round(confidence * 100)}%`;
  });

  constructor() {
    effect(() => {
      const payload = this.extractedPayload();

      this.form.reset(
        {
          run: payload.run ?? '',
          givenNames: payload.givenNames ?? '',
          surnames: payload.surnames ?? '',
          fullName: payload.fullName ?? '',
          documentNumber: payload.documentNumber ?? '',
          birthDate: payload.birthDate ?? '',
          expiryDate: payload.expiryDate ?? '',
          sex: payload.sex ?? '',
          nationality: payload.nationality ?? '',
          reviewNotes: '',
        },
        { emitEvent: false },
      );
    });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();

    this.confirmRequested.emit({
      run: nullify(value.run),
      givenNames: nullify(value.givenNames),
      surnames: nullify(value.surnames),
      fullName: nullify(value.fullName),
      documentNumber: nullify(value.documentNumber),
      birthDate: nullify(value.birthDate),
      expiryDate: nullify(value.expiryDate),
      sex: nullify(value.sex) as 'M' | 'F' | 'X' | null,
      nationality: nullify(value.nationality),
      reviewNotes: nullify(value.reviewNotes),
    });
  }
}
