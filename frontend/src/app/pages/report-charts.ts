import {Component,Input} from '@angular/core';

/**
 * A chart kit, not a chart style. Each report picks the shape its own data has:
 * a rate over time is a line, a composition is a donut, a split inside a group is a stack,
 * a plan against a limit is a bullet, a change is a waterfall. Every mark carries its
 * own number, because a reader should never have to measure a bar against an axis.
 */
export type Segment={label:string;value:number;fill:string};
export type Column={key:string;label:string;caption?:string;segments:Segment[];marker?:number|null;markerLabel?:string;empty?:string};
export type Ranked={key:string;label:string;note?:string;caption?:string;segments:Segment[]};
export type Step={label:string;value:number;kind:'base'|'add'|'remove'|'total'};
export type Series={label:string;color:string;kind?:'line'|'area'};
export type Point={label:string;values:(number|null)[];caption?:string};
export type Slice={label:string;value:number;fill:string;note?:string};
export type Bullet={key:string;label:string;value:number;target:number|null;note?:string;caption?:string};
export type Dumbbell={key:string;label:string;from:number;to:number;note?:string;caption?:string};
export type Diverge={key:string;label:string;up:number;down:number;caption?:string};

const tr=new Intl.NumberFormat('tr-TR',{maximumFractionDigits:1});
export const num=(n:number)=>tr.format(n);
const sum=(s:{value:number}[])=>s.reduce((n,x)=>n+Math.max(0,x.value),0);
const nice=(peak:number)=>{const p=Math.max(1,peak);const mag=Math.pow(10,Math.floor(Math.log10(p)));const s=p/mag;return (s<=1?1:s<=2?2:s<=2.5?2.5:s<=4?4:s<=5?5:s<=8?8:10)*mag;};

const BASE=`:host{display:block;min-width:0}
svg{display:block;width:100%;height:auto}
text{fill:#5a6b7b;font-family:inherit;font-size:11px;font-variant-numeric:tabular-nums}
text.value{fill:#15202b;font-size:11px;font-weight:600}
text.unit{fill:#8a98a4}
.axis{stroke:#e4eaee}.zero{stroke:#b4c0c8}
.marker{stroke:#15202b;stroke-width:2.5;stroke-linecap:round}
.frame{overflow-x:auto}
@media print{.frame{overflow:visible}svg{min-width:0}rect,circle,path,i{print-color-adjust:exact;-webkit-print-color-adjust:exact}}`;

