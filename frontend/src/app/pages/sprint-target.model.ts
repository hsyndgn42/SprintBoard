/** Pure logic for choosing which sprint a backlog item goes to, shared by the repeat dialog and the add dialog. */
export interface SprintTarget { id:string; number?:number; name:string; start:string; end:string; status:string }
export interface RepeatResult { id:string; repeatOfId?:string|null; sprintId:string|null; taskId:string|null; readinessWarnings?:string[] }

export const POOL_CHOICE='';
const byStart=(a:SprintTarget,b:SprintTarget)=>(a.start||'').localeCompare(b.start||'')||(a.number||0)-(b.number||0)||a.name.localeCompare(b.name,'tr');

/** Repeating finished work into a running sprint would be an unrecorded scope change, so only
 *  sprints that have not started yet are offered there. */
export function repeatTargets(sprints:SprintTarget[]|null|undefined):SprintTarget[]{
  return (sprints||[]).filter(s=>s&&s.status==='planned').sort(byStart);
}
/** Planning pool work may go to the running sprint (with a reason) or to any sprint still ahead of it. */
export function addTargets(sprints:SprintTarget[]|null|undefined):SprintTarget[]{
  const usable=(sprints||[]).filter(s=>s&&(s.status==='active'||s.status==='planned'));
  return [...usable.filter(s=>s.status==='active').sort(byStart),...usable.filter(s=>s.status==='planned').sort(byStart)];
}
/** The running sprint is where most work lands, so it is preselected when one exists. */
export function defaultAddTarget(sprints:SprintTarget[]|null|undefined):string{
  const targets=addTargets(sprints);
  return targets.find(s=>s.status==='active')?.id||targets[0]?.id||'';
}
export function sprintOptionLabel(sprint:SprintTarget):string{
  const range=sprint.start&&sprint.end?` · ${sprint.start} → ${sprint.end}`:'';
  return `${sprint.name}${range}`;
}
/** Adding to a running sprint demands a reason while a planned sprint does not, so the state is named. */
export function addTargetLabel(sprint:SprintTarget):string{
  return `${sprintOptionLabel(sprint)} · ${sprint.status==='active'?'Aktif':'Planlanan'}`;
}
export function repeatSuccessMessage(result:RepeatResult|null|undefined,sprintName:string):string{
  if(!result)return '';
  const warnings=(result.readinessWarnings||[]).filter(w=>!!w);
  // Naming the destination matters: the operator cannot see the new row's destination from the list alone.
  const base=result.sprintId
    ? `Yeni iş oluşturuldu ve ${sprintName||'seçilen sprint'} sprintine eklendi.`
    : 'Yeni iş oluşturuldu ve backlog havuzuna eklendi.';
  return warnings.length?`${base} Hazırlık kontrolü uyarıları devam ediyor: ${warnings.join(' · ')}`:base;
}
