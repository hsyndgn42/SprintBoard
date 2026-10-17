import { ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, TeamMember } from '../api.service';
import { AuthService } from '../auth.service';
import { ModalAccessibilityDirective } from '../modal-accessibility.directive';
type Period={joinedOn:string|null;leftOn:string|null;closed:boolean};
@Component({selector:'app-member-participation',standalone:true,imports:[FormsModule,ModalAccessibilityDirective],template:`
<div class="modal-layer"><form class="modal participation-modal" (ngSubmit)="save()">
<header><h2>{{member.name}} · Katılım geçmişi</h2><p>Ekibe giriş, ayrılış ve yeniden katılım dönemleri</p></header>
<div class="modal-body form-grid">
<p class="notice">Ayrılış tarihi ekipteki <b>son gün</b>dür; bu gün kapasiteye dahildir. Yeniden katılım için ayrı dönem ekleyin. Günlük/aylık kapasite bu geçmişi, yeni sprintler oluşturulduğu andaki dönemleri kullanır. Mevcut sprint planları ve görev atamaları değişmez.</p>
@if(!loaded){<p>Yükleniyor…</p>}
@for(period of periods;track $index;let i=$index){
<section class="period"><h3>{{i+1}}. katılım dönemi</h3>
<div class="form-grid two">
<label class="field">Katılım tarihi<input type="date" [name]="'joined'+i" [attr.name]="'joined'+i" [(ngModel)]="period.joinedOn" [disabled]="!auth.isAdmin()||busy"><small>İlk tarihsel kayıt bilinmiyorsa boş bırakılabilir.</small></label>
<label class="field">Son gün<input type="date" [name]="'left'+i" [attr.name]="'left'+i" [(ngModel)]="period.leftOn" [disabled]="!auth.isAdmin()||busy||!period.closed"><small>Ayrılmamış kişi için dönem açık kalır.</small></label>
</div>
<label class="period-state"><input type="checkbox" [name]="'closed'+i" [attr.name]="'closed'+i" [ngModel]="period.closed" (ngModelChange)="setClosed(i,$event)" [disabled]="!auth.isAdmin()||busy"> Bu dönem sona erdi</label>
@if(period.closed&&!period.leftOn){<p class="data-note">Ayrılış tarihi bilinmiyor. Bu belirsiz döneme günlük kapasite üretilmez.</p>}
@if(auth.isAdmin()&&i>0){<button type="button" class="btn small" (click)="remove(i)" [disabled]="busy">Dönemi kaldır</button>}
</section>}
@if(auth.isAdmin()&&loaded){<button type="button" class="btn" (click)="add()" [disabled]="busy||!canAdd">+ Yeniden katılım dönemi</button><small class="muted">Yeni dönem eklemek için önceki dönemi kapatın. Tarihler çakışamaz. Geçmiş düzeltmeleri günlük/aylık kapasiteyi etkiler; sprintler sabit kalır.</small>}
@if(error){<p class="notice warn" role="alert">{{error}}</p>}
@if(message){<p class="notice" role="status">{{message}}</p>}
</div><footer><button type="button" data-modal-dismiss class="btn" (click)="closed.emit()" [disabled]="busy">{{auth.isAdmin()?'Vazgeç':'Kapat'}}</button>@if(auth.isAdmin()){<button type="submit" class="btn primary" [disabled]="busy||!loaded">Katılım geçmişini kaydet</button>}</footer>
</form></div>
`,styles:[`.participation-modal{width:min(690px,100%)}.period{padding:16px;border:1px solid #dce5f1;border-radius:10px;display:grid;gap:14px}.period h3{margin:0}.period-state{display:flex;gap:9px;align-items:center;font-size:12px;color:#425976}.period-state input{width:16px;height:16px}.data-note{margin:0}@media(max-width:520px){.form-grid.two{grid-template-columns:1fr}}`]})
export class MemberParticipationComponent implements OnInit{
 @Input({required:true}) member!:TeamMember;@Output()closed=new EventEmitter<void>();@Output()saved=new EventEmitter<void>();
 private api=inject(ApiService);auth=inject(AuthService);private cdr=inject(ChangeDetectorRef);
 periods:Period[]=[];version='';loaded=false;busy=false;error='';message='';
 ngOnInit(){void this.load();}
 changed(){this.cdr.detectChanges();}
 async load(){try{const data=await this.api.get<{periods:Period[];version:string}>('/team/'+encodeURIComponent(this.member.id)+'/participation');this.periods=data.periods;this.version=data.version;this.loaded=true;}catch(e){this.error=String(e);}finally{this.changed();}}
 get canAdd(){return this.periods.length>0&&this.periods[this.periods.length-1].closed;}
 add(){if(this.canAdd){this.periods.push({joinedOn:null,leftOn:null,closed:false});this.message='';this.changed();}}
 remove(i:number){this.periods.splice(i,1);this.message='';this.changed();}
 setClosed(i:number,value:boolean){this.periods[i].closed=value;if(!value)this.periods[i].leftOn=null;this.message='';this.changed();}
 async save(){if(this.busy||!this.auth.isAdmin())return;this.busy=true;this.error='';this.message='';this.changed();try{await this.api.put('/team/'+encodeURIComponent(this.member.id)+'/participation',{version:this.version,periods:this.periods});await this.load();this.message='Katılım geçmişi kaydedildi. Mevcut sprintler değişmedi.';this.saved.emit();}catch(e){this.error=String(e);}finally{this.busy=false;this.changed();}}
}
