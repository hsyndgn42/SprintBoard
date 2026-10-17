import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';
import { installSubtypeCatalog, SubtypeOption } from './task-taxonomy';
import { DefectDetails } from './defect-model';

export interface SprintSummary {
  id: string; number: number; name: string; goal: string; start: string; end: string;
  status: string; storyPointsAvailable: boolean; taskCount: number; doneCount: number; undoneCount: number;
  deliveryTaskCount: number; deliveryDoneCount: number; deliveryUndoneCount: number;
}
export type TaskCategory = 'DEV' | 'DESIGN' | 'ANALYZE' | 'TEST' | 'DEFECT' | 'BAU' | 'OTHER';
export type TaskSubtype = string | null;
export interface ReserveMember {memberId:string;memberName:string;reservedHours:number;allocatedHours:number;remainingHours:number;overHours:number;coveredHours:number}
export interface DefectReserveSummary {taskId:string;name:string;sprintId?:string;sprintName?:string;members:ReserveMember[];defectCount:number;reservedHours:number;allocatedHours:number;remainingHours:number;overHours:number;coveredHours:number;unassignedDefectHours:number}
export interface Task {
  reserveCoveredHours?:number;extraPlanHours?:number;scopeOrder?:number;
  reserveTaskId?:string|null;planningHours?:number;
  emergency?:boolean;addedDuringSprint?:boolean;replacementTaskId?:string;replacementTaskName?:string;
  blocker?:{blocked:boolean;reason:string;updatedAt:string|null;version:number};flowFingerprint?:string;
  defect?:DefectDetails;
  id: string; sprintId: string; backlogId: string; name: string; criteria: string; type: string;
  workKind: string; status: string; statusNote: string; estimatedHours: number; remainingHours: number;
  storyPoints: number | null; size: 'SMALL' | 'MEDIUM' | 'LARGE' | 'X-LARGE' | null; externalId: string;
  taskCategory: TaskCategory; taskSubtype: TaskSubtype;
  assignments: { memberId: string; memberName: string; estimatedHours: number; planningHours?:number; supportOnly: boolean; leaveDays?: number; hoursPerDay?:number }[];
}
export interface SprintFlow {origin:'START'|'OBSERVED'|'UNTRACKED';trackedAt:string|null;baseline:Task[];events:{id:string;action:'ADDED'|'REMOVED';at:string;reason:string;task:Task}[];version:number;wipLimit:number|null;wip:number;blocked:number;currentCount:number;added:number;removed:number}
export interface Sprint extends SprintSummary { defectReserves?:DefectReserveSummary[]; items: Task[]; closureFrozen?:boolean; closedAt?:string; closureSettings?:ProductSettings;workSettings?:ProductSettings;flow?:SprintFlow }
export interface Overview {
  totalSprints: number; completedSprints: number; deliveredTasks: number; undoneTasks: number;
  deliveryRate: number | null; activeSprint: SprintSummary | null; recentSprints: SprintSummary[];
  roadmapCount: number; backlogCount: number; backlogLinkedCount: number; backlogReadyCount: number;
  backlogInSprintCount: number; activeMemberCount: number; activeSprintCapacityHours: number;
  activeSprintPlannedHours: number; todayCapacityHours: number; monthCapacityHours: number;
}
export interface RoadmapItem {
  kind: 'PROJECT' | 'FEATURE_SET' | 'GENERAL' | 'UNSPECIFIED'; referenceId: string | null;
  id: string; title: string; description: string; status: 'planned' | 'active' | 'on_hold' | 'completed'; priority: 'UNSET' | 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL'; targetDate: string | null;
  backlogCount: number; doneCount: number;
}
export interface BacklogItem {
  defect?:DefectDetails;
  priority: 'UNSET' | 'URGENT' | 'HIGH' | 'NORMAL' | 'LOW'; ownerId: string | null; ownerName: string | null; ownerActive: boolean;
  dependencies: { id:string; title:string; status:string; done:boolean }[];
  readiness: { eligible:boolean; ready:boolean; warnings:string[]; fingerprint:string };
  id: string; roadmapId: string | null; title: string; criteria: string; workKind: string; type: string;
  state: string; estimatedHours: number; storyPoints: number | null; externalId: string;
  size: 'SMALL' | 'MEDIUM' | 'LARGE' | 'X-LARGE' | null;
  taskCategory: TaskCategory; taskSubtype: TaskSubtype;
  repeatOfId: string | null; taskId: string | null; sprintId: string | null;
  taskStatus: string | null; roadmapTitle: string | null;
}
export interface TeamMember {
  photoDataUrl?:string|null;
  participationCount?:number; participationJoinedOn?:string|null; participationLeftOn?:string|null; participationClosed?:boolean;
  id: string; name: string; title: string; role: string; teamRole: string; engagement: string;
  active: number; joinedOn: string | null; leftOn: string | null;
}
export interface LeaveRecord { leaveType: "UNSPECIFIED" | "COMPANY_GRANTED" | "ANNUAL" | "OVERTIME"; entitlementEffect: string; overtimeHours: number; overtimeAccounting: string; id: string; memberId: string; memberName: string; sprintName: string; days: number; precision: string; status: string; sprintId: string; start: string | null; end: string | null }
export interface OvertimeBalance { memberId: string; memberName: string; openingHours: number; openingSprint: string | null; openingSprintNumber: number | null; earnedHours: number; manualUsedHours: number; leaveUsedHours: number; balanceHours: number; unknownLeaves: number; warnings: string[] }
export interface OvertimeRecord { id: string; memberId: string; memberName: string; sprintName: string; sprintNumber: number; earnedHours: number; usedCumulativeHours: number; balanceHours: number }
export interface ProductSettings { estimationMode: 'SIZE_AND_HOURS' | 'POINTS_AND_HOURS'; hoursPerDay: number; teamName?:string; workingDays?:number[]; today?:string; workSchedules?:{effectiveFrom:string;hoursPerDay:number;workingDays:number[]}[] }
export interface BauTemplate { id: string; title: string; workKind: string; mode: 'CORE' | 'MANUAL' | 'LEAVE'; daysPerMember: number; active: boolean; sortOrder: number }
export interface OvertimeEntry { planId?:string|null;planClassification?:string;planActualHours?:number; taskId?:string|null;taskTitle?:string|null;roadmapId?:string|null;roadmapTitle?:string|null; id: string; memberId: string; memberName: string; sprintId: string; sprintName: string; earnedHours: number; usedHours: number; plannedHours: number; includeInCapacity: boolean; note: string }
export interface ReportRow {
  id: string; number: number; name: string; end: string; tasks: number; allTasks: number; done: number; undone: number; deliveryRate: number | null;
  sizedTasks: number; sizeSmall: number; sizeMedium: number; sizeLarge: number; sizeXLarge: number;
  pointedTasks: number; storyPointsTotal: number; storyPointsAvailable: boolean;
}
export interface MemberReportRow {
  supportTaskCount:number;unestimatedTaskCount:number;capacitySource:'FROZEN'|'RECALCULATED'|'UNSPECIFIED_SUPPORT'|'UNAVAILABLE';allocationExplicit:boolean;allocatedDays:number|null;leaveDays:number;nonWorkingDays:number|null;overtimeHours:number|null;availableHours:number|null;
  memberId: string; memberName: string; title: string; teamRole: string; engagement: string;
  sprintId: string; sprintNumber: number; sprintName: string; taskCount: number; effortHours: number;
  done: number; undone: number; other: number; sizeSmall: number; sizeMedium: number; sizeLarge: number; sizeXLarge: number;
  pointedTasks: number; storyPointsTotal: number;
}
export interface WorkTypeReportRow {
  sprintId: string; sprintNumber: number; sprintName: string; sprintStatus: string;
  taskCategory: TaskCategory; taskSubtype: TaskSubtype; taskCount: number; effortHours: number; done: number; undone: number;
}
export interface RetroAction {id:string;sprintId:string;title:string;description:string;ownerId:string|null;ownerName:string|null;ownerActive:boolean;dueDate:string|null;status:'OPEN'|'IN_PROGRESS'|'DONE'|'CANCELLED';backlogId:string|null;backlogTitle:string|null;backlogState:string|null;linkedSprintId:string|null;linkedTaskStatus:string|null;version:number;createdAt:string;updatedAt:string}
export interface Retro { sprintId: string; workedWell: string; improve: string; actions: string }
export interface CalendarDay { id: string; date: string; title: string; memberId: string | null; memberName: string | null }
export interface CapacityRow { hoursPerDay?:number; focusPercent?:number; memberId: string; memberName: string; role: string; workingDays: number; nonWorkingDays: number; leaveDays: number; allocatedDays: number; allocationExplicit: boolean; supportMember: boolean; overtimeHours: number; availableHours: number; plannedHours: number; remainingHours: number }

