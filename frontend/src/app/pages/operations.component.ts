import { FoldDirective } from '../fold.directive';
import {OvertimeTaskPickerComponent} from './overtime-task-picker.component';
import { ListPagerComponent } from '../list-pager.component';
import {SlackOvertimeInboxComponent} from './slack-overtime-inbox.component';
import {LeaveRequestsComponent} from './leave-requests.component';
import {OvertimeRequestsComponent} from './overtime-requests.component';
import {activeMembers,activeMemberRecords} from './active-member.model';
import {overtimePeople,OvertimePerson} from './overtime-summary.model';
import { MemberPhotoComponent } from './member-photo.component';
import { MemberParticipationComponent } from './member-participation.component';
import { MemberCapacityComponent } from './member-capacity.component';
import { ModalAccessibilityDirective } from '../modal-accessibility.directive';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, OvertimeBalance, LeaveRecord, OvertimeEntry, OvertimeRecord, SprintSummary, TeamMember, formatDate } from '../api.service';
import { AuthService } from '../auth.service';

@Component({
  standalone: true,
  imports: [ListPagerComponent, ModalAccessibilityDirective, FormsModule, MemberCapacityComponent, MemberParticipationComponent, MemberPhotoComponent],
  template: `
    <div class="page-head"><div><span class="eyebrow">EKİP</span><h1>Takım ve roller</h1><p>Çekirdek ekip, Support ve geçmiş üyeler tek dizinde.</p></div>@if (auth.isAdmin()) { <button class="btn primary" (click)="openCreate()">+ Üye ekle</button> }</div>
    <div class="mini-metrics team-metrics"><div><small>Aktif üye</small><strong>{{ activeCount }}</strong></div><div><small>Support</small><strong>{{ supportCount }}</strong></div><div><small>Geçmiş üye</small><strong>{{ pastCount }}</strong></div></div>
    <section class="card card-pad team-directory"><div class="section-head"><div><span class="eyebrow">ÜYE DİZİNİ</span><h2>Takım üyeleri</h2></div><small>{{ visibleMembers.length }} / {{ members.length }} kişi</small></div>
      <div class="filter-toolbar"><label class="field">Kişi ara<input type="search" [(ngModel)]="query" placeholder="Ad, unvan veya rol"></label>
        <label class="field">Uzmanlık<select [(ngModel)]="roleFilter"><option value="all">Tüm roller</option><option value="develop">Developer</option><option value="design">Designer</option><option value="test">Tester</option><option value="analyst">Analyst</option><option value="architect">Architect</option></select></label>
        <label class="field">Durum<select [(ngModel)]="statusFilter"><option value="active">Aktif üyeler</option><option value="inactive">Geçmiş üyeler</option><option value="all">Tümü</option></select></label></div>
      <app-list-pager #teamPager [items]="visibleMembers" [size]="12" label="Takım" />@if (visibleMembers.length) { <div class="team-grid">@for (member of teamPager.rows; track member.id) {
        <article class="card member-profile" [class.inactive]="!member.active">
          <div class="member-profile-head"><span class="member-avatar profile-portrait">@if(member.photoDataUrl){<img [src]="member.photoDataUrl" [alt]="member.name+' profil fotoğrafı'">}@else{ {{initials(member.name)}} }</span><span><strong>{{member.name}}</strong><small>{{member.title || roleLabel(member)}}</small></span></div>
          <div class="member-tags"><span class="member-kind">{{engagementLabel(member)}}</span><span>{{roleLabel(member)}}</span><span class="member-state" [class.past]="!member.active">{{member.active?'Aktif':'Geçmiş'}}</span></div>
          <div class="member-profile-dates"><span>Son katılım<strong>{{member.participationJoinedOn ? formatDate(member.participationJoinedOn) : 'Tarih belirtilmedi'}}</strong></span><span>Katılım dönemi<strong>{{member.participationLeftOn ? formatDate(member.participationLeftOn) : member.participationClosed ? 'Kapalı dönem' : 'Devam ediyor'}}</strong></span></div>
          <footer class="member-actions">
            @if(auth.isAdmin()){<div class="member-primary-actions"><button class="btn primary small" (click)="edit(member)">Profili düzenle</button><button class="btn small" (click)="openPhoto(member)">{{member.photoDataUrl?'Fotoğrafı değiştir':'Fotoğraf ekle'}}</button></div>}
            <div class="member-secondary-actions"><button type="button" class="btn small" (click)="openParticipation(member)">Katılım geçmişi</button><button type="button" class="btn small" (click)="openCapacity(member)">Kapasite ayarları</button></div>
          </footer>
        </article>
      }</div> } @else { <div class="empty"><strong>Bu filtrede kişi yok</strong>Aramayı veya filtreleri değiştirin.</div> }
    </section>
    @if (error) { <p class="notice warn" role="alert">{{ error }}</p> }
    @if(photoMember){<app-member-photo [member]="photoMember" (closed)="closePhoto()" (saved)="load()" />}
    @if(participationMember){@defer(on immediate){<app-member-participation [member]="participationMember" (closed)="closeParticipation()" (saved)="load()" />}}
    @if(capacityMember){@defer(on immediate){<app-member-capacity [member]="capacityMember" (closed)="closeCapacity()" />}}
    @if (savedMessage) { <p class="notice" role="status">{{ savedMessage }}</p> }
    @if (formOpen) { <div class="modal-layer"><form class="modal" (ngSubmit)="save()"><header><h2>{{ editingId ? 'Üyeyi düzenle' : 'Takım üyesi ekle' }}</h2><p>Uzmanlık ve katılım türü görev ataması ile kapasiteyi belirler.</p></header>
      <div class="modal-body form-grid"><label class="field">Ad soyad<input name="name" [(ngModel)]="draft.name" required maxlength="150"></label>
        <label class="field">Unvan<input name="title" [(ngModel)]="draft.title" maxlength="160"></label>
        <div class="form-grid two"><label class="field">Uzmanlık<select name="teamRole" [(ngModel)]="draft.teamRole"><option value="DEVELOPER">Developer</option><option value="DESIGNER">Designer</option><option value="TEST_ENGINEER">Tester</option><option value="ANALYST">Analyst</option><option value="ARCHITECT">Architect</option><option value="OTHER">Diğer</option></select></label>
          <label class="field">Katılım<select name="engagement" [(ngModel)]="draft.engagement"><option value="CORE">Çekirdek ekip</option><option value="SUPPORT">Support</option></select></label></div>
        <label class="field">Takım sorumluluğu<input name="role" [(ngModel)]="draft.role" maxlength="40" placeholder="Member, Lead, Scrum Master"></label>
        <label class="field">Takıma katılım tarihi<input type="date" name="joinedOn" [(ngModel)]="draft.joinedOn" [disabled]="!!editingId"></label>
        @if (editingId) { <p class="data-note">Dönemleri Katılım geçmişi penceresinden düzenleyin. Ayrılan günleri Sprint → Kapasite sekmesinde belirleyin.</p> }
      @if (error) { <p class="notice warn" role="alert">{{ error }}</p> }</div><footer><button data-modal-dismiss type="button" class="btn" (click)="closeForm()">Vazgeç</button><button type="submit" class="btn primary" [disabled]="saving">{{ editingId ? 'Değişiklikleri kaydet' : 'Üye ekle' }}</button></footer></form></div> }
  `,
})
export class TeamComponent implements OnInit {
  photoMember:TeamMember|null=null;
  openPhoto(member:TeamMember){this.photoMember=member;this.cdr.detectChanges();}
  closePhoto(){this.photoMember=null;this.cdr.detectChanges();}
  participationMember:TeamMember|null=null;
  openParticipation(member:TeamMember){this.participationMember=member;this.cdr.detectChanges();}
  closeParticipation(){this.participationMember=null;this.cdr.detectChanges();}
  capacityMember:TeamMember|null=null;
  openCapacity(member:TeamMember){this.capacityMember=member;this.cdr.detectChanges();}
  closeCapacity(){this.capacityMember=null;this.cdr.detectChanges();}
  private api = inject(ApiService);
  auth = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);
  members: TeamMember[] = [];
  error = '';
  savedMessage = '';
  formOpen = false;
  setFormOpen(open: boolean): void { if(open)this.error=''; this.formOpen=open; this.cdr.detectChanges(); }
  editingId: string | null = null;
  saving = false;
  query = '';
  roleFilter = 'all';
  statusFilter = 'active';
  draft = { name: '', title: '', role: 'Member', teamRole: 'DEVELOPER', engagement: 'CORE', joinedOn: '' };
  formatDate = formatDate;
  get activeCount(): number { return this.members.filter(item => !!item.active).length; }
  get supportCount(): number { return this.members.filter(item => !!item.active && /support|destek|external|adjacent/i.test(`${item.engagement} ${item.teamRole}`)).length; }
  get pastCount(): number { return this.members.filter(item => !item.active).length; }
  get visibleMembers(): TeamMember[] { const q = this.query.toLocaleLowerCase('tr-TR').trim(); return this.members.filter(member =>
    (this.statusFilter === 'all' || (this.statusFilter === 'active' ? !!member.active : !member.active)) &&
    (this.roleFilter === 'all' || `${member.role} ${member.teamRole} ${member.title}`.toLowerCase().includes(this.roleFilter)) &&
    (!q || `${member.name} ${member.title} ${member.role} ${member.teamRole}`.toLocaleLowerCase('tr-TR').includes(q))); }
  initials(name: string): string { return name.trim().split(/\s+/).slice(0,2).map(part => part[0] || '').join('').toLocaleUpperCase('tr-TR'); }
  roleLabel(member: TeamMember): string { const role = `${member.teamRole} ${member.title}`.toLowerCase(); return role.includes('architect') ? 'Architect' : role.includes('design') ? 'Designer' : role.includes('test') ? 'Tester' : role.includes('anal') ? 'Analyst' : role.includes('develop') ? 'Developer' : member.role || 'Rol belirtilmedi'; }
  engagementLabel(member: TeamMember): string { return /support|destek|external|adjacent/i.test(`${member.engagement} ${member.teamRole}`) ? 'Support' : 'Çekirdek ekip'; }
  async ngOnInit(): Promise<void> { await this.load(); }
  async load(): Promise<void> { try { this.members = await this.api.get<TeamMember[]>('/team'); this.error = ''; } catch (error) { this.error = String(error); } finally { this.cdr.detectChanges(); } }
  openCreate(): void { this.closeForm(); this.savedMessage = ''; this.editingId = null; this.formOpen = true; this.cdr.detectChanges(); }
  edit(member: TeamMember): void { this.savedMessage = ''; this.editingId = member.id; this.draft = { name: member.name, title: member.title, role: member.role, teamRole: member.teamRole || 'OTHER', engagement: member.engagement.toUpperCase(), joinedOn: member.joinedOn || '' }; this.formOpen = true; this.cdr.detectChanges(); }
  closeForm(): void { this.formOpen = false; this.editingId = null; this.draft = { name: '', title: '', role: 'Member', teamRole: 'DEVELOPER', engagement: 'CORE', joinedOn: '' }; this.cdr.detectChanges(); }
  async save(): Promise<void> { this.saving = true; this.error = ''; this.savedMessage = ''; try {
    if (this.editingId) { const updated = await this.api.put<TeamMember>(`/team/${encodeURIComponent(this.editingId)}`, this.draft); this.members = this.members.map(member => member.id === updated.id ? updated : member); }
    else { await this.api.post('/team', this.draft); this.members = await this.api.get<TeamMember[]>('/team'); }
    this.closeForm(); this.savedMessage = 'Üye bilgileri kaydedildi.';
  } catch (error) { this.error = String(error); } finally { this.saving = false; this.cdr.detectChanges(); } }
  async toggle(member: TeamMember): Promise<void> { this.error = ''; this.savedMessage = ''; try { await this.api.patch(`/team/${encodeURIComponent(member.id)}`, { active: !member.active }); this.members = await this.api.get<TeamMember[]>('/team'); this.savedMessage = 'Üye durumu güncellendi.'; } catch (error) { this.error = String(error); } finally { this.cdr.detectChanges(); } }
}

