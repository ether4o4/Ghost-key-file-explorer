export interface WindowBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WindowPrefs extends WindowBounds {
  maximized: boolean;
}

/** Stored browser data is untrusted input, including JSON null and old values. */
export function sanitizeWindowPrefs(value: unknown): Partial<WindowPrefs> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const prefs: Partial<WindowPrefs> = {};
  for (const key of ['x', 'y', 'w', 'h'] as const) {
    const number = source[key];
    if (typeof number === 'number' && Number.isFinite(number) &&
        ((key !== 'w' && key !== 'h') || number > 0)) prefs[key] = number;
  }
  if (typeof source.maximized === 'boolean') prefs.maximized = source.maximized;
  return prefs;
}

/** Fit restored bounds to the actual window layer, including small phone views. */
export function fitWindowBounds(bounds: WindowBounds, workWidth: number, workHeight: number): WindowBounds {
  const width = Number.isFinite(workWidth) ? Math.max(1, workWidth) : 1;
  const height = Number.isFinite(workHeight) ? Math.max(1, workHeight) : 1;
  const padX = Math.min(12, width / 4);
  const padY = Math.min(12, height / 4);
  const availableW = width - padX * 2;
  const availableH = height - padY * 2;
  const w = Math.min(availableW, Math.max(Math.min(420, availableW), Number.isFinite(bounds.w) ? bounds.w : availableW));
  const h = Math.min(availableH, Math.max(Math.min(280, availableH), Number.isFinite(bounds.h) ? bounds.h : availableH));
  const x = Math.max(padX, Math.min(width - padX - w, Number.isFinite(bounds.x) ? bounds.x : padX));
  const y = Math.max(padY, Math.min(height - padY - h, Number.isFinite(bounds.y) ? bounds.y : padY));
  return { x, y, w, h };
}
