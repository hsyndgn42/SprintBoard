import { Component, Input, Output, EventEmitter } from '@angular/core';

/**
 * The non-content states a data screen can be in.
 *
 * `partial` is deliberately separate from `error`: it means the page has
 * usable data but one of its sources failed, so it must not replace the
 * content — it is rendered above it as a warning strip.
 */
export type SbStateVariant =
  | 'loading'
  | 'empty'
  | 'no-results'
  | 'denied'
  | 'offline'
  | 'error'
  | 'partial';

interface VariantPreset {
  /** Decorative mark; meaning always comes from the text, never the glyph. */
  readonly icon: string;
  readonly title: string;
  readonly message: string;
  readonly tone: 'neutral' | 'info' | 'warning' | 'danger';
  /** Screen-reader urgency. Errors interrupt; progress and emptiness do not. */
  readonly live: 'polite' | 'assertive' | 'off';
  readonly role: 'status' | 'alert' | 'note';
}

/**
 * Default copy. Every string explains *why* the screen looks like this and
 * what happens next, and none of them blame the reader for the state.
 */
const PRESETS: Record<SbStateVariant, VariantPreset> = {
  loading: {
    icon: '',
    title: 'Yükleniyor',
    message: 'Veriler hazırlanıyor.',
    tone: 'neutral',
    live: 'polite',
    role: 'status',
  },
  empty: {
    icon: '◇',
    title: 'Burada henüz kayıt yok',
    message: 'İlk kaydı eklediğinde bu alan dolacak.',
    tone: 'neutral',
    live: 'off',
    role: 'note',
  },
  'no-results': {
    icon: '⌕',
    title: 'Eşleşen kayıt bulunamadı',
    message: 'Filtreleri gevşetmeyi ya da aramayı temizlemeyi deneyebilirsin.',
    tone: 'neutral',
    live: 'polite',
    role: 'status',
  },
  denied: {
    icon: '🔒',
    title: 'Bu alanı görme yetkin yok',
    message: 'Erişim gerekiyorsa bir yöneticiden yetki isteyebilirsin.',
    tone: 'info',
    live: 'off',
    role: 'note',
  },
  offline: {
    icon: '⚡',
    title: 'Sunucuya ulaşılamadı',
    message: 'Bağlantı kurulamadı. Servis çalışıyorsa tekrar deneyebilirsin.',
    tone: 'danger',
    live: 'assertive',
    role: 'alert',
  },
  error: {
    icon: '!',
    title: 'Bu bölüm yüklenemedi',
    message: 'Beklenmeyen bir hata oluştu. Tekrar denemek sorunu çözebilir.',
    tone: 'danger',
    live: 'assertive',
    role: 'alert',
  },
  partial: {
    icon: '!',
    title: 'Bazı veriler eksik',
    message: 'Sayfanın bir bölümü yüklenemedi; gösterilen değerler eksik olabilir.',
    tone: 'warning',
    live: 'polite',
    role: 'status',
  },
};

/**
 * The one way SprintBoard renders "there is nothing to show yet".
 *
 * Pages previously hand-rolled a `<p class="empty">` per list, which meant
 * loading looked like emptiness, failures looked like emptiness, and a
 * filtered-out list looked identical to a genuinely empty one. Those are
 * four different situations with four different next actions.
 *
 * Usage:
 *   <sb-state variant="no-results" [actionLabel]="'Filtreleri temizle'"
 *             (action)="clearFilters()" />
 *
 * Permission-aware callers should simply omit `actionLabel` when the current
 * user cannot perform the action, so an empty state never advertises a
 * button the reader is not allowed to press.
 */
