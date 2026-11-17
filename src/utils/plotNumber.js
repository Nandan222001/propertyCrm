/**
 * The digits a plot is mapped by on the layout map.
 *
 * The map is drawn with plain plot numbers ("1" … "225"). A plot entered in the ERP as "COMM-01", "A/01" or
 * "01" therefore maps to plot 1 — the number alone decides the mapping, never the letters or the symbols. A plot
 * number with no digits at all keeps its letters, lower-cased, as its key.
 */
export function plotMapKey(value) {
  const text = String(value ?? '').trim();
  const digits = text.replace(/\D/g, '');
  return digits.replace(/^0+/, '') || (digits ? '0' : text.toLowerCase());
}

/** True when two plot numbers map to the same plot of the layout drawing. */
export function samePlotOnMap(a, b) {
  return plotMapKey(a) === plotMapKey(b);
}
