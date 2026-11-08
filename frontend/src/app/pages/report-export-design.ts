/** Offline reports share the same visual language; no fonts, scripts or network required. */
export const REPORT_EXPORT_DESIGN = `
body{margin:0;background:#edf2f7;color:#172d46;font-family:Inter,Segoe UI,Arial,sans-serif;line-height:1.6}
main{max-width:1180px;margin:32px auto;background:white;border:1px solid #dfe7f0;border-radius:18px;overflow:hidden;box-shadow:0 12px 40px #172d4608}
header,header.report-head{padding:34px 36px;background:#172f4b;border:0;border-bottom:4px solid #478ba5;color:white}
header h1{font-size:30px;letter-spacing:-.04em;line-height:1.2;color:white;margin:6px 0 14px}
header :is(p,.note,.eyebrow){color:#cfdeed}header .eyebrow{letter-spacing:.12em;font-size:10px}
header dl{display:flex;flex-wrap:wrap;gap:16px 32px;background:none;border:0;margin:24px 0 0}
header dl>div{padding:0;background:none;min-width:120px}header dt{color:#a6bdd3;font-size:10px}header dd{color:white;margin:3px 0 0;font-size:12px}
header .scope{display:inline-block;background:#28435f;border:1px solid #3b5672;color:#e5eff8;border-radius:8px;padding:8px 12px}
.content{padding:28px 32px}.layer{margin:24px 28px;padding:22px;border:1px solid #dfe7f0;border-radius:12px;background:white}
.section{padding:20px;margin-top:20px;border:1px solid #dfe7f0;border-radius:12px;background:white}
h2{font-size:18px;color:#172d46;letter-spacing:-.02em}h3{font-size:14px;color:#385470}
.metrics,.metrics.six,.kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;background:none;border:0;margin:18px 0}
.metric,.metrics>div,.kpis>div{padding:17px;background:#f7f9fc;border:1px solid #dfe7f0;border-radius:10px;min-width:0}
.metrics>div:first-child,.kpis>div:first-child{background:#edf5fc;border-color:#cbdeef}
.metric dt,.kpis small{color:#61738a;font-size:11px}.metric dd,.kpis strong{color:#172d46;font-size:29px;font-weight:700;letter-spacing:-.03em;margin:7px 0 0;font-variant-numeric:tabular-nums}
.metric .unit{font-size:12px;color:#61738a}.metric p{font-size:11px;color:#61738a}
.figure,.chart{padding:12px 0;background:white;border:0;overflow-x:auto}
.table-wrap{overflow:auto;max-height:600px}table{font-size:12px;font-variant-numeric:tabular-nums}th{background:#eef3f8;color:#49627d;text-transform:none;font-weight:650}th,td{padding:11px 12px}tbody tr:nth-child(even){background:#f8fafc}
.notice,.caution{border:0;border-left:3px solid #478ba5;border-radius:0 8px 8px 0;background:#eff6f8;color:#50667c;font-size:12px;padding:12px 16px}
.note,.empty{color:#61738a;font-size:12px}.split{gap:18px}.legend{color:#61738a;font-size:11px}
details{border:1px solid #dfe7f0;border-radius:10px;padding:14px 18px;margin:18px 0}summary{cursor:pointer;color:#385470;font-size:13px;font-weight:650}
footer{max-width:1120px;margin:18px auto;padding:18px 28px;color:#71849a;font-size:11px;line-height:1.6}
@media(max-width:760px){main{margin:0;border:0;border-radius:0}header,header.report-head{padding:26px 20px}.content{padding:16px}.layer{margin:16px;padding:16px}.section{padding:14px}.metrics,.metrics.six,.kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.split,.grid2{display:block}header h1{font-size:26px}}
@page{size:A4 landscape;margin:12mm}
@media print{body{background:white}main{max-width:none;margin:0;border:0;border-radius:0;box-shadow:none}header,header.report-head{padding:20px}.layer{margin:18px 0}.content{padding:0}.table-wrap{max-height:none;overflow:visible}.metrics,.metrics.six,.kpis{grid-template-columns:repeat(4,minmax(0,1fr))}.section,.figure,.metrics,.kpis{break-inside:avoid}.layer{break-inside:auto}details>*{display:block!important}summary{break-after:avoid}footer{margin:0;padding:18px 0}*{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
`;
