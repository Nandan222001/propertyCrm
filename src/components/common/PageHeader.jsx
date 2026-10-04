import React from 'react';

/** Page title block: eyebrow + heading + subtitle + action slot. */
export function PageHeader({ title, subtitle, eyebrow = 'ENTERPRISE REAL ESTATE OPERATIONS · LIVE', children }) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">
          <i className="live-dot" /> {eyebrow}
        </div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {children && <div className="heading-actions">{children}</div>}
    </div>
  );
}
