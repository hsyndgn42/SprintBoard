import type {Figure,ScopeReport,SprintScope,Mark} from './scope-report.model';
import {METHODOLOGY,EFFORT_NOTE,RECONCILIATION_NOTE,TOTALS_NOTE,SCOPE_COLORS,
 buildScopeReport,hours,items,movementFigure,num,shortDate,
 sprintStatusLabel,stamp,trackingLabel,urgentFigure,waterfallFigure} from './scope-report.model';
import type {Sprint} from '../api.service';

/**
 * The standalone export of "Acil İşler ve Kapsam Değişimi".
 *
 * Same five layers as the screen, same figures, same numbers. The file carries no script, no
 * external style, no font and no network reference, so it opens from a mail attachment years
 * from now and still prints. Every value that came from a person is escaped on the way in.
 */

const h=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const attr=(value:unknown)=>h(value);
const dash=(value:string)=>value.trim()?h(value):'<span class="void">Kayıt yok</span>';

/** The screen renders marks through a template; here the same marks become a string. */
function markSvg(mark:Mark):string{
 switch(mark.kind){
  case 'rect':return `<rect x="${mark.x}" y="${mark.y}" width="${mark.w}" height="${mark.h}" rx="${mark.rx??1}" fill="${attr(mark.fill)}"/>`;
  case 'path':return `<path d="${attr(mark.d)}" fill="${attr(mark.fill)}" stroke="#fff" stroke-width="2"/>`;
  case 'line':return `<line x1="${mark.x1}" y1="${mark.y1}" x2="${mark.x2}" y2="${mark.y2}" class="${attr(mark.role)}"/>`;
  case 'text':return `<text x="${mark.x}" y="${mark.y}" text-anchor="${attr(mark.anchor)}" class="${attr(mark.role)}">${h(mark.text)}</text>`;
 }
}

function figureHtml(figure:Figure):string{
 if(figure.empty)return `<p class="figure-empty">${h(figure.empty)}</p>`;
 return `<figure class="figure"><div class="figure-frame"><svg viewBox="0 0 ${figure.width} ${figure.height}" role="img" aria-labelledby="${attr(figure.id)}-t ${attr(figure.id)}-d">`
  +`<title id="${attr(figure.id)}-t">${h(figure.title)}</title><desc id="${attr(figure.id)}-d">${h(figure.desc)}</desc>`
  +figure.marks.map(markSvg).join('')
  +`</svg></div><figcaption>${h(figure.desc)}</figcaption></figure>`;
}

const legend=(entries:[string,string][])=>`<ul class="legend">${entries.map(([label,fill])=>`<li><i style="background:${attr(fill)}"></i>${h(label)}</li>`).join('')}</ul>`;

const metric=(label:string,value:string,unit:string,note='')=>
 `<div class="metric"><dt>${h(label)}</dt><dd>${h(value)}<span class="unit">${h(unit)}</span></dd>${note?`<p>${h(note)}</p>`:''}</div>`;

