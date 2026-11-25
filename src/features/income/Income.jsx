import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ListChecks, Search } from 'lucide-react';
import { actions, api, hasSession } from '../../api';
import { Table } from '../../components/common/DataTable';
import { Mini } from '../../components/common/StatTile';
import { getSettings } from '../../utils/settings';
import { pageCache } from '../../utils/pageCache';

const money = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const two = (n) => String(n).padStart(2, '0');
const dmy = (d) => `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()}`;
const round2 = (n) => Math.round(n * 100) / 100;
const percent = (rate) => Number((Number(rate) * 100).toFixed(2));

/** A date as the API sends it ("2026-03-02" or a full timestamp) -> a local Date. */
const toDate = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};

/** Every page of the agent's commissions (the API caps page_size at 200). */
async function loadAll() {
  const rows = [];
  for (let page = 1; page <= 50; page += 1) {
    const response = await api.commissions.list({ page, page_size: 200 });
    rows.push(...(response.data || []));
    if (!response.meta?.has_next) break;
  }
  return rows;
}

/**
 * Income (sales agent): what the agent has earned, paid out month by month.
 *
 * Summary: one line per month (payout date = the last day of the month a customer's payment came in) with the
 * commission earned, the admin charge, TDS and what is payable. Details opens that month payment by payment: the
 * project, plot and size, what the customer paid, the agent's own rate (self) or the team share (diff) and the income.
 */
