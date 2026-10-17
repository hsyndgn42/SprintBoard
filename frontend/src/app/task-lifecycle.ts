import type { Task } from './api.service';

/** BAU is operational planning, not a manually progressed delivery workflow. */
export const isBau = (task: Task) => task.taskCategory === 'BAU' || task.workKind === 'LEAVE' || task.taskSubtype === 'LEAVE';
export const effectiveTaskStatus = (task: Task) => isBau(task) ? 'done' : task.status;
