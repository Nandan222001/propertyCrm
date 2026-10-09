import React from 'react';

/** Consistent empty/zero-data state used by every table and list. */
export function EmptyState({ title = 'Nothing here yet', hint, action }) {
  return (
    <div className="empty-state" style={{ padding: '26px 12px', textAlign: 'center', color: '#8f99a9' }}>
      <b style={{ display: 'block', fontSize: 13, color: '#4a5568' }}>{title}</b>
      {hint && <span style={{ display: 'block', fontSize: 12, marginTop: 5 }}>{hint}</span>}
      {action}
    </div>
  );
}
