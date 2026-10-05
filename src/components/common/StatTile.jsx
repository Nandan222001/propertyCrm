import React from 'react';

export function StatTile({ title, value, color = '' }) {
  return (
    <div className="mini-stat">
      <small>{title}</small>
      <b className={color}>{value}</b>
    </div>
  );
}

/** Backwards-compatible alias (older pages import `Mini`). */
export const Mini = StatTile;
