/** Does a table row (array) or record (object) contain the text typed in the top-bar search? */
export const rowMatchesSearch = (row, search) => {
  const needle = String(search || '').trim().toLowerCase();
  if (!needle) return true;
  const values = Array.isArray(row) ? row : Object.values(row || {});
  return values.filter((v) => typeof v === 'string' || typeof v === 'number').join(' ').toLowerCase().includes(needle);
};
