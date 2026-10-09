import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export const PAGE_SIZE = 10;

/** Client-side pagination (10 per page). Clamps the page when the list shrinks. */
export function usePaged(rows, size = PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  useEffect(() => { if (page > pages) setPage(pages); }, [page, pages]);
  const current = Math.min(page, pages);
  const start = (current - 1) * size;
  return { rows: rows.slice(start, start + size), page: current, pages, total: rows.length, start, size, setPage };
}

export function Pager({ paged, label }) {
  if (paged.total <= paged.size) {
    return <div className="table-pagination">Showing {paged.total} {label}</div>;
  }
  const end = Math.min(paged.start + paged.size, paged.total);
  return (
    <div className="table-pagination" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span>Showing {paged.start + 1}–{end} of {paged.total} {label}</span>
      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        <button className="icon-action" aria-label="Previous page" disabled={paged.page === 1} onClick={() => paged.setPage(paged.page - 1)}><ChevronLeft size={14} /></button>
        Page {paged.page} of {paged.pages}
        <button className="icon-action" aria-label="Next page" disabled={paged.page === paged.pages} onClick={() => paged.setPage(paged.page + 1)}><ChevronRight size={14} /></button>
      </span>
    </div>
  );
}
