import { Component, Injectable, effect, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs/operators';
import { ApiService } from '../api.service';

/**
 * Holds the human-readable label for the record currently being viewed
 * (a sprint, a roadmap goal, a member). Detail pages set this so the
 * breadcrumb can show "Sprintler › Sprint 26" instead of an opaque id.
 *
 * Purely presentational: it never affects routing or data loading.
 */
@Injectable({ providedIn: 'root' })
export class SbBreadcrumbService {
  readonly context = signal<string>('');
  set(label: string): void { this.context.set(label || ''); }
  clear(): void { this.context.set(''); }
}

interface Crumb { label: string; link: string | null; }

const SECTION_LABELS: Record<string, string> = {
  overview: 'Genel bakış',
  roadmap: 'Roadmap',
  backlog: 'Backlog',
  sprints: 'Sprintler',
  team: 'Takım',
  leaves: 'İzinler',
  overtime: 'Fazla mesai',
  reports: 'Raporlar',
  settings: 'Ayarlar',
};

const TAB_LABELS: Record<string, string> = {
  planning: 'Planlama',
  board: 'Pano',
  review: 'Review',
  journal: 'Günlük',
  retro: 'Retro',
};

@Component({
  selector: 'sb-breadcrumb',
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (crumbs().length > 1) {
      <nav class="sb-breadcrumb" aria-label="Konum">
        <ol>
          @for (crumb of crumbs(); track $index) {
            <li>
              @if (crumb.link) {
                <a [routerLink]="crumb.link">{{ crumb.label }}</a>
              } @else {
                <span aria-current="page">{{ crumb.label }}</span>
              }
            </li>
          }
        </ol>
      </nav>
    }
  `,
})
export class SbBreadcrumbComponent {
  private router = inject(Router);
  private breadcrumb = inject(SbBreadcrumbService);
  private api = inject(ApiService);
  private url = signal(this.router.url);

  readonly crumbs = signal<Crumb[]>([]);

  constructor() {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(e => { this.url.set(e.urlAfterRedirects); });
    // Recomputes on navigation and whenever a detail page publishes its label.
    effect(() => { this.url(); this.breadcrumb.context(); this.api.teamName(); this.rebuild(); });
  }

  private rebuild(): void {
    const segments = this.url().split('?')[0].split('/').filter(Boolean);
    const list: Crumb[] = [{ label: this.api.teamName() || 'SprintBoard', link: '/overview' }];
    if (!segments.length) { this.crumbs.set([]); return; }

    const section = segments[0];
    const sectionLabel = SECTION_LABELS[section];
    if (!sectionLabel) { this.crumbs.set([]); return; }

    const hasDetail = segments.length > 1;
    list.push({ label: sectionLabel, link: hasDetail ? `/${section}` : null });

    if (hasDetail) {
      const context = this.breadcrumb.context();
      const detailLabel = context || this.humanise(segments[1]);
      const tab = segments[2] ? TAB_LABELS[segments[2]] : '';
      list.push({ label: detailLabel, link: tab ? `/${section}/${segments[1]}` : null });
      if (tab) list.push({ label: tab, link: null });
    }

    this.crumbs.set(list);
  }

  private humanise(segment: string): string {
    return /^\d+$/.test(segment) ? `#${segment}` : segment;
  }
}
