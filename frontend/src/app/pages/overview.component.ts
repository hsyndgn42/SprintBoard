import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, Overview, formatDate } from '../api.service';
import { SbStateComponent } from '../shared/sb-state.component';

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
  number = (value: number) => new Intl.NumberFormat('tr-TR', {maximumFractionDigits: 1}).format(value);
  sprintProgress(done: number, total: number): number { return total ? Math.round(done / total * 100) : 0; }
  get progress(): number | null { const active = this.data?.activeSprint; return active?.deliveryTaskCount ? Math.round(active.deliveryDoneCount / active.deliveryTaskCount * 100) : null; }
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
