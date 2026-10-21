import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, Overview, OverviewTypeBreakdown, formatDate } from '../api.service';
import { SbStateComponent } from '../shared/sb-state.component';
import { TASK_CATEGORY_COLORS, taskCategoryLabel } from '../task-taxonomy';

/** One row of the "needs attention" strip: a count plus where to act on it. */
export interface OverviewAlert {
  key: string; label: string; count: number; hint: string;
  tone: 'warn' | 'info'; link: unknown[];
}

@Component({
  standalone: true,
  imports: [RouterLink, SbStateComponent],
  templateUrl: './overview.component.html',
  styleUrl: './overview.component.css',
})
export class OverviewComponent implements OnInit {
  private api = inject(ApiService);
  private changeDetector = inject(ChangeDetectorRef);
  data: Overview | null = null;
  error = '';
  loading = false;
  formatDate = formatDate;
  teamName = this.api.teamName;
  categoryLabel = taskCategoryLabel;
  number = (value: number) => new Intl.NumberFormat('tr-TR', {maximumFractionDigits: 1}).format(value);
  sprintProgress(done: number, total: number): number { return total ? Math.round(done / total * 100) : 0; }
  get progress(): number | null { const active = this.data?.activeSprint; return active?.deliveryTaskCount ? Math.round(active.deliveryDoneCount / active.deliveryTaskCount * 100) : null; }

  /**
   * Share of the sprint calendar already spent. Reported next to delivery
   * progress so a sprint that is 80% through its days but 20% done reads as
   * a schedule signal rather than two unrelated numbers. Null when the
   * service did not send the day span (older response or no active sprint).
   */
  get timeElapsed(): number | null {
    const total = this.data?.activeSprintDaysTotal;
    const remaining = this.data?.activeSprintDaysRemaining;
    if (!total || total <= 0 || remaining === null || remaining === undefined) return null;
    return Math.min(100, Math.max(0, Math.round((total - remaining) / total * 100)));
  }

  /**
   * Counts the dashboard should surface rather than bury. Each entry is a
   * plain count the service already computed plus a route to resolve it;
   * nothing here is a derived health score or a judgement. Zero-count
   * signals are dropped so a healthy sprint shows a clean strip.
   */
  get alerts(): OverviewAlert[] {
    const view = this.data;
    const active = view?.activeSprint;
    if (!view || !active) return [];
    const board = ['/sprints', active.id, 'board'];
    const rows: OverviewAlert[] = [
      {key: 'blocked', label: 'Blocked iş', count: view.activeSprintBlockedCount ?? 0, hint: 'Panoda blocker işaretli', tone: 'warn', link: board},
      {key: 'unestimated', label: 'Tahminsiz iş', count: view.activeSprintUnestimatedCount ?? 0, hint: 'Planlanan efor girilmemiş', tone: 'warn', link: board},
      {key: 'unassigned', label: 'Atamasız iş', count: view.activeSprintUnassignedCount ?? 0, hint: 'Sorumlu kişi yok', tone: 'warn', link: board},
      {key: 'added', label: 'Sprint içi eklenen', count: view.activeSprintAddedDuringCount ?? 0, hint: 'Planlama sonrası kapsama girdi', tone: 'info', link: ['/sprints', active.id, 'summary']},
    ];
    return rows.filter(row => row.count > 0);
  }

  /** True once the service has sent at least one attention signal. */
  get hasSignals(): boolean {
    return this.data?.activeSprintUnestimatedCount !== undefined;
  }

  get typeBreakdown(): OverviewTypeBreakdown[] { return this.data?.activeSprintTypeBreakdown ?? []; }
  get typeTotal(): number { return this.typeBreakdown.reduce((sum, row) => sum + row.taskCount, 0); }
  typeShare(row: OverviewTypeBreakdown): number { const total = this.typeTotal; return total ? Math.round(row.taskCount / total * 100) : 0; }
  typeColor(row: OverviewTypeBreakdown): string { return TASK_CATEGORY_COLORS[row.category as keyof typeof TASK_CATEGORY_COLORS] || 'var(--sb-viz-8)'; }
  async ngOnInit(): Promise<void> { await this.load(); }

  /**
   * Extracted from ngOnInit so a failed load offers a retry instead of
   * stranding the reader on an error with no way forward. The request
   * itself is unchanged: a single GET /overview.
   */
  async load(): Promise<void> {
    this.loading = true;
    this.error = '';
    this.changeDetector.detectChanges();
    try { this.data = await this.api.get<Overview>('/overview'); }
    catch (error) { this.error = String(error); }
    finally { this.loading = false; this.changeDetector.detectChanges(); }
  }
}