/* ---------------------------------------------------------------- columns */
/** Sprint-by-sprint amounts. Stacked, each column topped with its own total. */
@Component({selector:'sb-columns',standalone:true,template:`
<div class="frame"><svg [attr.viewBox]="'0 0 '+width+' 224'" role="img" [attr.aria-label]="label">
 @for(t of ticks;track t){<line class="axis" x1="54" [attr.x2]="width-10" [attr.y1]="y(t)" [attr.y2]="y(t)"/><text x="46" [attr.y]="y(t)+4" text-anchor="end">{{fmt(t)}}</text>}
 <text x="46" y="12" text-anchor="end" class="unit">{{unit}}</text>
 @for(c of columns;track c.key;let i=$index){<g><title>{{c.caption||c.label}}</title>
  @if(c.empty){<text [attr.x]="x(i)" y="186" text-anchor="middle" class="unit">{{c.empty}}</text>}@else{
   @for(s of c.segments;track s.label;let j=$index){@if(s.value>0){<rect [attr.fill]="s.fill" [attr.x]="x(i)-bar/2" [attr.y]="y(top(c,j))" [attr.width]="bar" [attr.height]="h(s.value)" rx="1"/>}}
   <text class="value" [attr.x]="x(i)" [attr.y]="y(total(c))-7" text-anchor="middle">{{fmt(total(c))}}</text>
   @if(c.marker!=null){<line class="marker" [attr.x1]="x(i)-bar/2-6" [attr.x2]="x(i)+bar/2+6" [attr.y1]="y(c.marker)" [attr.y2]="y(c.marker)"><title>{{markerLabel}} {{fmt(c.marker)}}</title></line>}}
 </g>}
 <line class="zero" x1="54" [attr.x2]="width-10" y1="192" y2="192"/>
 @for(c of columns;track c.key;let i=$index){@if(i%step===0||i===columns.length-1){<text [attr.x]="x(i)" y="210" text-anchor="middle">{{c.label}}</text>}}
</svg></div>`,styles:[BASE]})
export class SbColumnsComponent{
 @Input() columns:Column[]=[];@Input() unit='sa';@Input() label='Karşılaştırma';@Input() markerLabel='sınır';
 fmt=num;
 get width(){return Math.max(720,80+this.columns.length*58);}
 get peak(){return nice(Math.max(1,...this.columns.map(c=>Math.max(sum(c.segments),c.marker??0))));}
 get ticks(){return [0,0.25,0.5,0.75,1].map(t=>this.peak*t);}
 get bar(){return Math.max(10,Math.min(46,(this.width-64)/Math.max(1,this.columns.length)-16));}
 get step(){return Math.max(1,Math.ceil(this.columns.length/14));}
 total(c:Column){return sum(c.segments);}
 top(c:Column,j:number){return c.segments.slice(0,j+1).reduce((n,s)=>n+Math.max(0,s.value),0);}
 x(i:number){return 54+(i+0.5)*(this.width-64)/Math.max(1,this.columns.length);}
 y(v:number){return 192-168*Math.min(v,this.peak)/this.peak;}
 h(v:number){return 168*Math.max(0,v)/this.peak;}
}

/* ------------------------------------------------------------------ lines */
/** A rate or a level over time. Areas sit behind, lines ride on top, every point labelled. */
@Component({selector:'sb-lines',standalone:true,template:`
<div class="frame"><svg [attr.viewBox]="'0 0 '+width+' 236'" role="img" [attr.aria-label]="label">
 @for(t of ticks;track t){<line class="axis" x1="54" [attr.x2]="width-10" [attr.y1]="y(t)" [attr.y2]="y(t)"/><text x="46" [attr.y]="y(t)+4" text-anchor="end">{{fmt(t)}}</text>}
 <text x="46" y="12" text-anchor="end" class="unit">{{unit}}</text>
 @for(s of series;track s.label;let i=$index){
  @if(s.kind==='area'){<path [attr.d]="area(i)" [attr.fill]="s.color" fill-opacity=".16"/>}
  <path [attr.d]="path(i)" fill="none" [attr.stroke]="s.color" stroke-width="2.5" stroke-linejoin="round" [attr.stroke-dasharray]="s.kind==='area'?'5 4':null"/>
 }
 @for(p of points;track p.label;let j=$index){<g><title>{{p.caption||p.label}}</title>
  @for(s of series;track s.label;let i=$index){@if(p.values[i]!=null){<circle [attr.cx]="x(j)" [attr.cy]="y(p.values[i]!)" r="4" [attr.fill]="s.color"/>}}
  @if(labelled(j)&&p.values[0]!=null){<text class="value" [attr.x]="x(j)" [attr.y]="y(p.values[0]!)-10" text-anchor="middle">{{fmt(p.values[0]!)}}</text>}
 </g>}
 <line class="zero" x1="54" [attr.x2]="width-10" y1="186" y2="186"/>
 @for(p of points;track p.label;let j=$index){@if(j%step===0||j===points.length-1){<text [attr.x]="x(j)" y="204" text-anchor="middle">{{p.label}}</text>}}
</svg></div>`,styles:[BASE]})
export class SbLinesComponent{
 @Input() series:Series[]=[];@Input() points:Point[]=[];@Input() unit='';@Input() label='Zaman serisi';
 fmt=num;
 get width(){return Math.max(720,80+this.points.length*58);}
 get peak(){return nice(Math.max(1,...this.points.flatMap(p=>p.values.map(v=>v??0))));}
 get ticks(){return [0,0.25,0.5,0.75,1].map(t=>this.peak*t);}
 get step(){return Math.max(1,Math.ceil(this.points.length/14));}
 labelled(j:number){return this.points.length<=14||j%this.step===0||j===this.points.length-1;}
 x(j:number){return 54+(j+0.5)*(this.width-64)/Math.max(1,this.points.length);}
 y(v:number){return 186-162*Math.min(Math.max(0,v),this.peak)/this.peak;}
 private pts(i:number){return this.points.map((p,j)=>p.values[i]==null?null:[this.x(j),this.y(p.values[i]!)] as [number,number]).filter((p):p is [number,number]=>!!p);}
 path(i:number){const p=this.pts(i);return p.map((q,k)=>(k?'L':'M')+q[0].toFixed(1)+' '+q[1].toFixed(1)).join(' ');}
 area(i:number){const p=this.pts(i);if(!p.length)return '';return this.path(i)+' L'+p[p.length-1][0].toFixed(1)+' 186 L'+p[0][0].toFixed(1)+' 186 Z';}
}

