import { Routes } from '@angular/router';
import { OverviewComponent } from './pages/overview.component';
import { ReportsComponent, SettingsComponent } from './pages/insights.component';
import { unsavedChangesGuard } from './shared/dirty-state';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'overview' },
  { path: 'overview', component: OverviewComponent },
  { path: 'roadmap', loadComponent: () => import('./pages/roadmap.component').then(m => m.RoadmapComponent) },
  { path: 'roadmap/:id', loadComponent: () => import('./pages/roadmap.component').then(m => m.RoadmapComponent) },
  { path: 'backlog', loadComponent: () => import('./pages/backlog.component').then(m => m.BacklogComponent) },
  { path: 'sprints', loadComponent: () => import('./pages/sprints.component').then(m => m.SprintsComponent) },
  { path: 'sprints/:id/:tab', loadComponent: () => import('./pages/sprints.component').then(m => m.SprintDetailComponent) },
  { path: 'team', loadComponent: () => import('./pages/operations.component').then(m => m.TeamComponent) },
  { path: 'leaves', loadComponent: () => import('./pages/operations.component').then(m => m.LeavesComponent) },
  { path: 'overtime', loadComponent: () => import('./pages/operations.component').then(m => m.OvertimeComponent) },
  { path: 'reports', loadComponent: () => import('./pages/insights.component').then(m => m.ReportsComponent) },
  // Settings owns editable forms, so in-app navigation away from it gets
  // the same confirmation as closing the tab.
  { path: 'settings', loadComponent: () => import('./pages/insights.component').then(m => m.SettingsComponent), canDeactivate: [unsavedChangesGuard] },
  { path: '**', redirectTo: 'overview' },
];