@Injectable({ providedIn: 'root' })
export class ApiService {
  teamName=signal('SprintBoard');
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private async request<T>(response: Observable<T>): Promise<T> {
    try { return await firstValueFrom(response); }
    catch (error: unknown) {
      const problem = error as { error?: { error?: string }; status?: number };
      if (problem.status === 401) {
        await this.auth.refresh();
        throw new Error('Oturumunuz sona erdi. Yeniden giriş yapın.');
      }
      throw new Error(problem.error?.error || (problem.status === 0 ? 'Yerel servis erişilemiyor.' : 'İşlem tamamlanamadı. Tekrar deneyin.'));
    }
  }
  private catalogRequest:Promise<void>|null=null;
  private refreshCatalog():Promise<void> {
    if(!this.catalogRequest)this.catalogRequest=this.request(this.http.get<SubtypeOption[]>('/api/task-subtypes')).then(installSubtypeCatalog).finally(()=>this.catalogRequest=null);
    return this.catalogRequest;
  }
  async get<T>(path:string):Promise<T>{
    const [result]=await Promise.all([this.request(this.http.get<T>(`/api${path}`)),path!=='/task-subtypes'?this.refreshCatalog():Promise.resolve()]);
    if(path==='/task-subtypes')installSubtypeCatalog(result as SubtypeOption[]);
    if(path==='/settings')this.teamName.set((result as ProductSettings).teamName||'VibeCraft Team');
    return result;
  }
  post<T>(path: string, body: object = {}): Promise<T> { return this.request(this.http.post<T>(`/api${path}`, body, { headers: { 'X-CSRF-TOKEN': this.auth.csrfToken() } })); }
  delete<T>(path: string, body?:object): Promise<T> { return this.request(this.http.delete<T>(`/api${path}`, { body, headers: { 'X-CSRF-TOKEN': this.auth.csrfToken() } })); }
  patch<T>(path: string, body: object): Promise<T> { return this.request(this.http.patch<T>(`/api${path}`, body, { headers: { 'X-CSRF-TOKEN': this.auth.csrfToken() } })); }
  async put<T>(path: string, body: object): Promise<T> { const result=await this.request(this.http.put<T>(`/api${path}`, body, { headers: { 'X-CSRF-TOKEN': this.auth.csrfToken() } }));if(path==='/settings'||path==='/settings/work-schedule')this.teamName.set((result as ProductSettings).teamName||'VibeCraft Team');return result; }
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return 'Tarih yok';
  return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
}
export function statusText(value: string): string {
  return ({ active: 'Aktif', planned: 'Planlandı', completed: 'Tamamlandı', todo: 'Yapılacak', doing: 'Devam ediyor', done: 'Done', undone: 'Undone', Ready: 'Hazır', IN_SPRINT: 'Sprintte', Done: 'Done', Undone: 'Undone' } as Record<string, string>)[value] || value;
}
