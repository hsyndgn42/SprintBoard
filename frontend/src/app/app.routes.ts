import { Routes } from '@angular/router';
import { OverviewComponent } from './pages/overview.component';
import { BacklogComponent } from './pages/backlog.component';
import { SprintsComponent, SprintDetailComponent } from './pages/sprints.component';
import { ReportsComponent, SettingsComponent } from './pages/insights.component';
import { unsavedChangesGuard } from './shared/dirty-state';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'overview' },
  { path: 'overview', component: OverviewComponent },
  { path: 'roadmap', loadComponent: () => import('./pages/roadmap.component').then(m => m.RoadmapComponent) },
  { path: 'roadmap/:id', loadComponent: () => import('./pages/roadmap.component').then(m => m.RoadmapComponent) },
  { path: 'backlog', component: BacklogComponent },
  { path: 'sprints', component: SprintsComponent },
  { path: 'sprints/:id/:tab', component: SprintDetailComponent },
  { path: 'team', loadComponent: () => import('./pages/operations.component').then(m => m.TeamComponent) },
  { path: 'leaves', loadComponent: () => import('./pages/operations.component').then(m => m.LeavesComponent) },
  { path: 'overtime', loadComponent: () => import('./pages/operations.component').then(m => m.OvertimeComponent) },
  { path: 'reports', component: ReportsComponent },
  // Settings owns editable forms, so in-app navigation away from it gets
  // the same confirmation as closing the tab.
  { path: 'settings', component: SettingsComponent, canDeactivate: [unsavedChangesGuard] },
  { path: '**', redirectTo: 'overview' },
];
