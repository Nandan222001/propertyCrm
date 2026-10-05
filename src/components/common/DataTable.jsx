import React from 'react';

export function DataTable({ headers, rows }) {
  return (
    <div className="table-scroll data-table">
      <table>
        <thead>
          <tr>{headers.map((h, i) => <th key={i}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --------------------------------------------------------------------------
// ROLE-ADAPTED MODULE PAGES
// --------------------------------------------------------------------------

/** Backwards-compatible alias (older pages import `Table`). */
export const Table = DataTable;
