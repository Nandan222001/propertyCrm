import React from 'react';

/**
 * Status pill. The tone is inferred from the label unless an explicit `tone`
 * is passed (the billing page maps its six invoice states explicitly).
 */
export function Badge({ children, tone }) {
  const s = String(children).toLowerCase();
  const inferred = s.includes('paid') && !s.includes('partially') || s.includes('confirmed') || s === 'available' || s === 'active' || s === 'ready'
    ? 'green'
    : s.includes('overdue') || s === 'suspended'
      ? 'red'
      : s.includes('hold') || s.includes('processing') || s.includes('invited') || s.includes('partially')
        ? 'amber'
        : 'indigo';
  const cls = tone || inferred;
  return <span className={`badge badge-${cls}`}>{children}</span>;
}
