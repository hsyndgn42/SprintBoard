import type { Task } from './api.service';

/** BAU is operational planning, not a manually progressed delivery workflow. */
export const isBau = (task: Task) => task.taskCategory === 'BAU' || task.workKind === 'LEAVE' || task.taskSubtype === 'LEAVE';
export const effectiveTaskStatus = (task: Task) => isBau(task) ? 'done' : task.status;

/** Effort spent on a task is never recorded in hours, so moving it off Todo or raising a blocker is the only
 *  trace that someone worked on it. Returning such work to the pool silently frees capacity that was in fact
 *  consumed, which is why the board warns before it happens. */
export const startedWork = (task: Task) => !isBau(task) && (!!task.blocker?.blocked || !['todo', ''].includes(task.status ?? ''));

