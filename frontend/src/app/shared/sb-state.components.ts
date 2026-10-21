import { Component, Input } from '@angular/core';

/**
 * Shared empty state.
 *
 * Replaces the ad-hoc `<div class="empty">…</div>` blocks so every screen
 * explains what is missing and what the user can do next. Projected content
 * is rendered as the action area.
 */
@Component({
  selector: 'sb-empty-state',
  standalone: true,
  template: `
    <div class="sb-state sb-state-empty empty" role="note">
      @if (icon) { <span class="sb-state-icon" aria-hidden="true">{{ icon }}</span> }
      <strong class="sb-state-title">{{ title }}</strong>
      @if (description) { <p class="sb-state-text">{{ description }}</p> }
      <div class="sb-state-actions"><ng-content></ng-content></div>
    </div>
  `,
})
export class SbEmptyStateComponent {
  @Input() title = 'Kayıt yok';
  @Input() description = '';
  @Input() icon = '';
}

/**
 * Shared loading state. Announces itself politely to assistive technology,
 * which the previous bare `<p>…yükleniyor</p>` markup did inconsistently.
 */
@Component({
  selector: 'sb-loading',
  standalone: true,
  template: `
    <div class="sb-state sb-state-loading loading" role="status" aria-live="polite">
      <span class="sb-spinner" aria-hidden="true"></span>
      <span>{{ label }}</span>
    </div>
  `,
})
export class SbLoadingComponent {
  @Input() label = 'Yükleniyor…';
}

/**
 * Shared error state. Exposed as an alert so failures are announced, with an
 * optional retry affordance supplied by the host via projected content.
 */
@Component({
  selector: 'sb-error-state',
  standalone: true,
  template: `
    <div class="sb-state sb-state-error" role="alert">
      <span class="sb-state-icon" aria-hidden="true">!</span>
      <div class="sb-state-body">
        <strong class="sb-state-title">{{ title }}</strong>
        @if (message) { <p class="sb-state-text">{{ message }}</p> }
      </div>
      <div class="sb-state-actions"><ng-content></ng-content></div>
    </div>
  `,
})
export class SbErrorStateComponent {
  @Input() title = 'İşlem tamamlanamadı';
  @Input() message = '';
}