function table(caption:string,headers:string[],rows:string[][],empty:string):string{
 const body=rows.length
  ? rows.map(row=>`<tr>${row.map((cell,i)=>`<td data-label="${attr(headers[i])}">${cell}</td>`).join('')}</tr>`).join('')
  : `<tr><td colspan="${headers.length}" class="void">${h(empty)}</td></tr>`;
 return `<div class="table-wrap" tabindex="0" role="region" aria-label="${attr(caption)}"><table><caption>${h(caption)}</caption>`
  +`<thead><tr>${headers.map(x=>`<th scope="col">${h(x)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
}

const badge=(label:string,tone:string)=>`<span class="badge ${attr(tone)}">${h(label)}</span>`;
const statusTone=(key:string)=>({done:'ok',doing:'info',todo:'warn',undone:'bad',removed:'mute',unknown:'mute'}[key]||'mute');
const trackingTone=(state:string)=>state==='FULL'?'info':state==='PARTIAL'?'warn':'mute';

const pair=(count:number,value:number,sign='')=>h(items(count))+' · '+h((count?sign:'')+num(value))+' sa';

function comparisonRows(report:ScopeReport):string[][]{
 return report.tracked.map(s=>[
  h(s.name),
  badge(sprintStatusLabel(s.status),s.status==='completed'?'mute':'info'),
  badge(trackingLabel(s.tracking),trackingTone(s.tracking)),
  pair(s.baselineItems,s.baselineHours),
  pair(s.addedItems,s.addedHours,'+'),
  pair(s.removedItems,s.removedHours,'−'),
  pair(s.currentItems,s.currentHours),
  s.reconciliationHours===0?'<span class="void">0 sa</span>':`<span class="flag">${h((s.reconciliationHours>0?'+':'−')+num(Math.abs(s.reconciliationHours)))} sa</span>`,
  h(items(s.urgentCount)),
  h(hours(s.urgentHours)),
  s.urgentCompletion==null?'<span class="void">—</span>':'%'+s.urgentCompletion,
 ]);
}

function urgentTable(sprint:SprintScope):string{
 return table(sprint.name+' · acil ve plansız işler',
  ['İş','Durum','Planlanan efor','Giriş tarihi','İş tipi','Gerekçe kaydı'],
  sprint.urgent.map(row=>[
   `<strong>${h(row.name)}</strong>${row.externalId?`<small>${h(row.externalId)}</small>`:''}`,
   badge(row.statusText,statusTone(row.status)),
   h(hours(row.hours)),h(shortDate(row.at)),h(row.category),dash(row.reason),
  ]),
  'Bu sprintte acil veya plansız olarak işaretlenmiş iş yok.');
}

function returnedTable(sprint:SprintScope):string{
 return table(sprint.name+' · backlog’a geri gönderilen işler',
  ['İş','Planlanan efor','Çıkış tarihi','Önceki durum','Kapsam durumu','Gerekçe kaydı','Yerine alınan acil iş'],
  sprint.returned.map(row=>[
   `<strong>${h(row.name)}</strong>${row.externalId?`<small>${h(row.externalId)}</small>`:''}`,
   h(hours(row.hours)),h(shortDate(row.at)),h(row.previousStatus),
   badge('Kapsamdan çıkarıldı','mute')+'<small>Undone olarak değerlendirilmez</small>',
   dash(row.reason),row.replacement?h(row.replacement):'<span class="void">Kayıt yok</span>',
  ]),
  'Bu sprintte backlog’a döndürülen iş yok.');
}

function sprintSection(sprint:SprintScope):string{
 const baselineLabel=sprint.tracking==='PARTIAL'?'Takip başlangıcı':'Başlangıç planı';
 return `<section class="sprint" aria-labelledby="sprint-${attr(sprint.id)}">
 <h3 id="sprint-${attr(sprint.id)}">${h(sprint.name)}</h3>
 <p class="meta">${badge(sprintStatusLabel(sprint.status),sprint.status==='completed'?'mute':'info')} ${badge(trackingLabel(sprint.tracking),trackingTone(sprint.tracking))}
  <span>${h(shortDate(sprint.start))} – ${h(shortDate(sprint.end))}</span>${sprint.trackedAt?`<span>Takip başlangıcı: ${h(shortDate(sprint.trackedAt))}</span>`:''}</p>
 <p class="note">${h(EFFORT_NOTE)}</p>
 <dl class="metrics four">
  ${metric(baselineLabel,String(sprint.baselineItems),'iş',num(sprint.baselineHours)+' sa')}
  ${metric('Sonradan eklenen','+'+sprint.addedItems,'iş',num(sprint.addedHours)+' sa')}
  ${metric('Backlog’a dönen',(sprint.removedItems?'−':'')+sprint.removedItems,'iş',num(sprint.removedHours)+' sa')}
  ${metric('Güncel kapsam',String(sprint.currentItems),'iş',num(sprint.currentHours)+' sa')}
 </dl>
 ${figureHtml(waterfallFigure(sprint))}
 ${legend([[baselineLabel,SCOPE_COLORS.baseline],['Eklenen',SCOPE_COLORS.added],['Çıkarılan',SCOPE_COLORS.removed],['Mutabakat farkı',SCOPE_COLORS.reconciliation],['Güncel plan',SCOPE_COLORS.current]])}
 ${sprint.reconciliationHours!==0?`<p class="note flagged">${h('Mutabakat farkı '+(sprint.reconciliationHours>0?'+':'−')+num(Math.abs(sprint.reconciliationHours))+' sa. '+RECONCILIATION_NOTE)}</p>`:''}
 <p class="note">${h('Acil / plansız iş: '+items(sprint.urgentCount)+' · '+hours(sprint.urgentHours)
  +(sprint.urgentCompletion==null?'' : ' · tamamlanan '+sprint.urgentDone+'/'+sprint.urgentCount+' (%'+sprint.urgentCompletion+')')
  +(sprint.reserveMoves?' · rezerv içi hareket: '+sprint.reserveMoves:''))}</p>
 ${urgentTable(sprint)}
 ${returnedTable(sprint)}
</section>`;
}

const css=`
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:#eef1f4;color:#15202b;font:14px/1.6 "Segoe UI",system-ui,-apple-system,Arial,sans-serif}
main{max-width:1180px;margin:26px auto;background:#fff;border:1px solid #d9e0e6}
a{color:#1b3f63}
h1{font-size:30px;line-height:1.15;letter-spacing:-.02em;margin:0}
h2{font-size:19px;letter-spacing:-.01em;margin:0 0 6px}
h3{font-size:16px;margin:0 0 6px}
p{margin:0 0 10px}
.report-head{padding:30px 34px 24px;border-bottom:2px solid #15202b}
.report-head dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:1px;margin:20px 0 0;background:#d9e0e6;border-block:1px solid #d9e0e6}
.report-head dl>div{background:#fff;padding:11px 13px;min-width:0}
.report-head dt{font-size:11px;color:#5a6b7b;margin:0}
.report-head dd{margin:3px 0 0;font-size:14px;overflow-wrap:anywhere}
.layer{padding:26px 34px;border-bottom:1px solid #d9e0e6}
.layer:last-of-type{border-bottom:0}
.lead{font-size:15.5px;line-height:1.55;max-width:70ch;color:#15202b}
.note{font-size:12.5px;line-height:1.65;color:#5a6b7b;max-width:78ch}
.note.flagged{padding:9px 12px;background:#f3f0f9;border-left:3px solid ${SCOPE_COLORS.reconciliation};color:#413765}
.caution{padding:11px 14px;background:#f6f8f9;border-left:3px solid #8a98a4;font-size:12.5px;color:#48596a;max-width:78ch}
.metrics{display:grid;gap:1px;background:#d9e0e6;border-block:1px solid #d9e0e6;margin:20px 0 10px;grid-template-columns:repeat(3,minmax(0,1fr))}
.metrics.four{grid-template-columns:repeat(4,minmax(0,1fr))}
.metric{background:#fff;padding:13px 15px;min-width:0}
.metric dt{font-size:12px;color:#5a6b7b;margin:0}
.metric dd{margin:4px 0 0;font-size:25px;line-height:1.1;font-variant-numeric:tabular-nums}
.metric .unit{font-size:12.5px;color:#5a6b7b;margin-left:4px}
.metric p{margin:3px 0 0;font-size:11.5px;color:#8a98a4}
.figure{margin:16px 0 0}
.figure-frame{overflow-x:auto}
.figure svg{display:block;width:100%;height:auto}
.figure text{fill:#5a6b7b;font-family:inherit;font-size:11px;font-variant-numeric:tabular-nums}
.figure text.value{fill:#15202b;font-size:12px;font-weight:650}
.figure text.unit{fill:#8a98a4}
.figure text.inverse{fill:#fff;font-weight:600;font-size:11.5px}
.figure .axis{stroke:#e4eaee}
.figure .zero{stroke:#aab6bf;stroke-width:1.5}
.figure .link{stroke:#c3ccd3;stroke-dasharray:3 3}
figcaption{margin-top:9px;font-size:12px;line-height:1.6;color:#5a6b7b;max-width:78ch}
.figure-empty{margin:16px 0;padding:18px;border:1px dashed #d9e0e6;font-size:13px;color:#5a6b7b;background:#f6f8f9}
.legend{list-style:none;display:flex;flex-wrap:wrap;gap:7px 18px;margin:11px 0 0;padding:0;font-size:12px;color:#5a6b7b}
.legend li{display:flex;align-items:center;gap:7px}
.legend i{width:11px;height:11px;border-radius:2px;flex:none;print-color-adjust:exact;-webkit-print-color-adjust:exact}
.grid2{display:grid;grid-template-columns:minmax(0,238px) minmax(0,1fr);gap:32px;align-items:start}
.findings{margin:14px 0 0;padding-left:18px;font-size:13.5px;line-height:1.75;max-width:80ch}
.findings li{margin-bottom:3px}
.table-wrap{margin:18px 0 0;overflow-x:auto}
.table-wrap:focus-visible{outline:2px solid #1b3f63;outline-offset:2px}
table{border-collapse:collapse;width:100%;min-width:620px;font-size:12.5px}
caption{text-align:left;font-size:12.5px;color:#5a6b7b;padding-bottom:8px}
th,td{text-align:left;vertical-align:top;padding:9px 10px;border-bottom:1px solid #e4eaee;overflow-wrap:anywhere}
th{background:#f6f8f9;font-size:11px;font-weight:650;color:#48596a;white-space:nowrap}
td small{display:block;font-size:11px;color:#8a98a4;margin-top:2px}
td strong{font-weight:620}
.void{color:#8a98a4}
.flag{color:${SCOPE_COLORS.reconciliation};font-weight:650}
.badge{display:inline-block;padding:1px 8px;border-radius:9px;font-size:11px;font-weight:620;border:1px solid;white-space:nowrap}
.badge.ok{color:#1f5a46;border-color:#9cc9b8;background:#eef7f3}
.badge.info{color:#1b3f63;border-color:#a8c4da;background:#eef4f9}
.badge.warn{color:#8a5a12;border-color:#dfbd87;background:#fdf6ea}
.badge.bad{color:#8e271f;border-color:#dfa9a3;background:#fcefed}
.badge.mute{color:#48596a;border-color:#c8d1d8;background:#f4f6f8}
.sprint{padding:22px 0 4px;border-top:1px solid #d9e0e6}
.sprint:first-of-type{border-top:0;padding-top:4px}
.meta{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;font-size:12px;color:#5a6b7b;margin-bottom:10px}
details{border-top:1px solid #d9e0e6}
summary{cursor:pointer;padding:12px 2px;font-size:14px;font-weight:600}
summary:focus-visible{outline:2px solid #1b3f63;outline-offset:2px}
.terms{margin:4px 0 14px;font-size:12.5px;line-height:1.7}
.terms dt{font-weight:650;margin-top:9px}
.terms dd{margin:1px 0 0;color:#48596a;max-width:84ch}
footer{padding:20px 34px;background:#f6f8f9;color:#5a6b7b;font-size:11.5px}
footer code{font-size:11px;overflow-wrap:anywhere}
@media(max-width:860px){
 main{margin:0;border:0}.report-head,.layer,footer{padding-left:18px;padding-right:18px}
 .report-head dl,.metrics,.metrics.four{grid-template-columns:1fr 1fr}.grid2{grid-template-columns:1fr;gap:20px}h1{font-size:25px}
}
@media(max-width:620px){
 table,tbody,tr,td{display:block}thead{display:none}
 tr{padding:9px 0;border-bottom:1px solid #d9e0e6}
 td{border:0;padding:3px 0}
 td:before{content:attr(data-label);display:block;font-size:10.5px;font-weight:650;color:#8a98a4}
 .metric dd{font-size:21px}
}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
@page{size:A4 landscape;margin:12mm}
@media print{
 body{background:#fff;font-size:10.5px}
 main{margin:0;border:0;max-width:none}
 .report-head{padding:0 0 14px}.layer{padding:14px 0}footer{padding:12px 0;background:#fff}
 details{border-top:1px solid #d9e0e6}
 details>summary{list-style:none}
 .table-wrap{overflow:visible}
 table{font-size:9.5px;min-width:0}th,td{padding:5px 6px}
 thead{display:table-header-group}
 tr,.metric,.figure,.report-head dl{break-inside:avoid}
 h1,h2,h3,caption,summary{break-after:avoid}
 .sprint{break-before:page;padding-top:10px;border-top:0}
 .sprint:first-of-type{break-before:auto}
 .figure svg{min-width:0}
 *{print-color-adjust:exact;-webkit-print-color-adjust:exact}
}
`;

/** Collapsible for a long screen read, forced open in print so the appendix is never lost. */
function methodologyHtml():string{
 return `<details open><summary>Tanımlar ve kurallar</summary><dl class="terms">`
  +METHODOLOGY.map(entry=>`<dt>${h(entry.term)}</dt><dd>${h(entry.text)}</dd>`).join('')
  +`</dl></details>`;
}

export function scopeReportHtml(sprints:Sprint[],generatedAt=new Date(),teamName=''):string{
 const report=buildScopeReport(sprints,generatedAt);
 const measured=report.fullCount+report.partialCount;
 return `<!doctype html><html lang="tr"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Acil İşler ve Kapsam Değişimi</title><style>${css}</style></head><body>
<main>
 <header class="report-head">
  <h1>Acil İşler ve Kapsam Değişimi</h1>
  <p class="note">${h('Sprint açılışından sonra kapsama giren ve kapsamdan çıkan işler. '+EFFORT_NOTE)}</p>
  <dl>
   ${teamName?`<div><dt>Ekip</dt><dd>${h(teamName)}</dd></div>`:''}
   <div><dt>Sprint aralığı</dt><dd>${h(report.sprintRange)}</dd></div>
   <div><dt>Efor türü</dt><dd>${h(report.effortBasis)}</dd></div>
   <div><dt>Kapsam</dt><dd>${h(report.totalSprints+' sprint · takipli '+measured)}</dd></div>
   <div><dt>Oluşturulma</dt><dd>${h(stamp(report.generatedAt))}</dd></div>
  </dl>
 </header>

 <section class="layer" aria-labelledby="donem-ozeti">
  <h2 id="donem-ozeti">Dönem Özeti</h2>
  <dl class="metrics">
   ${metric('Takipli sprint',String(measured),'sprint',report.totalSprints+' sprint incelendi')}
   ${metric('Sonradan eklenen iş',String(report.addedItems),'iş',num(report.addedHours)+' sa planlanan efor')}
   ${metric('Backlog’a dönen iş',String(report.removedItems),'iş',num(report.removedHours)+' sa planlanan efor')}
   ${metric('Acil / plansız iş',String(report.urgentCount),'iş',num(report.urgentHours)+' sa planlanan efor')}
   ${metric('Tamamlanan acil iş',report.urgentDone+' / '+report.urgentCount,'iş','')}
   ${metric('Acil iş tamamlanma',report.urgentCompletion==null?'—':'%'+report.urgentCompletion,'','Done durumundaki acil işler')}
  </dl>
  <p class="caution">${h(TOTALS_NOTE)}</p>
 </section>

 <section class="layer" aria-labelledby="grafikler">
  <h2 id="grafikler">Grafiksel Analiz</h2>
  <div class="grid2">
   <div>
    <h3>Acil iş durumu</h3>
    ${figureHtml(urgentFigure(report))}
    ${report.statusShares.length?legend(report.statusShares.map(s=>[s.label+' · '+s.count,s.fill] as [string,string])):''}
   </div>
   <div>
    <h3>Sprint kapsam hareketi</h3>
    ${figureHtml(movementFigure(report))}
    ${legend([['Sonradan eklenen',SCOPE_COLORS.added],['Backlog’a dönen',SCOPE_COLORS.removed]])}
   </div>
  </div>
 </section>

 ${report.findings.length?`<section class="layer" aria-labelledby="bulgular">
  <h2 id="bulgular">Öne Çıkan Bulgular</h2>
  <ul class="findings">${report.findings.map(f=>`<li>${h(f)}</li>`).join('')}</ul>
 </section>`:''}

 <section class="layer" aria-labelledby="karsilastirma">
  <h2 id="karsilastirma">Takipli Sprint Karşılaştırması</h2>
  ${table('Takipli sprintlerin başlangıç kapsamı, kapsam hareketleri, mutabakat farkı ve acil iş durumu',
   ['Sprint','Durum','Takip','Başlangıç','Eklenen','Çıkarılan','Güncel','Mutabakat farkı','Acil iş','Acil efor','Acil tamamlanma'],
   comparisonRows(report),'Kapsam değişimi takibi bulunan sprint yok.')}
 </section>

 ${report.tracked.length?`<section class="layer" aria-labelledby="detaylar">
  <h2 id="detaylar">Takipli Sprint Detayları</h2>
  ${report.tracked.map(sprintSection).join('')}
 </section>`:''}

 <section class="layer" aria-labelledby="yontem">
  <h2 id="yontem">Hesaplama Yöntemi</h2>
  ${methodologyHtml()}
 </section>
</main>
<footer>
 <p>${h('SprintBoard · Acil İşler ve Kapsam Değişimi · '+stamp(report.generatedAt))}</p>
 <p>${h('Kapsam gerekçeleri ekip üyelerinin yazdığı serbest metinlerdir; paylaşmadan önce kontrol edin.')}</p>
 <p>Teknik zaman damgası: <code>${h(report.generatedAtIso)}</code></p>
</footer>
</body></html>`;
}
