import {OvertimeTrendComponent} from './overtime-trend.component';
import { ListPagerComponent } from '../list-pager.component';
import {SlackSettingsComponent} from './slack-settings.component';
import {ScopeReportComponent} from './scope-report.component';
import { ReportHtmlExportComponent } from './report-html-export.component';
import { CapacityTrendComponent } from './capacity-trend.component';
import { WorkSettingsComponent } from './work-settings.component';
import { ModalAccessibilityDirective } from '../modal-accessibility.directive';
import { ChangeDetectorRef, Component, OnInit, inject, signal } from '@angular/core';
import {downloadText,sprintReportCsv,memberReportCsv,workTypeReportCsv} from './share-export';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MemberContextComponent } from './member-context.component';
import { RoadmapReportComponent } from './roadmap-report.component';
import { DefectReportComponent } from './defect-report.component';
import { SubtypeSettingsComponent } from './subtype-settings.component';
import { BackupComponent } from './backup.component';
import { AccountsComponent } from './accounts.component';
import { ApiService, BauTemplate, CalendarDay, MemberReportRow, ProductSettings, ReportRow, TaskCategory, TaskSubtype, TeamMember, WorkTypeReportRow, formatDate } from '../api.service';
import { TASK_CATEGORIES, TASK_CATEGORY_COLORS, taskCategoryLabel, taskSubtypeLabel } from '../task-taxonomy';

interface MemberReportSummary {
  supportTaskCount:number;
  memberId: string; memberName: string; title: string; teamRole: string; engagement: string;
  taskCount: number; effortHours: number; done: number; undone: number; other: number;
  sizeSmall: number; sizeMedium: number; sizeLarge: number; sizeXLarge: number; pointedTasks: number; storyPointsTotal: number;
}

interface WorkTypeSummary {
  taskCategory: TaskCategory; taskCount: number; effortHours: number; done: number; undone: number; color: string;
}

interface WorkSubtypeSummary {
  taskSubtype: TaskSubtype; taskCount: number; effortHours: number; done: number; undone: number;
}

