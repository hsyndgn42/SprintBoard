import { ChangeDetectorRef, Component, ElementRef, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../api.service';
import { ApprovalSummary, EMPTY_SUMMARY, REFRESH_MS, badgeText, bellLabel, pendingQueues, summaryTotal } from './approval-inbox.model';

/** Approvals arrive in five queues across three pages, so administrators had
 *  to open each queue to find out whether anything was waiting. The bell
 *  reports all of them in one place and links straight to the page that owns
 *  the queue. */
@Component({
  selector: 'sb-approval-bell',
  standalone: true,
  imports: [RouterLink],
  template: `
<button type="button" class="bell-trigger" [class.pending]="total > 0" [class.failed]="!!error"
  aria-haspopup="true" aria-controls="approval-panel" [attr.aria-expanded]="open"
  [attr.aria-label]="label" [title]="label" (click)="toggle()">
  <span class="bell-icon" aria-hidden="true">🔔</span>
  @if (total > 0) { <span class="bell-badge" aria-hidden="true">{{ badge }}</span> }
  @else if (error) { <span class="bell-badge warn" aria-hidden="true">!</span> }
</button>
@if (open) {
  <div class="bell-panel" id="approval-panel" role="group" aria-label="Onay bekleyenler">
    <header>
      <strong>Onay bekleyenler</strong>
      <button type="button" class="btn small" [disabled]="loading" (click)="refresh()">{{ loading ? 'Yenileniyor…' : 'Yenile' }}</button>
    </header>
    @if (error) {
      <p class="bell-error" role="alert">{{ error }}</p>
    } @else if (loading && !checked) {
      <p class="bell-note">Kuyruklar okunuyor…</p>
    } @else if (pending.length) {
      <ul class="bell-list">
        @for (queue of pending; track queue.key) {
          <li><a [routerLink]="queue.route" (click)="close()"><span>{{ queue.label }}</span><strong>{{ queue.count }}</strong></a></li>
        }
      </ul>
      <p class="bell-note">Karar bekleyen kayıtlar. Formatı bozuk Slack mesajları da düzeltme beklediği için sayılır.</p>
    } @else {
      <p class="bell-empty">Onay bekleyen kayıt yok.</p>
    }
  </div>
}`,
  styles: [`
:host{position:relative;display:flex;flex:none}
.bell-trigger{position:relative;display:grid;place-items:center;width:38px;height:38px;border:1px solid #d5dfec;border-radius:10px;background:#fff;color:#315071;font:inherit;cursor:pointer}
.bell-trigger:hover{background:#f6f9fd;border-color:#9fb8d5}
.bell-trigger:focus-visible{outline:3px solid #1766cb;outline-offset:2px}
.bell-trigger.pending{border-color:#bcd8f7;background:#f2f8ff}
.bell-icon{font-size:17px;line-height:1}
.bell-badge{position:absolute;top:-6px;right:-6px;min-width:19px;height:19px;padding:0 5px;display:grid;place-items:center;border-radius:999px;background:#c0392b;color:#fff;font-size:10px;font-weight:850;line-height:1}
.bell-badge.warn{background:#ad6200}
.bell-panel{position:absolute;top:calc(100% + 9px);right:0;z-index:40;width:min(330px,calc(100vw - 28px));padding:4px 0 0;border:1px solid #d6e1ef;border-radius:13px;background:#fff;box-shadow:0 20px 50px #162d4c2e;text-align:left}
.bell-panel header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:13px 15px;border-bottom:1px solid #e9eef6}
.bell-panel header strong{font-size:13px}
.bell-list{list-style:none;margin:0;padding:6px}
.bell-list a{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 10px;border-radius:9px;color:#31506f;font-size:12px;font-weight:650;text-decoration:none}
.bell-list a:hover{background:#f2f7ff;color:#1559aa}
.bell-list a:focus-visible{outline:3px solid #1766cb;outline-offset:-2px}
.bell-list strong{min-width:24px;padding:2px 8px;border-radius:999px;background:#eaf2ff;color:#1559aa;font-size:11px;font-weight:850;text-align:center}
.bell-note,.bell-empty,.bell-error{margin:0;padding:12px 15px;font-size:11px;line-height:1.6;color:#6c7f95}
.bell-note{border-top:1px solid #eef2f8}
.bell-empty{padding:22px 15px;text-align:center}
.bell-error{color:#92400e;background:#fffaf0}
@media(max-width:520px){.bell-panel{position:fixed;top:66px;right:10px;left:10px;width:auto}}
`],
})
export class SbApprovalBellComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private cdr = inject(ChangeDetectorRef);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);

  summary: ApprovalSummary = EMPTY_SUMMARY;
  open = false;
  loading = false;
  error = '';
  /** Distinguishes "never answered yet" from "answered with nothing waiting". */
  checked = false;
  private timer?: ReturnType<typeof setInterval>;

  get total(): number { return this.error ? 0 : summaryTotal(this.summary); }
  get badge(): string { return badgeText(this.total); }
  get label(): string { return bellLabel(this.summary, !!this.error); }
  get pending() { return pendingQueues(this.summary); }

  ngOnInit(): void {
    void this.refresh();
    this.timer = setInterval(() => { if (!document.hidden) void this.refresh(); }, REFRESH_MS);
    document.addEventListener('visibilitychange', this.onVisible);
    window.addEventListener('focus', this.onVisible);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    document.removeEventListener('visibilitychange', this.onVisible);
    window.removeEventListener('focus', this.onVisible);
  }

  /** Returning to the tab is the moment the count matters most. */
  private onVisible = () => { if (!document.hidden) void this.refresh(); };

  async refresh(): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    this.cdr.detectChanges();
    try {
      this.summary = await this.api.get<ApprovalSummary>('/admin/approvals');
      this.error = '';
      this.checked = true;
    } catch (e) {
      this.error = 'Bekleyen onaylar okunamadı. Yeniden deneyin.';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  toggle(): void {
    this.open = !this.open;
    this.cdr.detectChanges();
    if (this.open) void this.refresh();
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.cdr.detectChanges();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (!this.open) return;
    this.close();
    this.host.nativeElement.querySelector<HTMLElement>('.bell-trigger')?.focus();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.open && !this.host.nativeElement.contains(event.target as Node)) this.close();
  }
}