export function Income({ bookings = [], plots = [], notify }) {
  const live = hasSession();
  const [rows, setRows] = useState(() => pageCache.get('income') ?? null);
  const [payouts, setPayouts] = useState(() => pageCache.get('income-payouts') ?? []);   // what the company has paid this agent
  const [month, setMonth] = useState(null);          // 'YYYY-MM' of the month whose details are open
  const [query, setQuery] = useState('');
  const [needle, setNeedle] = useState('');

  const load = useCallback(async () => {
    try {
      const [commissions, paid] = await Promise.all([loadAll(), actions.agentPayouts().then((r) => r.data || []).catch(() => [])]);
      setRows(pageCache.set('income', commissions));
      setPayouts(pageCache.set('income-payouts', paid));
    } catch (error) {
      notify(`Could not load your income: ${error.message}`);
      setRows([]);
    }
  }, [notify]);
  useEffect(() => { if (live) load(); }, [live, load]);

  const adminRate = Math.min(Math.max(Number(getSettings().tax.adminChargeRate) || 0, 0), 30) / 100;

  const lines = useMemo(() => {
    const bookingById = new Map(bookings.filter((b) => typeof b[10] === 'number').map((b) => [b[10], b]));
    const sizeOf = new Map(plots.map((p) => [`${p[8]}|${p[0]}`, p[2]]));
    return (rows || [])
      .filter((c) => !['CANCELLED', 'REJECTED'].includes(c.status))
      .map((c) => {
        const date = toDate(c.received_on) || toDate(c.created_at);
        const booking = bookingById.get(c.booking_id);
        const gross = Number(c.gross_amount);
        const admin = round2(gross * adminRate);
        const tds = Number(c.tds_amount);
        return {
          id: c.id, date, month: date ? `${date.getFullYear()}-${two(date.getMonth() + 1)}` : '',
          project: booking?.[2] || '—', plot: booking?.[3] || '—',
          size: sizeOf.get(`${booking?.[2]}|${booking?.[3]}`),
          paid: Number(c.deal_value), rate: percent(c.rate), team: Boolean(c.is_override), via: c.source_agent_name || '',
          gross, admin, tds, payable: round2(gross - admin - tds),
        };
      })
      .filter((l) => l.date)
      .sort((a, b) => a.date - b.date || a.id - b.id);
  }, [rows, bookings, plots, adminRate]);

  const months = useMemo(() => {
    const byMonth = new Map();
    lines.forEach((l) => {
      const entry = byMonth.get(l.month) || { month: l.month, amount: 0, admin: 0, tds: 0, payable: 0, count: 0 };
      entry.amount += l.gross; entry.admin += l.admin; entry.tds += l.tds; entry.payable += l.payable; entry.count += 1;
      byMonth.set(l.month, entry);
    });
    return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)).map((m) => {
      const [y, mo] = m.month.split('-').map(Number);
      return { ...m, payout: new Date(y, mo, 0) };      // day 0 of the next month = the last day of this one
    });
  }, [lines]);

  const search = needle.trim().toLowerCase();
  const shownMonths = search ? months.filter((m) => dmy(m.payout).includes(search)
    || m.payout.toLocaleString('en-GB', { month: 'long', year: 'numeric' }).toLowerCase().includes(search)) : months;
  const detailLines = lines.filter((l) => l.month === month);
  const shownDetails = search ? detailLines.filter((l) => [dmy(l.date), l.project, l.plot, l.size].join(' ').toLowerCase().includes(search)) : detailLines;
  const open = month ? months.find((m) => m.month === month) : null;

  const total = (list, key) => list.reduce((t, x) => t + x[key], 0);
  const paidOut = round2(payouts.reduce((t, p) => t + Number(p.amount), 0));
  const balance = Math.max(round2(total(months, 'payable') - paidOut), 0);
  const shownTotals = month ? shownDetails : shownMonths;
  const gross = month ? total(shownTotals, 'gross') : total(shownTotals, 'amount');

  const submit = (e) => { e.preventDefault(); setNeedle(query); };
  const show = (next) => { setMonth(next); setQuery(''); setNeedle(''); };

  if (!live) return <p className="empty-note panel">Your income statement is available when you are connected to the server.</p>;
  if (rows === null) return <p className="empty-note panel">Loading your income…</p>;

  return (
    <>
      <div className="mini-stats four">
        <Mini title="COMMISSION EARNED" value={`₹${money(gross)}`} />
        <Mini title="ADMIN CHARGE" value={`₹${money(total(shownTotals, 'admin'))}`} />
        <Mini title="TDS" value={`₹${money(total(shownTotals, 'tds'))}`} />
        <Mini title="PAYABLE" value={`₹${money(total(shownTotals, 'payable'))}`} color="green-text" />
      </div>

      <div className="panel section-panel">
        <div className="crud-heading">
          <div>
            <h2>{open ? 'Income details' : 'Income summary'}</h2>
            <p>
              {open
                ? `Payments received in ${open.payout.toLocaleString('en-GB', { month: 'long', year: 'numeric' })} — payout date ${dmy(open.payout)}.`
                : `Month by month: what you earned, the admin charge${adminRate ? ` (${percent(adminRate)}%)` : ''}, TDS and what is payable to you. Open Details for the payment-wise break-up.`}
            </p>
          </div>
          {open && (
            <button className="button button-white small-btn" onClick={() => show(null)}><ArrowLeft size={13} /> Back to summary</button>
          )}
        </div>

        <form className="income-search" onSubmit={submit}>
          <input
            value={query} onChange={(e) => { setQuery(e.target.value); if (!e.target.value) setNeedle(''); }}
            placeholder={open ? 'Search… (date DD/MM/YYYY, project or plot)' : 'Search… (For Date DD/MM/YYYY)'} aria-label="Search income"
          />
          <button type="submit" className="button button-primary small-btn"><Search size={13} /> Search</button>
        </form>

        {open ? (
          <Table
            label="income details"
            headers={['SR NO', 'PROJECT NAME', 'PLOT NAME', 'DIMENSION', 'PAYMENT DATE', 'AMOUNT', 'SELF PERCENT', 'DIFF PERCENT', 'INCOME']}
            empty={search ? 'Nothing matches your search.' : 'No payments in this month.'}
            rows={shownDetails.map((l, i) => [
              i + 1,
              <span>{l.project}{l.team && <small className="muted-text"> · team: {l.via || 'a sub-agent'}</small>}</span>,
              l.plot,
              l.size ? `${l.size} sq ft` : '—',
              dmy(l.date),
              money(l.paid),
              l.team ? '—' : l.rate,
              l.team ? l.rate : '—',
              <b>{money(l.gross)}</b>,
            ])}
          />
        ) : (
          <Table
            label="income summary"
            headers={['SR NO', 'PAYOUT DATE', 'AMOUNT', 'ADMIN CHG', 'TDS', 'PAYABLE AMT', 'DETAILS']}
            empty={search ? 'No payout matches your search.' : 'No income yet — commission appears here once your customers pay.'}
            rows={shownMonths.map((m, i) => [
              i + 1,
              dmy(m.payout),
              money(m.amount),
              money(m.admin),
              money(m.tds),
              <b className="green-text">{money(m.payable)}</b>,
              <button className="icon-action" title={`Details for ${dmy(m.payout)}`} aria-label={`Details for ${dmy(m.payout)}`} onClick={() => show(m.month)}>
                <ListChecks size={15} />
              </button>,
            ])}
          />
        )}
      </div>

      {!open && (
        <div className="panel section-panel">
          <div className="crud-heading">
            <div>
              <h2>Payments received from the company</h2>
              <p>Every payout the company has made to you against your commission.</p>
            </div>
          </div>
          <div className="mini-stats three" style={{ marginBottom: 12 }}>
            <Mini title="PAYABLE TILL DATE" value={`₹${money(total(months, 'payable'))}`} />
            <Mini title="PAID TO YOU" value={`₹${money(paidOut)}`} color="green-text" />
            <Mini title="BALANCE TO BE PAID" value={`₹${money(balance)}`} color="amber-text" />
          </div>
          <Table
            label="payouts"
            headers={['SR NO', 'PAID ON', 'AMOUNT', 'MODE', 'REFERENCE', 'NOTE', 'STATUS']}
            empty="No payout has been made to you yet."
            rows={payouts.map((p, i) => [
              i + 1, dmy(toDate(p.date) || new Date(NaN)), <b className="green-text">{money(p.amount)}</b>, p.mode || '—', p.reference || '—', p.note || '—',
              <span className="badge badge-green">Paid</span>,
            ])}
          />
        </div>
      )}
    </>
  );
}
