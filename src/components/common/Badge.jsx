import React from 'react';

export function Badge({ children }) {
  const s = String(children).toLowerCase();
  return (
    <span className={`badge ${s.includes('paid') || s.includes('confirmed') || s === 'available' || s === 'active' || s === 'ready' ? 'badge-green' : s.includes('overdue') || s === 'suspended' ? 'badge-red' : s.includes('hold') || s.includes('processing') || s.includes('invited') ? 'badge-amber' : 'badge-indigo'}`}>
      {children}
    </span>
  );
}
