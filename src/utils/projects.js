/**
 * Project rows keep the tuple shape the whole UI already indexes:
 *   [0] name  [1] "Phase · City"  [2] total plots  [3] booked  [4] hold  [5] est. revenue ("12.6 Cr")
 * extended with the fields the add/edit form needs:
 *   [6] api id  [7] city  [8] phase  [9] location  [10] RERA no.  [11] active  [12] base rate / sq.ft
 *   [13] commercial  [14] corner  [15] north-east facing  [16] east facing  [17] park facing  (premium per plot, ₹)
 */
const CRORE = 10000000;

export const PROJECT_COL = {
  NAME: 0, WHERE: 1, TOTAL: 2, BOOKED: 3, HOLD: 4, REVENUE: 5,
  ID: 6, CITY: 7, PHASE: 8, LOCATION: 9, RERA: 10, ACTIVE: 11, RATE: 12,
  PREMIUM_COMMERCIAL: 13, PREMIUM_CORNER: 14, PREMIUM_NE: 15, PREMIUM_EAST: 16, PREMIUM_PARK: 17,
};

/** Premium charges: form field -> API field. Each is an extra added to the price of a plot with that feature. */
export const PREMIUMS = [
  ['premiumCommercial', 'premium_commercial', 'Commercial plot', 13],
  ['premiumCorner', 'premium_corner', 'Corner plot', 14],
  ['premiumNe', 'premium_ne_facing', 'North-East facing', 15],
  ['premiumEast', 'premium_east_facing', 'East facing', 16],
  ['premiumPark', 'premium_park_facing', 'Park / plantation facing', 17],
];

const where = (phase, city) => [phase, city].filter(Boolean).join(' · ');

/** Revenue in ₹ crore -> the label used in the table ("12.6 Cr"). */
export const crLabel = (crore) => (Number(crore) > 0 ? `${Number(Number(crore).toFixed(2))} Cr` : '—');

/** "12.6 Cr" -> 12.6 (blank when unknown). */
export const crValue = (label) => {
  const n = parseFloat(String(label || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && /cr/i.test(String(label)) ? String(n) : '';
};

/** Normalised view of a row for the form (seed rows have no extras: split the label). */
export function projectFormValues(row) {
  if (!row) return { name: '', phase: '', city: '', location: '', rera: '', total: '', rate: '', revenue: '', active: true, ...Object.fromEntries(PREMIUMS.map(([key]) => [key, ''])) };
  const [phaseFromLabel = '', cityFromLabel = ''] = String(row[1] || '').split(' · ');
  return {
    name: row[0],
    phase: row[PROJECT_COL.PHASE] ?? phaseFromLabel,
    city: row[PROJECT_COL.CITY] ?? cityFromLabel,
    location: row[PROJECT_COL.LOCATION] || '',
    rera: row[PROJECT_COL.RERA] || '',
    total: String(row[2] ?? ''),
    rate: row[PROJECT_COL.RATE] ? String(row[PROJECT_COL.RATE]) : '',
    revenue: crValue(row[5]),
    active: row[PROJECT_COL.ACTIVE] !== false,
    ...Object.fromEntries(PREMIUMS.map(([key, , , index]) => [key, row[index] ? String(row[index]) : ''])),
  };
}

/** Form values (+ the row being edited) -> table row. Booked / hold are never typed in. */
export function projectRowFromForm(form, existing) {
  return [
    form.name.trim(),
    where(form.phase.trim(), form.city.trim()) || '—',
    String(Number(form.total || 0)),
    existing ? existing[3] : '0',
    existing ? existing[4] : '0',
    crLabel(form.revenue),
    existing ? existing[PROJECT_COL.ID] : undefined,
    form.city.trim(),
    form.phase.trim(),
    form.location.trim(),
    form.rera.trim(),
    form.active,
    form.rate ? Number(form.rate) : undefined,
    ...PREMIUMS.map(([key]) => (form[key] ? Number(form[key]) : undefined)),
  ];
}

/** API payload for POST/PATCH /projects (blank optional fields are omitted). */
export function projectApiPayload(form) {
  const body = {
    name: form.name.trim(),
    total_plots: Number(form.total || 0),
    is_active: form.active,
  };
  if (form.phase.trim()) body.phase = form.phase.trim();
  if (form.city.trim()) body.city = form.city.trim();
  if (form.location.trim()) body.location = form.location.trim();
  if (form.rera.trim()) body.rera_number = form.rera.trim();
  if (form.rate) body.base_rate_per_sqft = Number(form.rate);
  if (form.revenue) body.estimated_revenue = Math.round(Number(form.revenue) * CRORE);
  PREMIUMS.forEach(([key, field]) => { if (form[key] !== '' && form[key] != null) body[field] = Number(form[key]); });
  return body;
}

/** API project object -> table row (so live data renders in the same table). */
export function projectFromApi(p) {
  const counts = p.plot_counts || {};
  const revenue = Number(p.estimated_revenue) / CRORE;
  return [
    p.name,
    where(p.phase, p.city) || '—',
    String(p.total_plots ?? 0),
    String((counts.BOOKED || 0) + (counts.SOLD || 0)),
    String(counts.HOLD || 0),
    crLabel(revenue),
    p.id,
    p.city || '',
    p.phase || '',
    p.location || '',
    p.rera_number || '',
    p.is_active !== false,
    p.base_rate_per_sqft ? Number(p.base_rate_per_sqft) : undefined,
    ...PREMIUMS.map(([, field]) => (p[field] != null ? Number(p[field]) : undefined)),
  ];
}

/** Returns an error string for the first problem found, else ''. */
export function validateProject(form, { projects = [], editing = null } = {}) {
  const name = form.name.trim();
  if (name.length < 2) return 'Project name must be at least 2 characters';
  if (name.length > 120) return 'Project name is too long (max 120)';
  const clash = projects.some((p) => p[0].toLowerCase() === name.toLowerCase() && p[0] !== editing?.[0]);
  if (clash) return `A project named "${name}" already exists`;
  const total = Number(form.total);
  if (form.total === '' || !Number.isInteger(total) || total < 0 || total > 100000) return 'Total plots must be a whole number between 0 and 100000';
  if (editing) {
    const used = Number(editing[3]) + Number(editing[4]);
    if (total < used) return `Total plots cannot be below ${used} (already booked or on hold)`;
  }
  if (form.rate !== '' && !(Number(form.rate) >= 0)) return 'Base rate must be a positive number';
  if (form.revenue !== '' && !(Number(form.revenue) >= 0)) return 'Estimated revenue must be a positive number';
  if (form.rera.length > 60) return 'RERA number is too long (max 60)';
  for (const [key, , label] of PREMIUMS) {
    if (form[key] !== '' && !(Number(form[key]) >= 0)) return `${label}: the premium must be a positive amount`;
  }
  return '';
}