/* ------------------------------------------------------------------ donut */
/** A composition. The ring carries the percentages, the legend carries the amounts. */
@Component({selector:'sb-donut',standalone:true,template:`
<div class="donut-wrap">
 <svg viewBox="0 0 240 240" role="img" [attr.aria-label]="label">
  <circle cx="120" cy="120" r="79" fill="none" stroke="#eef2f4" stroke-width="42"/>
  @for(a of arcs;track a.slice.label){<path [attr.d]="a.d" [attr.fill]="a.slice.fill" stroke="#fff" stroke-width="2"><title>{{a.slice.label}}: {{fmt(a.slice.value)}} {{unit}} (%{{a.pct}})</title></path>}
  @for(a of arcs;track a.slice.label){@if(a.pct>=7){<text [attr.x]="a.lx" [attr.y]="a.ly+4" text-anchor="middle" fill="#fff" style="font-weight:650;font-size:13px">%{{a.pct}}</text>}}
  <text x="120" y="114" text-anchor="middle" class="value" style="font-size:26px">{{fmt(total)}}</text>
  <text x="120" y="134" text-anchor="middle" class="unit">{{unit}}</text>
 </svg>
 <ul class="donut-key">@for(a of arcs;track a.slice.label){<li><i [style.background]="a.slice.fill"></i><span>{{a.slice.label}}@if(a.slice.note){<small>{{a.slice.note}}</small>}</span><b>{{fmt(a.slice.value)}} {{unit}}</b><em>%{{a.pct}}</em></li>}</ul>
</div>`,styles:[BASE+`
.donut-wrap{display:flex;gap:30px;align-items:center;flex-wrap:wrap}
svg{width:230px;flex:none}
.donut-key{list-style:none;margin:0;padding:0;flex:1;min-width:250px;display:grid;gap:2px}
.donut-key li{display:grid;grid-template-columns:12px 1fr auto 46px;align-items:baseline;gap:12px;font-size:13px;color:#15202b;padding:6px 0;border-bottom:1px solid #eef2f4}
.donut-key li:last-child{border-bottom:0}
.donut-key i{width:11px;height:11px;border-radius:3px;align-self:center}
.donut-key small{display:block;font-size:11px;color:#8a98a4;margin-top:2px}
.donut-key b{font-variant-numeric:tabular-nums;font-weight:600}
.donut-key em{font-style:normal;color:#5a6b7b;text-align:right;font-variant-numeric:tabular-nums;font-weight:600}
@media(max-width:560px){.donut-wrap{gap:16px}svg{width:180px}.donut-key{min-width:0}}`]})
export class SbDonutComponent{
 @Input() slices:Slice[]=[];@Input() unit='';@Input() label='Dağılım';
 fmt=num;
 get total(){return sum(this.slices);}
 /** Percentages are rounded once here so the ring, the labels and the legend never disagree. */
 get arcs(){const vis=this.slices.filter(s=>s.value>0).sort((a,b)=>b.value-a.value),total=Math.max(1,this.total);
  let angle=-Math.PI/2;
  return vis.map(slice=>{
   const span=2*Math.PI*slice.value/total,start=angle,end=angle+span;angle=end;
   const mid=(start+end)/2,R=100,r=58;
   const px=(a:number,rad:number)=>[(120+rad*Math.cos(a)).toFixed(2),(120+rad*Math.sin(a)).toFixed(2)];
   const [ax,ay]=px(start,R),[bx,by]=px(end,R),[cx2,cy2]=px(end,r),[dx,dy]=px(start,r);
   const large=span>Math.PI?1:0;
   const d=vis.length===1
    ?`M120 20 A100 100 0 1 1 119.9 20 Z M120 62 A58 58 0 1 0 119.9 62 Z`
    :`M${ax} ${ay} A${R} ${R} 0 ${large} 1 ${bx} ${by} L${cx2} ${cy2} A${r} ${r} 0 ${large} 0 ${dx} ${dy} Z`;
   return {slice,d,pct:Math.round(slice.value*100/total),lx:120+79*Math.cos(mid),ly:120+79*Math.sin(mid)};
  });}
}

