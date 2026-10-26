/**
 * A reader's filter choices are working context, not throwaway UI state.
 * Losing them on every reload or every trip to a detail page means narrowing
 * the same list by hand over and over, so they are remembered per browser
 * session: a reload or a back navigation keeps them, a new day starts clean.
 *
 * Only keys present in `defaults` are restored, so a filter removed in a later
 * build cannot resurrect itself from a stale stored value.
 */
export function readFilters<T extends Record<string, string>>(key: string, defaults: T): T {
  const restored = { ...defaults };
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return restored;
    const saved = JSON.parse(raw) as Record<string, unknown>;
    for (const field of Object.keys(defaults)) {
      const value = saved[field];
      if (typeof value === 'string') restored[field as keyof T] = value as T[keyof T];
    }
  } catch { /* unreadable or unparsable storage: the defaults are a safe answer */ }
  return restored;
}

export function writeFilters(key: string, values: Record<string, string>): void {
  try { sessionStorage.setItem(key, JSON.stringify(values)); }
  catch { /* private mode or full quota: filters simply do not survive the reload */ }
}