@Component({
  selector: 'sb-state',
  standalone: true,
  template: `
    <div
      [class]="'sb-state sb-state--' + variant + ' sb-state--tone-' + preset().tone"
      [class.sb-state--inline]="inline"
      [attr.role]="preset().role === 'note' ? null : preset().role"
      [attr.aria-live]="preset().live === 'off' ? null : preset().live"
    >
      @if (variant === 'loading') {
        <!-- Decorative: the adjacent text already announces the state. -->
        <span class="sb-state__spinner" aria-hidden="true"></span>
      } @else if (preset().icon) {
        <span class="sb-state__icon" aria-hidden="true">{{ preset().icon }}</span>
      }

      <div class="sb-state__body">
        <p class="sb-state__title">{{ title || preset().title }}</p>
        @if (resolvedMessage()) {
          <p class="sb-state__message">{{ resolvedMessage() }}</p>
        }
        @if (detail) {
          <p class="sb-state__detail">{{ detail }}</p>
        }
      </div>

      @if (actionLabel) {
        <div class="sb-state__actions">
          <button type="button" class="btn" [disabled]="actionDisabled" (click)="action.emit()">
            {{ actionLabel }}
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    .sb-state {
      display: flex;
      flex-direction: column;
      gap: var(--sb-space-3);
      align-items: center;
      padding: var(--sb-space-8) var(--sb-space-5);
      text-align: center;
      color: var(--sb-text-secondary);
    }

    /* Inline is for states that sit inside an existing card or table and
       must not add another full block of vertical space. */
    .sb-state--inline {
      flex-direction: row;
      gap: var(--sb-space-3);
      align-items: center;
      padding: var(--sb-space-3) var(--sb-space-4);
      text-align: left;
      border: 1px solid var(--sb-border);
      border-radius: var(--sb-radius-md);
      background: var(--sb-surface-muted);
    }

    .sb-state--inline .sb-state__body { flex: 1; }
    .sb-state--inline .sb-state__actions { margin: 0; }

    .sb-state__icon {
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      font-size: var(--sb-font-lg);
      border-radius: var(--sb-radius-pill);
      background: var(--sb-neutral-bg);
      color: var(--sb-neutral-fg);
    }

    .sb-state--inline .sb-state__icon {
      width: 26px;
      height: 26px;
      font-size: var(--sb-font-md);
    }

    .sb-state--tone-info .sb-state__icon { background: var(--sb-info-bg); color: var(--sb-info-fg); }
    .sb-state--tone-warning .sb-state__icon { background: var(--sb-warning-bg); color: var(--sb-warning-fg); }
    .sb-state--tone-danger .sb-state__icon { background: var(--sb-danger-bg); color: var(--sb-danger-fg); }

    .sb-state--inline.sb-state--tone-warning {
      background: var(--sb-warning-bg);
      border-color: var(--sb-warning-border);
    }

    .sb-state--inline.sb-state--tone-danger {
      background: var(--sb-danger-bg);
      border-color: var(--sb-danger-border);
    }

    .sb-state__title {
      margin: 0;
      font-size: var(--sb-font-base);
      font-weight: var(--sb-weight-semibold);
      line-height: var(--sb-leading-snug);
      color: var(--sb-text);
    }

    .sb-state__message,
    .sb-state__detail {
      margin: var(--sb-space-1) 0 0;
      font-size: var(--sb-font-md);
      line-height: var(--sb-leading-normal);
      max-width: 52ch;
    }

    .sb-state:not(.sb-state--inline) .sb-state__message,
    .sb-state:not(.sb-state--inline) .sb-state__detail {
      margin-inline: auto;
    }

    /* Technical detail is secondary: it helps a report, it does not lead. */
    .sb-state__detail {
      font-size: var(--sb-font-sm);
      color: var(--sb-text-muted);
      overflow-wrap: anywhere;
    }

    .sb-state__spinner {
      width: 22px;
      height: 22px;
      border: 2px solid var(--sb-neutral-300);
      border-top-color: var(--sb-primary);
      border-radius: var(--sb-radius-pill);
      animation: sb-state-spin .7s linear infinite;
    }

    @keyframes sb-state-spin { to { transform: rotate(360deg); } }

    /* The global reduced-motion reset freezes the spin, which would leave a
       static ring with no sign of progress. Fall back to a gentle fade so
       the control still reads as "working". */
    @media (prefers-reduced-motion: reduce) {
      .sb-state__spinner {
        animation: sb-state-pulse 1.4s ease-in-out infinite;
        border-top-color: var(--sb-primary);
      }
      @keyframes sb-state-pulse { 50% { opacity: .35; } }
    }
  `],
})
export class SbStateComponent {
  @Input() variant: SbStateVariant = 'empty';

  /** Overrides the preset heading when the screen has a more specific one. */
  @Input() title = '';

  /** Overrides the preset explanation. Pass `null` to hide it entirely. */
  @Input() message?: string | null;

  /** Optional technical context, e.g. an error code. Never required reading. */
  @Input() detail = '';

  /** Omit to render no action — the correct choice when the user lacks rights. */
  @Input() actionLabel = '';

  /** Use while a retry is already running so it cannot be fired twice. */
  @Input() actionDisabled = false;

  /** Compact row form for use inside an existing card, table or panel. */
  @Input() inline = false;

  @Output() action = new EventEmitter<void>();

  /** Falls back to `empty` so an unknown variant can never blank the screen. */
  preset(): VariantPreset {
    return PRESETS[this.variant] ?? PRESETS.empty;
  }

  resolvedMessage(): string {
    // `undefined` means "no opinion, use the preset"; `null`/'' means "hide".
    if (this.message === null) return '';
    if (this.message === undefined) return this.preset().message;
    return this.message;
  }
}