/* ------------------------------------------------------------------ stack */
/** Shares inside a group: every row is the whole, the segments are how it splits. */
@Component({selector:'sb-stack',standalone:true,template:`
<div class="stack">@for(r of rows;track r.key){<div class="stack-row"><div class="stack-head"><strong>{{r.label}}</strong><span>{{fmt(total(r))}} {{unit}}</span></div>
 <div class="stack-bar">@for(s of visible(r);track s.label){<span [style.background]="s.fill" [style.width.%]="100*s.value/total(r)" [attr.title]="s.label+': '+fmt(s.value)+' '+unit+' (%'+pct(r,s)+')'">@if(pct(r,s)>=9){<b>%{{pct(r,s)}}</b>}</span>}</div>
 <ul class="stack-key">@for(s of visible(r);track s.label){<li><i [style.background]="s.fill"></i>{{s.label}} <b>{{fmt(s.value)}}</b></li>}</ul>
</div>}</div>`,styles:[BASE+`
.stack{display:grid;gap:22px}
.stack-head{display:flex;justify-content:space-between;align-items:baseline;gap:12px;font-size:13.5px;color:#15202b}
.stack-head span{color:#5a6b7b;font-variant-numeric:tabular-nums}
.stack-bar{display:flex;height:30px;border-radius:5px;overflow:hidden;margin-top:7px;background:#eef2f4}
.stack-bar span{display:flex;align-items:center;justify-content:center;min-width:2px;print-color-adjust:exact;-webkit-print-color-adjust:exact}
.stack-bar b{color:#fff;font-size:11.5px;font-weight:650}
.stack-key{list-style:none;display:flex;flex-wrap:wrap;gap:4px 18px;margin:8px 0 0;padding:0;font-size:12px;color:#5a6b7b}
.stack-key li{display:flex;align-items:center;gap:6px}
.stack-key i{width:9px;height:9px;border-radius:2px}
.stack-key b{color:#15202b;font-variant-numeric:tabular-nums}
.stack-row{break-inside:avoid}`]})
export class SbStackComponent{
 @Input() rows:{key:string;label:string;segments:Segment[]}[]=[];@Input() unit='iş';
 fmt=num;
 total(r:{segments:Segment[]}){return Math.max(1,sum(r.segments));}
 visible(r:{segments:Segment[]}){return r.segments.filter(s=>s.value>0);}
 pct(r:{segments:Segment[]},s:Segment){return Math.round(s.value*100/this.total(r));}
}

