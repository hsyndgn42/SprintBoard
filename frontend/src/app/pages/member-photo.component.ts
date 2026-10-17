import {Component,Input,Output,EventEmitter,inject,ChangeDetectorRef} from '@angular/core';
import {ApiService,TeamMember} from '../api.service';
import {ModalAccessibilityDirective} from '../modal-accessibility.directive';
@Component({selector:'app-member-photo',standalone:true,imports:[ModalAccessibilityDirective],template:`
<div class="modal-layer"><section class="modal photo-dialog"><header><span class="eyebrow">EKİP PROFİLİ</span><h2>{{member.name}} · Fotoğraf</h2><p>Support dahil tüm üyeler için isteğe bağlıdır.</p></header><div class="modal-body">
<div class="photo-preview">@if(preview){<img [src]="preview" [alt]="member.name+' fotoğraf önizlemesi'">}@else{<span>{{member.name[0]}}</span>}</div>
<label class="field">Fotoğraf seç<input type="file" accept="image/png,image/jpeg" [disabled]="busy||processing" (change)="select($event)"></label>
<p class="data-note">PNG / JPEG · en fazla 8 MB. Ortalanarak kare biçime küçültülür. Dosya adı ve konum bilgileri saklanmaz. Fotoğraf yerel veritabanına ve yedeğe dahil edilir. Review HTML çıktısında yalnız çekirdek ekip ve Architecture fotoğrafları yer alır.</p>
@if(error){<p class="notice warn" role="alert">{{error}}</p>}
<button class="btn small" type="button" [disabled]="busy||processing||!preview" (click)="clear()">Fotoğrafı kaldır</button>
</div><footer><button data-modal-dismiss class="btn" [disabled]="busy||processing" (click)="closed.emit()">Vazgeç</button><button class="btn primary" [disabled]="busy||processing||!changed" (click)="save()">{{processing?'Hazırlanıyor…':busy?'Kaydediliyor…':'Fotoğrafı kaydet'}}</button></footer></section></div>`,styles:[`.photo-dialog{max-width:520px}.photo-preview{width:160px;height:160px;border-radius:24px;overflow:hidden;margin:0 auto 24px;background:#edf3fa;display:grid;place-items:center;color:#1762b6;font-size:54px;font-weight:700}.photo-preview img{width:100%;height:100%;object-fit:cover}`]})
export class MemberPhotoComponent {
 @Input({required:true})member!:TeamMember;@Output()closed=new EventEmitter<void>();@Output()saved=new EventEmitter<void>();
 private api=inject(ApiService);private cdr=inject(ChangeDetectorRef);preview='';error='';busy=false;processing=false;changed=false;
 ngOnInit(){this.preview=this.member.photoDataUrl||'';}
 clear(){this.preview='';this.changed=true;this.error='';this.cdr.detectChanges();}
 async select(event:Event){const input=event.target as HTMLInputElement,file=input.files?.[0];if(!file)return;this.error='';this.processing=true;let url='';try{
  if(!['image/png','image/jpeg'].includes(file.type)||file.size>8*1024*1024)throw Error('PNG/JPEG biçiminde, en fazla 8 MB fotoğraf seçin.');
  url=URL.createObjectURL(file);const img=new Image();img.src=url;await img.decode();if(img.naturalWidth*img.naturalHeight>40_000_000)throw Error('Fotoğraf çok büyük; daha küçük bir dosya seçin.');
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#f0f4f8';ctx.fillRect(0,0,256,256);const side=Math.min(img.naturalWidth,img.naturalHeight);ctx.drawImage(img,(img.naturalWidth-side)/2,(img.naturalHeight-side)/2,side,side,0,0,256,256);this.preview=canvas.toDataURL('image/jpeg',.85);this.changed=true;
 }catch(e){this.error=e instanceof Error?e.message:String(e);}finally{if(url)URL.revokeObjectURL(url);input.value='';this.processing=false;this.cdr.detectChanges();}}
 async save(){if(this.busy||this.processing)return;this.busy=true;this.error='';try{await this.api.put('/team/'+encodeURIComponent(this.member.id)+'/photo',{photoDataUrl:this.preview});this.saved.emit();this.closed.emit();}catch(e){this.error=String(e);}finally{this.busy=false;this.cdr.detectChanges();}}
}
