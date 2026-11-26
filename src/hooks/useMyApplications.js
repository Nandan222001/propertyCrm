import { useEffect, useState } from 'react';
import { api } from '../api';

/**
 * The customer's own application receipts (the application fee + enrollment fee taken before a plot is allotted).
 * The server limits the list to the signed-in customer; cancelled applications are left out. Does nothing unless
 * `enabled`, so other roles and the offline preview never ask.
 */
export function useMyApplications(enabled) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (!enabled) { setRows([]); return undefined; }
    let alive = true;
    const load = async () => {
      try {
        const all = [];
        for (let page = 1; page <= 50; page += 1) {
          const response = await api.applications.list({ page, page_size: 200 });
          all.push(...(response.data || []));
          if (!response.meta?.has_next) break;
        }
        if (alive) setRows(all.filter((a) => a.status !== 'CANCELLED'));
      } catch { if (alive) setRows([]); }
    };
    load();
    window.addEventListener('erp:applications-changed', load);
    return () => { alive = false; window.removeEventListener('erp:applications-changed', load); };
  }, [enabled]);
  return rows;
}
