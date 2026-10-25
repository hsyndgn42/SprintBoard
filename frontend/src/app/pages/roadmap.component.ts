import { RoadmapDetailComponent } from './roadmap-detail.component';
import { ListPagerComponent } from '../list-pager.component';
import { ModalAccessibilityDirective } from '../modal-accessibility.directive';
import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService, RoadmapItem, BacklogItem, ProductSettings, TaskCategory, TaskSubtype, formatDate } from '../api.service';
import { AuthService } from '../auth.service';
import { ROADMAP_STATUSES, ROADMAP_PRIORITIES, roadmapStatusLabel, roadmapPriorityLabel, filterRoadmap } from './roadmap-planning';
import { TASK_CATEGORIES, TASK_SUBTYPES, availableSubtypes, defaultTaskSubtype, taskCategoryLabel, taskSubtypeLabel } from '../task-taxonomy';

@Component({
  standalone: true,
  imports: [RoadmapDetailComponent, ListPagerComponent, ModalAccessibilityDirective, FormsModule, RouterLink],
  template: `
    @if (loading) { <div class="loading">Roadmap yükleniyor…</div> } @else if (selected) {
      <div class="page-head"><div><span class="eyebrow">{{ kindLabel(selected.kind) }} · {{ selected.referenceId || 'Referans ID yok' }}</span><h1>{{ selected.title }}</h1><p>{{ selected.description || 'Bu hedefe bağlı backlog işlerini yönetin.' }}</p></div>
        <div class="page-actions"><a class="btn" routerLink="/roadmap">← Tüm hedefler</a>@if (auth.isAdmin()) { <button class="btn" (click)="editTarget()">Düzenle</button><button class="btn primary" (click)="openBacklogForm()">Backlog işi ekle</button> }<button type="button" class="btn ui-refresh" [disabled]="loading" (click)="load()">Yenile</button></div></div>
      <dl class="sb-context"><div><dt>Hedef durumu</dt><dd>{{statusLabel(selected.status)}}</dd></div><div><dt>Öncelik</dt><dd>{{priorityLabel(selected.priority)}}</dd></div><div><dt>Hedef tarihi</dt><dd>{{selected.targetDate ? formatDate(selected.targetDate) : 'Belirtilmemiş'}}</dd></div>      @if(auth.isAdmin() && (selected.jiraEpicKey || jiraBaseUrl)){<div><dt>Jira epic</dt><dd>@if(selected.jiraEpicKey){@if(jiraBaseUrl){<a [href]="jiraBaseUrl+'/browse/'+selected.jiraEpicKey" target="_blank" rel="noopener">{{selected.jiraEpicKey}}</a>}@else{{{selected.jiraEpicKey}}}<button type="button" class="btn" [disabled]="epicBusy" (click)="unlinkEpic()">Bağlantıyı kaldır</button>}@else{<button type="button" class="btn" [disabled]="epicBusy" (click)="createEpic()">{{ epicBusy ? 'Açılıyor…' : 'Jira epic aç' }}</button><input class="epic-key" style="max-width:160px" [(ngModel)]="epicKeyDraft" [disabled]="epicBusy" placeholder="VBCRF-356" aria-label="Var olan epic anahtarı"><button type="button" class="btn" [disabled]="epicBusy || !epicKeyDraft.trim()" (click)="linkEpic()">Var olanı bağla</button>}</dd></div>}</dl>
      @if(epicError){<p class="form-error" role="alert">{{epicError}}</p>}
            @if(selected.jiraEpicKey){<p class="data-note">Bağlantıyı kaldırmak Jira'daki epic'i silmez; yalnızca bu hedefle ilişkisini keser.</p>}
      <p class="data-note">Hedef durumu elle yönetilir; bağlı işlerin sonucundan bağımsızdır.</p>
      <app-roadmap-detail [roadmap]="selected" [items]="linked" [settings]="settings" />
    } @else if (missingTarget) {
      <section class="card empty"><h1>Roadmap hedefi bulunamadı</h1><p>Hedef kaldırılmış veya bağlantı geçersiz olabilir.</p><a class="btn" routerLink="/roadmap">Tüm hedeflere dön</a></section>
    } @else {
      <div class="page-head"><div><span class="eyebrow">ÜRÜN YÖNÜ</span><h1>Roadmap</h1><p>Stratejik hedefleri backlog işlerine, oradan sprint teslimatlarına bağlayın.</p></div>@if (auth.isAdmin()) { <div class="page-actions"><button class="btn primary" (click)="setFormOpen(true)">+ Hedef ekle</button></div> }</div>
      @if (items.length) {
        <section class="card roadmap-filters ui-toolbar" aria-label="Roadmap filtreleri">
          <label class="field">Ara<input type="search" [(ngModel)]="query" placeholder="Başlık veya referans ID"></label>
          <label class="field">Durum<select [(ngModel)]="statusFilter"><option value="">Tüm durumlar</option>@for(s of statuses;track s.value){<option [value]="s.value">{{ s.label }}</option>}</select></label>
          <label class="field">Öncelik<select [(ngModel)]="priorityFilter"><option value="">Tüm öncelikler</option>@for(p of priorities;track p.value){<option [value]="p.value">{{ p.label }}</option>}</select></label>
          <label class="field">Tür<select [(ngModel)]="kindFilter"><option value="">Tüm türler</option><option value="PROJECT">Proje</option><option value="FEATURE_SET">Feature set</option><option value="GENERAL">Genel</option><option value="UNSPECIFIED">Belirtilmemiş</option></select></label>
          <label class="field">Sıralama<select [(ngModel)]="sort"><option value="priority">Öncelik</option><option value="date">Hedef tarihi</option><option value="title">Başlık</option></select></label>
          <button class="btn" (click)="resetFilters()">Filtreleri temizle</button>
        </section>
        <p class="data-note" aria-live="polite">{{ visible.length }} / {{ items.length }} hedef gösteriliyor</p>
        @if(!visible.length){<section class="card empty"><strong>Bu filtrelerde hedef bulunamadı</strong><button class="btn" (click)="resetFilters()">Filtreleri temizle</button></section>}
      }
      <app-list-pager #roadmapPager [items]="visible" label="Roadmap" />@if (visible.length) { <section class="roadmap-grid">@for (item of roadmapPager.rows; track item.id) {
        <a class="card roadmap-card" [routerLink]="['/roadmap', item.id]"><div><div class="roadmap-badges"><span class="status" [class.planned]="item.status==='planned'" [class.doing]="item.status==='active'" [class.done]="item.status==='completed'">{{ statusLabel(item.status) }}</span>@if(item.priority!=='UNSET'){<span class="roadmap-priority" [class.critical]="item.priority==='CRITICAL'" [class.high]="item.priority==='HIGH'">{{ priorityLabel(item.priority) }} öncelik</span>}@if(item.jiraEpicKey){<span class="roadmap-priority">Epic {{ item.jiraEpicKey }}</span>}</div><span class="eyebrow">{{ kindLabel(item.kind) }} · {{ item.referenceId || 'Referans ID yok' }}</span><h2>{{ item.title }}</h2><p>{{ item.description || 'Açıklama eklenmedi.' }}</p></div>
          <div><div class="roadmap-bottom"><span>{{ item.doneCount }} / {{ item.backlogCount }} iş tamamlandı</span><strong>{{ item.backlogCount ? '%' + Math.round(item.doneCount / item.backlogCount * 100) : '—' }}</strong></div><div class="progress-track"><span [style.width.%]="item.backlogCount ? item.doneCount / item.backlogCount * 100 : 0"></span></div></div>
          <div class="roadmap-bottom"><span>{{ item.targetDate ? formatDate(item.targetDate) : 'Hedef tarihi yok' }}</span><span>Detayı gör →</span></div></a>
      }</section> }
      @else if (!items.length) { <section class="card empty"><strong>Henüz roadmap hedefi yok</strong>Ürün yönü tanımlandığında hedefler burada görünür.@if (auth.isAdmin()) { <br><button class="btn primary" style="margin-top:15px" (click)="setFormOpen(true)">Hedef ekle</button> }</section> }
    }
    @if (error) { <p class="notice warn" role="alert">{{ error }}</p> }
    @if (formOpen) { <div class="modal-layer"><form class="modal" (ngSubmit)="save()"><header><h2>{{ formKind === 'roadmap' ? (editingId ? 'Roadmap öğesini düzenle' : 'Roadmap öğesi ekle') : 'Backlog işi ekle' }}</h2><p>Ürün hedefini işlerle ilişkilendirin.</p></header>
      <div class="modal-body form-grid"><label class="field">Başlık<input name="title" [(ngModel)]="draft.title" required maxlength="180" autofocus></label>
        @if (formKind === 'roadmap') { <div class="form-grid two"><label class="field">Tür<select name="kind" [(ngModel)]="draft.kind" required><option value="PROJECT">Proje</option><option value="FEATURE_SET">Feature set</option><option value="GENERAL">Genel</option>@if(editingId && draft.kind==='UNSPECIFIED') { <option value="UNSPECIFIED">Belirtilmemiş (eski kayıt)</option> }</select></label><label class="field">Referans ID<input name="referenceId" [(ngModel)]="draft.referenceId" maxlength="100" placeholder="Örn. TC-25142"><small>İsteğe bağlı proje/feature referansı; sistem kimliğinden bağımsızdır.</small></label></div><div class="form-grid two"><label class="field">Durum<select name="status" [(ngModel)]="draft.status" required>@for(s of statuses;track s.value){<option [value]="s.value">{{ s.label }}</option>}</select></label><label class="field">Öncelik<select name="priority" [(ngModel)]="draft.priority" required>@for(p of priorities;track p.value){<option [value]="p.value">{{ p.label }}</option>}</select></label></div><p class="data-note">Durumu sen belirlersin; işlerin tamamlanma yüzdesi bunu otomatik değiştirmez. Bağlı işlerin durumları korunur.</p><label class="field">Açıklama<textarea name="description" [(ngModel)]="draft.description"></textarea></label><label class="field">Hedef tarih<input type="date" name="targetDate" [(ngModel)]="draft.targetDate"></label> }
        @else { <label class="field">Kapsam ve kabul ölçütü<textarea name="criteria" [(ngModel)]="draft.criteria"></textarea></label><div class="form-grid two"><label class="field">İş tipi<select name="taskCategory" [(ngModel)]="draft.taskCategory" (ngModelChange)="changeCategory($event)" required>@for (option of taskCategories; track option.value) { <option [value]="option.value">{{ option.label }} · {{ option.description }}</option> }</select></label>@if (subtypeOptions.length) { <label class="field">Alt kırılım<select name="taskSubtype" [(ngModel)]="draft.taskSubtype" [required]="['TEST','DEFECT','BAU'].includes(draft.taskCategory)">@if(!['TEST','DEFECT','BAU'].includes(draft.taskCategory)){<option [ngValue]="null">Alt kırılım yok</option>}@for (option of subtypeOptions; track option.value) { <option [value]="option.value">{{ option.label }}</option> }</select></label> }<label class="field">Toplam efor (saat)<input name="estimatedHours" type="number" min="0" step="0.5" [(ngModel)]="draft.estimatedHours"></label></div>
          @if (settings.estimationMode === 'SIZE_AND_HOURS') { <label class="field">Size<select name="size" [(ngModel)]="draft.size" required><option value="">Size seçin</option><option value="SMALL">Small</option><option value="MEDIUM">Medium</option><option value="LARGE">Large</option><option value="X-LARGE">X-Large</option></select></label> } @else { <label class="field">Story Point<input name="storyPoints" type="number" min="0.5" step="0.5" [(ngModel)]="draft.storyPoints" required></label> } }
      @if (error) { <p class="notice warn" role="alert">{{ error }}</p> }</div><footer><button data-modal-dismiss type="button" class="btn" (click)="setFormOpen(false)">Vazgeç</button><button type="submit" class="btn primary" [disabled]="saving">Kaydet</button></footer></form></div> }
  `,
  styles:[`.roadmap-filters{display:grid;grid-template-columns:1.5fr repeat(4,minmax(120px,1fr)) auto;gap:12px;padding:18px;align-items:end}.roadmap-badges{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:14px}.roadmap-priority{font-size:10px;font-weight:750;color:#53677f;padding:4px 8px;background:#f3f6fa;border-radius:6px}.roadmap-priority.high{color:#865700;background:#fff5df}.roadmap-priority.critical{color:#a32620;background:#fff0ed}.roadmap-card h2,.roadmap-card p{overflow-wrap:anywhere}.roadmap-bottom{gap:12px}.roadmap-filters .field{min-width:0}@media(max-width:1200px){.roadmap-filters{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:600px){.roadmap-filters{grid-template-columns:1fr 1fr}.roadmap-filters .field:first-child{grid-column:1/-1}}@media print{.roadmap-filters{display:none}}`],
})
export class RoadmapComponent implements OnInit {
  private api = inject(ApiService);
  auth = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  Math = Math;
  statuses=ROADMAP_STATUSES;priorities=ROADMAP_PRIORITIES;
  statusLabel=roadmapStatusLabel;priorityLabel=roadmapPriorityLabel;
  query='';statusFilter='';priorityFilter='';kindFilter='';sort='priority';
  get visible(){return filterRoadmap(this.items,{query:this.query,status:this.statusFilter,priority:this.priorityFilter,kind:this.kindFilter,sort:this.sort});}
  resetFilters(){this.query='';this.statusFilter='';this.priorityFilter='';this.kindFilter='';this.sort='priority';}
  formatDate = formatDate;
  items: RoadmapItem[] = [];
  backlog: BacklogItem[] = [];
  settings: ProductSettings = { estimationMode: 'SIZE_AND_HOURS', hoursPerDay: 8 };
  selected: RoadmapItem | null = null;
  linked: BacklogItem[] = [];
  formOpen = false;
  jiraBaseUrl = '';
  epicBusy = false;
  epicError = '';
  epicKeyDraft = '';
  async linkEpic(): Promise<void> { await this.runEpic(() => this.api.put('/admin/jira/roadmap/'+encodeURIComponent(this.selected!.id)+'/epic',{epicKey:this.epicKeyDraft.trim()})); }
  async unlinkEpic(): Promise<void> { await this.runEpic(() => this.api.delete('/admin/jira/roadmap/'+encodeURIComponent(this.selected!.id)+'/epic')); }
  editingId: string | null = null;
  kindLabel(kind: string): string { return ({PROJECT:'Proje',FEATURE_SET:'Feature set',GENERAL:'Genel',UNSPECIFIED:'Tür belirtilmemiş'} as Record<string,string>)[kind] || kind; }
  setFormOpen(open: boolean): void { if(open){this.error='';this.editingId=null;this.formKind='roadmap';this.resetDraft();} this.formOpen=open; this.cdr.detectChanges(); }
  editTarget(): void { if(!this.selected)return;this.resetDraft();this.editingId=this.selected.id;this.formKind='roadmap';Object.assign(this.draft,{title:this.selected.title,description:this.selected.description,targetDate:this.selected.targetDate||'',kind:this.selected.kind,referenceId:this.selected.referenceId||'',status:this.selected.status,priority:this.selected.priority});this.error='';this.formOpen=true;this.cdr.detectChanges(); }
  resetDraft(): void { this.draft={title:'',description:'',targetDate:'',kind:'PROJECT',referenceId:'',status:'planned',priority:'UNSET',criteria:'',taskCategory:'DEV',taskSubtype:null,estimatedHours:0,size:'',storyPoints:null}; }
  formKind: 'roadmap' | 'backlog' = 'roadmap';
  taskCategories = TASK_CATEGORIES;
  draft = { title: '', description: '', targetDate: '', kind: 'PROJECT' as RoadmapItem['kind'], referenceId: '', status: 'planned' as RoadmapItem['status'], priority: 'UNSET' as RoadmapItem['priority'], criteria: '', taskCategory: 'DEV' as TaskCategory, taskSubtype: null as TaskSubtype, estimatedHours: 0, size: '', storyPoints: null as number | null };
  get subtypeOptions() { return availableSubtypes(this.draft.taskCategory,null); }
  changeCategory(category: TaskCategory): void { this.draft.taskCategory = category; this.draft.taskSubtype = defaultTaskSubtype(category); this.cdr.detectChanges(); }
  taxonomyLabel(category: TaskCategory, subtype: TaskSubtype): string { return subtype ? `${taskCategoryLabel(category)} · ${taskSubtypeLabel(subtype)}` : taskCategoryLabel(category); }
  saving = false;
  error = '';
  loading = true;
  missingTarget = false;
  private destroyRef = inject(DestroyRef);
  async ngOnInit(): Promise<void> { this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.selectTarget()); await this.load(); }
  private selectTarget(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.selected = this.items.find(item => item.id === id) || null;
    this.linked = this.backlog.filter(item => item.roadmapId === id);
    this.missingTarget = !!id && !this.selected;
    this.formOpen = false;
    this.formKind = 'roadmap';
    this.cdr.detectChanges();
  }
  async load(): Promise<void> {
    this.loading=true;this.error='';
    try {
      [this.items, this.backlog, this.settings] = await Promise.all([this.api.get<RoadmapItem[]>('/roadmap'), this.api.get<BacklogItem[]>('/backlog'), this.api.get<ProductSettings>('/settings')]);
      await this.loadJira();
      this.selectTarget();
    } catch (error) { this.error = String(error); }
    finally { this.loading = false; this.cdr.detectChanges(); }
  }
  /** Only admins may read Jira settings; a missing or disabled integration simply hides the epic controls. */
  private async loadJira(): Promise<void> {
    this.jiraBaseUrl='';
    if(!this.auth.isAdmin())return;
    try { const jira=await this.api.get<{baseUrl:string;enabled:boolean}>('/admin/jira'); if(jira.enabled)this.jiraBaseUrl=jira.baseUrl; } catch { /* integration not reachable; epic controls stay hidden */ }
  }
  async createEpic(): Promise<void> {
    await this.runEpic(() => this.api.post('/admin/jira/roadmap/'+encodeURIComponent(this.selected!.id)+'/epic',{}));
  }
  private async runEpic(call: () => Promise<unknown>): Promise<void> {
    if(!this.selected||this.epicBusy)return;
    this.epicBusy=true;this.epicError='';
    try { await call(); this.epicKeyDraft=''; await this.load(); }
    catch (error) { this.epicError=String(error); }
    finally { this.epicBusy=false; this.cdr.detectChanges(); }
  }
  openBacklogForm(): void { this.resetDraft();this.editingId=null;this.error='';this.formKind = 'backlog'; this.formOpen = true; this.cdr.detectChanges(); }
  async save(): Promise<void> {
    this.saving = true; this.error = '';
    try {
      if (this.formKind === 'roadmap') { const input={title:this.draft.title,description:this.draft.description,targetDate:this.draft.targetDate||null,kind:this.draft.kind,referenceId:this.draft.referenceId,status:this.draft.status,priority:this.draft.priority};if(this.editingId)await this.api.put('/roadmap/'+encodeURIComponent(this.editingId),input);else await this.api.post('/roadmap',input); }
      else await this.api.post('/backlog', { title: this.draft.title, criteria: this.draft.criteria, roadmapId: this.selected?.id, taskCategory: this.draft.taskCategory, taskSubtype: this.draft.taskSubtype, estimatedHours: this.draft.estimatedHours, size: this.settings.estimationMode === 'SIZE_AND_HOURS' ? this.draft.size : null, storyPoints: this.settings.estimationMode === 'POINTS_AND_HOURS' ? this.draft.storyPoints : null });
      this.formOpen = false; this.editingId=null; this.resetDraft();
      await this.load();
    } catch (error) { this.error = String(error); }
    finally { this.saving = false; this.cdr.detectChanges(); }
  }
}
