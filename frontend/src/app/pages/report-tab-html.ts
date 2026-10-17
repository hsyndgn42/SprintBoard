import {overtimeSectionHtml,trendSvg,defectSeries} from './operational-trends.model';
import {reserveHtml} from './defect-reserve-html';
import type {ReportExport} from './report-export.model';
import {memberContexts,capacitySourceLabel} from './member-context.model';
import {trendSource} from './capacity-trend.model';
import {taskCategoryLabel,taskSubtypeLabel} from '../task-taxonomy';

const h=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const n=(value:number|null|undefined)=>value==null?'—':new Intl.NumberFormat('tr-TR',{maximumFractionDigits:2}).format(Number.isFinite(value)?value:0);
const numeric=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?Math.max(0,v):0;
const colors=['#13866c','#cd7b27','#397cc5','#8460c6','#8ba7c9'];
const sum=<T>(rows:T[],get:(row:T)=>number)=>rows.reduce((total,r)=>total+numeric(get(r)),0);
const rate=(part:number,total:number)=>total?Math.round(100*part/total)+'%':'—';
const section=(title:string,body:string,note='')=>`<section class="section"><h2>${h(title)}</h2>${note?`<p class="note">${h(note)}</p>`:''}${body}</section>`;
const kpis=(rows:[string,unknown][])=>`<div class="kpis">${rows.map(([label,value])=>`<div><small>${h(label)}</small><strong>${h(value)}</strong></div>`).join('')}</div>`;
const table=(headers:string[],rows:unknown[][])=>`<div class="table-wrap"><table><thead><tr>${headers.map(x=>`<th>${h(x)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map((cell,i)=>`<td data-label="${h(headers[i])}">${h(cell)}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${headers.length}">Seçili kapsamda kayıt yok.</td></tr>`}</tbody></table></div>`;
type ChartRow={label:string;values:number[];note?:string};
function stacks(rows:ChartRow[],labels:string[],unit:string,max?:number){
 const scale=Math.max(1,max??0,...rows.map(r=>r.values.reduce((a,b)=>a+numeric(b),0)));
 return `<div class="legend">${labels.map((label,i)=>`<span><i style="background:${colors[i%colors.length]}"></i>${h(label)}</span>`).join('')}</div><div class="chart">${rows.map(r=>`<article class="chart-row"><div><strong>${h(r.label)}</strong>${r.note?`<small>${h(r.note)}</small>`:''}</div><div><div class="track" role="img" aria-label="${h(r.values.map((v,i)=>labels[i]+': '+n(v)+' '+unit).join(', '))}">${r.values.map((v,i)=>`<span style="width:${100*numeric(v)/scale}%;background:${colors[i%colors.length]}"></span>`).join('')}</div><div class="values">${r.values.map((v,i)=>`<span>${h(labels[i])}: <b>${n(v)} ${h(unit)}</b></span>`).join('')}</div></div></article>`).join('')||'<p class="empty">Seçili kapsamda kayıt yok.</p>'}</div>`;
}
function pairs(rows:{label:string;capacity:number|null;planned:number;note:string}[]){
 const scale=Math.max(1,...rows.flatMap(r=>[numeric(r.capacity),numeric(r.planned)]));
 return `<div class="legend"><span><i style="background:#8ba7c9"></i>Bilinen net kapasite</span><span><i style="background:#1565c0"></i>Planlanan efor</span></div><div class="chart">${rows.map(r=>`<article class="chart-row"><div><strong>${h(r.label)}</strong><small>${h(r.note)}</small></div><div>${[['Kapasite',r.capacity,'#8ba7c9'],['Plan',r.planned,'#1565c0']].map(([label,v,color])=>`<div class="pair"><span>${label}</span><div class="track"><span style="width:${100*numeric(v)/scale}%;background:${color}"></span></div><b>${n(v as number|null)} sa</b></div>`).join('')}</div></article>`).join('')||'<p class="empty">Seçili kapsamda kayıt yok.</p>'}</div>`;
}
const estimates=(r:{sizeSmall:number;sizeMedium:number;sizeLarge:number;sizeXLarge:number;pointedTasks:number;storyPointsTotal:number},size:boolean,total:number)=>size?
 `S ${n(r.sizeSmall)} · M ${n(r.sizeMedium)} · L ${n(r.sizeLarge)} · XL ${n(r.sizeXLarge)} · Belirtilmemiş ${n(Math.max(0,total-r.sizeSmall-r.sizeMedium-r.sizeLarge-r.sizeXLarge))}`:
 `${r.pointedTasks?n(r.storyPointsTotal)+' SP':'SP belirtilmedi'} · ${r.pointedTasks} işte kayıtlı`;
const css=`
:root{--ink:#17324f;--muted:#63778f;--line:#dce5f0;--blue:#1565c0}*{box-sizing:border-box}body{margin:0;background:#eff3f8;color:var(--ink);font:14px/1.6 'Segoe UI',Arial,sans-serif}main{max-width:1180px;margin:28px auto;background:white;border:1px solid var(--line);border-radius:18px;overflow:hidden}header{padding:36px 40px;background:linear-gradient(125deg,#112e4d,#1d527d);color:white}.eyebrow{font-size:10px;letter-spacing:.2em;font-weight:800;color:#b6d6f7}h1{font-size:34px;line-height:1.2;margin:12px 0 18px;letter-spacing:-.03em}header p{color:#d1e2f2;margin:8px 0;font-size:12px;overflow-wrap:anywhere}header .scope{padding-top:14px;border-top:1px solid #4c6a87}.content{padding:26px 40px 38px}.notice{padding:13px 16px;border-left:3px solid #4283cb;background:#f1f6fd;font-size:12px;color:#46627f}.kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:24px 0}.kpis>div{padding:18px;border:1px solid var(--line);border-radius:10px;background:#fafcff;min-width:0}.kpis small{display:block;color:var(--muted);font-size:11px}.kpis strong{display:block;font-size:25px;margin-top:5px;overflow-wrap:anywhere}.section{margin-top:30px;min-width:0}h2{font-size:21px;letter-spacing:-.02em;margin:0 0 14px}h3{font-size:15px}.note,.empty{font-size:12px;color:var(--muted)}.legend{display:flex;flex-wrap:wrap;gap:10px 20px;font-size:11px;color:var(--muted);margin:14px 0}.legend span{display:flex;gap:7px;align-items:center}.legend i{width:10px;height:10px;border-radius:3px}.chart{border:1px solid var(--line);border-radius:12px;padding:20px;background:#fbfdff}.chart-row{display:grid;grid-template-columns:minmax(120px,1fr) minmax(0,3fr);gap:20px;padding:15px 0;border-bottom:1px solid #e7edf5;break-inside:avoid}.chart-row:last-child{border:0}.chart-row strong{font-size:13px;overflow-wrap:anywhere}.chart-row small{display:block;font-size:11px;color:var(--muted);margin-top:4px;overflow-wrap:anywhere}.track{display:flex;height:13px;border-radius:4px;background:#eaf0f7;overflow:hidden}.track>span{display:block;height:100%;flex-shrink:0}.values{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:11px;margin-top:8px;color:#526a84}.pair{display:grid;grid-template-columns:65px minmax(0,1fr) 90px;gap:10px;align-items:center;font-size:11px;margin:6px 0}.pair>b{text-align:right}.split{display:grid;grid-template-columns:1fr 1fr;gap:24px}.split>.section{min-width:0}.split .chart-row{grid-template-columns:1fr;gap:8px}.table-wrap{margin-top:20px}table{border-collapse:collapse;width:100%;table-layout:fixed;font-size:12px}th,td{text-align:left;vertical-align:top;padding:12px 10px;border-bottom:1px solid var(--line);overflow-wrap:anywhere}th{background:#f1f5fa;text-transform:uppercase;font-size:10px;letter-spacing:.04em;color:var(--muted)}th:first-child{width:22%}footer{padding:20px 40px;border-top:1px solid var(--line);color:var(--muted);font-size:11px}.equation{display:flex;gap:12px;align-items:center;margin:20px 0}.equation>div{flex:1;padding:16px;border:1px solid var(--line);border-radius:10px;font-size:12px}.equation strong{display:block;font-size:22px}.equation>b{color:var(--muted)}.period{margin:20px 0;padding:16px;border:1px solid var(--line);border-radius:12px}
@media(max-width:800px){main{margin:0;border:0;border-radius:0}header{padding:28px 22px}.content{padding:20px 22px}footer{padding:20px 22px}.kpis{grid-template-columns:1fr 1fr}.split{grid-template-columns:1fr}.chart-row{grid-template-columns:1fr;gap:9px}h1{font-size:28px}.chart{padding:14px}}
@media(max-width:600px){table,tbody,tr,td{display:block}thead{display:none}tr{padding:10px 0;border-bottom:1px solid var(--line)}td{border:0;padding:5px 0}td:before{content:attr(data-label);display:block;font-size:10px;font-weight:700;color:var(--muted)}.kpis strong{font-size:21px}.kpis>div{padding:12px}.pair{grid-template-columns:55px minmax(0,1fr) 72px;gap:6px}.equation{flex-wrap:wrap}.equation>div{flex-basis:40%}.equation>b{display:none}}
@page{size:A4 landscape;margin:12mm}@media print{body{background:white;font-size:11px}main{margin:0;border:0;max-width:none}header{padding:20px}.content{padding:15px 0}.chart-row,tr,.kpis{break-inside:avoid}h1,h2,h3{break-after:avoid}.chart{background:white}.section{margin-top:22px}.kpis{grid-template-columns:repeat(4,minmax(0,1fr))}.split{grid-template-columns:1fr 1fr}.chart-row{grid-template-columns:1fr 3fr}.table-wrap{overflow:visible}table{display:table;font-size:10px}thead{display:table-header-group}tbody{display:table-row-group}tr{display:table-row}th,td{display:table-cell;padding:7px}td:before{display:none}footer{padding:15px 0}*{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
`;
export function reportTabHtml(input:ReportExport,createdAt=new Date().toISOString()):string{
 let title='',body='',notice='Efor, planlanan saattir; gerçekleşen süre veya bireysel performans puanı değildir.';
 switch(input.kind){
  case 'overtime':{title='Mesai durumu ve trendi';notice='Gerçekleşen mesai ile planlanan mesai ayrıdır. Bekleyen talepler ve açılış bakiyesi kazanılan mesaiye eklenmez.';body=overtimeSectionHtml(input.rows)+section('Sprint bazlı mesai',table(['Sprint','Gerçekleşen saat','Planlanan saat','Plan kapsamında saat','Kalan saat','Aşan saat','Plansız saat','Sınıflandırılmamış saat','Mesaiden izin günü','Eşleştirilmemiş kullanım/düzeltme saati'],input.rows.map(r=>[r.name,r.earned,r.planned,r.matched||0,r.remaining||0,r.excess||0,r.unplanned||0,r.unclassified||0,r.usedDays,r.unmatchedUsedHours])));if(input.entries?.length)body+=section('Görev / Roadmap mesaileri',table(['Kişi / sprint','Görev','Roadmap (kayıt anı)','Mesai türü','Gerçekleşen saat','Planlanan saat'],input.entries.map(e=>[e.memberName+' · '+e.sprintName,e.taskTitle||'Genel / bağlantı yok',e.roadmapTitle||'Bağlantı yok',e.earnedHours>0?(e.planClassification==='PLANNED'?'Plana bağlı':e.planClassification==='UNPLANNED'?'Plansız':'Sınıflandırılmamış'):'Mesai planı',e.earnedHours,e.plannedHours])));break;}
  case 'delivery':{
   title='Sprint teslimatı';const rows=input.rows,size=input.settings.estimationMode==='SIZE_AND_HOURS';
   const total=sum(rows,r=>r.tasks),done=sum(rows,r=>r.done),undone=sum(rows,r=>r.undone);
   body=kpis([['Tamamlanan sprint',rows.length],['Done · BAU hariç',done],['Undone · BAU hariç',undone],['Ağırlıklı teslimat',rate(done,total)]]);
   body+=section('Sprint teslimat oranı',stacks([...rows].sort((a,b)=>a.number-b.number).map(r=>({label:r.name,values:r.deliveryRate===null?[]:[r.deliveryRate],note:r.deliveryRate===null?'— · Teslimat işi yok; oran hesaplanmaz':r.done+' / '+r.tasks+' iş'})),['Done oranı'],'%',100),'BAU hariç. Oranı olmayan dönem — olarak belirtilir; sıfır teslimatla eş tutulmaz.');
   body+=section(size?'Size kompozisyonu':'Story Point hacmi',size?stacks([...rows].sort((a,b)=>a.number-b.number).map(r=>({label:r.name,values:[r.sizeSmall,r.sizeMedium,r.sizeLarge,r.sizeXLarge]})),['S','M','L','XL'],'iş'):stacks(rows.map(r=>({label:r.name,values:[r.storyPointsTotal],note:r.pointedTasks+' işte kayıtlı'})),['Story Point'],'SP'));
   body+=section('Sprint karşılaştırması',table(['Sprint','Bitiş','İş / Done / Undone','Teslimat',size?'Size dağılımı':'Story Point'],rows.map(r=>[r.name,r.end,r.tasks+' / '+r.done+' / '+r.undone,r.deliveryRate===null?'—':n(r.deliveryRate)+'%',estimates(r,size,r.tasks)])));
   break;
  }
  case 'members':{
   title='Kişi dağılımı';const rows=input.rows,total=sum(rows,r=>r.taskCount),done=sum(rows,r=>r.done),size=input.settings.estimationMode==='SIZE_AND_HOURS';
   notice+=' BAU dahil, Leave hariç kişi atamalarıdır. Çok kişili iş her kişi için bir kez sayılır.';
   body=kpis([['Ekip üyesi',rows.length],['İş ataması',total],['Planlanan efor',n(sum(rows,r=>r.effortHours))+' sa'],['Done oranı',rate(done,total)]]);
   body+=section('İş hacmi ve sonuç dağılımı',stacks(rows.map(r=>({label:r.memberName,values:[r.done,r.undone,r.other],note:n(r.effortHours)+' sa · '+r.supportTaskCount+' X destek'})),['Done','Undone','Diğer'],'iş'));
   body+=section('Kişi özeti',table(['Kişi','Atama / X destek','Planlanan efor','Done / Undone / Diğer',size?'Size dağılımı':'Story Point'],rows.map(r=>[r.memberName,r.taskCount+' / '+r.supportTaskCount,n(r.effortHours)+' sa',r.done+' / '+r.undone+' / '+r.other,estimates(r,size,r.taskCount)])));
   break;
  }
  case 'types':{
   title='İş tipi ve alt kırılım analizi';const rows=input.rows;
   const group=(key:(r:typeof rows[number])=>string)=>{const map=new Map<string,{count:number;hours:number;done:number;undone:number}>();for(const row of rows){const name=key(row),r=map.get(name)||{count:0,hours:0,done:0,undone:0};r.count+=row.taskCount;r.hours+=row.effortHours;r.done+=row.done;r.undone+=row.undone;map.set(name,r);}return [...map];};
   const categories=group(r=>taskCategoryLabel(r.taskCategory)),subtypes=group(r=>taskCategoryLabel(r.taskCategory)+' / '+taskSubtypeLabel(r.taskSubtype));
   const total=sum(rows,r=>r.taskCount);
   body=kpis([['Toplam iş',total],['Planlanan efor',n(sum(rows,r=>r.effortHours))+' sa'],['Done oranı',rate(sum(rows,r=>r.done),total)],['Kategori',categories.length]]);
   body+=section('İş tipi dağılımı',stacks(categories.map(([label,r])=>({label,values:[r.count],note:n(r.hours)+' sa'})),['İş adedi'],'iş'),'BAU dahil, Leave eforu hariç. Aktif ve planlanan sprint sonuçları geçicidir.');
   body+=section('Alt kırılımlar',stacks(subtypes.map(([label,r])=>({label,values:[r.done,r.undone,Math.max(0,r.count-r.done-r.undone)],note:n(r.hours)+' sa'})),['Done','Undone','Diğer'],'iş'));
   body+=section('İş tipi özeti',table(['Tür / alt tür','İş','Planlanan efor','Done','Undone'],subtypes.map(([label,r])=>[label,r.count,n(r.hours)+' sa',r.done,r.undone])));
   break;
  }
  case 'context':{
   title='Kapasite, izin ve X destek';const rows=memberContexts(input.rows);
   notice='Kişi bazlı izin günü, kapasite ve X destek bilgisi içerir. Paylaşmadan önce alıcıları kontrol edin. İzin günleri ve X atamaları saat toplamına eklenmez. Eksik kapasitede birleşik oran üretilmez.';
   body=kpis([['Kişi',rows.length],['Kayıtlı izin',n(sum(rows,r=>r.leaveDays))+' gün'],['X destek',sum(rows,r=>r.supportTasks)+' atama'],['Planlanan efor',n(sum(rows,r=>r.effortHours))+' sa']]);
   body+=section('Kapasite ve katkı haritası',pairs(rows.map(r=>({label:r.name,capacity:r.known?r.availableHours:null,planned:r.effortHours,note:r.known+'/'+r.total+' kapasite kaydı · '+n(r.leaveDays)+' gün izin · '+r.supportTasks+' X · Plan/kapasite '+(r.load===null?'—':n(r.load)+'%')}))));
   body+=section('Sprint bazlı katılım',rows.map(m=>`<article class="period"><h3>${h(m.name)}</h3>${table(['Sprint / kaynak','Ayrılan gün','İzin / çalışılmayan gün','Net kapasite / plan','Planlı mesai / X'],m.periods.map(p=>[p.sprintName+' · '+capacitySourceLabel(p.capacitySource),n(p.allocatedDays),n(p.leaveDays)+' / '+n(p.nonWorkingDays),n(p.availableHours)+' / '+n(p.effortHours)+' sa',n(p.overtimeHours)+' sa / '+p.supportTaskCount]))}</article>`).join(''),'Kapanış kaydı olmayan dönemler güncel takvim ve izinlerle yeniden hesaplanır; kesin tarihsel kapasite değildir. Support kapasitesi ekip kapasitesine eklenmez.');
   break;
  }
  case 'roadmap':{
   title='Roadmap efor raporu';const rows=input.rows;
   notice+=' Tüm dönemler, güncel Roadmap bağlantıları. Mesai kayıt anındaki Roadmap’e aittir; yalnız gerçekleşen kayıtlar dahil, eski bağlantısız kayıtlar hariç. Mesai ve havuz tahmini atanan efordan ayrıdır; toplama eklenmez. BAU dahil, Leave ve X saat hariç.';
   body=kpis([['Roadmap öğesi',rows.length],['Atanan efor',n(sum(rows,r=>r.assignedHours))+' sa'],['Gerçekleşen mesai (ayrı)',n(sum(rows,r=>r.overtimeHours||0))+' sa'],['Havuz tahmini (ayrı)',n(sum(rows,r=>r.poolEstimatedHours))+' sa']]);
   body+=section('Eforun Roadmap dağılımı',stacks(rows.map(r=>({label:r.title,values:[r.doneHours,r.undoneHours,r.openHours],note:(r.referenceId||'Referans ID yok')+' · Havuz '+n(r.poolEstimatedHours)+' sa (ayrı)'})),['Done','Undone','Açık'],'sa'));
   body+=section('Roadmap bazlı gerçekleşen mesai',stacks(rows.map(r=>({label:r.title,values:[r.overtimeHours||0],note:'Plan eforundan ayrı'})),['Gerçekleşen mesai'],'sa'));
   body+=section('Roadmap özeti',table(['Roadmap / referans','Tür','İş / Done / Undone / Açık','Atanan efor','Mesai (ayrı)','Havuz iş / tahmin','X / Atamasız'],rows.map(r=>[r.title+' · '+(r.referenceId||'—'),({PROJECT:'Proje',FEATURE_SET:'Feature set',GENERAL:'Genel'} as Record<string,string>)[r.kind]||'Belirtilmemiş',r.taskCount+' / '+r.done+' / '+r.undone+' / '+r.open,n(r.assignedHours)+' sa',n(r.overtimeHours||0)+' sa',r.poolCount+' / '+n(r.poolEstimatedHours)+' sa',r.supportAssignmentCount+' / '+r.unassignedTaskCount])));
   break;
  }
  case 'capacity':{
   title='Ekip kapasitesi ve toplam plan';const rows=input.rows;
   notice+=' Tamamlanan sprintlerde kayıtlı kişilerle sınırlıdır. Kapasite yalnız çekirdek ekiptir; Support/Architect plana katılır, kapasiteye katılmaz. Eksik kapasite sıfır varsayılmaz. Kapasite üstü planlama hata değildir.';
   const core=sum(rows,r=>r.corePlanned),support=sum(rows,r=>r.supportPlanned),planned=sum(rows,r=>r.planned);
   body=kpis([['Sprint',rows.length],['Bilinen çekirdek kapasite',n(sum(rows,r=>r.capacity))+' sa'],['Çekirdek planı',n(core)+' sa'],['Support planı',n(support)+' sa']]);
   body+=`<div class="equation"><div>Çekirdek planı<strong>${n(core)} sa</strong></div><b>+</b><div>Support planı<strong>${n(support)} sa</strong></div><b>=</b><div>Toplam plan<strong>${n(planned)} sa</strong></div></div>`;
   body+=section('Çekirdek planı / kapasite',pairs(rows.map(r=>({label:r.name,capacity:r.known||r.people&&!r.unknown?r.capacity:null,planned:r.corePlanned,note:trendSource(r)+' · '+r.known+' bilinen / '+r.unknown+' eksik kapasite · Oran '+(r.coreRatio===null?'—':n(r.coreRatio)+'%')}))));
   body+=section('Toplam planın dağılımı',stacks(rows.map(r=>({label:r.name,values:[r.corePlanned,r.supportPlanned],note:r.people?'':'Bu kapsamda katılım kaydı yok'})),['Çekirdek','Support'],'sa'));
   body+=section('Sprint özeti',table(['Sprint / kaynak','Bilinen kapasite','Çekirdek / Support planı','Toplam plan','Çekirdek oranı','Kişisel aşım / boşluk'],rows.map(r=>[r.name+' · '+trendSource(r),r.known||r.people&&!r.unknown?n(r.capacity)+' sa':'—',n(r.corePlanned)+' / '+n(r.supportPlanned)+' sa',r.people?n(r.planned)+' sa':'—',r.coreRatio===null?'—':n(r.coreRatio)+'%',r.known?n(r.over)+' / '+n(r.free)+' sa':'—'])),'İzin ve çalışılmayan günler net kapasiteye yansır. BAU plana dahildir; Leave ve X saat toplamaz. Kişisel boşluk başka kişinin kapasite üstü planını silmez.');
   break;
  }
  case 'defects':{
   title='Defect analizi';const rows=input.rows;
   notice='Her defect işi bir kez sayılır. Done olan defect kapanmış ve doğrulanmış kabul edilir. Geçmişte girilmeyen önem ve ortam bilgileri tahminle doldurulmaz.';
   body=kpis([['Seçili kapsam',rows.length+' defect'],['Done · Kapandı',input.counts.done],['Açık / havuzda',input.counts.open],['Undone',input.counts.undone]]);
   body+='<div class="split">'+input.charts.map(c=>section(c.title,stacks(c.rows.map(r=>({label:r.label,values:[r.count]})),['Defect'],'iş'))).join('')+'</div>';
   if(input.reserves?.length)body+='<p class="note">Rezerv özeti sprint kapsamındadır; defect alt filtreleri rezerv bütçesini değiştirmez.</p>';
   body+=reserveHtml(input.reserves);
   if(input.trend?.length)body+=section('Sprint bazlı defect trendi',trendSvg(input.trend.map(r=>'S'+r.number),defectSeries(input.trend),'iş')+table(['Sprint','Test','Prod','Diğer','Done','Açık','Undone'],input.trend.map(r=>[r.name,r.test,r.prod,r.other,r.done,r.open,r.undone])),'Sprintteki sonuçlar esas alınır; havuz hariçtir. Tekrarlanan işler ayrı sprint kayıtlarıdır. Aktif sprint geçicidir.');
   body+=section('Defect iş listesi',table(['İş / tür','Sprint / havuz','Önem / ortam','Görev durumu','Bildiren'],rows.map(r=>[r.title+' · '+r.subtype,r.sprint,r.severity+' / '+r.environment,r.status,r.reporter])));
   break;
  }
 }
 const date=new Date(createdAt),time=Number.isNaN(date.getTime())?createdAt:new Intl.DateTimeFormat('tr-TR',{dateStyle:'long',timeStyle:'short',timeZone:'Europe/Istanbul'}).format(date);
 return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${h(title)} · SprintBoard</title><style>${css}</style></head><body><main data-report="${input.kind}"><header><span class="eyebrow">SPRINTBOARD / RAPOR</span><h1>${h(title)}</h1><p>Oluşturulma: ${h(time)} · İstanbul saati</p><p class="scope">${h(input.scope)}</p></header><div class="content"><p class="notice">${h(notice)}</p>${body}</div><footer>Yalnız seçili rapor ve filtre kapsamı · Salt okunur, çevrimdışı HTML.<br>Uygulamaya bağlanmaz; kendiliğinden güncellenmez. Hesaplar, erişim bilgileri ve serbest notlar dahil değildir. Tarayıcıdan Yazdır → PDF kullanabilirsiniz.</footer></main></body></html>`;
}
