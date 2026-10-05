/** CSV export — one implementation for every table in the ERP. */

const escapeCell = (value) => {
  const cell = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell;
};

/** Download `rows` as a CSV file. `rows` is an array of arrays; `headers` optional. */
export function downloadCsv(filename, rows, headers = []) {
  const lines = [headers, ...rows].filter((row) => row && row.length).map((row) => row.map(escapeCell).join(','));
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** True when the browser refused a download (private mode / blocked blob). */
export const csvUnsupported = () => typeof Blob === 'undefined';
