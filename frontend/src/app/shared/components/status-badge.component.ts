import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { type IdentityReadingStatus } from '../../core/models/identity-reading.models';

@Component({
  selector: 'app-status-badge',
  standalone: true,
  template: `
    <span class="status-badge" [class]="statusClass()">
      {{ statusLabel() }}
    </span>
  `,
  styles: `
    .status-badge {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 0.35rem 0.7rem;
      font-size: 0.78rem;
      font-weight: 800;
      letter-spacing: 0.03em;
      text-transform: uppercase;
    }

    .status-draft {
      background: rgba(15, 92, 108, 0.12);
      color: #0f5c6c;
    }

    .status-confirmed {
      background: rgba(35, 122, 87, 0.12);
      color: #237a57;
    }

    .status-corrected {
      background: rgba(184, 109, 24, 0.12);
      color: #9a5c12;
    }

    .status-failed {
      background: rgba(182, 59, 42, 0.12);
      color: #b63b2a;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusBadgeComponent {
  readonly status = input.required<IdentityReadingStatus>();

  readonly statusLabel = computed(() => {
    switch (this.status()) {
      case 'draft_extracted':
        return 'Pendiente de revisión';
      case 'reviewed_confirmed':
        return 'Confirmado';
      case 'reviewed_corrected':
        return 'Corregido';
      case 'extraction_failed':
        return 'Extracción fallida';
    }
  });

  readonly statusClass = computed(() => {
    switch (this.status()) {
      case 'draft_extracted':
        return 'status-draft';
      case 'reviewed_confirmed':
        return 'status-confirmed';
      case 'reviewed_corrected':
        return 'status-corrected';
      case 'extraction_failed':
        return 'status-failed';
    }
  });
}