/* ----------------------------------------------------------------- bullet */
/** A plan measured against its own limit: the bar is what was planned, the tick is the limit. */
@Component({selector:'sb-bullet',standalone:true,template:`
<div class="frame"><svg [attr.viewBox]="'0 0 720 '+height" role="img" [attr.aria-label]="label">
 @for(r of rows;track r.key;let i=$index){<g><title>{{r.caption||r.label}}</title>
  <text x="0" [attr.y]="y(i)+2">{{clip(r.label)}}</text>
  <rect x="210" [attr.y]="y(i)-10" [attr.width]="plotw" height="20" fill="#f1f4f6" rx="2"/>
  @if(r.target!==null){<rect x="210" [attr.y]="y(i)-10" [attr.width]="w(min(r.value,r.target))" height="20" fill="#1f6f78" rx="2"/>
   @if(r.value>r.target){<rect [attr.x]="210+w(r.target)" [attr.y]="y(i)-10" [attr.width]="w(r.value-r.target)" height="20" fill="#c0362c"/>}
   <line class="marker" [attr.x1]="210+w(r.target)" [attr.x2]="210+w(r.target)" [attr.y1]="y(i)-15" [attr.y2]="y(i)+15"/>}
  @else{<rect x="210" [attr.y]="y(i)-10" [attr.width]="w(r.value)" height="20" fill="#9bb4b8" rx="2"/>}
  <text class="value" x="716" [attr.y]="y(i)-3" text-anchor="end">{{valueLabel}} {{fmt(r.value)}} {{unit}}</text>
  @if(r.target!==null){<text class="unit" x="716" [attr.y]="y(i)+11" text-anchor="end">{{targetLabel}} {{fmt(r.target)}} {{unit}}</text>}
 </g>}
 <line class="zero" x1="210" x2="580" [attr.y1]="height-16" [attr.y2]="height-16"/>
 @for(t of ticks;track t){<text [attr.x]="210+w(t)" [attr.y]="height-4" text-anchor="middle" class="unit">{{fmt(t)}}</text>}
</svg></div>`,styles:[BASE]})
export class SbBulletComponent{
 @Input() rows:Bullet[]=[];@Input() unit='sa';@Input() label='Plan ve sınır';
 /** The bar and the limit are named so the pair never reads as an unexplained ratio. */
 @Input() valueLabel='Plan';@Input() targetLabel='Sınır';
 fmt=num;plotw=370;min=Math.min;
 get height(){return Math.max(74,this.rows.length*40+34);}
 get peak(){return nice(Math.max(1,...this.rows.flatMap(r=>[r.value,r.target??0])));}
 get ticks(){return [0,0.5,1].map(t=>this.peak*t);}
 y(i:number){return 20+i*40;}
 w(v:number){return this.plotw*Math.max(0,Math.min(v,this.peak))/this.peak;}
 clip(v:string){return v.length>30?v.slice(0,29)+'…':v;}
}

/* ------------------------------------------------------------------ pair */
/** Two amounts per row, drawn as two stacked bars. A reader compares bar lengths far more
 *  reliably than the gap between two dots, and both numbers are named on the right. */
