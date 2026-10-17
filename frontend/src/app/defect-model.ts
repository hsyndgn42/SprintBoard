export interface DefectDetails { reporterId?:string|null; reporterName?:string|null; reporterTeamId?:string|null; sourceUrl?:string|null; severity:string; environment:string; relatedId:string|null; relatedTitle?:string|null; verification:string; verifierId:string|null; verifierName?:string|null; verificationNote:string; verifiedAt?:string|null }
export const severityOptions=[{value:'UNSET',label:'Belirlenmemiş'},{value:'CRITICAL',label:'Kritik'},{value:'HIGH',label:'Yüksek'},{value:'MEDIUM',label:'Orta'},{value:'LOW',label:'Düşük'}];
export const environmentOptions=[{value:'UNSET',label:'Belirlenmemiş'},...['DEV','SIT','SAT','UAT','PREPROD','PROD'].map(value=>({value,label:value})),{value:'OTHER',label:'Diğer'}];
export const verificationOptions=[{value:'NOT_CHECKED',label:'Doğrulama kaydı yok'},{value:'PENDING',label:'Doğrulama bekliyor'},{value:'PASSED',label:'Başarılı'},{value:'FAILED',label:'Başarısız'}];
export const emptyDefect=():DefectDetails=>({severity:'UNSET',environment:'UNSET',relatedId:null,verification:'NOT_CHECKED',verifierId:null,verificationNote:''});
export const defectLabel=(value:string,options:{value:string;label:string}[])=>options.find(o=>o.value===value)?.label||'Belirlenmemiş';
export const defectSummary=(d?:DefectDetails)=>[defectLabel(d?.severity||'UNSET',severityOptions),defectLabel(d?.environment||'UNSET',environmentOptions)].join(' · ');
