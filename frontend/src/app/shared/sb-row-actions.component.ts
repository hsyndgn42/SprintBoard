import { ChangeDetectorRef, Component, DestroyRef, HostListener, Input, inject } from '@angular/core';

/**
 * Row actions collapsed behind one trigger.
 *
 * A table row's job is to be scanned. Laying three or four full-width buttons
 * into the last cell makes every row as tall as its button stack and as wide as
 * its longest label, which is what pushed the planning and capacity tables off
 * screen. Collapsing them keeps rows one line tall while the labels stay
 * written out in full inside the menu, so nothing has to be abbreviated into
 * guesswork.
 *
 * The menu is positioned fixed from the trigger's rectangle rather than nested
 * inside the row, because every table here scrolls inside `.table-wrap` and a
 * nested popover would be clipped by it.
 */
@Component({
  selector: 'sb-row-actions',
  standalone: true,
  template: `
    <button type="button" class="sb-row-actions__trigger" [attr.aria-label]="label" aria-haspopup="menu"
      [attr.aria-expanded]="open" [disabled]="disabled" (click)="toggle($event)">
      <span aria-hidden="true">⋯</span>
    </button>
    <div class="sb-row-actions__menu" role="menu" [hidden]="!open" [style.top.px]="top" [style.left.px]="left" (click)="close()">
      <ng-content />
    </div>
  `,
  styles: [`
    :host{display:inline-flex;justify-content:flex-end}
    .sb-row-actions__trigger{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;padding:0;border:1px solid #d6e0ec;border-radius:8px;background:#fff;color:#44607c;font-size:16px;line-height:1;cursor:pointer;transition:background-color .15s,border-color .15s}
    .sb-row-actions__trigger:hover:not(:disabled){background:#eef4fb;border-color:#9fbcd8}
    .sb-row-actions__trigger[aria-expanded=true]{background:#e7f0fa;border-color:#5f93c6;color:#1c4d7c}
    .sb-row-actions__trigger:disabled{opacity:.45;cursor:not-allowed}
    .sb-row-actions__trigger:focus-visible{outline:3px solid #b2d3f5;outline-offset:1px}
    .sb-row-actions__menu[hidden]{display:none}
    .sb-row-actions__menu{position:fixed;z-index:60;display:flex;flex-direction:column;align-items:stretch;gap:2px;min-width:184px;padding:6px;border:1px solid #d3dfec;border-radius:10px;background:#fff;box-shadow:0 10px 28px #1c3c5c26}
    .sb-row-actions__menu ::ng-deep .btn{justify-content:flex-start;width:100%;min-height:32px;padding:7px 10px;border:0;background:none;text-align:left;font-weight:600;white-space:normal}
    .sb-row-actions__menu ::ng-deep .btn:hover:not(:disabled){background:#eef4fb}
    .sb-row-actions__menu ::ng-deep .btn.danger{color:#b0352c}
    .sb-row-actions__menu ::ng-deep .btn.danger:hover:not(:disabled){background:#fdeeec}
  `],
})
export class SbRowActionsComponent {
  @Input() label = 'Satır işlemleri';
  @Input() disabled = false;
  open = false;
  top = 0;
  left = 0;
  private cdr = inject(ChangeDetectorRef);

  /** Tables scroll inside their own wrapper, which `window:scroll` never reports,
   *  so the menu listens in the capture phase and closes rather than drifting
   *  away from the row it belongs to. */
  constructor() {
    const close = () => this.close();
    document.addEventListener('scroll', close, true);
    inject(DestroyRef).onDestroy(() => document.removeEventListener('scroll', close, true));
  }

  toggle(event: MouseEvent): void {
    event.stopPropagation();
    this.open = !this.open;
    if (this.open) this.place(event.currentTarget as HTMLElement);
    this.cdr.detectChanges();
  }

  /** Opens below the trigger and flips above or inwards when the viewport would cut it off. */
  private place(trigger: HTMLElement): void {
    const rect = trigger.getBoundingClientRect();
    const width = 200, height = 180;
    this.top = rect.bottom + height > window.innerHeight ? Math.max(8, rect.top - height) : rect.bottom + 6;
    this.left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
  }

  close(): void { if (this.open) { this.open = false; this.cdr.detectChanges(); } }

  @HostListener('document:click') onDocumentClick(): void { this.close(); }
  @HostListener('document:keydown.escape') onEscape(): void { this.close(); }
  @HostListener('window:resize') onResize(): void { this.close(); }
}
