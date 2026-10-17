import {Component,Input,Output,EventEmitter,OnInit,inject,ChangeDetectorRef} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ModalAccessibilityDirective} from '../modal-accessibility.directive';
import {ApiService,TeamMember,formatDate} from '../api.service';
import {AuthService} from '../auth.service';
interface Policy{effectiveFrom:string;hoursPerDay:number|null;focusPercent:number}
@Component({selector:'app-member-capacity',standalone:true,imports:[FormsModule,ModalAccessibilityDirective],template:`
<div class="modal-layer"><form class="modal" (ngSubmit)="save()"><header><h2>{{member.name}} · Kapasite ayarları</h2><p>Günlük saat ve planlamaya ayrılabilecek oran</p></header>
<div class="modal-body form-grid"><p class="data-note">Günlük/aylık kapasite seçilen tarihten itibaren değişir. Yeni sprintler oluşturulurken kişinin o tarihteki düzenini sabitler; mevcut sprintler ve geçmiş efor değişmez. Çalışma günleri takım takviminden gelir.</p>
@if(loaded){@if(auth.isAdmin()){
<label class="field">Günlük saat kaynağı<select name="personHoursMode" [(ngModel)]="custom" (ngModelChange)="changed()"><option [ngValue]="false">Takım varsayılanını kullan</option><option [ngValue]="true">Kişiye özel saat</option></select></label>
@if(custom){<label class="field">Günlük çalışma saati<input name="personHours" type="number" min="1" max="24" step="0.5" [(ngModel)]="hours" required></label>}
<label class="field">Odak oranı (%)<input name="personFocus" type="number" min="0" max="100" step="1" [(ngModel)]="focus" required><small>Varsayılan %100. Performans puanı değildir; planlamaya ayrılabilen paydır.</small></label>
<label class="field">Geçerlilik başlangıcı<input name="personFrom" type="date" [(ngModel)]="from" [min]="today" required></label>
<p class="notice">BAU Meeting/Support zaten görev eforudur; bunları karşılamak için odak oranını ayrıca düşürmeyin. Örneğin 10 uygun gün × 8 saat × %80 = 64 saat; planlı mesai ayrıca eklenir.</p>
<p class="data-note">Support için sprintte ayrılan gün girişi hâlâ gereklidir. X ataması saat tüketmez. BAU günleri kişinin günlük saatiyle efora çevrilir; odak oranı görev saatlerini değiştirmez. Sprint oluşturulduktan sonra eklenen kişinin özel ayarı sonraki yeni sprintte kullanılır.</p>
}
<h3>Kapasite ayarı geçmişi</h3><div class="list">@for(p of history;track p.effectiveFrom){<div class="list-row"><span><strong>{{formatDate(p.effectiveFrom)}} itibarıyla</strong><small>{{p.hoursPerDay===null?'Takım saati':p.hoursPerDay+' sa/gün'}} · %{{p.focusPercent}} odak</small></span>@if(auth.isAdmin()&&p.effectiveFrom>=today){<button class="btn small" type="button" (click)="edit(p)">Düzenle</button>}</div>}@empty{<p class="data-note">Özel ayar yok: takım saati ve %100 odak.</p>}</div>
}@else{<p>Yükleniyor…</p>}
@if(message){<p role="status" class="inline-success">{{message}}</p>}@if(error){<p role="alert" class="notice warn">{{error}}</p>}</div>
<footer><button data-modal-dismiss class="btn" type="button" [disabled]="busy" (click)="closed.emit()">{{auth.isAdmin()?'Vazgeç':'Kapat'}}</button>@if(auth.isAdmin()){<button class="btn primary" type="submit" [disabled]="busy||!loaded">Kapasite ayarını kaydet</button>}</footer></form></div>`})
export class MemberCapacityComponent implements OnInit{
 @Input({required:true})member!:TeamMember;@Output()closed=new EventEmitter<void>();private api=inject(ApiService);auth=inject(AuthService);private cdr=inject(ChangeDetectorRef);
 loaded=false;busy=false;custom=false;hours=8;focus=100;from='';today='';history:Policy[]=[];error='';message='';formatDate=formatDate;
 changed(){this.cdr.detectChanges();}async ngOnInit(){await this.load();}
 async load(){try{const data=await this.api.get<{today:string;history:Policy[]}>('/team/'+encodeURIComponent(this.member.id)+'/capacity-policy');this.history=data.history;this.today=data.today;const current=this.history.find(p=>p.effectiveFrom<=this.today);this.custom=current?.hoursPerDay!=null;this.hours=current?.hoursPerDay??8;this.focus=current?.focusPercent??100;this.from=this.today;this.loaded=true;}catch(e){this.error=String(e);}finally{this.changed();}}
 edit(p:Policy){this.custom=p.hoursPerDay!==null;this.hours=p.hoursPerDay??8;this.focus=p.focusPercent;this.from=p.effectiveFrom;this.message='';this.changed();}
 async save(){if(this.busy||!this.auth.isAdmin())return;this.busy=true;this.error='';this.message='';this.changed();try{await this.api.put('/team/'+encodeURIComponent(this.member.id)+'/capacity-policy',{effectiveFrom:this.from,hoursPerDay:this.custom?this.hours:null,focusPercent:this.focus});await this.load();this.message='Kaydedildi. Mevcut sprintlerin kapasitesi değişmedi.';}catch(e){this.error=String(e);}finally{this.busy=false;this.changed();}}
}
