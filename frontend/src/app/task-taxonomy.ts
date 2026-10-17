import type { TaskCategory, TaskSubtype } from './api.service';

export const TASK_CATEGORIES: { value: TaskCategory; label: string; description: string }[] = [
  { value: 'DEV', label: 'DEV', description: 'Geliştirme' },
  { value: 'DESIGN', label: 'DESIGN', description: 'Tasarım' },
  { value: 'ANALYZE', label: 'ANALYZE', description: 'Analiz ve keşif' },
  { value: 'TEST', label: 'TEST', description: 'Test ve kalite' },
  { value: 'DEFECT', label: 'DEFECT', description: 'Hata düzeltme' },
  { value: 'BAU', label: 'BAU', description: 'Tekrarlayan ekip işi' },
];

export const TASK_SUBTYPES: Partial<Record<TaskCategory, { value: Exclude<TaskSubtype, null>; label: string; active?:boolean }[]>> = {
  TEST: [
    { value: 'FUNCTIONAL_TEST', label: 'Fonksiyonel Test' },
    { value: 'E2E_TEST', label: 'E2E Test' },
    { value: 'REGRESSION_TEST', label: 'Regresyon Testi' },
    { value: 'PERFORMANCE_TEST', label: 'Performance Test' },
    { value: 'GENERAL_TEST', label: 'Genel Test' },
  ],
  DEFECT: [
    { value: 'TEST_DEFECT', label: 'Test Defect' },
    { value: 'PROD_DEFECT', label: 'Prod Defect' },
  ],
  BAU: [
    { value: 'DEFECT_SUPPORT', label: 'Defect Support' },
    { value: 'SUPPORT', label: 'Support' },
    { value: 'MEETING', label: 'Meeting' },
    { value: 'TRAINING', label: 'Training' },
    { value: 'LEAVE', label: 'Leave' },
    { value: 'OTHER_BAU', label: 'Diğer BAU' },
  ],
};

export const TASK_CATEGORY_COLORS: Record<TaskCategory, string> = {
  DEV: '#2563eb', DESIGN: '#7c3aed', ANALYZE: '#0891b2', TEST: '#0d9488', DEFECT: '#dc4c41', BAU: '#c47718', OTHER: '#64748b',
};

export function taskCategoryLabel(value: TaskCategory | string): string {
  return TASK_CATEGORIES.find(option => option.value === value)?.label || (value === 'OTHER' ? 'DİĞER' : value || 'DİĞER');
}

export function taskSubtypeLabel(value: TaskSubtype | string | null): string {
  if (!value) return 'Alt kırılım yok';
  return Object.values(TASK_SUBTYPES).flatMap(options => options || []).find(option => option.value === value)?.label || value;
}

export function defaultTaskSubtype(category: TaskCategory): TaskSubtype {
  return TASK_SUBTYPES[category]?.find(o=>o.active!==false)?.value || null;
}
export interface SubtypeOption {code:string;category:TaskCategory;label:string;active:boolean;systemType:boolean;protected:boolean;usageCount:number}
export function installSubtypeCatalog(rows:SubtypeOption[]):void {
  for(const key of Object.keys(TASK_SUBTYPES))delete TASK_SUBTYPES[key as TaskCategory];
  for(const row of rows)(TASK_SUBTYPES[row.category] ||= []).push({value:row.code,label:row.label,active:row.active});
}
export function availableSubtypes(category:TaskCategory,current?:TaskSubtype){
  return (TASK_SUBTYPES[category]||[]).filter(o=>o.active!==false||o.value===current).map(o=>({...o,label:o.label+(o.active===false?' (pasif)':'')}));
}
