import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, Overview, formatDate } from '../api.service';

@Component({
  standalone: true,
  imports: [RouterLink],
  templateUrl: './overview.component.html',
  styleUrl: './overview.component.css',
})
export class OverviewComponent implements OnInit {
  private api = inject(ApiService);
  private changeDetector = inject(ChangeDetectorRef);
  data: Overview | null = null;
  error = '';
  formatDate = formatDate;
  number = (value: number) => new Intl.NumberFormat('tr-TR', {maximumFractionDigits: 1}).format(value);
  sprintProgress(done: number, total: number): number { return total ? Math.round(done / total * 100) : 0; }
  get progress(): number | null { const active = this.data?.activeSprint; return active?.deliveryTaskCount ? Math.round(active.deliveryDoneCount / active.deliveryTaskCount * 100) : null; }
  async ngOnInit(): Promise<void> {
    try { this.data = await this.api.get<Overview>('/overview'); }
    catch (error) { this.error = String(error); }
    finally { this.changeDetector.detectChanges(); }
  }
}
