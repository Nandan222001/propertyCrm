/** Name helpers shared by every table, avatar and agent lookup. */

/** "Sanjay Patel" -> "S. Patel" — the key booking/payment rows store for agents. */
export function agentKey(fullName = '') {
  const parts = String(fullName).trim().split(/\s+/);
  if (parts.length < 2) return fullName;
  return `${parts[0][0].toUpperCase()}. ${parts[parts.length - 1]}`;
}

/** "Sanjay Patel" -> "SP" (avatar initials). */
export const initials = (name = '') =>
  String(name || 'NA').split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase();

/** Loose search: matches when *every* whitespace-separated term appears in any field. */
export function matchesSearch(term, ...fields) {
  const needle = String(term || '').trim().toLowerCase();
  if (!needle) return true;
  const hay = fields.filter(Boolean).join(' ').toLowerCase();
  return needle.split(/\s+/).every((part) => hay.includes(part));
}
