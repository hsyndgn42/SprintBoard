import {Component,Input} from '@angular/core';
import type {Figure} from './scope-report.model';

/**
 * One renderer for every chart in this report. The geometry is decided in the model, so the
 * interactive screen and the standalone export draw the same marks and can never drift apart.
 * Each figure carries its own title and description, which is what a screen reader is given.
 */
@Component({selector:'sb-scope-figure',standalone:true,template:`
@if(figure.empty){<p class="figure-empty">{{figure.empty}}</p>}
@else{
 <div class="figure-frame">
  <svg [attr.viewBox]="'0 0 '+figure.width+' '+figure.height" role="img"
       [attr.aria-labelledby]="figure.id+'-t '+figure.id+'-d'" [style.min-width.px]="figure.width>300?520:0">
   <title [attr.id]="figure.id+'-t'">{{figure.title}}</title>
   <desc [attr.id]="figure.id+'-d'">{{figure.desc}}</desc>
   @for(m of figure.marks;track $index){
    @switch(m.kind){
     @case('rect'){<rect [attr.x]="m.x" [attr.y]="m.y" [attr.width]="m.w" [attr.height]="m.h" [attr.rx]="m.rx" [attr.fill]="m.fill"/>}
     @case('path'){<path [attr.d]="m.d" [attr.fill]="m.fill" [attr.stroke]="m.stroke||'#fff'" [attr.stroke-width]="m.strokeWidth||2" stroke-linejoin="round" stroke-linecap="round"/>}
     @case('line'){<line [attr.x1]="m.x1" [attr.y1]="m.y1" [attr.x2]="m.x2" [attr.y2]="m.y2" [attr.class]="m.role"/>}
     @case('text'){<text [attr.x]="m.x" [attr.y]="m.y" [attr.text-anchor]="m.anchor" [attr.class]="m.role">{{m.text}}</text>}
    }
   }
  </svg>
  </div>
}`,styles:[`
:host{display:block;min-width:0}
.figure-frame{overflow-x:auto}
svg{display:block;width:100%;height:auto}
text{fill:#5a6b7b;font-family:inherit;font-size:11px;font-variant-numeric:tabular-nums}
text.value{fill:#15202b;font-size:12px;font-weight:650}
text.unit{fill:#8a98a4}
text.inverse{fill:#fff;font-weight:600;font-size:11.5px}
.axis{stroke:#e4eaee}
.zero{stroke:#aab6bf;stroke-width:1.5}
.link{stroke:#c3ccd3;stroke-dasharray:3 3}
.figure-empty{margin:16px 0;padding:18px;border:1px dashed #d9e0e6;border-radius:6px;font-size:13px;color:#5a6b7b;background:#f6f8f9}
@media print{.figure-frame{overflow:visible}svg{min-width:0!important}rect,path{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
`]})
export class ScopeFigureComponent{
 @Input({required:true}) figure!:Figure;
}
