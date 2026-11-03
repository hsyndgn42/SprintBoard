import {Component,Input} from '@angular/core';

/**
 * The three shapes the reports actually need. A sprint-by-sprint comparison is a column,
 * a ranking is a horizontal bar, and a change in scope is a flow. Each carries an average
 * so a single sprint can be read against the team's own normal rather than against zero.
 */
export type Segment={label:string;value:number;fill:string};
export type Column={key:string;label:string;caption?:string;segments:Segment[];marker?:number|null;empty?:string};
export type Ranked={key:string;label:string;note?:string;caption?:string;segments:Segment[]};
export type Step={label:string;value:number;kind:'base'|'add'|'remove'|'total'};

const tr=new Intl.NumberFormat('tr-TR',{maximumFractionDigits:1});
export const num=(n:number)=>tr.format(n);
const sum=(s:Segment[])=>s.reduce((n,x)=>n+Math.max(0,x.value),0);

const AXIS=`.axis{stroke:#d9e0e6}.avg{stroke:#15202b;stroke-width:1.5;stroke-dasharray:6 4;opacity:.55}.avg-tag{fill:#15202b;opacity:.75;font-size:11px}
text{fill:#5a6b7b;font-family:inherit;font-size:11px;font-variant-numeric:tabular-nums}
.marker{stroke:#15202b;stroke-width:2.5;stroke-linecap:round}
svg{display:block;width:100%;height:auto}
:host{display:block;min-width:0}
.frame{overflow-x:auto}
.key{display:flex;flex-wrap:wrap;gap:8px 18px;margin:12px 0 0;font-size:12px;color:#5a6b7b}
.key span{display:flex;align-items:center;gap:7px}
.key i{width:11px;height:11px;border-radius:2px;print-color-adjust:exact;-webkit-print-color-adjust:exact}
.key i.rule{height:0;width:16px;border-top:2.5px solid #15202b;border-radius:0}
.key i.dash{height:0;width:16px;border-top:2px dashed #15202b;opacity:.6;border-radius:0}
@media print{.frame{overflow:visible}svg{min-width:0}rect,.key i{print-color-adjust:exact;-webkit-print-color-adjust:exact}}`;

/** Sprint-by-sprint comparison: stacked columns, an optional per-column marker, one average. */
@Component({selector:'sb-columns',standalone:true,template:`
<div class="frame"><svg [attr.viewBox]="'0 0 '+width+' 252'" role="img" [attr.aria-label]="label">
 @for(t of [0,0.5,1];track t){<line class="axis" [attr.x1]="56" [attr.x2]="width-14" [attr.y1]="y(peak*t)" [attr.y2]="y(peak*t)"/><text x="48" [attr.y]="y(peak*t)+4" text-anchor="end">{{fmt(peak*t)}}</text>}
 <text x="48" y="12" text-anchor="end">{{unit}}</text>
 @for(c of columns;track c.key;let i=$index){<g><title>{{c.caption||c.label}}</title>
  @if(c.empty){<text [attr.x]="x(i)" y="196" text-anchor="middle">{{c.empty}}</text>}@else{
   @for(s of c.segments;track s.label;let j=$index){@if(s.value>0){<rect [attr.fill]="s.fill" [attr.x]="x(i)-bar/2" [attr.y]="y(top(c,j))" [attr.width]="bar" [attr.height]="h(s.value)" rx="1"/>}}
   @if(c.marker!=null){<line class="marker" [attr.x1]="x(i)-bar/2-5" [attr.x2]="x(i)+bar/2+5" [attr.y1]="y(c.marker)" [attr.y2]="y(c.marker)"/>}}
 </g>}
 @if(average!==null&&average>0){<line class="avg" x1="56" [attr.x2]="width-14" [attr.y1]="y(average)" [attr.y2]="y(average)"/><text class="avg-tag" [attr.x]="width-14" [attr.y]="y(average)-6" text-anchor="end">{{averageLabel}} {{fmt(average)}}</text>}
 @for(c of columns;track c.key;let i=$index){@if(i%step===0||i===columns.length-1){<text [attr.x]="x(i)" y="238" text-anchor="middle">{{c.label}}</text>}}
</svg></div><ng-content/>`,styles:[AXIS]})
export class SbColumnsComponent{
 @Input() columns:Column[]=[];@Input() unit='sa';@Input() label='Sprint karşılaştırması';
 @Input() average:number|null=null;@Input() averageLabel='ortalama';
 fmt=num;
 get width(){return Math.max(720,88+this.columns.length*58);}
 get peak(){return Math.max(1,...this.columns.map(c=>Math.max(sum(c.segments),c.marker??0)),this.average??0);}
 get bar(){return Math.max(9,Math.min(44,(this.width-70)/Math.max(1,this.columns.length)-14));}
 get step(){return Math.max(1,Math.ceil(this.columns.length/14));}
 top(c:Column,j:number){return c.segments.slice(0,j+1).reduce((n,s)=>n+Math.max(0,s.value),0);}
 x(i:number){return 56+(i+0.5)*(this.width-70)/Math.max(1,this.columns.length);}
 y(v:number){return 184-172*Math.min(v,this.peak)/this.peak;}
 h(v:number){return 172*Math.max(0,v)/this.peak;}
}

