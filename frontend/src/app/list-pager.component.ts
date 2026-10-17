import {ApplicationRef,Component, HostListener, Input, inject} from '@angular/core';
@Component({selector:'app-list-pager',standalone:true,template:`
 @if(total>size){<nav class="pager" [attr.aria-label]="label+' sayfaları'">
 <button type="button" class="btn small" [disabled]="page===1" (click)="changePage(page-1)">← Önceki</button>
 <span aria-live="polite">{{(page-1)*size+1}}–{{end}} / {{total}} · {{page}} / {{pages}}</span>
 <button type="button" class="btn small" [disabled]="page===pages" (click)="changePage(page+1)">Sonraki →</button>
 </nav>}`,styles:[`:host{display:block}.pager{display:flex;flex-wrap:wrap;justify-content:flex-end;align-items:center;gap:10px;margin:14px 0}.pager span{font-size:12px;color:#64748b}@media print{:host{display:none}}`]})
export class ListPagerComponent<T=any>{
 private app=inject(ApplicationRef);private printing=false;
 changePage(page:number){this.page=Math.max(1,Math.min(page,this.pages));this.app.tick();}
 @HostListener('window:beforeprint') beforePrint(){this.printing=true;this.app.tick();}
 @HostListener('window:afterprint') afterPrint(){this.printing=false;this.app.tick();}
 @Input() label='Liste'; @Input() size=10;
 private values:T[]=[];private signature='';page=1;
 @Input() set items(value:readonly T[]|null|undefined){
  const next=[...(value||[])];const signature=JSON.stringify(next.map((item:any)=>item?.id??item?.memberId??item?.username??item?.key??item?.date??item));
  if(signature!==this.signature){this.page=1;this.signature=signature;}this.values=next;
  this.page=Math.min(this.page,this.pages);
 }
 get total(){return this.values.length;}get pages(){return Math.max(1,Math.ceil(this.total/this.size));}
 get end(){return Math.min(this.page*this.size,this.total);}
 get rows(){return this.printing?this.values:this.values.slice((this.page-1)*this.size,this.page*this.size);}
}