@Component({
  standalone: true,
  imports: [OvertimeTrendComponent,ListPagerComponent, ScopeReportComponent,ReportHtmlExportComponent, RouterLink, FormsModule, DefectReportComponent, MemberContextComponent, RoadmapReportComponent, CapacityTrendComponent],
  host: {'class':'reports-page'},
  templateUrl: './reports.component.html',
  styleUrl: './reports.component.css',
})
export class ReportsComponent implements OnInit {
  overtimeReady=signal(false);scopeReady=signal(false);
  readonly tabs=[{"id":"scope","label":"Acil işler / kapsam"},{"id":"delivery","label":"Sprint teslimatı"},{"id":"members","label":"Kişi dağılımı"},{"id":"context","label":"Katılım bağlamı"},{"id":"types","label":"İş tipleri"},{"id":"roadmap","label":"Roadmap eforu"},{"id":"capacity","label":"Kapasite trendi"},{"id":"defects","label":"Defect"},{"id":"overtime","label":"Mesai"}];
  activeTab='delivery';
  selectTab(id:string){this.activeTab=id;this.cdr.detectChanges();}
  tabKey(event:KeyboardEvent){
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();
    const current=this.tabs.findIndex(t=>t.id===this.activeTab);
    const next=event.key==='Home'?0:event.key==='End'?this.tabs.length-1:(current+(event.key==='ArrowRight'?1:-1)+this.tabs.length)%this.tabs.length;
    this.selectTab(this.tabs[next].id);
    (event.currentTarget as HTMLElement).querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
  }
  trendReady=signal(false);
  roadmapReady=signal(false);
  loading=true;defectReady=signal(false);viewTime=new Intl.DateTimeFormat('tr-TR',{dateStyle:'medium',timeStyle:'short'}).format(new Date());
  get memberPeriod(){return this.rows.find(r=>r.id===this.selectedSprint)?.name||'Tüm tamamlanan sprintler';}
  get typePeriod(){const s=this.typeSprintOptions.find(r=>r.id===this.selectedTypeSprint);return s?s.name+' / '+s.status:'Tüm sprintler (aktif, planlanan ve tamamlanan)';}
  get memberSortLabel(){return ({tasks:'İş sayısı',effort:'Efor',delivery:'Done oranı',name:'İsim'} as Record<string,string>)[this.memberSort];}
  get memberScope(){return this.memberPeriod+' · '+(this.memberQuery||'Tüm kişiler')+' · Sıralama: '+this.memberSortLabel;}
  exportCsv(kind:'sprints'|'members'|'types'){if(this.loading||this.error)return;const text=kind==='members'?memberReportCsv(this.memberSummary,this.settings,this.memberPeriod):kind==='types'?workTypeReportCsv(this.filteredWorkTypeRows):sprintReportCsv(this.rows,this.settings);downloadText(text,'text/csv;charset=utf-8','sprintboard-'+kind+'.csv');}
  private api = inject(ApiService);
  private cdr = inject(ChangeDetectorRef);
  rows: ReportRow[] = [];
  memberRows: MemberReportRow[] = [];
  workTypeRows: WorkTypeReportRow[] = [];
  settings: ProductSettings = { estimationMode: 'SIZE_AND_HOURS', hoursPerDay: 8 };
  selectedSprint = '';
  selectedTypeSprint = '';
  memberQuery = '';
  memberSort = 'tasks';
  error = '';
  formatDate = formatDate;
  get detailCategories(): TaskCategory[] { return (['BAU','TEST','DEFECT','DEV','DESIGN','ANALYZE'] as TaskCategory[]).filter(c=>['BAU','TEST','DEFECT'].includes(c)||this.filteredWorkTypeRows.some(r=>r.taskCategory===c&&!!r.taskSubtype)); }
  categoryLabel = taskCategoryLabel;
  subtypeLabel = taskSubtypeLabel;
  get totalDone(): number { return this.rows.reduce((sum, row) => sum + row.done, 0); }
  get totalUndone(): number { return this.rows.reduce((sum, row) => sum + row.undone, 0); }
  get chartRows(): ReportRow[] { return [...this.rows].filter(row => row.deliveryRate !== null).sort((a, b) => a.number - b.number); }
  get recentChartRows(): ReportRow[] { return [...this.rows].sort((a,b) => a.number-b.number).slice(-8); }
  get averageDelivery(): number | null { const total = this.rows.reduce((sum,row) => sum + row.tasks,0); return total ? Math.round(this.totalDone * 100 / total) : null; }
  get deliveryTrendPoints(): string { return this.chartRows.map((row, index) => `${this.chartX(index)},${this.chartY(row.deliveryRate)}`).join(' '); }
  get memberSummary(): MemberReportSummary[] {
    const summaries = new Map<string, MemberReportSummary>();
    for (const row of this.memberRows) {
      if (this.selectedSprint && row.sprintId !== this.selectedSprint) continue;
      const current = summaries.get(row.memberId) || { memberId: row.memberId, memberName: row.memberName, title: row.title, teamRole: row.teamRole, engagement: row.engagement, supportTaskCount:0, taskCount: 0, effortHours: 0, done: 0, undone: 0, other: 0, sizeSmall: 0, sizeMedium: 0, sizeLarge: 0, sizeXLarge: 0, pointedTasks: 0, storyPointsTotal: 0 };
      for (const key of ['supportTaskCount','taskCount', 'effortHours', 'done', 'undone', 'other', 'sizeSmall', 'sizeMedium', 'sizeLarge', 'sizeXLarge', 'pointedTasks', 'storyPointsTotal'] as const) current[key] += row[key];
      summaries.set(row.memberId, current);
    }
    const query = this.memberQuery.trim().toLocaleLowerCase('tr-TR');
    const result = [...summaries.values()].filter(row => !query || `${row.memberName} ${row.title} ${row.teamRole} ${row.engagement}`.toLocaleLowerCase('tr-TR').includes(query));
    return result.sort((a, b) => this.memberSort === 'name' ? a.memberName.localeCompare(b.memberName, 'tr') : this.memberSort === 'effort' ? b.effortHours - a.effortHours : this.memberSort === 'delivery' ? this.deliveryRate(b) - this.deliveryRate(a) : b.taskCount - a.taskCount);
  }
  get contextRows():MemberReportRow[]{const ids=new Set(this.memberSummary.map(m=>m.memberId));return this.memberRows.filter(r=>(!this.selectedSprint||r.sprintId===this.selectedSprint)&&ids.has(r.memberId));}
  get memberTaskTotal(): number { return this.memberSummary.reduce((sum, row) => sum + row.taskCount, 0); }
  get memberEffortTotal(): number { return this.memberSummary.reduce((sum, row) => sum + row.effortHours, 0); }
  get memberDoneRate(): number { const done = this.memberSummary.reduce((sum, row) => sum + row.done, 0); const total = this.memberSummary.reduce((sum, row) => sum + row.taskCount, 0); return total ? Math.round(done * 100 / total) : 0; }
  get chartMembers(): MemberReportSummary[] { return [...this.memberSummary].sort((a, b) => b.taskCount - a.taskCount).slice(0, 8); }
  get filteredWorkTypeRows(): WorkTypeReportRow[] { return this.workTypeRows.filter(row => !this.selectedTypeSprint || row.sprintId === this.selectedTypeSprint); }
  get typeSprintOptions(): { id: string; name: string; status: string; number: number }[] {
    const sprints = new Map<string, { id: string; name: string; status: string; number: number }>();
    for (const row of this.workTypeRows) sprints.set(row.sprintId, { id: row.sprintId, name: row.sprintName, status: row.sprintStatus === 'completed' ? 'Tamamlandı' : row.sprintStatus === 'active' ? 'Aktif' : 'Planlandı', number: row.sprintNumber });
    return [...sprints.values()].sort((a, b) => b.number - a.number);
  }
  get workTypeSummary(): WorkTypeSummary[] {
    const summaries = new Map<TaskCategory, WorkTypeSummary>();
    for (const row of this.filteredWorkTypeRows) {
      const current = summaries.get(row.taskCategory) || { taskCategory: row.taskCategory, taskCount: 0, effortHours: 0, done: 0, undone: 0, color: TASK_CATEGORY_COLORS[row.taskCategory] };
      current.taskCount += row.taskCount; current.effortHours += row.effortHours; current.done += row.done; current.undone += row.undone; summaries.set(row.taskCategory, current);
    }
    const order = [...TASK_CATEGORIES.map(item => item.value), 'OTHER' as TaskCategory];
    return [...summaries.values()].sort((a, b) => order.indexOf(a.taskCategory) - order.indexOf(b.taskCategory));
  }
  get taxonomyTaskTotal(): number { return this.workTypeSummary.reduce((sum, row) => sum + row.taskCount, 0); }
  get taxonomyEffortTotal(): number { return this.workTypeSummary.reduce((sum, row) => sum + row.effortHours, 0); }
  get taxonomyDoneRate(): number { const done = this.workTypeSummary.reduce((sum, row) => sum + row.done, 0); return this.taxonomyTaskTotal ? Math.round(done * 100 / this.taxonomyTaskTotal) : 0; }
  get workTypeGradient(): string {
    if (!this.taxonomyTaskTotal) return '#e8eef7';
    let cursor = 0; const stops: string[] = [];
    for (const row of this.workTypeSummary) { const end = cursor + row.taskCount * 100 / this.taxonomyTaskTotal; stops.push(`${row.color} ${cursor}% ${end}%`); cursor = end; }
    return `conic-gradient(${stops.join(',')})`;
  }
  get workTypeAriaLabel(): string { return this.workTypeSummary.map(row => `${taskCategoryLabel(row.taskCategory)} ${row.taskCount} iş`).join(', '); }
  categoryShare(row: WorkTypeSummary): number { return this.taxonomyTaskTotal ? Math.round(row.taskCount * 100 / this.taxonomyTaskTotal) : 0; }
  categoryColor(category: TaskCategory): string { return TASK_CATEGORY_COLORS[category]; }
  categoryTaskCount(category: TaskCategory): number { return this.workTypeSummary.find(row => row.taskCategory === category)?.taskCount || 0; }
  subtypeSummary(category: TaskCategory): WorkSubtypeSummary[] {
    const summaries = new Map<TaskSubtype, WorkSubtypeSummary>();
    for (const row of this.filteredWorkTypeRows.filter(item => item.taskCategory === category)) {
      const current = summaries.get(row.taskSubtype) || { taskSubtype: row.taskSubtype, taskCount: 0, effortHours: 0, done: 0, undone: 0 };
      current.taskCount += row.taskCount; current.effortHours += row.effortHours; current.done += row.done; current.undone += row.undone; summaries.set(row.taskSubtype, current);
    }
    return [...summaries.values()].sort((a, b) => b.taskCount - a.taskCount);
  }
  subtypeBarWidth(category: TaskCategory, count: number): number { const max = Math.max(...this.subtypeSummary(category).map(row => row.taskCount), 1); return Math.max(4, count * 100 / max); }
  subtypeDoneRate(row: WorkSubtypeSummary): number { return row.taskCount ? Math.round(row.done * 100 / row.taskCount) : 0; }
  breakdownTitle(category: TaskCategory): string { return category === 'BAU' ? 'Operasyon kırılımı' : category === 'TEST' ? 'Test kapsamı' : category === 'DEFECT' ? 'Defect kaynağı' : 'İş kırılımı'; }
  async ngOnInit(): Promise<void> { try { [this.rows, this.memberRows, this.workTypeRows, this.settings] = await Promise.all([this.api.get<ReportRow[]>('/reports'), this.api.get<MemberReportRow[]>('/reports/members'), this.api.get<WorkTypeReportRow[]>('/reports/work-types'), this.api.get<ProductSettings>('/settings')]); } catch (error) { this.error = String(error); } finally { this.loading=false;this.cdr.detectChanges(); } }
  chartX(index: number): number { return this.chartRows.length <= 1 ? 370 : 50 + index * 640 / (this.chartRows.length - 1); }
  chartY(rate: number | null): number { return 196 - Math.max(0, Math.min(100, rate ?? 0)) * 1.6; }
  sizeSegment(row: ReportRow, value: number): number { const total = row.sizeSmall + row.sizeMedium + row.sizeLarge + row.sizeXLarge; return total ? value * 100 / total : 0; }
  pointVolume(row: ReportRow): number { const max = Math.max(...this.recentChartRows.map(item => item.storyPointsTotal), 1); return row.storyPointsTotal * 100 / max; }
  memberVolume(member: MemberReportSummary): number { const max = Math.max(...this.chartMembers.map(item => item.taskCount), 1); return Math.max(2, member.taskCount * 100 / max); }
  memberResult(member: MemberReportSummary, value: number): number { return member.taskCount ? value * 100 / member.taskCount : 0; }
  deliveryRate(row: { done: number; taskCount: number }): number { return row.taskCount ? Math.round(row.done * 100 / row.taskCount) : 0; }
  sizeText(row: { sizeSmall: number; sizeMedium: number; sizeLarge: number; sizeXLarge: number }): string { return `Small ${row.sizeSmall}, Medium ${row.sizeMedium}, Large ${row.sizeLarge}, X-Large ${row.sizeXLarge}`; }
  initials(name: string): string { return name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase('tr-TR'); }
  roleLabel(value: string): string { return ({ DEVELOPER: 'Developer', TESTER: 'Tester', DESIGNER: 'Designer', ARCHITECT: 'Architect', ANALYST: 'Analyst' } as Record<string, string>)[value] || value; }
  engagementLabel(value: string): string { return value === 'SUPPORT' ? 'Support' : value === 'FORMER' ? 'Eski ekip' : 'Çekirdek ekip'; }
  print(): void { if(!this.loading&&!this.error&&this.defectReady()&&this.roadmapReady()&&this.trendReady()&&this.scopeReady()&&this.overtimeReady())window.print(); }
}

