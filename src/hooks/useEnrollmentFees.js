import { useEffect, useMemo, useState } from 'react';
import { api, hasSession } from '../api';
import { pageCache } from '../utils/pageCache';

/** "2026-03-02" -> a local Date (null when it is not a date). */
const toDate = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};

/**
 * The enrollment fees received with applications (step 1 of a booking), for the collection totals.
 * Only the enrollment fee counts as collection — the application fee never does — and a cancelled application
 * stops counting. `fees` is `[{ date, amount }]` (for the monthly chart) and `total` their sum.
 * Offline preview has no applications, so it returns nothing.
 */
export function useEnrollmentFees(project = 'All projects') {
  const [rows, setRows] = useState(() => pageCache.get('enrollment-fees') ?? []);

  useEffect(() => {
    if (!hasSession()) return undefined;
    let alive = true;
    const load = async () => {
      try {
        const all = [];
        for (let page = 1; page <= 50; page += 1) {
          const response = await api.applications.list({ page, page_size: 200 });
          all.push(...(response.data || []));
          if (!response.meta?.has_next) break;
        }
        if (alive) setRows(pageCache.set('enrollment-fees', all));
      } catch { /* keep what we had: the totals simply exclude enrollment until it loads */ }
    };
    load();
    window.addEventListener('erp:applications-changed', load);
    return () => { alive = false; window.removeEventListener('erp:applications-changed', load); };
  }, []);

  return useMemo(() => {
    const fees = rows
      .filter((a) => a.status !== 'CANCELLED' && (project === 'All projects' || a.project_name === project))
      .map((a) => ({ date: toDate(a.received_on), amount: Number(a.enrollment_fee || 0) }))
      .filter((f) => f.date && f.amount > 0);
    return { fees, total: fees.reduce((t, f) => t + f.amount, 0) };
  }, [rows, project]);
}
