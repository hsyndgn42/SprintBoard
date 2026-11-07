import type {DeliveryReport,DeliverySprint} from './delivery-report.model';
import {DELIVERY_COLORS,DELIVERY_METHODOLOGY,RATE_NOTE,SIZE_NOTE,
 buildDeliveryReport,intakeFigure,items,num,percent,sizeFigure,stamp,trendFigure} from './delivery-report.model';
import {REPORT_HTML_CSS,figureHtml} from './scope-report-html';
import type {ProductSettings,ReportRow} from '../api.service';

/**
 * The standalone export of "Sprint Teslimatı".
 *
 * It mirrors the screen section for section and reuses the same reading model, so a number can
 * never differ between the two. No script, no external style, no font, no network call: the file
 * opens from a mail attachment with SprintBoard switched off and still prints on A4.
 */

const h=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const attr=(value:unknown)=>h(value);
const shortDate=(iso:string)=>{const d=new Date(iso);return Number.isNaN(d.getTime())?'—':new Intl.DateTimeFormat('tr-TR',{dateStyle:'medium'}).format(d);};

const metric=(label:string,value:string,unit:string,note='')=>
 `<div class="metric"><dt>${h(label)}</dt><dd>${h(value)}<span class="unit">${h(unit)}</span></dd>${note?`<p>${h(note)}</p>`:''}</div>`;

const legend=(entries:[string,string][])=>`<ul class="legend">${entries.map(([label,fill])=>`<li><i style="background:${attr(fill)}"></i>${h(label)}</li>`).join('')}</ul>`;

/** Size chips read as label plus count so greyscale print and screen readers lose nothing.
 *  Empty categories are left to the legend; repeating "XL 0" on every row was pure noise. */
const sizeCell=(row:DeliverySprint)=>`<span class="chips">${row.sizes.filter(s=>s.count).map(s=>
 `<span class="chip"><i style="background:${attr(s.fill)}"></i>${h(s.label)} ${h(num(s.count))}</span>`).join('')||'<span class="void">Kayıt yok</span>'}</span>`;

const rateCell=(rate:number|null)=>rate===null
 ? '<span class="void">—</span>'
 : `<span class="rate"><i><b style="width:${rate}%"></b></i>${h(percent(rate))}</span>`;

