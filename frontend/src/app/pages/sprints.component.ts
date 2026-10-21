import { SprintEditDialogComponent } from './sprint-edit-dialog.component';
import { FoldDirective } from '../fold.directive';
import {PlannedOvertimeListComponent} from './planned-overtime-list.component';
import {PlannedOvertimeDialogComponent} from './planned-overtime-dialog.component';
import { ListPagerComponent } from '../list-pager.component';
import {WorkItemActionComponent} from './work-item-action.component';
import {DefectReservesComponent,ReserveLinkComponent} from './defect-reserve.component';
import { isBau, effectiveTaskStatus } from '../task-lifecycle';
import { SprintJournalComponent } from './sprint-journal.component';
import { PlanningInsightsComponent } from './planning-insights.component';
import { ModalAccessibilityDirective } from '../modal-accessibility.directive';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { SbBreadcrumbService } from '../shared/sb-breadcrumb.component';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService, BacklogItem, BauTemplate, CapacityRow, ProductSettings, Sprint, SprintSummary, Task, TaskCategory, TaskSubtype, TeamMember, formatDate, statusText } from '../api.service';
import { AuthService } from '../auth.service';
import { RetroComponent } from './retro.component';
import { TASK_CATEGORIES, TASK_CATEGORY_COLORS, TASK_SUBTYPES, availableSubtypes, defaultTaskSubtype, taskCategoryLabel, taskSubtypeLabel } from '../task-taxonomy';
import { SprintReviewComponent } from './sprint-review.component';
import { DefectDialogComponent } from './defect-dialog.component';
import { defectSummary } from '../defect-model';
import { SprintCloseDialogComponent } from './sprint-close-dialog.component';
import { SprintAddDialogComponent } from './sprint-add-dialog.component';
import { SprintBoardComponent } from './sprint-board.component';

@Component({
  standalone: true,
  imports: [ListPagerComponent, ModalAccessibilityDirective, FormsModule, RouterLink],
  template: `
    <div class="page-head"><div><span class="eyebrow">TESLİMAT DÖNEMLERİ</span><h1>Sprintler</h1><p>Aktif, planlanan ve tamamlanan sprintleri ayrı görünümlerde yönetin.</p></div>
      @if (auth.isAdmin()) { <div class="page-actions"><button class="btn primary" (click)="openCreate()">+ Yeni sprint</button></div> }</div>
    <nav class="subtabs" aria-label="Sprint durumu"><a routerLink="/sprints" [queryParams]="{status:'active'}" [class.active]="filter === 'active'">Aktif {{ count('active') }}</a>
      <a routerLink="/sprints" [queryParams]="{status:'planned'}" [class.active]="filter === 'planned'">Planlanan {{ count('planned') }}</a>
      <a routerLink="/sprints" [queryParams]="{status:'completed'}" [class.active]="filter === 'completed'">Geçmiş {{ count('completed') }}</a></nav>
    <app-list-pager #sprintPager [items]="visible" label="Sprintler" />@if (visible.length) { <section class="sprint-list">@for (sprint of sprintPager.rows; track sprint.id) {
      <a class="card sprint-row" [routerLink]="['/sprints', sprint.id, 'summary']"><span><span class="name">{{ sprint.name }}</span><span class="date">{{ formatDate(sprint.start) }} – {{ formatDate(sprint.end) }}</span></span>
        <span class="goal">{{ sprint.goal || 'Hedef belirtilmedi' }}</span><span class="status" [class.active]="sprint.status==='active'" [class.completed]="sprint.status==='completed'" [class.planned]="sprint.status==='planned'">{{ statusText(sprint.status) }}</span>
        <span class="ratio">{{ sprint.doneCount }}/{{ sprint.taskCount }}<small>Done iş</small></span></a>
    }</section> }
    @else { <section class="card empty"><strong>Bu bölümde sprint yok</strong>Yeni sprint oluşturabilir veya diğer sekmeye geçebilirsiniz.</section> }
    @if (error) { <p class="notice warn" role="alert">{{ error }}</p> }
    @if (formOpen) { <div class="modal-layer"><form class="modal" (ngSubmit)="create()"><header><h2>Yeni sprint</h2><p>Planlanan sprinti oluşturun; aktif sprinte dokunulmaz.</p></header>
      <div class="modal-body form-grid"><label class="field">Sprint adı<input name="name" [(ngModel)]="draft.name" required maxlength="160"></label>
        <label class="field">Hedef (isteğe bağlı)<textarea name="goal" [(ngModel)]="draft.goal" maxlength="10000" placeholder="Hedefi daha sonra belirleyebilirsiniz."></textarea></label>
        <div class="form-grid two"><label class="field">Başlangıç<input type="date" name="start" [(ngModel)]="draft.start" required></label><label class="field">Bitiş<input type="date" name="end" [(ngModel)]="draft.end" required></label></div>
        <p class="data-note">Etkin BAU şablonları sprint adıyla eklenir: {{ templateSummary }}. Bu işler otomatik olarak Genel türündeki BAU Roadmap’ine bağlanır; hedef yoksa oluşturulur. Otomatik kişi eforu yalnız çekirdek ekibe verilir (Support ve Architect hariç). On Leave izinlerden türetilir; kapasiteden bir kez düşülür. Şablonlar Ayarlar’da düzenlenir.</p>
      @if (error) { <p class="notice warn" role="alert">{{ error }}</p> }</div><footer><button data-modal-dismiss type="button" class="btn" (click)="setFormOpen(false)">Vazgeç</button><button type="submit" class="btn primary" [disabled]="saving">Sprint oluştur</button></footer></form></div> }
  `,
})
export class SprintsComponent implements OnInit {
  private api = inject(ApiService);
  auth = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  items: SprintSummary[] = [];
  templates: BauTemplate[] = [];
  filter = 'active';
  formOpen = false;
  setFormOpen(open: boolean): void { if(open)this.error=''; this.formOpen=open; this.cdr.detectChanges(); }
  saving = false;
  error = '';
  draft = { name: '', goal: '', start: '', end: '' };
  formatDate = formatDate;
  statusText = statusText;
  get visible(): SprintSummary[] { return this.items.filter(sprint => this.filter === 'planned' ? ['planned', 'draft'].includes(sprint.status) : sprint.status === this.filter); }
  get templateSummary(): string { return this.templates.filter(item => item.active).map(item => item.title).join(' · ') || 'etkin BAU şablonu yok'; }
  count(status: string): number { return this.items.filter(sprint => status === 'planned' ? ['planned', 'draft'].includes(sprint.status) : sprint.status === status).length; }
  async ngOnInit(): Promise<void> {
    this.route.queryParamMap.subscribe(params => { const filter = params.get('status'); this.filter = ['active', 'planned', 'completed'].includes(filter || '') ? filter! : 'active'; this.cdr.detectChanges(); });
    await this.load();
  }
  async load(): Promise<void> { try { [this.items, this.templates] = await Promise.all([this.api.get<SprintSummary[]>('/sprints'), this.api.get<BauTemplate[]>('/bau-templates')]); } catch (error) { this.error = String(error); } finally { this.cdr.detectChanges(); } }
  openCreate(): void { this.formOpen = true; this.cdr.detectChanges(); }
  async create(): Promise<void> {
    this.saving = true; this.error = '';
    try { await this.api.post('/sprints', this.draft); this.formOpen = false; this.draft = { name: '', goal: '', start: '', end: '' }; await this.load(); await this.router.navigate(['/sprints'], { queryParams: { status: 'planned' } }); }
    catch (error) { this.error = String(error); }
    finally { this.saving = false; this.cdr.detectChanges(); }
  }
}

