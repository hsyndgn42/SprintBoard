import {Component,Input} from '@angular/core';
import type {Ranked} from './report-charts';

/** Responsive text and bars keep every person readable without shrinking an SVG. */
@Component({selector:'app-member-bars',standalone:true,template:`
<div class="member-bars" role="list" [attr.aria-label]="label">
 @for(row of rows;track row.key){
 <div class="member-bar-row" role="listitem" [attr.aria-label]="description(row)">
  <div class="person"><strong>{{row.label}}</strong>@if(row.note){<small>{{row.note}}</small>}</div>
  <div class="track" aria-hidden="true">@for(segment of row.segments;track segment.label){@if(segment.value>0){
   <span [style.width.%]="100*segment.value/scale" [style.background]="segment.fill" [title]="segment.label+': '+fmt(segment.value)+' '+unit">
    @if(100*segment.value/scale>=16){<b>{{fmt(segment.value)}}</b>}
   </span>
  }}</div>
  <span class="total">{{fmt(total(row))}} <small>{{unit}}</small></span>
 </div>
 }
</div>`,styles:[`
:host{display:block;min-width:0}.member-bars{display:grid;gap:16px}
.member-bar-row{display:grid;grid-template-columns:minmax(95px,1fr) minmax(70px,2fr) 72px;gap:14px;align-items:center;min-height:36px}
.person{min-width:0}.person strong{display:block;color:#233c55;font-size:12px;font-weight:650;overflow-wrap:anywhere}.person small{display:block;font-size:10px;color:#71849a;line-height:1.5;margin-top:3px}
.track{display:flex;height:24px;background:#edf2f7;border-radius:5px;overflow:hidden}.track>span{display:flex;align-items:center;justify-content:center;flex:none;height:100%;color:#fff;min-width:0}.track b{font-size:10px;font-weight:650}
.total{font-size:13px;font-weight:700;color:#233c55;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.total small{font-size:10px;font-weight:450;color:#71849a}
@media(max-width:480px){.member-bar-row{grid-template-columns:minmax(0,1fr) 70px;gap:6px 10px}.person{grid-column:1}.total{grid-column:2;grid-row:auto}.track{grid-column:1/-1;grid-row:auto;order:3;height:20px}.member-bars{gap:20px}}
@media print{.member-bar-row{break-inside:avoid}.track span{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
`]})
export class MemberBarsComponent {
 @Input() rows:Ranked[]=[];@Input() unit='iş';@Input() label='Kişi dağılımı';
 fmt(value:number){return new Intl.NumberFormat('tr-TR',{maximumFractionDigits:1}).format(value);}
 total(row:Ranked){return row.segments.reduce((sum,s)=>sum+Math.max(0,s.value),0);}
 get scale(){return Math.max(...this.rows.map(r=>this.total(r)),0)||1;}
 description(row:Ranked){return row.label+': '+row.segments.map(s=>s.label+' '+this.fmt(s.value)+' '+this.unit).join(', ')+(row.note?' · '+row.note:'');}
}