const leaveLabel = (kind: string) => ({ ANNUAL: 'Yıllık izin', OVERTIME: 'Mesai hakedişinden izin', COMPANY_GRANTED: 'Şirket izni', UNSPECIFIED: 'Türü belirtilmemiş' }[kind] || kind);
const emptyLeave = () => ({ memberId: '', sprintId: '', days: 1, start: '', end: '', leaveType: '', overtimeAccounting: 'DEBIT' });
@Component({
  standalone: true, imports: [FoldDirective,ListPagerComponent, LeaveRequestsComponent, ModalAccessibilityDirective, FormsModule],
  template: `
    <div class="page-head"><div><span class="eyebrow">EKİP OPERASYONU</span><h1>Kişi izinleri</h1><p>İzin türünü, kapasite etkisini ve mesai kullanımını birlikte izleyin.</p></div>@if(auth.isAdmin()){<button class="btn primary" (click)="open()">+ İzin ekle</button>}</div>
    @defer(on immediate){<app-leave-requests [sprints]="sprints" (approved)="load()" />}
    <div class="mini-metrics ops-metrics"><div><small>Filtrede izin</small><strong>{{ totalDays }} gün</strong></div><div><small>Yıllık izin</small><strong>{{ daysFor('ANNUAL') }} gün</strong></div><div><small>Mesai izni</small><strong>{{ daysFor('OVERTIME') }} gün</strong></div><div><small>Türü belirsiz</small><strong>{{ daysFor('UNSPECIFIED') }} gün</strong></div></div>
    <details appFold class="card card-pad"><summary class="section-head"><h2>İzin geçmişi</h2><small>{{filteredRecords.length}} kayıt</small></summary>
      <p class="data-note">Tüm izin türleri kapasiteyi azaltır. Yalnız mesai hakedişinden izin, mesai bakiyesini düşürür. Yıllık izin toplamı kullanılan gündür; yıllık hakediş bakiyesi değildir. Şirket tatilleri ortak takvimden girilir.</p>
      <div class="filter-toolbar"><label class="field">Kişi<select [(ngModel)]="memberFilter"><option value="all">Tüm kişiler</option>@for(member of activeMembers; track member.id){<option [value]="member.id">{{member.name}}</option>}</select></label>
      <label class="field">Sprint<select [(ngModel)]="sprintFilter"><option value="all">Tüm sprintler</option>@for(sprint of sprints; track sprint.id){<option [value]="sprint.id">{{sprint.name}}</option>}</select></label>
      <label class="field">İzin türü<select [(ngModel)]="typeFilter"><option value="all">Tüm türler</option><option value="ANNUAL">Yıllık izin</option><option value="OVERTIME">Mesai hakedişi</option><option value="COMPANY_GRANTED">Şirket izni</option><option value="UNSPECIFIED">Türü belirtilmemiş</option></select></label>
      <label class="field">Tarih kesinliği<select [(ngModel)]="precisionFilter"><option value="all">Tümü</option><option value="exact">Kesin tarihli</option><option value="sprint-level">Sprint bazlı</option></select></label></div>
      <app-list-pager #peoplePager [items]="groupedRecords" label="İzinler" /><div class="person-accordions">@for(group of peoplePager.rows; track group.memberId){
        <details class="person-accordion"><summary><span class="member-avatar">{{initials(group.memberName)}}</span><span class="person-accordion-name"><strong>{{group.memberName}}</strong><small>{{group.records.length}} kayıt</small></span><span class="person-total">{{group.days}} gün</span><span class="chevron">⌄</span></summary>
        <div class="person-accordion-body"><app-list-pager #leavePager [items]="group.records" label="İzin kayıtları" />@for(record of leavePager.rows; track record.id){<div class="person-record"><span><strong>{{record.sprintName || 'Sprint belirtilmedi'}} · {{label(record.leaveType)}}</strong><small>@if(record.start){ {{formatDate(record.start)}} – {{formatDate(record.end)}} }@else{ Tarih kesin değil · sprint bazlı }</small>
        <small>@if(record.leaveType==='OVERTIME'){ {{record.overtimeHours}} sa · {{record.overtimeAccounting==='IN_SNAPSHOT' ? 'Geçmiş bakiyede zaten düşülmüş; tekrar düşmez' : 'Mesai kullanımına yansıdı'}} }@else if(record.leaveType==='UNSPECIFIED'){ Mesai etkisi bilinmiyor; otomatik düşülmedi }@else{ Mesai hakedişinden düşmez }</small></span>
        <span class="person-values"><strong>{{record.days}} gün</strong>@if(auth.isAdmin()){<button class="btn small" (click)="open(record)">Düzenle</button>}</span></div>}</div></details>
      }@empty{<div class="empty">Bu filtrede izin kaydı yok.</div>}</div>
    </details>
    @if(error){<p class="notice warn" role="alert">{{error}}</p>}
    @if(formOpen){<div class="modal-layer"><form class="modal" (ngSubmit)="save()"><header><h2>{{editingId ? 'İzni düzenle' : 'İzin kaydı'}}</h2><p>Mesai izni tek kayıtla hem kapasiteye hem kullanıma yansır.</p></header><div class="modal-body form-grid">
      <label class="field">Üye<select name="memberId" [(ngModel)]="draft.memberId" [disabled]="!!editingId" required><option value="">Kişi seçin</option>@for(member of activeMembers; track member.id){<option [value]="member.id">{{member.name}}</option>}</select></label>
      <label class="field">Sprint<select name="sprintId" [(ngModel)]="draft.sprintId" (ngModelChange)="loadCapacity()" [disabled]="!!editingId" required><option value="">Sprint seçin</option>@for(sprint of sprints; track sprint.id){<option [value]="sprint.id">{{sprint.name}}</option>}</select></label>
      <label class="field">İzin türü<select name="leaveType" [(ngModel)]="draft.leaveType" required><option value="">Tür seçin</option><option value="ANNUAL">Yıllık izin</option><option value="OVERTIME">Mesai hakedişinden izin</option><option value="COMPANY_GRANTED">Şirket izni (hakedişten düşmez)</option></select></label>
      <label class="field">İzin günü<input type="number" name="days" min="0.5" max="100" step="0.5" [(ngModel)]="draft.days" required></label>
      <div class="form-grid two"><label class="field">Başlangıç (isteğe bağlı)<input type="date" name="start" [(ngModel)]="draft.start"></label><label class="field">Bitiş (isteğe bağlı)<input type="date" name="end" [(ngModel)]="draft.end"></label></div>
      @if(draft.leaveType==='OVERTIME'){
        <label class="field">Mesai kullanımının muhasebesi<select name="overtimeAccounting" [(ngModel)]="draft.overtimeAccounting"><option value="DEBIT">Yeni kullanım — bakiyeden düş</option><option value="IN_SNAPSHOT">Geçmiş bakiyede zaten düşülmüş — tekrar düşme</option></select></label>
        <p class="notice">Güncel mesai bakiyesi: {{balanceFor(draft.memberId)}} saat. @if(estimatedHours!==null){Bu izin: {{estimatedHours}} saat.} Günlük tam çalışma saati kullanılır; odak yüzdesi hakedişi azaltmaz.</p>
        <p class="data-note">“Zaten düşülmüş” yalnız eski mesai tablosunda kullanım olarak yer aldığı doğrulanan izinler içindir. Yeni izinlerde “Yeni kullanım” seçin. Mesai sayfasında ayrıca kullanım girmeyin.</p>
      }
      @if(editingId){<p class="data-note">Geçmiş izin türünü yalnız bildiğiniz kaynağa göre düzeltin. Sabit kapanışlı sprintlerde gün/tarih değiştirilemez; tür düzeltmesi bakiyeye yansır.</p>}
      @if(error){<p class="notice warn" role="alert">{{error}}</p>}</div><footer><button data-modal-dismiss type="button" class="btn" [disabled]="saving" (click)="close()">Vazgeç</button><button type="submit" class="btn primary" [disabled]="saving || !draft.leaveType">İzni kaydet</button></footer></form></div>}
  `,
})
export class LeavesComponent implements OnInit {
  private api=inject(ApiService); auth=inject(AuthService); private cdr=inject(ChangeDetectorRef);
  records:LeaveRecord[]=[]; members:TeamMember[]=[]; sprints:SprintSummary[]=[]; balances:OvertimeBalance[]=[];
  capacityRows:{memberId:string;hoursPerDay:number}[]=[]; error=''; formOpen=false; saving=false; editingId:string|null=null;
  memberFilter='all'; sprintFilter='all'; precisionFilter='all'; typeFilter='all'; draft=emptyLeave(); original:LeaveRecord|null=null;
  formatDate=formatDate; label=leaveLabel;
  initials(name:string){return name.trim().split(/\s+/).slice(0,2).map(p=>p[0]||'').join('').toLocaleUpperCase('tr-TR');}
  get activeMembers(){return activeMembers(this.members);}
  get filteredRecords(){return activeMemberRecords(this.records,this.members).filter(r=>(this.memberFilter==='all'||r.memberId===this.memberFilter)&&(this.sprintFilter==='all'||r.sprintId===this.sprintFilter)&&(this.typeFilter==='all'||r.leaveType===this.typeFilter)&&(this.precisionFilter==='all'||(this.precisionFilter==='exact'?!!r.start:!r.start)));}
  get totalDays(){return this.filteredRecords.reduce((s,r)=>s+r.days,0);}
  daysFor(type:string){return this.filteredRecords.filter(r=>r.leaveType===type).reduce((s,r)=>s+r.days,0);}
  get groupedRecords(){const groups=new Map<string,LeaveRecord[]>();for(const r of this.filteredRecords)groups.set(r.memberId,[...(groups.get(r.memberId)||[]),r]);return [...groups].map(([memberId,records])=>({memberId,memberName:records[0].memberName,records,days:records.reduce((s,r)=>s+r.days,0)})).sort((a,b)=>a.memberName.localeCompare(b.memberName,'tr-TR'));}
  balanceFor(id:string){return this.balances.find(b=>b.memberId===id)?.balanceHours||0;}
  get estimatedHours():number|null {const o=this.original;if(o?.leaveType==='OVERTIME'&&o.days===this.draft.days&&(o.start||'')===this.draft.start&&(o.end||'')===this.draft.end)return o.overtimeHours;const h=this.capacityRows.find(r=>r.memberId===this.draft.memberId)?.hoursPerDay;return h===undefined?null:Math.round(this.draft.days*h*100)/100;}
  open(record?:LeaveRecord){this.original=record||null;this.editingId=record?.id||null;this.draft=record?{memberId:record.memberId,sprintId:record.sprintId,days:record.days,start:record.start||'',end:record.end||'',leaveType:record.leaveType==='UNSPECIFIED'?'':record.leaveType,overtimeAccounting:record.overtimeAccounting==='IN_SNAPSHOT'?'IN_SNAPSHOT':'DEBIT'}:emptyLeave();this.error='';this.formOpen=true;void this.loadCapacity();this.cdr.detectChanges();}
  close(){this.formOpen=false;this.error='';this.cdr.detectChanges();}
  async loadCapacity(){const id=this.draft.sprintId;this.capacityRows=[];if(id)try{const rows=await this.api.get<{memberId:string;hoursPerDay:number}[]>('/sprints/'+encodeURIComponent(id)+'/capacity');if(id===this.draft.sprintId)this.capacityRows=rows;}catch(e){this.error=String(e);}finally{this.cdr.detectChanges();}}
  async ngOnInit(){await this.load();}
  async load(){try{[this.records,this.members,this.sprints,this.balances]=await Promise.all([this.api.get<LeaveRecord[]>('/leaves'),this.api.get<TeamMember[]>('/team'),this.api.get<SprintSummary[]>('/sprints'),this.api.get<OvertimeBalance[]>('/overtime/balances')]);this.error='';}catch(e){this.error=String(e);}finally{this.cdr.detectChanges();}}
  async save(){if(this.saving)return;this.saving=true;this.error='';try{if(this.editingId)await this.api.put('/leaves/'+encodeURIComponent(this.editingId),this.draft);else await this.api.post('/leaves',this.draft);this.formOpen=false;await this.load();}catch(e){this.error=String(e);}finally{this.saving=false;this.cdr.detectChanges();}}
}
@Component({
  standalone:true, imports:[FoldDirective,OvertimeTaskPickerComponent,ListPagerComponent,SlackOvertimeInboxComponent,OvertimeRequestsComponent,ModalAccessibilityDirective,FormsModule],
  templateUrl:'./overtime.component.html',
  styleUrl:'./overtime.component.css',
})
export class OvertimeComponent implements OnInit {
  private api=inject(ApiService);auth=inject(AuthService);private cdr=inject(ChangeDetectorRef);
  records:OvertimeRecord[]=[];entries:OvertimeEntry[]=[];leaves:LeaveRecord[]=[];balances:OvertimeBalance[]=[];members:TeamMember[]=[];sprints:SprintSummary[]=[];
  error='';formOpen=false;saving=false;query='';loading=true;selected:OvertimePerson|null=null;
  draft={taskId:'',memberId:'',sprintId:'',earnedHours:0,usedHours:0,plannedHours:0,includeInCapacity:false,note:''};
  initials(name:string){return name.trim().split(/\s+/).slice(0,2).map(p=>p[0]||'').join('').toLocaleUpperCase('tr-TR');}
  number(value:number){return new Intl.NumberFormat('tr-TR',{maximumFractionDigits:2}).format(value);}
  get activeMembers(){return activeMembers(this.members);}
  get personGroups(){const q=this.query.trim().toLocaleLowerCase('tr-TR');return activeMemberRecords(overtimePeople(this.members,this.records,this.entries,this.leaves,this.sprints),this.members).filter(p=>!q||p.memberName.toLocaleLowerCase('tr-TR').includes(q));}
  openPerson(person:OvertimePerson){this.selected=person;this.cdr.detectChanges();}
  closePerson(){this.selected=null;this.cdr.detectChanges();}
  get hasUnmatchedUsage(){return this.selected?.rows.some(r=>r.unmatchedUsedHours!==0);}
  get selectedWarnings(){return this.balances.find(b=>b.memberId===this.selected?.memberId)?.warnings||[];}
  setFormOpen(open:boolean){this.formOpen=open;this.error='';this.cdr.detectChanges();}
  async ngOnInit(){await this.load();}
  async load(){try{[this.records,this.entries,this.members,this.sprints,this.leaves,this.balances]=await Promise.all([this.api.get<OvertimeRecord[]>('/overtime'),this.api.get<OvertimeEntry[]>('/overtime/entries'),this.api.get<TeamMember[]>('/team'),this.api.get<SprintSummary[]>('/sprints'),this.api.get<LeaveRecord[]>('/leaves'),this.api.get<OvertimeBalance[]>('/overtime/balances')]);this.error='';}catch(e){this.error=String(e);}finally{this.loading=false;this.cdr.detectChanges();}}
  async create(){if(this.saving)return;this.saving=true;this.error='';try{await this.api.post('/overtime/entries',this.draft);this.formOpen=false;this.draft={taskId:'',memberId:'',sprintId:'',earnedHours:0,usedHours:0,plannedHours:0,includeInCapacity:false,note:''};await this.load();}catch(e){this.error=String(e);}finally{this.saving=false;this.cdr.detectChanges();}}
}