@Component({
  standalone: true,
  imports: [FoldDirective,SprintEditDialogComponent,PlannedOvertimeListComponent,PlannedOvertimeDialogComponent,ListPagerComponent, WorkItemActionComponent,DefectReservesComponent,ReserveLinkComponent,ModalAccessibilityDirective, FormsModule, RouterLink, SprintJournalComponent, PlanningInsightsComponent, SprintBoardComponent, SprintReviewComponent, SprintAddDialogComponent, SprintCloseDialogComponent, DefectDialogComponent, RetroComponent],
  template: `
    @if (sprint; as current) {
      <div class="page-head sprint-detail-head"><div><span class="eyebrow">SPRİNT DETAYI</span><h1>{{ current.name }}</h1><p>{{ current.goal || 'Sprint hedefi belirtilmedi.' }}</p></div>
        <div class="page-actions sprint-detail-actions"><a class="btn subtle" routerLink="/sprints" [queryParams]="{status:current.status === 'completed' ? 'completed' : current.status}">← Sprintler</a>
          @if (auth.isAdmin() && !current.closureFrozen && (current.status === 'active' || current.status === 'planned')) { <button class="btn" (click)="setEditOpen(true)">Sprinti düzenle</button> }
          @if (auth.isAdmin() && (current.status === 'active' || current.status === 'planned')) { <button class="btn primary" (click)="openAddTask()">+ İş ekle</button> }
          @if (auth.isAdmin() && current.status === 'active') { <button class="btn closing-action" (click)="openComplete()">Sprinti tamamla</button> }
          @if (auth.isAdmin() && current.status === 'planned') { <button class="btn closing-action" (click)="start()">Sprinti başlat</button> }
        </div></div>
      @if(current.closureFrozen){<p class="notice" data-testid="closure-frozen">Kapanış kaydı sabitlendi · {{ current.closedAt }}. Görevler, atamalar, kapasite ve tahmin yöntemi kapanış anını gösterir.</p>}
      <nav class="subtabs" aria-label="Sprint alanları"><a [routerLink]="['/sprints', current.id, 'summary']" [class.active]="tab==='summary'">Özet</a><a [routerLink]="['/sprints', current.id, 'planning']" [class.active]="tab==='planning'">Planlama</a><a [routerLink]="['/sprints', current.id, 'capacity']" [class.active]="tab==='capacity'">Kapasite</a><a [routerLink]="['/sprints', current.id, 'effort']" [class.active]="tab==='effort'">Efor matrisi</a><a [routerLink]="['/sprints', current.id, 'board']" [class.active]="tab==='board'">Pano</a><a [routerLink]="['/sprints', current.id, 'journal']" [class.active]="tab==='journal'">Sprint günlüğü</a><a [routerLink]="['/sprints', current.id, 'review']" [class.active]="tab==='review'">Review</a><a [routerLink]="['/sprints', current.id, 'retro']" [class.active]="tab==='retro'">Retro</a></nav>
      @if(tab==='planning'||tab==='capacity'){@defer(on immediate){<app-planning-insights [items]="current.items" [rows]="capacityRows" [loaded]="capacityLoaded" [mode]="settings.estimationMode" [historical]="current.status==='completed'" [editable]="auth.isAdmin()&&current.status!=='completed'" (allocate)="openAllocation($event)" (assign)="openAssignments($event)" />}}
      @if (tab === 'capacity') {
        <section class="card card-pad"><div class="section-head"><div><span class="eyebrow">KİŞİ KAPASİTESİ</span><h2>Planlanan yük / kullanılabilir saat</h2></div></div>
          <details class="ui-help"><summary>Kapasite hesabı hakkında</summary><p class="data-note">Kişiye bu sprintte ayrılan günü belirtin. Çekirdek ekip varsayılan olarak tam uygun gün, Support ise siz gün ayırana kadar 0 gün kapasite getirir. İzin ve çalışılmayan günler ayrılan kapasiteden düşer. Tarihi bilinmeyen eski izinler yalnız sprint toplamından düşülür.</p></details>
          <app-list-pager #capacityPager [items]="capacityRows" label="Kapasite" /><div class="table-wrap"><table class="capacity-table"><caption class="sr-only">Sprint kapasite dağılımı: kişi başına çalışma günü, izin, planlı mesai ve atanan efor.</caption><thead><tr><th scope="col">Kişi</th><th scope="col">Rol</th><th scope="col">Çalışma günü</th><th scope="col">Ayrılan gün</th><th scope="col">İzin</th><th scope="col">Çalışılmayan</th><th scope="col">Planlı mesai</th><th scope="col">Kapasite</th><th scope="col">Atanan</th><th scope="col">Fark</th><th scope="col"><span class="sr-only">İşlem</span></th></tr></thead><tbody>
            @for (row of capacityPager.rows; track row.memberId) { <tr><td><strong>{{ row.memberName }}</strong><small class="table-subtext">{{ row.hoursPerDay ?? settings.hoursPerDay }} sa/gün · %{{ row.focusPercent ?? 100 }} odak</small>@if (row.supportMember) { <small class="table-subtext">Support</small> }</td><td>{{ row.role }}</td><td>{{ row.workingDays }}</td><td><strong>{{ row.allocatedDays }} gün</strong>@if (row.supportMember && !row.allocationExplicit) { <small class="table-subtext">Atama bekliyor</small> }</td><td>{{ row.leaveDays }} gün</td><td>{{ row.nonWorkingDays }} gün</td><td>{{ row.overtimeHours }} sa</td><td>{{ row.availableHours }} sa</td><td>{{ row.plannedHours }} sa</td>
              <td><span class="status" [class.undone]="row.remainingHours<0" [class.done]="row.remainingHours>=0">{{ row.remainingHours }} sa</span></td><td>@if (auth.isAdmin() && current.status !== 'completed') { <div class="capacity-actions"><button class="btn small" (click)="openAllocation(row)">Gün düzenle</button><button class="btn small" [attr.aria-label]="row.memberName+' için planlı mesai ekle'" (click)="openPlannedOvertime(row)">Planlı mesai ekle</button><button class="btn small" [attr.aria-label]="row.memberName+' için planlı mesaileri yönet'" (click)="openOvertimePlans(row)">Planlı mesaileri yönet</button></div> }</td></tr> }
          </tbody></table></div>
        </section>
      } @else if (tab === 'effort') {
        <div class="section-head effort-heading"><div><span class="eyebrow">EFOR DAĞILIMI</span><h2>Görev × kişi görünümü</h2><p class="data-note">Kişi bazlı atamalar ve görev eforları.</p></div></div>
        <section class="card card-pad effort-toolbar ui-toolbar" aria-label="Efor görünümü filtreleri"><label class="field">Görev ara<input type="search" [(ngModel)]="effortQuery" placeholder="Görev adında ara"></label><label class="field">Kişi<select [(ngModel)]="effortMemberId"><option value="">Tüm kişiler</option>@for (member of effortMembers; track member.id) { <option [value]="member.id">{{ member.name }}</option> }</select></label></section>
        <div class="effort-metrics"><div class="card"><small>Gösterilen görev</small><strong>{{ effortItems.length }}</strong></div><div class="card"><small>Atanan efor</small><strong>{{ effortAssignedHours }} sa</strong></div><div class="card"><small>İzin kapasite etkisi</small><strong>{{ effortLeaveHours }} sa</strong></div></div>
        @if (effortGroups.length) { <div class="effort-groups">@for (group of effortGroups; track group.key) { <details appFold class="card effort-group"><summary><span class="planning-group-mark" [style.background]="group.color"></span><span class="fold-title"><strong>{{ group.label }}</strong><small>{{ group.description }}</small></span><span class="effort-group-count">{{ group.items.length }} görev</span><span class="chevron" aria-hidden="true">⌄</span></summary>
          <app-list-pager #effortPager [items]="group.items" [label]="group.label" /><div class="effort-rows">@for (item of effortPager.rows; track item.id) { <article class="effort-row" [style.border-left-color]="taskColor(item)"><div class="effort-task"><strong>{{ item.name }}</strong><span>{{ taxonomyLabel(item) }} · {{ relativeEstimate(item) }} · {{ isBau(item)?'Done · otomatik':statusText(item.status) }}</span></div>
            <div class="effort-allocations">@for (assignment of visibleEffortAssignments(item); track assignment.memberId) { <div class="effort-person"><strong>{{ assignment.memberName }}</strong><span>@if (item.workKind === 'LEAVE') { {{ assignment.leaveDays || 0 }} gün · {{ (assignment.leaveDays || 0) * (assignment.hoursPerDay ?? settings.hoursPerDay) }} sa izin } @else if (assignment.supportOnly) { X · efor yok } @else { {{ assignment.planningHours ?? assignment.estimatedHours }} sa@if(item.taskSubtype==='DEFECT_SUPPORT'){ · kalan rezerv (ayrılan {{assignment.estimatedHours}} sa)} }</span></div> } @empty { <span class="effort-unassigned">{{ effortMemberId ? 'Bu kişiye atanmamış' : 'Atama yok' }}</span> }</div>
            <div class="effort-total"><small>{{ item.workKind === 'LEAVE' ? 'Kapasite etkisi' : 'Atanan efor' }}</small><strong>{{ visibleEffortHours(item) }} sa</strong>@if (item.workKind !== 'LEAVE') { <small>Görev tahmini {{ item.estimatedHours }} sa</small> }</div></article> }</div>
        </details> }</div> } @else { <section class="card empty"><strong>Bu filtrede görev bulunamadı</strong>Aramayı veya kişi filtresini değiştirebilirsiniz.</section> }
      } @else if (tab === 'planning') {
        @if(current.defectReserves?.length){<details appFold class="card card-pad"><summary><h2>Defect Support rezerv planı</h2></summary>@defer(on immediate){<app-defect-reserves [rows]="current.defectReserves||[]" />}</details>}<div class="section-head planning-heading"><div><span class="eyebrow">SPRİNT PLANI</span><h2>İşler ve atamalar</h2><p class="data-note">BAU ve teslimat işleri türlerine göre ayrılır. Efor saatleri ile izin kaynaklı kapasite kaybı ayrı izlenir.</p></div><span class="status">{{ current.items.length }} iş</span></div>
        <div class="planning-groups">@for (group of planningGroups; track group.key) {
          <details appFold class="card planning-group" [attr.aria-label]="group.label + ' işleri'"><summary class="planning-group-head"><div><span class="planning-group-mark" [style.background]="group.color"></span><div><h3>{{ group.label }}</h3><p>{{ group.description }}</p></div></div><span class="planning-group-total">{{ group.items.length }} iş · {{ groupHours(group.items) }} sa efor</span></summary>
            <app-list-pager #planPager [items]="group.items" [label]="group.label" /><div class="table-wrap planning-table-wrap"><table class="planning-table"><caption class="sr-only">Sprint planlama listesi: iş, göreli tahmin, efor, atamalar ve durum.</caption><thead><tr><th scope="col">İş</th><th scope="col">Göreli tahmin</th><th scope="col">Efor / etki</th><th scope="col">Atamalar</th><th scope="col">Durum</th><th scope="col"><span class="sr-only">İşlem</span></th></tr></thead><tbody>
              @for (item of planPager.rows; track item.id) { <tr [attr.data-planning-task]="item.id"><td><span class="task-swatch" [style.background]="taskColor(item)" aria-hidden="true"></span><strong class="task-title">{{ item.name }}</strong><small class="table-subtext">{{ taxonomyLabel(item) }}</small></td>
                <td><span class="estimate-badge">{{ relativeEstimate(item) }}</span></td><td>@if (item.workKind === 'LEAVE') { <strong>{{ leaveHours(item) }} sa</strong><small class="table-subtext">{{ leaveDays(item) }} gün · kapasiteden düşer</small> } @else { <strong>{{ item.planningHours ?? item.estimatedHours }} sa</strong>@if(item.taskSubtype==='DEFECT_SUPPORT'){<small class="table-subtext">Kalan rezerv · başlangıç {{item.estimatedHours}} sa</small>}@if(item.taskCategory==='DEFECT' && item.reserveTaskId){<small class="table-subtext">Rezervden karşılanan: {{ item.reserveCoveredHours ?? 0 }} sa</small><small class="table-subtext">Ek plan yükü: {{ item.extraPlanHours ?? 0 }} sa</small>} }</td>
                <td class="assignment-cell">{{ assignmentNames(item) }}@if(item.taskCategory==='DEFECT'&&auth.isAdmin()&&current.status!=='completed'){@defer(on immediate){<app-reserve-link [task]="item" [sprint]="current" (updated)="load(current.id)" />}}@if(item.reserveTaskId){<small class="table-subtext">Defect Support rezervine bağlı</small>}</td><td><span class="status" [class.done]="effectiveStatus(item)==='done'" [class.undone]="effectiveStatus(item)==='undone'" [class.doing]="effectiveStatus(item)==='doing'" [class.todo]="effectiveStatus(item)==='todo'">{{ isBau(item)?'Done · otomatik':statusText(item.status) }}</span></td>
                <td>@if(item.taskCategory==='DEFECT'){<small>{{ defectSummary(item.defect) }}</small>}<div class="table-actions">@if(auth.isAdmin() && current.status!=='completed' && item.taskCategory==='DEFECT'){<button class="btn small" (click)="openDefect(item)">Defect takibi</button>}@if (auth.isAdmin() && !current.closureFrozen) { @if(current.status!=='completed'){<button class="btn small" (click)="openRename(item)">Adı düzenle</button>} <button class="btn small" (click)="openClassification(item)">Türü düzenle</button> } @if (auth.isAdmin() && current.status !== 'completed' && item.workKind !== 'LEAVE') { <button class="btn small" (click)="openAssignments(item)">Atama düzenle</button> }</div></td></tr> }
            </tbody></table></div>
          </details>
        }</div>
      } @else if (tab === 'retro') {
        <app-retro [sprintId]="current.id" />
      } @else if (tab === 'board') {
        @defer (on immediate) { <app-sprint-board [sprint]="current" [settings]="settings" [editable]="auth.isAdmin()" [busy]="saving" (statusChange)="changeStatus($event.task,$event.status)" (updated)="load(current.id)" /> } @placeholder { <div class="loading">Pano yükleniyor…</div> }
      } @else if(tab==='journal'){@defer(on immediate){<app-sprint-journal [sprint]="current" />}
      } @else if (tab === 'review') {
        @defer (on immediate) { <app-sprint-review [sprint]="current" [settings]="settings" /> } @placeholder { <div class="loading">Review yükleniyor…</div> }
      } @else {
        <section class="card sprint-summary-hero"><div><span class="eyebrow">DÖNEM ÖZETİ</span><h2>{{ formatDate(current.start) }} – {{ formatDate(current.end) }}</h2><p>{{ current.goal || 'Sprint hedefi belirtilmedi.' }}</p></div><div class="sprint-summary-progress"><span class="status" [class.active]="current.status==='active'" [class.completed]="current.status==='completed'">{{ statusText(current.status) }}</span><strong>{{ deliveryDone }}/{{ deliveryItems.length }}</strong><small>teslimat işi tamamlandı</small><div class="progress-track" role="progressbar" [attr.aria-valuenow]="deliveryPercent" aria-valuemin="0" aria-valuemax="100" [attr.aria-label]="'Teslimat tamamlanma oranı yüzde ' + deliveryPercent"><span [style.width.%]="deliveryPercent"></span></div></div></section>
        <div class="sprint-summary-metrics"><div class="card"><small>Teslimat</small><strong>{{ deliveryDone }}/{{ deliveryItems.length }}</strong><span>Done / toplam iş</span></div><div class="card"><small>Açık / Undone</small><strong>{{ deliveryOpen }} / {{ deliveryUndone }}</strong><span>Teslimat kararları</span></div><div class="card"><small>Atanan efor</small><strong>{{ capacityLoaded ? assignedHours + ' sa' : '—' }}</strong><span>İzin efor dahil değil</span></div><div class="card"><small>Hesaplanan kapasite</small><strong>{{ capacityLoaded ? availableHours + ' sa' : '—' }}</strong><span>{{ capacityLoaded ? (current.closureFrozen ? 'Kapanışta sabitlendi' : current.status === 'completed' ? 'Tarihsel snapshot değil' : 'İzin sonrası takım toplamı') : 'Hesaplanıyor' }}</span></div></div>
        <div class="detail-layout sprint-summary-detail"><section class="card card-pad"><div class="section-head"><div><span class="eyebrow">İŞ DAĞILIMI</span><h2>Sprint planı</h2></div><a class="btn small" [routerLink]="['/sprints',current.id,'planning']">Planlamayı aç →</a></div>
          <div class="summary-kind-list">@for (group of planningGroups; track group.key) { <div class="summary-kind-row"><span class="planning-group-mark" [style.background]="group.color"></span><strong>{{ group.label }}</strong><span>{{ group.items.length }} iş</span><span>{{ groupHours(group.items) }} sa</span></div> }</div>
          @if (subtypeSummary.length) { <div class="summary-subtypes"><small>ALT KIRILIMLAR</small><div>@for (row of subtypeSummary; track row.subtype) { <span>{{ taskSubtypeLabel(row.subtype) }} <strong>{{ row.count }}</strong></span> }</div></div> }
          @if (!planningGroups.length) { <p class="data-note">Henüz sprint işi bulunmuyor.</p> }
        </section><aside class="stack"><section class="card card-pad"><span class="eyebrow">KAPASİTE ETKİSİ</span><h2>Takım zamanı</h2><div class="summary-capacity-line"><span>İzin</span><strong>{{ capacityLoaded ? leaveDayTotal + ' gün · ' + leaveHourTotal + ' sa' : '—' }}</strong></div><div class="summary-capacity-line"><span>Planlı mesai</span><strong>{{ capacityLoaded ? overtimeHours + ' sa' : '—' }}</strong></div><div class="summary-capacity-line"><span>Efor–kapasite farkı</span><strong>{{ capacityLoaded ? remainingHours + ' sa' : '—' }}</strong></div><p class="data-note">İzin görevi efora eklenmez; kullanılabilir kapasiteden düşer. {{ current.closureFrozen ? 'Kapasite kapanış anında sabitlenmiştir.' : 'Eski sprint kapasitesi kayıtlı bilgilerden hesaplanır; kaynak snapshot’ı değildir.' }}</p></section>
          <section class="card card-pad"><span class="eyebrow">EKİP</span><h2>Atanan kişiler</h2><p class="muted">{{ teamNames || 'Atama bulunamadı' }}</p><p class="data-note">{{ settings.estimationMode === 'SIZE_AND_HOURS' ? 'Göreli büyüklük Size, kişi kapasitesi ve atamalar saat ile izlenir.' : 'Göreli büyüklük Story Point, kişi kapasitesi ve atamalar saat ile izlenir.' }}</p></section></aside></div>
      }
    } @else if (error) { <div class="card empty"><strong>Sprint yüklenemedi</strong>{{ error }}</div> } @else { <div class="loading">Sprint yükleniyor…</div> }
    @if (error && sprint) { <p class="notice warn" role="alert">{{ error }}</p> }
    @if (actionMessage && sprint) { <p class="notice" role="status">{{ actionMessage }}</p> }
    @if(renameTask){@defer(on immediate){<app-work-item-action [id]="renameTask.id" [title]="renameTask.name" (cancel)="closeRename()" (saved)="renamed()" />}}
    @if(defectTask){<app-defect-dialog [backlogId]="defectTask.backlogId" [title]="defectTask.name" (cancel)="closeDefect()" (saved)="defectSaved()" />}
    @if(showEdit && sprint){<app-sprint-edit-dialog [sprint]="sprint" (cancel)="setEditOpen(false)" (saved)="sprintEdited($event)" />}
    @if(showComplete && sprint){<app-sprint-close-dialog [sprintId]="sprint.id" (cancel)="closeComplete()" (completed)="completed()" />}
    @if (showAddTask && sprint) { @defer(on immediate){<app-sprint-add-dialog [sprintId]="sprint.id" (cancel)="closeAddTask()" (added)="taskAdded()" />} }
    @if (assignmentTask) { <div class="modal-layer" role="presentation"><div class="modal assignment-modal" role="dialog" aria-modal="true" aria-labelledby="assignment-title"><header><h2 id="assignment-title">Atamaları düzenle</h2><p>{{ assignmentTask.name }} · kişi başı efor girin veya efor tüketmeyen X desteği seçin.</p></header>
      <div class="modal-body assignment-list">@for (member of members; track member.id) { <div class="assignment-row" [class.selected]="assigned(member.id)"><label class="assignment-person"><input type="checkbox" [checked]="assigned(member.id)" (change)="toggleAssignment(member.id)"><span>{{ member.name }}@if (!member.active) { <small>(geçmiş atama)</small> }</span></label>
        @if (assigned(member.id)) { <div class="assignment-controls"><select [attr.aria-label]="member.name + ' atama türü'" [(ngModel)]="assignmentModes[member.id]" (ngModelChange)="refreshAssignmentPreview()"><option value="hours">Efor (saat)</option><option value="support">X · Support</option></select>
          @if (assignmentModes[member.id] === 'hours') { <label class="assignment-hours"><span class="sr-only">{{ member.name }} tahmini saat</span><input type="number" min="0" max="1000" step="0.5" [attr.aria-label]="member.name + ' tahmini saat'" [(ngModel)]="assignmentHours[member.id]" (ngModelChange)="refreshAssignmentPreview()"><span>sa</span></label> } @else { <span class="muted assignment-no-effort">Efor yok</span> }</div> }</div> }
        @defer(on immediate){<app-planning-insights [items]="sprint?.items || []" [rows]="capacityRows" [loaded]="capacityLoaded" [mode]="settings.estimationMode" [taskId]="assignmentTask.id" [draft]="assignmentDraft" />}
        @if (assignmentError) { <p class="notice warn" role="alert">{{ assignmentError }}</p> }
      </div>
      <footer><button data-modal-dismiss type="button" class="btn" (click)="closeAssignments()">Vazgeç</button><button type="button" class="btn primary" [disabled]="saving" (click)="saveAssignments()">{{ saving ? 'Kaydediliyor…' : 'Atamaları kaydet' }}</button></footer></div></div> }
    @if (classificationTask) { <div class="modal-layer" role="presentation"><div class="modal taxonomy-modal" role="dialog" aria-modal="true" aria-labelledby="taxonomy-title"><header><h2 id="taxonomy-title">İş tipini düzenle</h2><p>{{ classificationTask.name }}</p></header>
      <div class="modal-body form-grid"><label class="field">İş tipi<select name="classificationCategory" [(ngModel)]="classificationCategory" (ngModelChange)="changeClassificationCategory($event)">@for (option of taskCategories; track option.value) { <option [value]="option.value">{{ option.label }} · {{ option.description }}</option> }</select></label>
        @if (classificationSubtypeOptions.length) { <label class="field">Alt kırılım<select name="classificationSubtype" [(ngModel)]="classificationSubtype" [required]="['TEST','DEFECT','BAU'].includes(classificationCategory)">@if(!['TEST','DEFECT','BAU'].includes(classificationCategory)){<option [ngValue]="null">Alt kırılım yok</option>}@for (option of classificationSubtypeOptions; track option.value) { <option [value]="option.value">{{ option.label }}</option> }</select><small>Bu alan raporlarda ayrı kırılım olarak gösterilir.</small></label> }
        @if (classificationError) { <p class="notice warn" role="alert">{{ classificationError }}</p> }
      @if (error) { <p class="notice warn" role="alert">{{ error }}</p> }</div><footer><button data-modal-dismiss type="button" class="btn" (click)="closeClassification()">Vazgeç</button><button type="button" class="btn primary" [disabled]="saving || (['TEST','DEFECT','BAU'].includes(classificationCategory) && !classificationSubtype)" (click)="saveClassification()">{{ saving ? 'Kaydediliyor…' : 'İş tipini kaydet' }}</button></footer></div></div> }
    @if(overtimePlansRow&&sprint){@defer(on immediate){<app-planned-overtime-list [sprint]="sprint" [row]="overtimePlansRow" (closed)="closeOvertimePlans()" (changed)="overtimePlansChanged($event)" />}}
    @if(plannedOvertimeRow&&sprint){@defer(on immediate){<app-planned-overtime-dialog [sprint]="sprint" [row]="plannedOvertimeRow" (cancelled)="closePlannedOvertime()" (saved)="plannedOvertimeSaved($event)" />}}
    @if (allocationRow) { <div class="modal-layer"><div class="modal"><header><h2>Sprint kapasitesi</h2><p>{{ allocationRow.memberName }} · bu sprintte ekibe ayrılan gün</p></header>
      <div class="modal-body form-grid"><label class="field">Ayrılan gün<input type="number" min="0" max="100" step="0.5" [(ngModel)]="allocationDays"></label><p class="data-note">0 gün: yalnız X desteği. Örneğin 15 günlük sprintte Support için 5 gün ayıracaksanız 5 girin. İzinler bu günlerden ayrıca düşer.</p></div>
      <footer><button data-modal-dismiss class="btn" (click)="closeAllocation()">Vazgeç</button><button class="btn primary" [disabled]="saving || allocationDays < 0" (click)="saveAllocation()">Kaydet</button></footer></div></div> }
    @if (pendingUndoneTask) { <div class="modal-layer"><div class="modal"><header><h2>Undone gerekçesi</h2><p>{{ pendingUndoneTask.name }} neden tamamlanmadı?</p></header>
      <div class="modal-body"><p class="data-note">Açıklama görevle birlikte kaydedilir. Vazgeçerseniz durum değişmez.</p><label class="field">Açıklama (zorunlu)<textarea [ngModel]="undoneNote" (ngModelChange)="updateUndoneNote($event)" name="undoneNote" required rows="4" maxlength="2000" placeholder="Tamamlanmama nedeni ve kalan işi kısaca açıklayın"></textarea></label>@if(error){<p class="notice warn" role="alert">{{ error }}</p>}</div>
      <footer><button data-modal-dismiss class="btn" [disabled]="saving" (click)="cancelUndone()">Vazgeç</button><button class="btn primary" [disabled]="!undoneNote.trim() || saving" (click)="confirmUndone()">Undone olarak kaydet</button></footer></div></div> }
  `,
  styles:[`.capacity-actions{display:flex;flex-direction:column;align-items:stretch;gap:6px;min-width:145px}`],
})
export class SprintDetailComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  auth = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private breadcrumb = inject(SbBreadcrumbService);
  ngOnDestroy(): void { this.breadcrumb.clear(); }
  sprint: Sprint | null = null;
  settings: ProductSettings = { estimationMode: 'SIZE_AND_HOURS', hoursPerDay: 8 };
  tab = 'summary';
  error = '';
  saving = false;
  renameTask:Task|null=null;
  openRename(task:Task){this.renameTask=task;this.cdr.detectChanges();}
  closeRename(){this.renameTask=null;this.cdr.detectChanges();}
  async renamed(){this.closeRename();if(this.sprint)await this.load(this.sprint.id);this.actionMessage='Görev adı güncellendi.';this.cdr.detectChanges();}
  defectTask:Task|null=null;defectSummary=defectSummary;
  openDefect(t:Task){this.defectTask=t;this.cdr.detectChanges();}
  closeDefect(){this.defectTask=null;this.cdr.detectChanges();}
  async defectSaved(){this.closeDefect();if(this.sprint)await this.load(this.sprint.id);}
  showEdit = false;
  setEditOpen(open:boolean){this.showEdit=open;this.cdr.detectChanges();}
  async sprintEdited(id:string){this.showEdit=false;await this.load(id);this.actionMessage='Sprint bilgileri güncellendi. Kapasite yeni tarihlere göre hesaplandı.';this.cdr.detectChanges();}
  showComplete = false;
  showAddTask = false;
  selectedBacklogId = '';
  availableBacklog: BacklogItem[] = [];
  members: TeamMember[] = [];
  assignmentTask: Task | null = null;
  classificationTask: Task | null = null;
  classificationCategory: TaskCategory = 'DEV';
  classificationSubtype: TaskSubtype = null;
  classificationError = '';
  pendingUndoneTask: Task | null = null;
  undoneNote = '';
  assignmentHours: Record<string, number> = {};
  assignmentModes: Record<string, 'hours' | 'support'> = {};
  assignmentDraft:Task['assignments']=[];
  refreshAssignmentPreview(){this.assignmentDraft=Object.entries(this.assignmentHours).map(([memberId,hours])=>({memberId,memberName:this.members.find(m=>m.id===memberId)?.name||memberId,estimatedHours:this.assignmentModes[memberId]==='support'?0:Number(hours),supportOnly:this.assignmentModes[memberId]==='support'}));this.cdr.detectChanges();}
  assignmentError = '';
  effortQuery = '';
  effortMemberId = '';
  capacityRows: CapacityRow[] = [];
  capacityLoaded = false;
  private capacityRequestId = 0;
  overtimePlansRow:CapacityRow|null=null;
  openOvertimePlans(row:CapacityRow){if(!this.auth.isAdmin()||!this.sprint||this.sprint.status==='completed')return;this.overtimePlansRow=row;this.cdr.detectChanges();}
  closeOvertimePlans(){this.overtimePlansRow=null;this.cdr.detectChanges();}
  async overtimePlansChanged(id:string){if(this.sprint?.id!==id)return;const member=this.overtimePlansRow?.memberId;await this.loadCapacity(id);if(this.sprint?.id!==id)return;if(this.overtimePlansRow?.memberId===member)this.overtimePlansRow=this.capacityRows.find(r=>r.memberId===member)||null;this.actionMessage='Mesai planı güncellendi. Hakediş ve görev eforu değişmedi.';this.cdr.detectChanges();}
  plannedOvertimeRow:CapacityRow|null=null;
  openPlannedOvertime(row:CapacityRow){if(!this.auth.isAdmin()||!this.sprint||this.sprint.status==='completed')return;this.plannedOvertimeRow=row;this.cdr.detectChanges();}
  closePlannedOvertime(){this.plannedOvertimeRow=null;this.cdr.detectChanges();}
  async plannedOvertimeSaved(id:string){this.closePlannedOvertime();if(this.sprint?.id!==id)return;this.actionMessage='Planlı mesai kapasiteye eklendi. Hakediş ve görev eforu değişmedi.';await this.loadCapacity(id);this.cdr.detectChanges();}
  allocationRow: CapacityRow | null = null;
  allocationDays = 0;
  actionMessage = '';
  formatDate = formatDate;
  statusText = statusText;
  taskCategories = TASK_CATEGORIES;
  taskSubtypeLabel = taskSubtypeLabel;
  private readonly kindOrder = ['BAU', 'DEV', 'DESIGN', 'ANALYZE', 'TEST', 'DEFECT', 'OTHER'];
  private readonly kindMeta: Record<string, { label: string; description: string; color: string }> = {
    BAU: { label: 'BAU', description: 'Tekrarlayan ekip işleri ve izin', color: TASK_CATEGORY_COLORS.BAU },
    DEV: { label: 'DEV', description: 'Geliştirme işleri', color: TASK_CATEGORY_COLORS.DEV },
    DESIGN: { label: 'DESIGN', description: 'Tasarım işleri', color: TASK_CATEGORY_COLORS.DESIGN },
    ANALYZE: { label: 'ANALYZE', description: 'Analiz ve keşif işleri', color: TASK_CATEGORY_COLORS.ANALYZE },
    TEST: { label: 'TEST', description: 'Fonksiyonel, E2E, regresyon ve performans testleri', color: TASK_CATEGORY_COLORS.TEST },
    DEFECT: { label: 'DEFECT', description: 'Test ve üretim hatası düzeltmeleri', color: TASK_CATEGORY_COLORS.DEFECT },
    OTHER: { label: 'DİĞER', description: 'Diğer teslimat işleri', color: TASK_CATEGORY_COLORS.OTHER },
  };
  get planningGroups(): { key: string; label: string; description: string; color: string; items: Task[] }[] {
    return this.kindOrder.map(key => ({ key, ...this.kindMeta[key], items: (this.sprint?.items || []).filter(item => this.groupKey(item) === key) })).filter(group => group.items.length > 0);
  }
  get effortMembers(): { id: string; name: string }[] {
    const people = new Map<string, string>();
    for (const item of this.sprint?.items || []) for (const assignment of item.assignments) people.set(assignment.memberId, assignment.memberName);
    return [...people].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }
  get effortItems(): Task[] {
    const query = this.effortQuery.trim().toLocaleLowerCase('tr-TR');
    return (this.sprint?.items || []).filter(item => (!query || item.name.toLocaleLowerCase('tr-TR').includes(query))
      && (!this.effortMemberId || item.assignments.some(assignment => assignment.memberId === this.effortMemberId)));
  }
  get effortGroups(): { key: string; label: string; description: string; color: string; items: Task[] }[] {
    const shown = new Set(this.effortItems.map(item => item.id));
    return this.planningGroups.map(group => ({ ...group, items: group.items.filter(item => shown.has(item.id)) })).filter(group => group.items.length > 0);
  }
  visibleEffortAssignments(item: Task): Task['assignments'] { return this.effortMemberId ? item.assignments.filter(assignment => assignment.memberId === this.effortMemberId) : item.assignments; }
  visibleEffortHours(item: Task): number { return this.visibleEffortAssignments(item).reduce((total, assignment) => total + (item.workKind === 'LEAVE' ? (assignment.leaveDays || 0) * (assignment.hoursPerDay ?? this.settings.hoursPerDay) : assignment.supportOnly ? 0 : (assignment.planningHours ?? assignment.estimatedHours)), 0); }
  get effortAssignedHours(): number { return this.effortItems.filter(item => item.workKind !== 'LEAVE').reduce((total, item) => total + this.visibleEffortHours(item), 0); }
  get effortLeaveHours(): number { return this.effortItems.filter(item => item.workKind === 'LEAVE').reduce((total, item) => total + this.visibleEffortHours(item), 0); }
  get subtypeSummary(): { subtype: Exclude<TaskSubtype, null>; count: number }[] {
    const counts = new Map<Exclude<TaskSubtype, null>, number>();
    for (const item of this.sprint?.items || []) if (item.taskSubtype) counts.set(item.taskSubtype, (counts.get(item.taskSubtype) || 0) + 1);
    return [...counts].map(([subtype, count]) => ({ subtype, count })).sort((a, b) => b.count - a.count);
  }
  get classificationSubtypeOptions(): { value: Exclude<TaskSubtype, null>; label: string }[] { return availableSubtypes(this.classificationCategory,this.classificationTask?.taskCategory===this.classificationCategory?this.classificationTask.taskSubtype:null); }
  private groupKey(item: Task): string { return item.taskCategory && this.kindMeta[item.taskCategory] ? item.taskCategory : this.legacyCategory(item); }
  private legacyCategory(item: Task): string { if (item.type === 'BAU' || item.externalId?.startsWith('BAU-AUTO:')) return 'BAU'; return ({ DEVELOPMENT: 'DEV', DESIGN: 'DESIGN', ANALYSIS: 'ANALYZE', TEST: 'TEST' } as Record<string, string>)[(item.workKind || '').toUpperCase()] || 'OTHER'; }
  taxonomyLabel(item: Task): string { const category = taskCategoryLabel(item.taskCategory || this.legacyCategory(item)); return item.taskSubtype ? `${category} · ${taskSubtypeLabel(item.taskSubtype)}` : category; }
  sizeLabel(size: string): string { return ({ SMALL: 'Small', MEDIUM: 'Medium', LARGE: 'Large', 'X-LARGE': 'X-Large' } as Record<string, string>)[size] || size; }
  relativeEstimate(item: Task): string { return this.settings.estimationMode === 'SIZE_AND_HOURS' ? (item.size ? `Size ${this.sizeLabel(item.size)}` : 'Size belirlenmedi') : (item.storyPoints != null ? `${item.storyPoints} SP` : 'SP belirlenmedi'); }
  leaveDays(item: Task): number { return item.assignments.reduce((total, assignment) => total + (assignment.leaveDays || 0), 0); }
  leaveHours(item: Task): number { return item.assignments.reduce((sum,a)=>sum+(a.leaveDays||0)*(a.hoursPerDay??this.settings.hoursPerDay),0); }
  groupHours(items: Task[]): number { return items.reduce((total, item) => total + (item.workKind === 'LEAVE' ? 0 : (item.planningHours ?? item.estimatedHours)), 0); }
  get deliveryItems(): Task[] { return (this.sprint?.items || []).filter(item => this.groupKey(item) !== 'BAU'); }
  get deliveryDone(): number { return this.deliveryItems.filter(item => item.status === 'done').length; }
  get deliveryUndone(): number { return this.deliveryItems.filter(item => item.status === 'undone').length; }
  get deliveryOpen(): number { return this.deliveryItems.filter(item => item.status === 'todo' || item.status === 'doing').length; }
  get deliveryPercent(): number { return this.deliveryItems.length ? Math.round(this.deliveryDone * 100 / this.deliveryItems.length) : 0; }
  get assignedHours(): number { return this.capacityRows.reduce((total, row) => total + row.plannedHours, 0); }
  get availableHours(): number { return this.capacityRows.reduce((total, row) => total + row.availableHours, 0); }
  get remainingHours(): number { return this.capacityRows.reduce((total, row) => total + row.remainingHours, 0); }
  get overtimeHours(): number { return this.capacityRows.reduce((total, row) => total + row.overtimeHours, 0); }
  get leaveDayTotal(): number { return this.capacityRows.reduce((total, row) => total + row.leaveDays, 0); }
  get leaveHourTotal(): number { return this.capacityRows.reduce((sum,r)=>sum+r.leaveDays*(r.hoursPerDay??this.settings.hoursPerDay),0); }
  get teamNames(): string { return [...new Set(this.sprint?.items.flatMap(item => item.assignments.map(assignment => assignment.memberName)).filter(Boolean) || [])].join(' · '); }
  assignmentNames(item: Task): string { if (item.workKind === 'LEAVE') return item.assignments.map(row => `${row.memberName} (${row.leaveDays} gün izin)`).join(', ') || 'Bu sprintte izin yok'; return item.assignments.map(assignment => `${assignment.memberName}${assignment.supportOnly ? ' (X)' : assignment.estimatedHours ? ' (' + assignment.estimatedHours + ' sa)' : ''}`).filter(Boolean).join(', ') || 'Atanmamış'; }
  taskColor(item: Task): string { const palette = ['#2563eb', '#7c3aed', '#0d9488', '#d97706', '#db2777', '#0891b2']; const key = item.backlogId || item.id; let hash = 0; for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0; return palette[hash % palette.length]; }
  ngOnInit(): void { this.route.paramMap.subscribe(params => { const nextTab = params.get('tab') || 'summary'; const id = params.get('id') || ''; if (nextTab !== this.tab || id !== this.sprint?.id) { this.overtimePlansRow=null; this.plannedOvertimeRow=null; this.renameTask=null; this.pendingUndoneTask=null; this.undoneNote=''; this.defectTask=null; this.showComplete=false; this.showAddTask=false; this.allocationRow = null; this.closeAssignments(); this.closeClassification(); this.actionMessage = ''; } if (id !== this.sprint?.id) { this.effortQuery = ''; this.effortMemberId = ''; } this.tab = nextTab; this.cdr.detectChanges(); this.load(id); }); }
  private sprintLoadVersion=0;
  async load(id: string): Promise<void> {
    const version=++this.sprintLoadVersion;this.capacityLoaded=false;++this.capacityRequestId;if(id!==this.sprint?.id)this.sprint=null;
    try { const [sprint,settings]=await Promise.all([this.api.get<Sprint>(`/sprints/${encodeURIComponent(id)}`),this.api.get<ProductSettings>('/settings')]);if(version!==this.sprintLoadVersion)return;this.sprint=sprint;this.breadcrumb.set(sprint?.name||'');this.settings=sprint?.closureSettings||sprint?.workSettings||settings;this.error='';if(['planning','capacity','summary'].includes(this.tab))await this.loadCapacity(id);}
    catch(error){if(version===this.sprintLoadVersion){this.error=String(error);this.sprint=null;}}
    finally{if(version===this.sprintLoadVersion)this.cdr.detectChanges();}
  }
  isBau=isBau; effectiveStatus=effectiveTaskStatus;
  async changeStatus(item: Task, value: string): Promise<void> {
    if(isBau(item))return;
    if(this.saving||!this.auth.canWork(item)||this.sprint?.status!=='active'||this.sprint.closureFrozen||item.sprintId!==this.sprint.id)return;
    if (value === 'undone') { this.error=''; this.pendingUndoneTask = item; this.undoneNote = item.statusNote || ''; this.cdr.detectChanges(); return; }
    this.saving=true;this.error='';
    try { await this.api.patch(`${this.auth.isAdmin()?'/tasks/':'/self/tasks/'}${encodeURIComponent(item.id)}${this.auth.isAdmin()?'':'/status'}`, { status: value, expectedStatus:item.status }); if(this.sprint?.id===item.sprintId)await this.load(item.sprintId); }
    catch (error) { this.error = String(error); }
    finally { this.saving=false;this.cdr.detectChanges(); }
  }
  updateUndoneNote(value:string):void {this.undoneNote=value;this.cdr.detectChanges();}
  cancelUndone(): void { const id = this.pendingUndoneTask?.sprintId; this.pendingUndoneTask = null; this.undoneNote = ''; this.cdr.detectChanges(); if (id && id===this.sprint?.id) this.load(id); }
  async confirmUndone(): Promise<void> { if (this.saving || !this.pendingUndoneTask || !this.undoneNote.trim() || this.pendingUndoneTask.sprintId!==this.sprint?.id) return; const task = this.pendingUndoneTask; this.saving = true; this.error='';
    try { await this.api.patch(`${this.auth.isAdmin()?'/tasks/':'/self/tasks/'}${encodeURIComponent(task.id)}${this.auth.isAdmin()?'':'/status'}`, { status: 'undone', note: this.undoneNote.trim(), expectedStatus:task.status }); this.pendingUndoneTask = null; this.undoneNote = ''; if(this.sprint?.id===task.sprintId)await this.load(task.sprintId); }
    catch (error) { this.error = String(error); } finally { this.saving = false; this.cdr.detectChanges(); }
  }
  async loadCapacity(id: string): Promise<void> { const requestId = ++this.capacityRequestId; this.capacityLoaded = false; try { const rows = await this.api.get<CapacityRow[]>(`/sprints/${encodeURIComponent(id)}/capacity`); if (requestId === this.capacityRequestId) { this.capacityRows = rows; this.capacityLoaded = true; } } catch (error) { if (requestId === this.capacityRequestId) this.error = String(error); } finally { this.cdr.detectChanges(); } }
  openAllocation(row: CapacityRow): void { this.allocationRow = row; this.allocationDays = row.allocatedDays; this.cdr.detectChanges(); }
  closeAllocation(): void { this.allocationRow = null; this.cdr.detectChanges(); }
  async saveAllocation(): Promise<void> { if (!this.sprint || !this.allocationRow) return; this.saving = true; this.error = ''; this.actionMessage = ''; ++this.capacityRequestId; try { const updated = await this.api.put<CapacityRow>(`/sprints/${encodeURIComponent(this.sprint.id)}/capacity/${encodeURIComponent(this.allocationRow.memberId)}`, { allocatedDays: this.allocationDays }); this.capacityRows = this.capacityRows.map(row => row.memberId === updated.memberId ? updated : row); this.allocationRow = null; this.actionMessage = `${updated.memberName} için ayrılan gün kaydedildi.`; } catch (error) { this.error = String(error); } finally { this.saving = false; this.cdr.detectChanges(); } }
  async openAssignments(task: Task): Promise<void> { const requestedTab = this.tab; const requestedSprintId = this.sprint?.id; try { const assignedIds = new Set(task.assignments.map(item => item.memberId)); const members = (await this.api.get<TeamMember[]>('/team')).filter(member => !!member.active || assignedIds.has(member.id)); if (this.tab !== requestedTab || this.sprint?.id !== requestedSprintId) return; this.members = members; this.assignmentHours = Object.fromEntries(task.assignments.map(item => [item.memberId, item.estimatedHours])); this.assignmentModes = Object.fromEntries(task.assignments.map(item => [item.memberId, item.supportOnly ? 'support' : 'hours'])); this.assignmentError = ''; this.assignmentTask = task; this.refreshAssignmentPreview(); if(!this.capacityLoaded&&requestedSprintId)void this.loadCapacity(requestedSprintId); } catch (error) { this.error = String(error); } finally { this.cdr.detectChanges(); } }
  openClassification(task: Task): void { this.classificationTask = task; this.classificationCategory = task.taskCategory || this.legacyCategory(task) as TaskCategory; this.classificationSubtype = task.taskSubtype || (['TEST','DEFECT','BAU'].includes(this.classificationCategory) ? defaultTaskSubtype(this.classificationCategory) : null); this.classificationError = ''; this.cdr.detectChanges(); }
  changeClassificationCategory(category: TaskCategory): void { this.classificationCategory = category; this.classificationSubtype = defaultTaskSubtype(category); this.classificationError = ''; this.cdr.detectChanges(); }
  closeClassification(): void { this.classificationTask = null; this.classificationError = ''; this.cdr.detectChanges(); }
  async saveClassification(): Promise<void> {
    if (!this.classificationTask || !this.sprint || this.saving) return;
    if (['TEST','DEFECT','BAU'].includes(this.classificationCategory) && !this.classificationSubtype) { this.classificationError = 'Seçilen iş tipi için alt kırılım gereklidir.'; return; }
    const taskId = this.classificationTask.id; const sprintId = this.sprint.id;
    this.saving = true; this.classificationError = ''; this.error = ''; this.actionMessage = '';
    try { await this.api.patch(`/tasks/${encodeURIComponent(taskId)}`, { taskCategory: this.classificationCategory, taskSubtype: this.classificationSubtype }); this.closeClassification(); await this.load(sprintId); this.actionMessage = 'İş tipi ve raporlama kırılımı kaydedildi.'; }
    catch (error) { this.classificationError = String(error); }
    finally { this.saving = false; this.cdr.detectChanges(); }
  }
  assigned(memberId: string): boolean { return Object.prototype.hasOwnProperty.call(this.assignmentHours, memberId); }
  toggleAssignment(memberId: string): void { if (this.assigned(memberId)) { delete this.assignmentHours[memberId]; delete this.assignmentModes[memberId]; } else { this.assignmentHours[memberId] = 0; this.assignmentModes[memberId] = 'hours'; } this.assignmentError = ''; this.refreshAssignmentPreview(); this.cdr.detectChanges(); }
  closeAssignments(): void { this.assignmentTask = null; this.assignmentError = ''; this.cdr.detectChanges(); }
  async saveAssignments(): Promise<void> {
    if (!this.assignmentTask || !this.sprint || this.saving) return;
    const assignments = Object.entries(this.assignmentHours).map(([memberId, estimatedHours]) => ({ memberId, estimatedHours: this.assignmentModes[memberId] === 'support' ? 0 : Number(estimatedHours), supportOnly: this.assignmentModes[memberId] === 'support' }));
    if (assignments.some(item => !Number.isFinite(item.estimatedHours) || item.estimatedHours < 0 || item.estimatedHours > 1000)) { this.assignmentError = 'Efor saatini 0–1000 arasında girin veya X · Support seçin.'; this.cdr.detectChanges(); return; }
    const taskId = this.assignmentTask.id;
    const sprintId = this.sprint.id;
    this.saving = true; this.assignmentError = ''; this.error = ''; this.actionMessage = '';
    try { await this.api.put(`/tasks/${encodeURIComponent(taskId)}/assignments`, { assignments }); this.closeAssignments(); await this.load(sprintId); if (!this.error) this.actionMessage = 'Atamalar kaydedildi.'; }
    catch (error) { this.assignmentError = String(error); }
    finally { this.saving = false; this.cdr.detectChanges(); }
  }
  openAddTask(): void { this.showAddTask=true; this.cdr.detectChanges(); }
  closeAddTask(): void { this.showAddTask=false; this.cdr.detectChanges(); }
  async taskAdded(): Promise<void> { this.closeAddTask(); if(this.sprint) await this.load(this.sprint.id); }
  async start(): Promise<void> {
    if (!this.sprint) return;
    try { await this.api.post(`/sprints/${encodeURIComponent(this.sprint.id)}/start`); await this.load(this.sprint.id); }
    catch (error) { this.error = String(error); }
    finally { this.cdr.detectChanges(); }
  }
  openComplete():void {this.showComplete=true;this.cdr.detectChanges();}
  closeComplete():void {this.showComplete=false;this.cdr.detectChanges();}
  async completed():Promise<void> {this.closeComplete();if(!this.sprint)return;const id=this.sprint.id;await this.load(id);await this.loadCapacity(id);await this.router.navigate(['/sprints',id,'review']);}
  print(): void { window.print(); }
}
