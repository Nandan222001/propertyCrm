import React from 'react';

/** Card panel with an optional title/subtitle and header action. */
export function Panel({ title, subtitle, action, className = '', children }) {
  return (
    <section className={`panel ${className}`.trim()}>
      {(title || action) && (
        <div className="panel-head">
          <div>
            {title && <h2>{title}</h2>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