/** A ranking: the eye travels down a sorted list and the dashed line says where normal is. */
@Component({selector:'sb-ranked',standalone:true,template:`
<div class="frame"><svg [attr.viewBox]="'0 0 720 '+height" role="img" [attr.aria-label]="label">
 @if(average!==null&&average>0){<line class="avg" [attr.x1]="plot(average)" [attr.x2]="plot(average)" y1="4" [attr.y2]="height-18"/><text class="avg-tag" [attr.x]="plot(average)" [attr.y]="height-4" text-anchor="middle">{{averageLabel}} {{fmt(average)}}</text>}
 @for(r of rows;track r.key;let i=$index){<g><title>{{r.caption||r.label}}</title>
  <text x="0" [attr.y]="row(i)+4">{{clip(r.label)}}</text>
  @if(r.note){<text x="0" [attr.y]="row(i)+17" opacity=".7">{{clip(r.note)}}</text>}
  @for(s of r.segments;track s.label;let j=$index){@if(s.value>0){<rect [attr.fill]="s.fill" [attr.x]="206+plotw*offset(r,j)/span" [attr.y]="row(i)-9" [attr.width]="plotw*s.value/span" height="14" rx="1"/>}}
  <text [attr.x]="716" [attr.y]="row(i)+4" text-anchor="end">{{fmt(total(r))}} {{unit}}</text>
 </g>}
</svg></div><ng-content/>`,styles:[AXIS]})
export class SbRankedComponent{
 @Input() rows:Ranked[]=[];@Input() unit='sa';@Input() label='Sıralama';
 @Input() average:number|null=null;@Input() averageLabel='ortalama';
 fmt=num;plotw=440;
 get height(){return Math.max(60,this.rows.length*34+28);}
 get span(){return Math.max(1,...this.rows.map(r=>sum(r.segments)),this.average??0);}
 total(r:Ranked){return sum(r.segments);}
 offset(r:Ranked,j:number){return r.segments.slice(0,j).reduce((n,s)=>n+Math.max(0,s.value),0);}
 row(i:number){return 18+i*34;}
 plot(v:number){return 206+this.plotw*Math.min(v,this.span)/this.span;}
 clip(v:string){return v.length>30?v.slice(0,29)+'…':v;}
}

/** Scope change reads as a flow: where the plan started, what moved it, where it stands. */
@Component({selector:'sb-flow',standalone:true,template:`
<div class="frame"><svg viewBox="0 0 720 230" role="img" [attr.aria-label]="label">
 <line class="axis" x1="40" x2="712" y1="176" y2="176"/>
 @for(s of steps;track s.label;let i=$index){<g><title>{{s.label}}: {{fmt(s.value)}} {{unit}}</title>
  @if(i>0&&i<steps.length-1){<line class="axis" [attr.x1]="x(i-1)+w/2" [attr.x2]="x(i)-w/2" [attr.y1]="carry(i)" [attr.y2]="carry(i)" stroke-dasharray="3 3"/>}
  <rect [attr.fill]="fill(s)" [attr.x]="x(i)-w/2" [attr.y]="top(s,i)" [attr.width]="w" [attr.height]="size(s)" rx="1"/>
  <text [attr.x]="x(i)" [attr.y]="top(s,i)-7" text-anchor="middle">{{s.kind==='add'?'+':s.kind==='remove'?'−':''}}{{fmt(s.value)}}</text>
  <text [attr.x]="x(i)" y="196" text-anchor="middle">{{s.label}}</text>
 </g>}
</svg></div><ng-content/>`,styles:[AXIS]})
export class SbFlowComponent{
 @Input() steps:Step[]=[];@Input() unit='sa';@Input() label='Kapsam akışı';
 fmt=num;w=74;
 private running(i:number){let n=0;for(let k=0;k<i;k++){const s=this.steps[k];if(s.kind==='base')n=s.value;else if(s.kind==='add')n+=s.value;else if(s.kind==='remove')n-=s.value;}return n;}
 get peak(){return Math.max(1,...this.steps.map((s,i)=>s.kind==='add'?this.running(i)+s.value:Math.max(s.value,this.running(i))));}
 x(i:number){return 40+(i+0.5)*672/Math.max(1,this.steps.length);}
 size(s:Step){return Math.max(2,150*Math.abs(s.value)/this.peak);}
 top(s:Step,i:number){const base=this.running(i);const high=s.kind==='add'?base+s.value:s.kind==='remove'?base:s.value;return 176-150*high/this.peak;}
 carry(i:number){const s=this.steps[i];return 176-150*(s.kind==='remove'?this.running(i):this.running(i))/this.peak;}
 fill(s:Step){return s.kind==='add'?'#c0362c':s.kind==='remove'?'#b9c4cb':s.kind==='total'?'#15202b':'#1f6f78';}
}
