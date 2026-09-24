// Display formatting for record values (display only - stored data is untouched).
export const formatValue = (v) => {
  if (v === undefined || v === null || v === '') return '—';
  if (typeof v === 'object' && v.lat !== undefined) return `${v.lat.toFixed(5)}, ${v.lng.toFixed(5)}`;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

export const hasValue = (v) => v !== undefined && v !== null && v !== '';

export const timeAgo = (iso) => {
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 60 * 24) return `${Math.round(m / 60)} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

export const fullDate = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
