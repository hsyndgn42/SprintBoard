import { isBau, effectiveTaskStatus } from '../task-lifecycle';
import type { ProductSettings, Sprint, Task } from '../api.service';
import { TASK_CATEGORIES, TASK_CATEGORY_COLORS, TASK_SUBTYPES, taskCategoryLabel, taskSubtypeLabel } from '../task-taxonomy';

export const REVIEW_STATUSES = [
  { key: 'done', label: 'Done', color: '#0d9274' },
  { key: 'undone', label: 'Undone', color: '#d34b45' },
  { key: 'doing', label: 'Devam ediyor', color: '#2563eb' },
  { key: 'todo', label: 'Yapılacak', color: '#94a3b8' },
];
export const isLeave = (task: Task) => task.taskSubtype === 'LEAVE' || task.workKind === 'LEAVE';
export const effort = (task: Task) => isLeave(task) ? 0 : Math.max(0, task.planningHours ?? task.estimatedHours ?? 0);
export const percent = (part: number, total: number) => total > 0 ? part / total * 100 : 0;
export function reviewGroup(key: string, label: string, color: string, items: Task[]) {
  const hours = items.reduce((sum, task) => sum + effort(task), 0);
  return { key, label, color, count: items.length, hours,
    statuses: REVIEW_STATUSES.map(status => ({ ...status, count: items.filter(task => task.status === status.key).length })),
    done: items.filter(task => task.status === 'done').length,
  };
}
export function buildReview(sprint: Sprint, settings: ProductSettings) {
  // Derive the review policy without changing live tasks or frozen closure records.
  const items = sprint.items.map(task => isBau(task) ? { ...task, status: effectiveTaskStatus(task) } : task);
  const delivery = items.filter(task => task.taskCategory !== 'BAU' && !isLeave(task));
  const bau = items.filter(task => task.taskCategory === 'BAU');
  const done = delivery.filter(task => task.status === 'done').length;
  const statuses = REVIEW_STATUSES.map(status => {
    const matching = delivery.filter(task => task.status === status.key);
    return { ...status, count: matching.length, hours: matching.reduce((sum, task) => sum + effort(task), 0) };
  });
  let offset = 0;
  const gradient = statuses.map(status => {
    const start = offset;
    offset += percent(status.count, delivery.length);
    return `${status.color} ${start}% ${offset}%`;
  }).join(', ');
  const categories = [...TASK_CATEGORIES.map(category => category.value), 'OTHER' as const]
    .map(key => reviewGroup(key, taskCategoryLabel(key), TASK_CATEGORY_COLORS[key], items.filter(task => task.taskCategory === key)))
    .filter(group => group.count);
  const breakdowns = (['BAU', 'TEST', 'DEFECT', 'DEV', 'DESIGN', 'ANALYZE'] as const).filter(category=>['BAU','TEST','DEFECT'].includes(category)||items.some(task=>task.taskCategory===category&&!!task.taskSubtype)).map(category => ({
    category, label: taskCategoryLabel(category),
    rows: [...(TASK_SUBTYPES[category] || []).map(subtype => reviewGroup(subtype.value, subtype.label, TASK_CATEGORY_COLORS[category], items.filter(task => task.taskCategory === category && task.taskSubtype === subtype.value))),
      reviewGroup('UNSPECIFIED', 'Belirtilmemiş', '#64748b', items.filter(task => task.taskCategory === category && !TASK_SUBTYPES[category]?.some(subtype => subtype.value === task.taskSubtype)))],
  }));
  const sizeKeys = ['SMALL', 'MEDIUM', 'LARGE', 'X-LARGE'];
  const sizeLabels = ['S', 'M', 'L', 'XL'];
  const sizeColors = ['#0d9488', '#2563eb', '#c47718', '#7c3aed'];
  const sizes = sizeKeys.map((key, index) => reviewGroup(key, sizeLabels[index], sizeColors[index], delivery.filter(task => task.size === key)));
  const pointed = delivery.filter(task => task.storyPoints != null);
  const typeDistribution = categories.flatMap(g=>g.key!=='DEFECT'?[g]:[...['TEST_DEFECT','PROD_DEFECT'].map(key=>reviewGroup(key,taskSubtypeLabel(key),key==='PROD_DEFECT'?'#d34b45':'#2563eb',items.filter(t=>t.taskCategory==='DEFECT'&&t.taskSubtype===key))),reviewGroup('OTHER_DEFECT','Diğer / belirtilmemiş defect','#64748b',items.filter(t=>t.taskCategory==='DEFECT'&&!['TEST_DEFECT','PROD_DEFECT'].includes(t.taskSubtype||'')))].filter(r=>r.count));
  return { items, delivery, bau, done, statuses, categories, typeDistribution, breakdowns, sizes,
    rate: delivery.length ? Math.round(percent(done, delivery.length)) : null,
    gradient: delivery.length ? `conic-gradient(${gradient})` : '#e8edf4',
    deliveryHours: delivery.reduce((sum, task) => sum + effort(task), 0),
    bauHours: bau.reduce((sum, task) => sum + effort(task), 0),
    leaveHours: items.filter(isLeave).reduce((sum, task) => sum + task.assignments.reduce((hours, member) => hours + (member.leaveDays || 0)*(member.hoursPerDay??settings.hoursPerDay), 0), 0),
    pending: delivery.filter(task => task.status !== 'done'),
    missingSize: delivery.filter(task => !sizeKeys.includes(task.size || '')).length,
    missingPoints: delivery.length - pointed.length,
    points: pointed.reduce((sum, task) => sum + (task.storyPoints || 0), 0),
    donePoints: pointed.filter(task => task.status === 'done').reduce((sum, task) => sum + (task.storyPoints || 0), 0),
  };
}
