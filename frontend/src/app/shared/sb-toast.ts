import { Component, Injectable, inject, signal } from '@angular/core';

export type SbToastKind = 'success' | 'error' | 'info';

export interface SbToast {
  id: number;
  kind: SbToastKind;
  text: string;
}

/**
 * Lightweight transient-feedback queue.
 *
 * Several screens performed a save and gave no confirmation at all, or set a
 * message field that was never rendered. This service is purely additive:
 * existing inline error/success markup is left untouched, so no current
 * feedback path is removed.
 */
@Injectable({ providedIn: 'root' })
export class SbToastService {
  readonly toasts = signal<SbToast[]>([]);
  private nextId = 1;

  success(text: string): void { this.push('success', text); }
  error(text: string): void { this.push('error', text); }
  info(text: string): void { this.push('info', text); }

  dismiss(id: number): void {
    this.toasts.update(list => list.filter(t => t.id !== id));
  }

  private push(kind: SbToastKind, text: string): void {
    if (!text) return;
    const id = this.nextId++;
    this.toasts.update(list => [...list.slice(-3), { id, kind, text }]);
    setTimeout(() => this.dismiss(id), kind === 'error' ? 8000 : 4500);
  }
}

@Component({
  selector: 'sb-toast-host',
  standalone: true,
  template: `
    <div class="sb-toast-host" aria-live="polite" aria-atomic="false">
      @for (toast of service.toasts(); track toast.id) {
        <div class="sb-toast" [class.success]="toast.kind === 'success'" [class.error]="toast.kind === 'error'" [attr.role]="toast.kind === 'error' ? 'alert' : 'status'">
          <span class="sb-toast-text">{{ toast.text }}</span>
          <button type="button" class="sb-toast-close" aria-label="Bildirimi kapat" (click)="service.dismiss(toast.id)">×</button>
        </div>
      }
    </div>
  `,
})
export class SbToastHostComponent {
  service = inject(SbToastService);
}