@Component({selector:'sb-pair',standalone:true,template:`
<div class="frame"><svg [attr.viewBox]="'0 0 720 '+height" role="img" [attr.aria-label]="label">
 @for(t of ticks;track t){<line class="axis" [attr.x1]="left+w(t)" [attr.x2]="left+w(t)" y1="0" [attr.y2]="height-20"/><text [attr.x]="left+w(t)" [attr.y]="height-6" text-anchor="middle" class="unit">{{fmt(t)}}</text>}
 @for(r of rows;track r.key;let i=$index){<g><title>{{r.caption||r.label}}</title>
  <text x="0" [attr.y]="y(i)+16">{{clip(r.label)}}</text>
  <rect [attr.x]="left" [attr.y]="y(i)+4" [attr.width]="w(r.from)" height="11" [attr.fill]="fromColor" rx="2"/>
  <rect [attr.x]="left" [attr.y]="y(i)+19" [attr.width]="w(r.to)" height="11" [attr.fill]="toColor" rx="2"/>
  <text class="value" x="716" [attr.y]="y(i)+13" text-anchor="end">{{toLabel}} {{fmt(r.to)}}</text>
  <text class="unit" x="716" [attr.y]="y(i)+27" text-anchor="end">{{fromLabel}} {{fmt(r.from)}} · fark {{fmt(gap(r))}}</text>
 </g>}
 <line class="zero" [attr.x1]="left" [attr.x2]="left+plotw" [attr.y1]="height-20" [attr.y2]="height-20"/>
</svg></div>`,styles:[BASE]})
export class SbPairComponent{
 @Input() rows:Dumbbell[]=[];@Input() unit='';@Input() label='Karşılaştırma';
 @Input() fromColor='#93a7b8';@Input() toColor='#1f6f78';
 @Input() fromLabel='Alınan';@Input() toLabel='Teslim';
 fmt=num;left=206;plotw=354;
 get height(){return Math.max(70,this.rows.length*42+26);}
 get peak(){return nice(Math.max(1,...this.rows.flatMap(r=>[r.from,r.to])));}
 get ticks(){return [0,0.5,1].map(t=>this.peak*t);}
 gap(r:Dumbbell){return Math.abs(r.from-r.to);}
 y(i:number){return i*42;}
 w(v:number){return this.plotw*Math.max(0,Math.min(v,this.peak))/this.peak;}
 clip(v:string){return v.length>28?v.slice(0,27)+'…':v;}
}

/* -------------------------------------------------------------- diverging */
/** Two opposite facts that can both be true at once, drawn on either side of zero. */
@Component({selector:'sb-diverge',standalone:true,template:`
<div class="frame"><svg [attr.viewBox]="'0 0 '+width+' 160'" role="img" [attr.aria-label]="label">
 <line class="zero" x1="70" [attr.x2]="width-10" y1="70" y2="70"/>
 <text x="62" y="40" text-anchor="end" class="unit">{{upLabel}}</text><text x="62" y="98" text-anchor="end" class="unit">{{downLabel}}</text>
 @for(r of rows;track r.key;let i=$index){<g><title>{{r.caption||r.label}}</title>
  @if(r.up>0){<rect fill="#c0362c" [attr.x]="x(i)-bar/2" [attr.y]="70-h(r.up)" [attr.width]="bar" [attr.height]="h(r.up)" rx="1"/><text class="value" [attr.x]="x(i)" [attr.y]="70-h(r.up)-6" text-anchor="middle">{{fmt(r.up)}}</text>}
  @if(r.down>0){<rect fill="#b9c4cb" [attr.x]="x(i)-bar/2" y="70" [attr.width]="bar" [attr.height]="h(r.down)" rx="1"/><text class="value" [attr.x]="x(i)" [attr.y]="70+h(r.down)+14" text-anchor="middle">{{fmt(r.down)}}</text>}
 </g>}
 @for(r of rows;track r.key;let i=$index){@if(i%step===0||i===rows.length-1){<text [attr.x]="x(i)" y="152" text-anchor="middle">{{r.label}}</text>}}
</svg></div>`,styles:[BASE]})
export class SbDivergeComponent{
 @Input() rows:Diverge[]=[];@Input() label='Aşım ve boşluk';@Input() upLabel='aşım';@Input() downLabel='boşta';
 fmt=num;
 get width(){return Math.max(720,80+this.rows.length*58);}
 get peak(){return Math.max(1,...this.rows.flatMap(r=>[r.up,r.down]));}
 get bar(){return Math.max(8,Math.min(30,(this.width-80)/Math.max(1,this.rows.length)-18));}
 get step(){return Math.max(1,Math.ceil(this.rows.length/14));}
 x(i:number){return 70+(i+0.5)*(this.width-80)/Math.max(1,this.rows.length);}
 h(v:number){return 44*Math.max(0,v)/this.peak;}
}

