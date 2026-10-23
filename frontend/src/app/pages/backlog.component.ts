import {WorkItemActionComponent} from './work-item-action.component';
import {BacklogHistoryComponent} from './backlog-history.component';
import {SlackInboxComponent} from './slack-inbox.component';
import {SlackBacklogInboxComponent} from './slack-backlog-inbox.component';
import {FoldDirective} from '../fold.directive';
import {BACKLOG_VIEWS,matchesBacklogView} from './backlog-view.model';
import { ModalAccessibilityDirective } from '../modal-accessibility.directive';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService, BacklogItem, TeamMember, Overview, ProductSettings, RoadmapItem, TaskCategory, TaskSubtype, statusText } from '../api.service';
import { SprintAddDialogComponent } from './sprint-add-dialog.component';
import { DefectFieldsComponent } from './defect-fields.component';
import { emptyDefect,defectSummary } from '../defect-model';
import { AuthService } from '../auth.service';
import { TASK_CATEGORIES, TASK_SUBTYPES, availableSubtypes, defaultTaskSubtype, taskCategoryLabel, taskSubtypeLabel } from '../task-taxonomy';
import { SbStateComponent } from '../shared/sb-state.component';

@Component({
  standalone: true,
  imports: [WorkItemActionComponent,SlackInboxComponent,SlackBacklogInboxComponent,FoldDirective, BacklogHistoryComponent, ModalAccessibilityDirective, FormsModule, RouterLink, SprintAddDialogComponent, DefectFieldsComponent, SbStateComponent],
  template: `
    <div class="page-head"><div><span class="eyebrow">İŞ HAVUZU</span><h1>Backlog</h1><p>İş havuzunu ve sprintlerdeki işleri tek yerden yönetin.</p></div>
      @if (auth.isAdmin()) { <div class="page-actions"><button class="btn primary" (click)="openCreate()">+ Yeni iş</button></div> }</div>
    @if(auth.isAdmin()){@defer(on idle){<app-slack-backlog-inbox (changed)="load()" (openItem)="openSlackItem($event)" /><details appFold class="card card-pad" style="margin-bottom:18px"><summary class="section-head"><div><span class="eyebrow">SLACK · DEFECT</span><h2>Defect bildirimleri</h2></div></summary><app-slack-inbox (changed)="load()" (openItem)="openSlackItem($event)" /></details>}}
    <section class="ui-toolbar backlog-toolbar" aria-label="Backlog filtreleri"><div class="ui-toolbar-head"><h2>İşleri filtrele</h2><button type="button" class="btn small" (click)="clearFilters()">Filtreleri temizle</button></div><div class="form-grid backlog-filters">
      <label class="field">Ara<input type="search" [(ngModel)]="query" (ngModelChange)="resetPage()" placeholder="İş adı veya dış referans"></label>
      <label class="field">Görünüm<select aria-label="Backlog görünümü" [(ngModel)]="filter" (ngModelChange)="resetPage()">@for(view of views;track view.value){<option [value]="view.value">{{view.label}}</option>}</select></label>
      <label class="field">İş tipi<select [(ngModel)]="typeFilter" (ngModelChange)="resetPage()"><option value="">Tüm iş tipleri</option>@for (option of taskCategories; track option.value) { <option [value]="option.value">{{ option.label }}</option> }</select></label>
      <label class="field">Öncelik<select [(ngModel)]="priorityFilter" (ngModelChange)="resetPage()"><option value="">Tümü</option>@for (p of priorities; track p.value) { <option [value]="p.value">{{ p.label }}</option> }</select></label>
      <label class="field">Hazırlık<select [(ngModel)]="readinessFilter" (ngModelChange)="resetPage()"><option value="">Tümü</option><option value="ready">Planlamaya hazır</option><option value="warnings">Kontrol gerekli</option><option value="blocked">Bağımlılığı açık</option></select></label>
      <label class="field">Sıralama<select [(ngModel)]="sort" (ngModelChange)="resetPage()"><option value="priority">Öncelik</option><option value="recent">En yeni</option></select></label>
    </div><div class="ui-toolbar-foot"><p class="data-note" aria-live="polite">{{viewHint}}</p><p class="data-note">{{ readyCount }} planlamaya hazır · {{ warningCount }} kontrol gerekli</p></div></section>
    <div class="section-head" id="backlog-results"><div><h2>İş listesi</h2><small>{{ visible.length }} / {{ items.length }} kayıt</small></div></div>
    @if (filtersActive()) {
      <div class="backlog-filter-summary" role="status">
        <span class="backlog-filter-summary__label">Aktif filtreler</span>
        <ul>@for (chip of activeFilterChips(); track chip) { <li>{{ chip }}</li> }</ul>
        <button type="button" class="btn small" (click)="clearFilters()">Filtreleri temizle</button>
      </div>
    }
    @if (visible.length) { <div class="table-wrap backlog-table-wrap"><table class="backlog-table"><caption class="sr-only">Backlog işleri: başlık, roadmap bağlantısı, durum, sprint görevi ve işlemler.</caption><thead><tr><th scope="col">İş</th><th scope="col">Roadmap</th><th scope="col">Durum</th><th scope="col">Sprint görevi</th><th scope="col">İşlemler</th></tr></thead><tbody>
      @for (item of visiblePage; track item.id) { <tr [attr.data-backlog-id]="item.id">
        <td data-label="İş"><button class="backlog-title-link" (click)="openDetail(item)">{{ item.title }}</button><small>{{ taxonomyLabel(item.taskCategory,item.taskSubtype) }} · {{ relativeEstimate(item) }} @if (item.estimatedHours) { · {{ item.estimatedHours }} saat efor }</small></td>
        <td data-label="Roadmap">@if (auth.isAdmin()) { <select class="compact-select" [attr.aria-label]="item.title + ' roadmap hedefi'" [disabled]="linkingIds.has(item.id)" [ngModel]="item.roadmapId" (ngModelChange)="link(item, $event)">
          <option [ngValue]="null">Roadmap hedefine bağlı değil</option>@for (target of roadmap; track target.id) { <option [ngValue]="target.id">{{ target.referenceId ? target.referenceId + ' · ' : '' }}{{ target.title }}</option> }
        </select> } @else { <span>{{ item.roadmapTitle || 'Roadmap hedefine bağlı değil' }}</span> }</td>
        <td data-label="Durum"><span class="status" [class.done]="item.taskStatus === 'done'" [class.undone]="item.taskStatus === 'undone'" [class.doing]="item.taskStatus === 'doing'" [class.todo]="item.taskStatus === 'todo' && !plannedOnly(item)" [class.planned]="plannedOnly(item)" [class.active]="item.state === 'IN_SPRINT' && !plannedOnly(item)">{{ backlogState(item) }}</span>@if (plannedOnly(item)) { <small>{{ item.sprintName }} · sprint başlayınca Yapılacak olur</small> }@if (item.readiness.eligible) { <small [class.readiness-warning]="!item.readiness.ready">{{ item.readiness.ready ? 'Planlamaya hazır' : 'Kontrol gerekli · ' + item.readiness.warnings.length }}</small> }@if (item.dependencies.length) { <small>{{ item.dependencies.length }} bağımlılık · {{ openDependencies(item) }} açık</small> }</td>
        <td data-label="Sprint">@if (item.sprintId) { <a class="table-link" [routerLink]="['/sprints', item.sprintId, 'summary']">{{ item.sprintName || 'Sprint görevi' }} →</a><small>{{ item.sprintStatus==='active'?'Aktif sprint':item.sprintStatus==='planned'?'Planlanan sprint':'Kapanmış sprint' }}</small> } @else { <span class="muted">Henüz yok</span> }</td>
        <td data-label="İşlemler"><div class="table-actions">@if (auth.isAdmin() && !item.taskId && item.state === 'Ready') { <button class="btn small" (click)="edit(item)">Düzenle</button> <button class="btn small danger" (click)="openDelete(item)">Sil</button> } @if (auth.isAdmin() && !item.taskId && item.state === 'Ready' && activeId) { <button class="btn small" (click)="addToActive(item)">Aktif sprinte al</button> }
          @else if (auth.isAdmin() && item.taskId) { <button class="btn small" (click)="repeat(item)">Yeni iş olarak tekrarla</button> } @else { <span class="muted">—</span> }</div></td>
      </tr> }</tbody></table></div> }
    @else if (filtersActive()) { <sb-state variant="no-results" title="Bu filtrede iş yok" message="Toplam {{ items.length }} kayıt var ama hiçbiri seçili filtrelerle eşleşmiyor." actionLabel="Filtreleri temizle" (action)="clearFilters()" /> }
    @else { <sb-state variant="empty" title="Backlog boş" message="Planlanacak ilk işi ekleyerek başlayabilirsin." [actionLabel]="auth.isAdmin() ? 'Yeni iş ekle' : ''" (action)="openCreate()" /> }
    @if (totalPages > 1) { <nav class="pager" aria-label="Backlog sayfaları"><button class="btn small" [disabled]="page<=1" (click)="changePage(page-1)">← Önceki</button><span aria-live="polite">{{ pageStart }}–{{ pageEnd }} / {{ visible.length }} · Sayfa {{ page }} / {{ totalPages }}</span><button class="btn small" [disabled]="page>=totalPages" (click)="changePage(page+1)">Sonraki →</button></nav> }
    @if (error && !formOpen) { <sb-state variant="error" title="Backlog işlemi tamamlanamadı" [detail]="error" message="Listeyi yeniden yükleyerek güncel durumu görebilirsin." actionLabel="Yeniden yükle" (action)="load()" /> }
    @if (savedMessage) { <p class="inline-success" role="status">{{ savedMessage }}</p> }
    @if(deleteItem){@defer(on immediate){<app-work-item-action action="delete" [id]="deleteItem.id" [title]="deleteItem.title" (cancel)="closeDelete()" (saved)="deleted()" />}}
    @if (detail; as item) { <div class="modal-layer"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="backlog-detail-title"><header><span class="eyebrow">BACKLOG İŞİ</span><h2 id="backlog-detail-title">{{ item.title }}</h2><p>{{ taxonomyLabel(item.taskCategory,item.taskSubtype) }} · {{ relativeEstimate(item) }} · {{ item.estimatedHours }} sa</p></header><div class="modal-body"><span class="status">{{ backlogState(item) }}</span><h3>Planlama</h3><p>{{ priorityLabel(item.priority) }}</p>@if(item.dependencies.length) { <h3>Önce tamamlanması gereken işler</h3><ul>@for (d of item.dependencies; track d.id) { <li>{{ d.title }} — {{ d.done ? 'Done' : 'Tamamlanmadı' }}</li> }</ul> }@if(item.readiness.eligible) { <h3>Hazırlık kontrolü</h3>@if(item.readiness.ready) { <p class="inline-success">Planlamaya hazır</p> } @else { <ul>@for(w of item.readiness.warnings;track w) { <li>{{ w }}</li> }</ul> } }@if(item.taskCategory==='DEFECT'){<h3>Defect bilgileri</h3><p>{{ defectSummary(item.defect) }}</p><p>İlgili iş: {{ item.defect?.relatedTitle || 'Bağlantı yok' }}</p><p>Bildiren: {{ item.defect?.reporterName || (item.defect?.reporterId ? 'Ad soyad bekleniyor' : 'Kayıt yok') }}</p>@if(item.defect?.sourceUrl){<a [href]="item.defect?.sourceUrl" target="_blank" rel="noopener noreferrer">Kaynak Slack mesajı ↗</a>}}<h3>Kapsam ve kabul ölçütü</h3><p style="white-space:pre-wrap;overflow-wrap:anywhere">{{ item.criteria || 'Kapsam ve kabul ölçütü belirtilmemiş.' }}</p><h3>Roadmap hedefi</h3><p>@if(item.roadmapId) { <a class="table-link" [routerLink]="['/roadmap',item.roadmapId]">{{ item.roadmapTitle }} →</a> } @else { Roadmap hedefine bağlı değil }</p>@if (item.repeatOfId) { <p class="data-note">Önceki bir işin devamı / tekrarı olarak açılmıştır.</p> }@if (item.taskId) { <p class="data-note">@if (plannedOnly(item)) { Bu iş <strong>{{ item.sprintName }}</strong> sprintine planlandı ama sprint henüz başlamadı; buradan düzenleyebilirsiniz ve değişiklik sprint görevine de işlenir. Sprint başladıktan sonra yalnız sprint ekranından yönetilir. } @else { Bu işin sprint görevi var. Tarihsel kayıt korunur; durum ve atamaları sprint ekranından yönetin. }</p> }@defer(on immediate){<app-backlog-history [itemId]="item.id" />}</div><footer><button data-modal-dismiss class="btn" (click)="closeDetail()">Kapat</button>@if (item.sprintId) { <a class="btn primary" [routerLink]="['/sprints',item.sprintId,'planning']">Sprint görevine git</a> }@if (auth.isAdmin() && (plannedOnly(item) || (!item.taskId && item.state === 'Ready'))) { <button class="btn primary" (click)="edit(item)">İşi düzenle</button> }</footer></section></div> }
    @if (formOpen) { <div class="modal-layer"><form class="modal" (ngSubmit)="create()"><header><h2>{{ editingId ? 'Backlog işini düzenle' : 'Backlog işi ekle' }}</h2><p>İş bir roadmap hedefine bağlanabilir.</p></header>
      <div class="modal-body form-grid"><label class="field">İş adı<input name="title" [(ngModel)]="draft.title" required maxlength="300"></label>
        <label class="field">Kapsam ve kabul ölçütü<textarea maxlength="10000" name="criteria" [(ngModel)]="draft.criteria"></textarea></label>
        <label class="field">Roadmap hedefi<select name="roadmapId" [(ngModel)]="draft.roadmapId"><option value="">Roadmap hedefine bağlı değil</option>@for (target of roadmap; track target.id) { <option [value]="target.id">{{ target.referenceId ? target.referenceId + ' · ' : '' }}{{ target.title }}</option> }</select><small>Seçilen Roadmap öğesine bağlanır; aynı hedef altında birden fazla backlog işi olabilir.</small></label>
        <label class="field">Öncelik<select name="priority" [(ngModel)]="draft.priority">@for (p of priorities; track p.value) { <option [value]="p.value">{{ p.label }}</option> }</select></label>
        <div class="dependency-picker"><h3>Bağımlılıklar</h3><p class="data-note">Bu işten önce tamamlanması gereken işler. Döngüsel bağlantılara izin verilmez.</p>@for(id of draft.dependencyIds;track id) { <div class="dependency-row"><span>{{ dependencyTitle(id) }}</span><button type="button" class="btn small" [attr.aria-label]="dependencyTitle(id) + ' bağımlılığını kaldır'" (click)="removeDependency(id)">Kaldır</button></div> }<label class="field">Bağımlılık ara<input name="dependencyQuery" type="search" [(ngModel)]="dependencyQuery" (ngModelChange)="refresh()" placeholder="İş adı yazın"></label>@if(dependencyQuery.trim()) { <div class="dependency-options">@for(item of dependencyOptions;track item.id) { <button type="button" class="dependency-row" (click)="addDependency(item.id)">{{ item.title }} · {{ backlogState(item) }}</button> }@empty { <p>Eşleşen iş yok.</p> }</div> }</div>
        <div class="form-grid two"><label class="field">İş tipi<select name="taskCategory" [(ngModel)]="draft.taskCategory" (ngModelChange)="changeCategory($event)" required>@for (option of taskCategories; track option.value) { <option [value]="option.value">{{ option.label }} · {{ option.description }}</option> }</select></label>
          @if (subtypeOptions.length) { <label class="field">Alt kırılım<select name="taskSubtype" [(ngModel)]="draft.taskSubtype" [required]="['TEST','DEFECT','BAU'].includes(draft.taskCategory)">@if(!['TEST','DEFECT','BAU'].includes(draft.taskCategory)){<option [ngValue]="null">Alt kırılım yok</option>}@for (option of subtypeOptions; track option.value) { <option [value]="option.value">{{ option.label }}</option> }</select></label> }
          <label class="field">Toplam efor (saat)@if (estimateRequired) { <span aria-hidden="true"> *</span> }<input name="estimatedHours" type="number" min="0" step="0.5" [required]="estimateRequired" [(ngModel)]="draft.estimatedHours"><small>@if (estimateRequired) { Zorunlu · havuzda veya sprint başlamadan önce buradan düzeltilebilir. } Kişi atamaları planlamada ayrıca dağıtılır.</small></label></div>
        @if (settings.estimationMode === 'SIZE_AND_HOURS') { <label class="field">Size<select name="size" [(ngModel)]="draft.size" required><option value="">Size seçin</option><option value="SMALL">Small</option><option value="MEDIUM">Medium</option><option value="LARGE">Large</option><option value="X-LARGE">X-Large</option></select><small>Göreli büyüklüktür; saatten otomatik hesaplanmaz.</small></label> }
        @else { <label class="field">Story Point<input name="storyPoints" type="number" min="0.5" step="0.5" [(ngModel)]="draft.storyPoints" required><small>Göreli büyüklüktür; saatten otomatik hesaplanmaz.</small></label> }
      @if(draft.taskCategory==='DEFECT'){<app-defect-fields [(value)]="draft.defect" (valueChange)="refresh()" [items]="items" [members]="members" [itemId]="editingId" />}
      @if (error) { <p class="notice warn" role="alert">{{ error }}</p> }</div><footer><button data-modal-dismiss type="button" class="btn" (click)="closeForm()">Vazgeç</button><button type="submit" class="btn primary" [disabled]="saving">{{ editingId ? 'Değişiklikleri kaydet' : 'İşi ekle' }}</button></footer></form></div> }
    @if(addItemId && activeId) { @defer(on immediate){<app-sprint-add-dialog [sprintId]="activeId" [backlogId]="addItemId" (cancel)="closeAdd()" (added)="taskAdded()" />} }
  `,
  styles: [`.backlog-title-link{display:block;border:0;background:none;padding:0;text-align:left;color:#195da8;font:inherit;font-weight:750;cursor:pointer;white-space:normal;overflow-wrap:anywhere}.backlog-title-link:hover{text-decoration:underline}.backlog-title-link:focus-visible{outline:2px solid #1565c0;outline-offset:4px}h3{margin-top:20px}.priority-badge{display:inline-block;padding:4px 8px;border-radius:6px;background:#edf2fa;color:#35516f;font-size:12px;font-weight:700}.priority-badge.urgent{background:#feecec;color:#9d2424}.priority-badge.high{background:#fff4df;color:#805215}.readiness-warning{color:#805215}.dependency-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px;width:100%;text-align:left;overflow-wrap:anywhere}.dependency-options{max-height:180px;overflow:auto}.dependency-options button{border:1px solid #dce5f1;background:#f8fbff;cursor:pointer}`],
})
export class BacklogComponent implements OnInit {
  private api = inject(ApiService);
  auth = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);
  settings: ProductSettings = { estimationMode: 'SIZE_AND_HOURS', hoursPerDay: 8 };
  items: BacklogItem[] = [];
  roadmap: RoadmapItem[] = [];
  activeId: string | null = null;
  members: TeamMember[] = [];
  priorities = [{value:'UNSET',label:'Belirlenmemiş'},{value:'URGENT',label:'Acil'},{value:'HIGH',label:'Yüksek'},{value:'NORMAL',label:'Normal'},{value:'LOW',label:'Düşük'}];
  priorityFilter=''; readinessFilter=''; sort='priority'; dependencyQuery=''; addItemId='';
  linkingIds = new Set<string>();
  query = '';
  filter = 'open';
  views=BACKLOG_VIEWS;
  get viewHint(){return this.views.find(v=>v.value===this.filter)?.hint||'';}
  typeFilter = '';
  page = 1;
  pageSize = 20;
  formOpen = false;
  editingId: string | null = null;
  detail: BacklogItem | null = null;
  savedMessage = '';
  saving = false;
  error = '';
  statusText = statusText;
  /** A task sitting in a sprint that has not started yet is scheduled, not
   *  in progress. Reporting it as "Yapılacak" claims work has been handed to
   *  the team when the sprint is still being planned. Derived from the sprint
   *  status, so starting the sprint moves it on without any data change. */
  backlogState(item: BacklogItem): string { return item.state === 'Ready' ? 'Havuzda' : item.sprintStatus === 'planned' ? 'Planlandı' : statusText(item.taskStatus || item.state); }
  plannedOnly(item: BacklogItem): boolean { return !!item.taskId && item.sprintStatus === 'planned'; }
  defectSummary=defectSummary;
  taskCategories = TASK_CATEGORIES;
  draft = { title: '', criteria: '', roadmapId: '', taskCategory: 'DEV' as TaskCategory, taskSubtype: null as TaskSubtype, estimatedHours: 0, size: '' as BacklogItem['size'] | '', storyPoints: null as number | null, priority:'UNSET' as BacklogItem['priority'], dependencyIds:[] as string[], defect:emptyDefect() };
  refresh():void { this.cdr.detectChanges(); }
  priorityLabel(value:string):string { return this.priorities.find(p=>p.value===value)?.label || 'Belirlenmemiş'; }
  openDependencies(item:BacklogItem):number { return item.dependencies.filter(d=>!d.done).length; }
  get readyCount():number { return this.items.filter(i=>i.readiness.ready).length; }
  get warningCount():number { return this.items.filter(i=>i.readiness.eligible && !i.readiness.ready).length; }
  dependencyTitle(id:string):string { return this.items.find(i=>i.id===id)?.title || id; }
  get dependencyOptions():BacklogItem[] { const q=this.dependencyQuery.trim().toLocaleLowerCase('tr-TR'); return this.items.filter(i=>i.id!==this.editingId && !this.draft.dependencyIds.includes(i.id) && i.title.toLocaleLowerCase('tr-TR').includes(q)).slice(0,20); }
  addDependency(id:string):void { this.draft.dependencyIds=[...this.draft.dependencyIds,id]; this.dependencyQuery=''; this.refresh(); }
  removeDependency(id:string):void { this.draft.dependencyIds=this.draft.dependencyIds.filter(d=>d!==id); this.refresh(); }
  get subtypeOptions() { return availableSubtypes(this.draft.taskCategory,this.editingId ? this.draft.taskSubtype : null); }
  changeCategory(category: TaskCategory): void { this.draft.taskCategory = category; this.draft.taskSubtype = defaultTaskSubtype(category); this.cdr.detectChanges(); }
  taxonomyLabel(category: TaskCategory, subtype: TaskSubtype): string { return subtype ? `${taskCategoryLabel(category)} · ${taskSubtypeLabel(subtype)}` : taskCategoryLabel(category); }
  relativeEstimate(item: BacklogItem): string { return this.settings.estimationMode === 'SIZE_AND_HOURS' ? (item.size ? `Size ${this.sizeLabel(item.size)}` : 'Size belirlenmedi') : (item.storyPoints != null ? `${item.storyPoints} SP` : 'SP belirlenmedi'); }
  sizeLabel(size: string): string { return ({ SMALL: 'Small', MEDIUM: 'Medium', LARGE: 'Large', 'X-LARGE': 'X-Large' } as Record<string, string>)[size] || size; }
  get visible(): BacklogItem[] {
    const q = this.query.trim().toLocaleLowerCase('tr-TR');
    return this.items.filter(item => matchesBacklogView(item,this.filter) && (!this.typeFilter || item.taskCategory === this.typeFilter) &&
      (!q || `${item.title} ${item.externalId}`.toLocaleLowerCase('tr-TR').includes(q)) &&
      (!this.priorityFilter || item.priority===this.priorityFilter) &&
      (!this.readinessFilter || (item.readiness.eligible && (this.readinessFilter==='ready' ? item.readiness.ready : this.readinessFilter==='blocked' ? this.openDependencies(item)>0 : !item.readiness.ready))))
      .sort((a,b)=>this.sort==='priority' ? this.rank(a.priority)-this.rank(b.priority) : 0);
  }
  rank(p:string):number { return ({URGENT:0,HIGH:1,NORMAL:2,LOW:3,UNSET:4} as Record<string,number>)[p] ?? 4; }
  get totalPages(): number { return Math.max(1, Math.ceil(this.visible.length / this.pageSize)); }
  get pageStart(): number { return this.visible.length ? (this.page - 1) * this.pageSize + 1 : 0; }
  get pageEnd(): number { return Math.min(this.page * this.pageSize, this.visible.length); }
  get visiblePage(): BacklogItem[] { return this.visible.slice((this.page - 1) * this.pageSize, this.page * this.pageSize); }
  clearFilters(): void { this.query=""; this.filter="open"; this.typeFilter=""; this.priorityFilter=""; this.readinessFilter=""; this.sort="priority"; this.resetPage(); }

  /**
   * True when the reader has narrowed the list away from its default view.
   * `filter` defaults to 'open', so that value on its own is not a filter.
   */
  filtersActive(): boolean {
    return !!this.query.trim()
      || this.filter !== 'open'
      || !!this.typeFilter
      || !!this.priorityFilter
      || !!this.readinessFilter;
  }

  /**
   * Human-readable summary of what is currently narrowing the list, so an
   * unexpected result count can be explained without reopening every
   * dropdown. Returns the resolved option labels, not the raw codes.
   */
  activeFilterChips(): string[] {
    const chips: string[] = [];
    const q = this.query.trim();
    if (q) chips.push(`Arama: “${q}”`);
    if (this.filter !== 'open') {
      chips.push(`Görünüm: ${this.views.find(v => v.value === this.filter)?.label ?? this.filter}`);
    }
    if (this.typeFilter) {
      chips.push(`İş tipi: ${this.taskCategories.find(c => c.value === this.typeFilter)?.label ?? this.typeFilter}`);
    }
    if (this.priorityFilter) {
      chips.push(`Öncelik: ${this.priorities.find(p => p.value === this.priorityFilter)?.label ?? this.priorityFilter}`);
    }
    if (this.readinessFilter) {
      const readiness: Record<string, string> = {
        ready: 'Planlamaya hazır',
        warnings: 'Kontrol gerekli',
        blocked: 'Bağımlılığı açık',
      };
      chips.push(`Hazırlık: ${readiness[this.readinessFilter] ?? this.readinessFilter}`);
    }
    return chips;
  }
  resetPage(): void { this.page = 1; this.cdr.detectChanges(); }
  changePage(nextPage: number): void {
    this.page = Math.max(1, Math.min(nextPage, this.totalPages));
    this.cdr.detectChanges();
    document.getElementById('backlog-results')?.scrollIntoView({ block: 'start' });
  }
  openCreate(): void { this.editingId=null; this.draft={title:'',criteria:'',roadmapId:'',taskCategory:'DEV',taskSubtype:null,estimatedHours:0,size:'',storyPoints:null,priority:'UNSET',dependencyIds:[],defect:emptyDefect()}; this.formOpen=true; this.error=''; this.cdr.detectChanges(); }
  closeForm(): void { this.formOpen=false; this.editingId=null; this.cdr.detectChanges(); }
  openDetail(item: BacklogItem): void { this.detail=item; this.cdr.detectChanges(); }
  closeDetail(): void { this.detail=null; this.cdr.detectChanges(); }
  deleteItem:BacklogItem|null=null;
  openDelete(item:BacklogItem){this.detail=null;this.deleteItem=item;this.cdr.detectChanges();}
  closeDelete(){this.deleteItem=null;this.cdr.detectChanges();}
  async deleted(){this.closeDelete();this.savedMessage='Backlog işi silindi. Denetim geçmişi korundu.';await this.load();}
  edit(item: BacklogItem): void { this.editingId=item.id; this.detail=null; this.draft={title:item.title,criteria:item.criteria,roadmapId:item.roadmapId || '',taskCategory:item.taskCategory,taskSubtype:item.taskSubtype,estimatedHours:item.estimatedHours,size:item.size || '',storyPoints:item.storyPoints,priority:item.priority,dependencyIds:item.dependencies.map(d=>d.id),defect:{...(item.defect||emptyDefect())}}; this.formOpen=true; this.error=''; this.cdr.detectChanges(); }
  private route=inject(ActivatedRoute);
  async ngOnInit(): Promise<void> { await this.load();const id=this.route.snapshot.queryParamMap.get('item');if(id){const item=this.items.find(i=>i.id===id);if(item)this.openDetail(item);else{this.error='Bağlı backlog işi bulunamadı.';this.cdr.detectChanges();}} }
  async load(): Promise<void> {
    try {
      const [items, roadmap, overview, settings, members] = await Promise.all([this.api.get<BacklogItem[]>('/backlog'), this.api.get<RoadmapItem[]>('/roadmap'), this.api.get<Overview>('/overview'), this.api.get<ProductSettings>('/settings'), this.api.get<TeamMember[]>('/team')]);
      this.members=members; this.items = items; this.roadmap = roadmap; this.activeId = overview.activeSprint?.id || null; this.settings = settings;
      this.page = Math.min(this.page, this.totalPages);
    } catch (error) { this.error = String(error); }
    finally { this.cdr.detectChanges(); }
  }
  async openSlackItem(id:string){await this.load();const item=this.items.find(i=>i.id===id);if(item)this.openDetail(item);else{this.error='Bağlı iş bulunamadı; eski bir ürün yedeği geri yüklenmiş olabilir.';this.cdr.detectChanges();}}
  async link(item: BacklogItem, roadmapId: string | null): Promise<void> {
    if (this.linkingIds.has(item.id)) return;
    this.linkingIds.add(item.id); this.error = ''; this.savedMessage = '';
    this.cdr.detectChanges();
    try {
      await this.api.patch(`/backlog/${encodeURIComponent(item.id)}`, { roadmapId });
      item.roadmapId = roadmapId;
      item.roadmapTitle = this.roadmap.find(target => target.id === roadmapId)?.title || null;
      this.savedMessage = roadmapId ? 'Roadmap bağlantısı kaydedildi.' : 'Roadmap bağlantısı kaldırıldı.';
    }
    catch (error) { this.error = String(error); await this.load(); }
    finally { this.linkingIds.delete(item.id); this.cdr.detectChanges(); }
  }
  /** BAU is capacity set aside rather than sized work, and a defect's intake
   *  estimate is deliberately allowed to stay empty because its assigned
   *  effort is authoritative. Everything else must be sized before it can
   *  reach a sprint. Planned sprint work remains editable until the sprint starts. */
  get estimateRequired(): boolean { return this.draft.taskCategory !== 'BAU' && this.draft.taskCategory !== 'DEFECT'; }
  async create(): Promise<void> {
    if (this.estimateRequired && !(Number(this.draft.estimatedHours) > 0)) { this.error = 'Toplam eforu sıfırdan büyük bir saat değeri olarak girin.'; this.cdr.detectChanges(); return; }
    this.saving = true; this.error = '';
    try { if(this.editingId) { await this.api.put(`/backlog/${encodeURIComponent(this.editingId)}`,{...this.draft,size:this.draft.size || null,roadmapId:this.draft.roadmapId || null}); this.savedMessage='Backlog işi güncellendi.'; } else { await this.api.post('/backlog', { ...this.draft, size: this.settings.estimationMode === 'SIZE_AND_HOURS' ? this.draft.size : null, storyPoints: this.settings.estimationMode === 'POINTS_AND_HOURS' ? this.draft.storyPoints : null, roadmapId: this.draft.roadmapId || null }); this.savedMessage='Backlog işi eklendi.'; } this.editingId=null; this.formOpen = false; this.draft = { title: '', criteria: '', roadmapId: '', taskCategory: 'DEV', taskSubtype: null, estimatedHours: 0, size: '', storyPoints: null, priority:'UNSET',dependencyIds:[],defect:emptyDefect() }; this.page = 1; await this.load(); }
    catch (error) { this.error = String(error); }
    finally { this.saving = false; this.cdr.detectChanges(); }
  }
  addToActive(item: BacklogItem): void { this.addItemId=item.id; this.refresh(); }
  closeAdd():void { this.addItemId=''; this.refresh(); }
  async taskAdded():Promise<void> { this.closeAdd(); await this.load(); }
  async repeat(item: BacklogItem): Promise<void> {
    try { await this.api.post(`/backlog/${encodeURIComponent(item.id)}/repeat`); await this.load(); }
    catch (error) { this.error = String(error); }
    finally { this.cdr.detectChanges(); }
  }
}
