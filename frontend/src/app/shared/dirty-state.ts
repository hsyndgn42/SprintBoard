import { Injectable, inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';

/**
 * Unsaved-change protection (P-06).
 *
 * Before this, every form decided for itself whether leaving was safe —
 * which in practice meant none of them did, and a half-filled settings form
 * disappeared silently on navigation. This is the single mechanism all of
 * them share.
 *
 * Two deliberate boundaries:
 *
 * - "Dirty" means the user changed something, not that a form exists. A
 *   screen the reader only looked at never warns, because a warning that
 *   fires when nothing is at stake trains people to dismiss it.
 * - Saving is not the same as unsaved. While a save is in flight the form
 *   is busy, not dirty, so the user is not asked to confirm discarding
 *   work that is already on its way to the server. If the save fails the
 *   form becomes dirty again and the user can retry or leave — they are
 *   never trapped.
 */

/** A registered source that can report whether it holds unsaved input. */
export interface DirtySource {
  readonly label: string;
  isDirty(): boolean;
}

@Injectable({ providedIn: 'root' })
export class DirtyStateService {
  private sources = new Map<object, DirtySource>();
  private listening = false;

  /**
   * Registers a form or dialog. The owner keeps the token it passes so it
   * can release the registration on destroy; a component that forgets would
   * otherwise keep warning about a screen that no longer exists.
   */
  register(token: object, source: DirtySource): void {
    this.sources.set(token, source);
    this.sync();
  }

  release(token: object): void {
    this.sources.delete(token);
    this.sync();
  }

  /** Labels of everything currently holding unsaved input. */
  dirtyLabels(): string[] {
    return [...this.sources.values()].filter(source => source.isDirty()).map(source => source.label);
  }

  isDirty(): boolean {
    return [...this.sources.values()].some(source => source.isDirty());
  }

  /**
   * Asks the user to confirm losing their input. Returns true when it is
   * safe to proceed. Uses the native dialog on purpose: it is keyboard
   * accessible, it cannot be missed, and it works during the beforeunload
   * handler where a custom overlay would never be shown.
   */
  confirmDiscard(): boolean {
    const labels = this.dirtyLabels();
    if (!labels.length) return true;
    const what = labels.length === 1 ? labels[0] : labels.length + ' bölümde';
    return confirm(`${what} kaydedilmemiş değişiklik var.\n\nSayfadan ayrılırsan bu değişiklikler kaybolur. Devam edilsin mi?`);
  }

  /**
   * The browser-level guard is attached only while something is actually
   * dirty, so a read-only page never produces the browser's "leave site?"
   * dialog.
   */
  private sync(): void {
    const needed = this.sources.size > 0;
    if (needed === this.listening) return;
    this.listening = needed;
    if (needed) window.addEventListener('beforeunload', this.onBeforeUnload);
    else window.removeEventListener('beforeunload', this.onBeforeUnload);
  }

  private onBeforeUnload = (event: BeforeUnloadEvent): void => {
    if (!this.isDirty()) return;
    event.preventDefault();
    event.returnValue = '';
  };
}

/**
 * Route guard. Registered once on the routes that own editable forms, so
 * in-app navigation gets the same protection as closing the tab.
 */
export const unsavedChangesGuard: CanDeactivateFn<unknown> = () =>
  inject(DirtyStateService).confirmDiscard();

/**
 * Compares the current form value against the last saved one.
 *
 * Comparison is on a normalised snapshot rather than Angular's own dirty
 * flag, because that flag stays set after the user types a character and
 * removes it again — which would warn about a change that no longer
 * exists. Typing and undoing should leave no trace.
 */
export class DirtyTracker {
  private baseline = '';
  private busy = false;

  constructor(initial?: unknown) { this.reset(initial); }

  /** Records the current values as the saved state. */
  reset(value: unknown): void { this.baseline = snapshot(value); }

  /** Marks a save as in flight, which suppresses the unsaved warning. */
  saving(value: boolean): void { this.busy = value; }

  isDirty(current: unknown): boolean {
    if (this.busy) return false;
    return snapshot(current) !== this.baseline;
  }
}

/**
 * Stable serialisation: object key order must not decide whether a form
 * counts as changed, and null/undefined/'' are all "the user typed
 * nothing" as far as a warning is concerned.
 */
function snapshot(value: unknown): string {
  return JSON.stringify(normalise(value));
}

function normalise(value: unknown): unknown {
  if (value === null || value === undefined || value === '') return null;
  if (Array.isArray(value)) return value.map(normalise);
  if (typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) out[key] = normalise(source[key]);
    return out;
  }
  return value;
}
