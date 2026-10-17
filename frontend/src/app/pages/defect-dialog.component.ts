import { ModalAccessibilityDirective } from '../modal-accessibility.directive';
import { Component,Input,Output,EventEmitter,OnInit,OnDestroy,inject,ChangeDetectorRef } from '@angular/core';
import { ApiService,BacklogItem,TeamMember } from '../api.service';
import { DefectDetails,emptyDefect } from '../defect-model';
import { DefectFieldsComponent } from './defect-fields.component';
@Component({selector:'app-defect-dialog',standalone:true,imports: [ModalAccessibilityDirective, DefectFieldsComponent],template:`<div class="modal-layer"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="defect-title"><header><h2 id="defect-title">Defect takibi</h2><p>{{ title }}</p></header><div class="modal-body">@if(loading){<p>Yükleniyor…</p>}@else{<app-defect-fields [value]="draft" (valueChange)="update($event)" [items]="items" [members]="members" [itemId]="backlogId" />}@if(error){<p class="notice warn" role="alert">{{ error }}</p>}</div><footer><button data-modal-dismiss class="btn" [disabled]="saving" (click)="cancel.emit()">Vazgeç</button><button class="btn primary" [disabled]="loading || saving || !loaded" (click)="save()">{{ saving?'Kaydediliyor…':'Defect bilgilerini kaydet' }}</button></footer></section></div>`})
export class DefectDialogComponent implements OnInit,OnDestroy {
  @Input({required:true}) backlogId!:string;@Input() title='';@Output() cancel=new EventEmitter<void>();@Output() saved=new EventEmitter<void>();
  private api=inject(ApiService);private cdr=inject(ChangeDetectorRef);private destroyed=false;draft:DefectDetails=emptyDefect();items:BacklogItem[]=[];members:TeamMember[]=[];loading=true;loaded=false;saving=false;error='';
  ngOnDestroy(){this.destroyed=true;}update(d:DefectDetails){this.draft=d;this.cdr.detectChanges();}
  async ngOnInit(){try{[this.items,this.members]=await Promise.all([this.api.get<BacklogItem[]>('/backlog'),this.api.get<TeamMember[]>('/team')]);const item=this.items.find(i=>i.id===this.backlogId);if(!item)throw Error('İş bulunamadı');this.draft={...(item.defect||emptyDefect())};this.loaded=true;}catch(e){this.error=String(e);}finally{this.loading=false;if(!this.destroyed)this.cdr.detectChanges();}}
  async save(){if(!this.loaded||this.saving)return;this.saving=true;this.error='';this.cdr.detectChanges();try{await this.api.put('/backlog/'+encodeURIComponent(this.backlogId)+'/defect',this.draft);this.saved.emit();}catch(e){this.error=String(e);}finally{this.saving=false;if(!this.destroyed)this.cdr.detectChanges();}}
}