@Component({
  standalone: true,
  imports: [ListPagerComponent, SlackSettingsComponent, ModalAccessibilityDirective, FormsModule, BackupComponent, SubtypeSettingsComponent, AccountsComponent, WorkSettingsComponent],
  template: `
    <div class="page-head"><div><span class="eyebrow">YÖNETİM</span><h1>Ayarlar</h1><p>Sprint varsayılanları, erişim hesapları, tahmin yöntemi, takvim ve yedekleme.</p></div></div>
    @if(loading){<p class="notice" role="status">Ayarlar yükleniyor…</p>} @else {<details class="settings-section"><summary>Tahmin yöntemi <small>Size / Story Point ve efor</small></summary><div class="settings-primary">
      <section class="card card-pad"><span class="eyebrow">TAHMİN YÖNTEMİ</span><h2>Göreli tahmin + efor</h2>
        <p class="muted">Kapasite ve kişi atamaları her iki yöntemde de saat/gün ile hesaplanır. Size veya Story Point yalnız işin göreli büyüklüğünü anlatır.</p>
        <div class="choice-list"><label><input type="radio" name="estimateMode" value="SIZE_AND_HOURS" [(ngModel)]="settings.estimationMode"><span><strong>Size + efor</strong><small>Ekip standardı. Small, Medium, Large veya X-Large; yanında kişi bazlı saat.</small></span></label>
          <label><input type="radio" name="estimateMode" value="POINTS_AND_HOURS" [(ngModel)]="settings.estimationMode"><span><strong>Story Point + efor</strong><small>Göreli tahmin Story Point, kapasite ve atama yine saat ile izlenir.</small></span></label></div>
        <button class="btn primary" [disabled]="saving" (click)="saveSettings()">Tahmin yöntemini kaydet</button>
        @if (savedMessage) { <p class="inline-success" role="status">{{ savedMessage }}</p> }
      </section>

    </div></details>
    }
    <details class="settings-section"><summary>Slack entegrasyonu <small>Kanallar, bağlantı ve mesaj şablonları</small></summary>@defer (on idle) { <app-slack-settings /> } @placeholder { <section class="card card-pad" style="margin:18px 0"><h2>Slack</h2><p>Entegrasyon ayarları yükleniyor…</p></section> }
    </details><details class="settings-section"><summary>Ekip ve çalışma düzeni <small>Günlük saat ve çalışma haftası</small></summary><app-work-settings #workSettings /></details>
    <details class="settings-section"><summary>Kullanıcılar ve erişim <small>Hesaplar ve işlem geçmişi</small></summary><app-accounts /></details>
    <details class="settings-section"><summary>BAU varsayılanları <small>Sprint iş şablonları</small></summary>
    <section class="card card-pad" style="margin:18px 0"><div class="section-head"><div><span class="eyebrow">SPRİNT VARSAYILANLARI</span><h2>BAU iş şablonları</h2></div><button class="btn primary" (click)="openTemplate()">+ BAU işi ekle</button></div>
      <p class="data-note">Etkin şablonlar yeni sprint oluşturulduğunda, sprint adıyla ayrı backlog ve görev kayıtlarına dönüşür. Buradaki değişiklikler geçmiş veya mevcut sprint görevlerini değiştirmez. On Leave izin kayıtlarından görünür; kapasitede yalnız bir kez düşülür.</p>
      <app-list-pager #bauPager [items]="templates" label="BAU şablonları" /><div class="list" style="margin-top:14px">@for (template of bauPager.rows; track template.id) { <div class="list-row"><span><strong>{{ template.title }}</strong><small>{{ template.mode === 'LEAVE' ? 'İzinlerden türetilir · 0 saat görev eforu' : template.mode === 'CORE' ? 'Çekirdek ekip · kişi başı ' + template.daysPerMember + ' gün' : 'Elle atama · 0 saat başlangıç' }}</small></span>
        <span class="page-actions"><span class="status" [class.done]="template.active">{{ template.active ? 'Etkin' : 'Pasif' }}</span><button class="btn small" (click)="openTemplate(template)">Düzenle</button></span></div> }</div>
      @if (templateMessage) { <p class="inline-success" role="status">{{ templateMessage }}</p> }
    </section>
    </details><details class="settings-section"><summary>İş türleri <small>Alt kırılım yönetimi</small></summary><app-subtype-settings #subtypeSettings /></details>
    <details class="settings-section" open><summary>Yedekleme ve veri güvenliği <small>Son durum, zamanlama ve geri yükleme</small></summary>
    <app-backup (restored)="load(); subtypeSettings.load(); workSettings.load()" />
    </details><details class="settings-section"><summary>Çalışma takvimi <small>Tatiller ve çalışılmayan günler</small></summary><section class="card card-pad" style="margin-top:18px"><div class="section-head"><div><span class="eyebrow">ÇALIŞMA TAKVİMİ</span><h2>Çalışılmayan günler</h2></div><span class="muted">{{ calendarVisible.length }} / {{ days.length }} kayıt</span></div>
      <p class="data-note">Tüm kayıtlar tam gün çalışılmayan gün olarak uygulanır. Resmî yarım günler (arifeler ve 28 Ekim) ekip kararıyla tam gündür. Çalışma düzeninde zaten kapalı günler tekrar düşülmez; aynı tarihteki tatiller bir kez sayılır. İzin ve mesai hakedişinden düşülmez.</p>
      <div class="form-grid two calendar-controls"><label class="field">Takvim yılı<select [(ngModel)]="calendarYear"><option value="">Tüm yıllar</option>@for(year of calendarYears;track year){<option [value]="year">{{ year }}</option>}</select></label><label class="field">Kapsam filtresi<select [(ngModel)]="calendarScope"><option value="">Tüm kayıtlar</option><option value="team">Tüm ekip</option>@for(member of members;track member.id){<option [value]="member.id">{{ member.name }}</option>}</select></label></div>
      <div class="page-actions calendar-import"><button class="btn" [disabled]="saving" (click)="importHolidays(2027)">2027 tatillerini tamamla</button><button class="btn" [disabled]="saving" (click)="importHolidays(2028)">2028 tatillerini tamamla</button></div>
      <p class="data-note">Eksik günler eklenir; mevcut kayıtlar değiştirilmez. Kaynak: <a href="https://vakithesaplama.diyanet.gov.tr/icerik.php?icerik=159" target="_blank" rel="noopener noreferrer">Diyanet 2027</a> · <a href="https://vakithesaplama.diyanet.gov.tr/icerik.php?icerik=193" target="_blank" rel="noopener noreferrer">Diyanet 2028</a>. Sonradan ilan edilebilecek idari izinler dahil değildir.</p>
      @if(calendarMessage){<p class="inline-success" role="status">{{ calendarMessage }}</p>}
      <p class="data-note">{{ calendarWeekdayCount }} hafta içi kaydı · {{ calendarVisible.length-calendarWeekdayCount }} hafta sonu kaydı. Kişinin sprint tarihleri, katılımı ve kapsamına göre kapasiteye uygulanır.</p>
      <form class="form-grid calendar-form" (ngSubmit)="addDay()"><label class="field">Tarih<input type="date" name="date" [(ngModel)]="draft.date" required></label>
        <label class="field">Açıklama<input name="title" [(ngModel)]="draft.title" required maxlength="180" placeholder="Resmî tatil / ekip günü"></label>
        <label class="field">Kapsam<select name="memberId" [(ngModel)]="draft.memberId"><option value="">Tüm ekip</option>@for (member of members; track member.id) { <option [value]="member.id">{{ member.name }}</option> }</select></label>
        <button class="btn primary" type="submit" [disabled]="saving">Gün ekle</button></form>
      <app-list-pager #calendarPager [items]="calendarVisible" label="Takvim" />@if (calendarVisible.length) { <div class="list" style="margin-top:18px">@for (day of calendarPager.rows; track day.id) { <div class="list-row"><span><strong>{{ formatDate(day.date) }}</strong><small>{{ day.title }}</small></span><span class="status">{{ day.memberName || 'Tüm ekip' }}</span></div> }</div> }
    </section>
    @if (error) { <p class="notice warn" role="alert">{{ error }}</p> }
    </details>
    @if (templateOpen) { <div class="modal-layer"><form class="modal" (ngSubmit)="saveTemplate()"><header><h2>{{ editingTemplateId ? 'BAU işini düzenle' : 'BAU işi ekle' }}</h2><p>Değişiklik yalnız daha sonra oluşturulan sprintlere uygulanır.</p></header>
      <div class="modal-body form-grid"><label class="field">İş adı<input name="bauTitle" [(ngModel)]="templateDraft.title" required maxlength="120" placeholder="Örn. Operasyon desteği"></label>
        <label class="field">Atama kuralı<select name="bauMode" [ngModel]="templateDraft.mode" (ngModelChange)="setTemplateMode($event)" [disabled]="editingTemplateId === 'bau-leave'">
          @if (editingTemplateId === 'bau-leave') { <option value="LEAVE">İzinlerden türet</option> }
          <option value="CORE">Tüm çekirdek ekibe kişi başı efor</option><option value="MANUAL">Elle atama (0 saat)</option></select></label>
        @if (templateDraft.mode === 'CORE') { <label class="field">Kişi başı gün<input name="bauDays" type="number" min="0.5" max="20" step="0.5" [(ngModel)]="templateDraft.daysPerMember" required><small>Support ve Architect hariç. Günler yeni sprintin başlangıcına uygun günlük saatle çarpılır.</small></label> }
        @if (editingTemplateId) { <label class="field"><span>Yeni sprintlerde kullan</span><span><input type="checkbox" name="bauActive" [(ngModel)]="templateDraft.active"> Etkin</span></label> }
      @if (error) { <p class="notice warn" role="alert">{{ error }}</p> }</div><footer><button data-modal-dismiss type="button" class="btn" (click)="closeTemplate()">Vazgeç</button><button type="submit" class="btn primary" [disabled]="saving">Kaydet</button></footer></form></div> }
  `,
})
export class SettingsComponent implements OnInit {
  loading=true;
  private api = inject(ApiService);
  private cdr = inject(ChangeDetectorRef);
  settings: ProductSettings = { estimationMode: 'SIZE_AND_HOURS', hoursPerDay: 8 };
  templates: BauTemplate[] = [];
  templateOpen = false;
  closeTemplate(): void { this.templateOpen=false; this.cdr.detectChanges(); }
  editingTemplateId: string | null = null;
  templateDraft: { title: string; mode: 'CORE' | 'MANUAL' | 'LEAVE'; daysPerMember: number; active: boolean } = { title: '', mode: 'MANUAL', daysPerMember: 0, active: true };
  templateMessage = '';
  savedMessage = '';
  calendarYear = '2027';
  calendarScope = '';
  calendarMessage = '';
  get calendarYears(){return [...new Set(['2027','2028',...this.days.map(d=>d.date.slice(0,4))])].sort();}
  get calendarVisible(){return this.days.filter(d=>(!this.calendarYear||d.date.startsWith(this.calendarYear+'-'))&&(!this.calendarScope||(this.calendarScope==='team'?!d.memberId:d.memberId===this.calendarScope))).sort((a,b)=>a.date.localeCompare(b.date)||a.title.localeCompare(b.title,'tr'));}
  get calendarWeekdayCount(){return this.calendarVisible.filter(d=>![0,6].includes(new Date(d.date+'T12:00:00').getDay())).length;}
  async importHolidays(year:number):Promise<void>{if(this.saving)return;this.saving=true;this.error='';this.calendarMessage='';try{const r=await this.api.post<{added:number;existing:number}>('/calendar/turkey-holidays/'+year,{});await this.load();this.calendarYear=String(year);this.calendarScope='team';this.calendarMessage=year+': '+r.added+' gün eklendi, '+r.existing+' gün zaten kayıtlı. Yarım günler tam gün uygulandı.';}catch(error){this.error=String(error);}finally{this.saving=false;this.cdr.detectChanges();}}
  days: CalendarDay[] = [];
  members: TeamMember[] = [];
  draft = { date: '', title: '', memberId: '' };
  saving = false;
  error = '';
  formatDate = formatDate;
  async ngOnInit(): Promise<void> { await this.load(); }
  async load(): Promise<void> { this.loading=true; try { [this.days, this.members, this.settings, this.templates] = await Promise.all([this.api.get<CalendarDay[]>('/calendar'), this.api.get<TeamMember[]>('/team'), this.api.get<ProductSettings>('/settings'), this.api.get<BauTemplate[]>('/bau-templates')]); this.error = ''; } catch (error) { this.error = String(error); } finally { this.loading=false; this.cdr.detectChanges(); } }
  openTemplate(template?: BauTemplate): void { this.editingTemplateId = template?.id || null; this.templateDraft = template ? { title: template.title, mode: template.mode, daysPerMember: template.daysPerMember, active: template.active } : { title: '', mode: 'MANUAL', daysPerMember: 0, active: true }; this.templateMessage = ''; this.templateOpen = true; this.cdr.detectChanges(); }
  setTemplateMode(mode: 'CORE' | 'MANUAL' | 'LEAVE'): void { this.templateDraft.mode = mode; this.templateDraft.daysPerMember = mode === 'CORE' ? 2 : 0; this.cdr.detectChanges(); }
  async saveTemplate(): Promise<void> { this.saving = true; this.error = ''; this.templateMessage = ''; try { if (this.editingTemplateId) await this.api.put(`/bau-templates/${encodeURIComponent(this.editingTemplateId)}`, this.templateDraft); else await this.api.post('/bau-templates', this.templateDraft); this.templateOpen = false; await this.load(); this.templateMessage = 'BAU şablonu kaydedildi. Yeni sprintlerde kullanılacak.'; } catch (error) { this.error = String(error); } finally { this.saving = false; this.cdr.detectChanges(); } }
  async saveSettings(): Promise<void> { if(this.loading||this.saving)return; this.saving = true; this.error = ''; this.savedMessage = ''; try { this.settings = await this.api.put<ProductSettings>('/settings', { estimationMode: this.settings.estimationMode }); this.savedMessage = 'Tahmin yöntemi kaydedildi.'; } catch (error) { this.error = String(error); } finally { this.saving = false; this.cdr.detectChanges(); } }
  async addDay(): Promise<void> { this.saving = true; try { await this.api.post('/calendar', this.draft); this.calendarYear=this.draft.date.slice(0,4);this.calendarScope=''; this.draft = { date: '', title: '', memberId: '' }; await this.load(); } catch (error) { this.error = String(error); } finally { this.saving = false; this.cdr.detectChanges(); } }
}
