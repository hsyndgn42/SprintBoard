import { ListPagerComponent } from '../list-pager.component';
import {Component,OnInit,OnDestroy,Output,EventEmitter,inject,ChangeDetectorRef} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ApiService,Sprint} from '../api.service';
import {ScopeSummaryComponent} from './scope-summary.component';
import {scopeReportHtml} from './scope-summary.model';
import {downloadText} from './share-export';
@Component({selector:'app-scope-report',standalone:true,imports:[ListPagerComponent,FormsModule,ScopeSummaryComponent],template:`
<section class="card card-pad"><div class="section-head"><div><span class="eyebrow">SPRINT KAPSAMI</span><h2>Acil işler ve kapsam değişimi</h2></div><button class="btn primary" [disabled]="loading||!!error" (click)="download()">HTML indir</button></div>
<label class="field scope-filter">Sprint<select [(ngModel)]="selected" (ngModelChange)="changed()"><option value="">Tüm sprintler</option>@for(s of rows;track s.id){<option [value]="s.id">{{s.name}}</option>}</select></label>
<p class="data-note">Aktif ve geçmiş sprintler · Her sprintin kendi kayıtlı kapsamı. Gerekçeler HTML çıktısına dahildir.</p>
@if(loading){<p role="status">Kapsam geçmişi yükleniyor…</p>}@if(error){<p role="alert">{{error}}</p><button class="btn" (click)="load()">Tekrar dene</button>}
</section>
<app-list-pager #scopePager [items]="visible" [size]="5" label="Sprint kapsamları" />@for(s of scopePager.rows;track s.id){<app-scope-summary [sprint]="s" />}
`,styles:['.scope-filter{max-width:360px;margin-top:16px}.section-head{gap:16px;flex-wrap:wrap}@media print{button,.scope-filter{display:none}}']})
export class ScopeReportComponent implements OnInit,OnDestroy{
 @Output() readyChange=new EventEmitter<boolean>();private api=inject(ApiService);private cdr=inject(ChangeDetectorRef);private destroyed=false;
 rows:Sprint[]=[];selected='';loading=true;error='';
 ngOnInit(){void this.load();}ngOnDestroy(){this.destroyed=true;}
 get visible(){return this.rows.filter(s=>!this.selected||s.id===this.selected);}
 changed(){if(!this.destroyed)this.cdr.detectChanges();}
 async load(){this.loading=true;this.error='';this.readyChange.emit(false);try{this.rows=await this.api.get<Sprint[]>('/reports/scope');}catch(e){this.error=String(e);}finally{this.loading=false;if(!this.destroyed)this.readyChange.emit(!this.error);this.changed();}}
 download(){if(!this.loading&&!this.error)downloadText(scopeReportHtml(this.visible),'text/html;charset=utf-8','sprintboard-acil-kapsam.html');}
}
