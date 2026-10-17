import type {OvertimeTrendRow,DefectTrendRow} from './operational-trends.model';
import type {OvertimeEntry,DefectReserveSummary} from '../api.service';
import type {ProductSettings,ReportRow,MemberReportRow,WorkTypeReportRow} from '../api.service';
import type {MemberExportRow} from './share-export';
import type {CapacityTrend} from './capacity-trend.model';
export interface RoadmapExportRow {
 title:string;kind:string;referenceId:string|null;taskCount:number;done:number;undone:number;open:number;
 overtimeHours?:number;assignedHours:number;doneHours:number;undoneHours:number;openHours:number;poolCount:number;poolEstimatedHours:number;unassignedTaskCount:number;supportAssignmentCount:number;
}
export interface DefectExportRow {title:string;subtype:string;sprint:string;status:string;severity:string;environment:string;reporter:string}
export interface ExportChart {title:string;rows:{label:string;count:number}[]}
export type ReportExport = {scope:string} & (
 {kind:'overtime';rows:OvertimeTrendRow[];entries?:OvertimeEntry[]} |
 {kind:'delivery';rows:ReportRow[];settings:ProductSettings} |
 {kind:'members';rows:MemberExportRow[];settings:ProductSettings} |
 {kind:'types';rows:WorkTypeReportRow[]} |
 {kind:'context';rows:MemberReportRow[]} |
 {kind:'roadmap';rows:RoadmapExportRow[]} |
 {kind:'capacity';rows:CapacityTrend[]} |
 {kind:'defects';trend?:DefectTrendRow[];reserves?:DefectReserveSummary[];rows:DefectExportRow[];charts:ExportChart[];counts:{done:number;open:number;undone:number}}
);