/* ----------------------------------------------------------------- ranked */
/** A sorted list where the label matters as much as the length. */
@Component({selector:'sb-ranked',standalone:true,template:`
<div class="frame"><svg [attr.viewBox]="'0 0 720 '+height" role="img" [attr.aria-label]="label">
 @for(r of rows;track r.key;let i=$index){<g><title>{{r.caption||r.label}}</title>
  <text x="0" [attr.y]="row(i)+4">{{clip(r.label)}}</text>
  @if(r.note){<text x="0" [attr.y]="row(i)+18" class="unit">{{clip(r.note)}}</text>}
  @for(s of r.segments;track s.label;let j=$index){@if(s.value>0){<rect [attr.fill]="s.fill" [attr.x]="206+plotw*offset(r,j)/span" [attr.y]="row(i)-9" [attr.width]="plotw*s.value/span" height="16" rx="1"/>}}
  <text class="value" x="716" [attr.y]="row(i)+4" text-anchor="end">{{fmt(total(r))}} {{unit}}</text>
 </g>}
</svg></div>`,styles:[BASE]})
export class SbRankedComponent{
 @Input() rows:Ranked[]=[];@Input() unit='sa';@Input() label='Sıralama';
 fmt=num;plotw=440;
 get height(){return Math.max(50,this.rows.length*34+14);}
 get span(){return Math.max(1,...this.rows.map(r=>sum(r.segments)));}
 total(r:Ranked){return sum(r.segments);}
 offset(r:Ranked,j:number){return r.segments.slice(0,j).reduce((n,s)=>n+Math.max(0,s.value),0);}
 row(i:number){return 18+i*34;}
 clip(v:string){return v.length>30?v.slice(0,29)+'…':v;}
}

/* ------------------------------------------------------------------- flow */
/** A change: where the plan started, what moved it, where it ended. */
@Component({selector:'sb-flow',standalone:true,template:`
<div class="frame"><svg viewBox="0 0 720 230" role="img" [attr.aria-label]="label">
 <line class="zero" x1="40" x2="712" y1="176" y2="176"/>
 @for(s of steps;track s.label;let i=$index){<g><title>{{s.label}}: {{fmt(s.value)}} {{unit}}</title>
  @if(i>0&&i<steps.length-1){<line class="axis" [attr.x1]="x(i-1)+w/2" [attr.x2]="x(i)-w/2" [attr.y1]="carry(i)" [attr.y2]="carry(i)" stroke-dasharray="3 3"/>}
  <rect [attr.fill]="fill(s)" [attr.x]="x(i)-w/2" [attr.y]="top(s,i)" [attr.width]="w" [attr.height]="size(s)" rx="1"/>
  <text class="value" [attr.x]="x(i)" [attr.y]="top(s,i)-7" text-anchor="middle">{{s.kind==='add'?'+':s.kind==='remove'?'−':''}}{{fmt(s.value)}}</text>
  <text [attr.x]="x(i)" y="196" text-anchor="middle">{{s.label}}</text>
 </g>}
</svg></div>`,styles:[BASE]})
export class SbFlowComponent{
 @Input() steps:Step[]=[];@Input() unit='sa';@Input() label='Kapsam akışı';
 fmt=num;w=74;
 private running(i:number){let n=0;for(let k=0;k<i;k++){const s=this.steps[k];if(s.kind==='base')n=s.value;else if(s.kind==='add')n+=s.value;else if(s.kind==='remove')n-=s.value;}return n;}
 get peak(){return Math.max(1,...this.steps.map((s,i)=>s.kind==='add'?this.running(i)+s.value:Math.max(s.value,this.running(i))));}
 x(i:number){return 40+(i+0.5)*672/Math.max(1,this.steps.length);}
 size(s:Step){return Math.max(2,150*Math.abs(s.value)/this.peak);}
 top(s:Step,i:number){const base=this.running(i);const high=s.kind==='add'?base+s.value:s.kind==='remove'?base:s.value;return 176-150*high/this.peak;}
 carry(i:number){return 176-150*this.running(i)/this.peak;}
 fill(s:Step){return s.kind==='add'?'#c0362c':s.kind==='remove'?'#b9c4cb':s.kind==='total'?'#15202b':'#1f6f78';}
}