function comparisonTable(report:DeliveryReport):string{
 const headers=['Sprint','Bitiş','Alınan','BAU','BAU dahil','Done','Undone','Teslimat',report.sizeMode?'Size dağılımı':'Story Point'];
 const body=report.sprints.length?report.sprints.map(s=>{
  const cells=[h(s.name),h(shortDate(s.end)),h(num(s.intake)),h(num(s.bau)),h(num(s.allTasks)),h(num(s.done)),h(num(s.undone)),rateCell(s.rate),
   report.sizeMode?sizeCell(s):h(num(s.storyPoints))+' SP<small>'+h(num(s.pointed))+' işte kayıtlı</small>'];
  return `<tr>${cells.map((cell,i)=>`<td data-label="${attr(headers[i])}"${i>1&&i<7?' class="num"':''}>${cell}</td>`).join('')}</tr>`;
 }).join(''):`<tr><td colspan="${headers.length}" class="void">Tamamlanan sprint yok.</td></tr>`;
 return `<div class="table-wrap" tabindex="0" role="region" aria-label="Sprint karşılaştırması"><table class="delivery-table">`
  +`<caption>Sprint karşılaştırması: bitiş tarihi, alınan iş, BAU, Done ve Undone dağılımı, teslimat oranı ve büyüklük dağılımı. Yeni sprint üstte.</caption>`
  +`<thead><tr>${headers.map(x=>`<th scope="col">${h(x)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
}

const extra=`
.delivery-head dl{margin-top:0}
.metrics.six{grid-template-columns:repeat(3,minmax(0,1fr))}
.strip{display:flex;flex-wrap:wrap;gap:8px 26px;margin:10px 0 0;padding:11px 14px;background:#f6f8f9;font-size:12.5px;color:#48596a}
.strip b{font-weight:650;color:#15202b}
.delivery-table{min-width:880px}
.delivery-table td.num,.delivery-table th:nth-child(n+3):nth-child(-n+8){text-align:right;font-variant-numeric:tabular-nums}
.delivery-table td:first-child{font-weight:620}
.rate{display:inline-flex;align-items:center;gap:8px;justify-content:flex-end;white-space:nowrap}
.rate i{display:block;width:58px;height:7px;border-radius:4px;background:#e4eaee;overflow:hidden;flex:none}
.rate b{display:block;height:100%;background:${DELIVERY_COLORS.rate};print-color-adjust:exact;-webkit-print-color-adjust:exact}
.chips{display:flex;flex-wrap:wrap;gap:4px 10px;font-size:11.5px;color:#48596a}
.chip{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
.chip i{width:9px;height:9px;border-radius:2px;flex:none;print-color-adjust:exact;-webkit-print-color-adjust:exact}
@media print{.delivery-table{min-width:0}.rate i{width:34px}.metrics.six{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:620px){.rate{justify-content:flex-start}.delivery-table td.num{text-align:left}}
`;

export function deliveryReportHtml(rows:ReportRow[],settings:ProductSettings,generatedAt=new Date(),teamName='',scope='Tüm tamamlanan sprintler'):string{
 const report=buildDeliveryReport(rows,settings);
 const period=report.sprints.length?shortDate(report.sprints[report.sprints.length-1].end)+' – '+shortDate(report.sprints[0].end):'—';
 return `<!doctype html><html lang="tr"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sprint Teslimatı</title><style>${REPORT_HTML_CSS}${extra}</style></head><body>
<main>
 <header class="report-head delivery-head">
  <h1>Sprint Teslimatı</h1>
  <p class="note">${h('Tamamlanan sprintlerde alınan iş ile teslim edilen iş. '+RATE_NOTE)}</p>
  <dl>
   ${teamName?`<div><dt>Ekip</dt><dd>${h(teamName)}</dd></div>`:''}
   <div><dt>Kapsam</dt><dd>${h(scope)}</dd></div>
   <div><dt>Sprint</dt><dd>${h(report.sprintCount+' tamamlanan')}</dd></div>
   <div><dt>Dönem</dt><dd>${h(period)}</dd></div>
   <div><dt>Oluşturulma</dt><dd>${h(stamp(generatedAt))}</dd></div>
  </dl>
 </header>

 <section class="layer" aria-labelledby="teslimat-ozeti">
  <h2 id="teslimat-ozeti">Teslimat Özeti</h2>
  <dl class="metrics six">
   ${metric('Tamamlanan sprint',num(report.sprintCount),'sprint')}
   ${metric('Teslim edilen iş',num(report.totalDone),'iş','BAU hariç Done')}
   ${metric('Undone',num(report.totalUndone),'iş','Sprint kapanırken tamamlanmamış')}
   ${metric('Teslimat oranı',percent(report.overallRate),'','İş adedi ağırlıklı')}
   ${metric('Son tamamlanan',report.latest?percent(report.latest.rate):'—','',report.latest?report.latest.name:'Tamamlanan sprint yok')}
   ${metric('En düşük oran',report.worst?percent(report.worst.rate):'—','',report.worst?report.worst.name:'Karşılaştırma için tek sprint')}
  </dl>
  <p class="strip"><span>Ortalama alınan iş: <b>${h(report.averageIntake==null?'—':num(report.averageIntake))}</b></span>`
  +`<span>Ortalama teslim: <b>${h(report.averageDone==null?'—':num(report.averageDone))}</b></span>`
  +`<span>En yüksek oran: <b>${h(report.best?report.best.name+' · '+percent(report.best.rate):'—')}</b></span></p>
 </section>

 ${report.findings.length?`<section class="layer" aria-labelledby="bulgular">
  <h2 id="bulgular">Öne Çıkan Bulgular</h2>
  <ul class="findings">${report.findings.map(f=>`<li>${h(f)}</li>`).join('')}</ul>
 </section>`:''}

 <section class="layer" aria-labelledby="trend">
  <h2 id="trend">Teslimat Trendi</h2>
  <p class="note">${h(RATE_NOTE+' Ölçek her zaman %0–100 arasıdır.')}</p>
  ${figureHtml(trendFigure(report))}
 </section>

 <section class="layer" aria-labelledby="alinan-teslim">
  <h2 id="alinan-teslim">Alınan İş ile Teslim Edilen İş</h2>
  ${figureHtml(intakeFigure(report))}
  ${legend([['Sprinte alınan iş',DELIVERY_COLORS.intake],['Teslim edilen iş',DELIVERY_COLORS.delivered]])}
 </section>

 <section class="layer" aria-labelledby="buyukluk">
  <h2 id="buyukluk">${report.sizeMode?'İşlerin Büyüklük Dağılımı':'Story Point Hacmi'}</h2>
  ${report.sizeMode
   ? figureHtml(sizeFigure(report))+legend(report.sizeTotals.map(s=>[s.label+' · '+items(s.count)+' · '+percent(s.share),s.fill] as [string,string]))+`<p class="caution">${h(SIZE_NOTE)}</p>`
   : `<dl class="metrics">${metric('Story Point',num(report.storyPoints),'SP','Tamamlanan sprintlerin toplamı')}${metric('Kayıtlı iş',num(report.pointedTasks),'iş','Story Point girilmiş iş sayısı')}</dl>`}
 </section>

 <section class="layer" aria-labelledby="karsilastirma">
  <h2 id="karsilastirma">Sprint Karşılaştırması</h2>
  ${comparisonTable(report)}
 </section>

 <section class="layer" aria-labelledby="yontem">
  <h2 id="yontem">Nasıl hesaplanıyor?</h2>
  <dl class="terms">${DELIVERY_METHODOLOGY.map(e=>`<dt>${h(e.term)}</dt><dd>${h(e.text)}</dd>`).join('')}</dl>
 </section>
</main>
<footer>
 <p>${h('SprintBoard · Sprint Teslimatı · '+scope+' · '+report.sprintCount+' tamamlanan sprint · '+stamp(generatedAt))}</p>
 <p>${h('Bu dosya bağımsızdır: harici stil, yazı tipi, betik veya ağ çağrısı içermez.')}</p>
</footer>
</body></html>`;
}
