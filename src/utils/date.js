/** Date helpers — one implementation for every screen. */

export const todayLabel = () =>
  new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

export const dateLabel = (value) => {
  if (!value) return '—';
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime())
    ? String(value)
    : parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const dateTimeLabel = (value) => {
  if (!value) return '—';
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString('en-GB');
};

/** ISO timestamp helper used by the store when stamping records. */
export const nowIso = () => new Date().toISOString();
