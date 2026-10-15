import React, { useEffect } from 'react';
import { Pager, usePaged } from './Pager';

/** Every list is shown 10 rows at a time with a pager underneath (`paginate={false}` shows all rows). */
export function DataTable({ headers, rows, label = 'records', paginate = true, pageSize }) {
  const paged = usePaged(rows, pageSize);
  const { setPage, total } = paged;
  useEffect(() => { setPage(1); }, [total, setPage]); // a new search / filter starts at the first page
  const visible = paginate ? paged.rows : rows;
  return (
    <>
      <div className="table-scroll data-table">
        <table>
          <thead>
            <tr>{headers.map((h, i) => <th key={i}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={paged.start + i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      {paginate && rows.length > 0 && <Pager paged={paged} label={label} />}
    </>
  );
}

// --------------------------------------------------------------------------
// ROLE-ADAPTED MODULE PAGES
// --------------------------------------------------------------------------

/** Backwards-compatible alias (older pages import `Table`). */
export const Table = DataTable;
