import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, Search, X } from 'lucide-react';
import { actions, hasSession } from '../../api';
import { Table } from '../../components/common/DataTable';
import { Mini } from '../../components/common/StatTile';
import { Badge } from '../../components/common/Badge';
import { pageCache } from '../../utils/pageCache';

const money = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const dmy = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—');
const label = (s) => String(s || '').replace(/_/g, ' ');
const bp = (r) => `[${r.agent_code}] ${r.agent_name}`;

/** The search + filter bar shared by the three Sales pages (a dropdown, a search box and a Search button). */
function Filters({ options, value, onChange, query, setQuery, apply, placeholder }) {
  return (
    <form className="sales-filters" onSubmit={(e) => { e.preventDefault(); apply(); }}>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Filter">
        {options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
      </select>
      <input
        value={query} onChange={(e) => { setQuery(e.target.value); if (!e.target.value) apply(''); }}
        placeholder={placeholder} aria-label="Search sales"
      />
      <button type="submit" className="button button-primary small-btn"><Search size={13} /> Search</button>
    </form>
  );
}

const useList = (cacheKey, fetcher, notify) => {
  const live = hasSession();
  const [rows, setRows] = useState(() => pageCache.get(cacheKey) ?? null);
  const load = useCallback(async () => {
    try {
      const response = await fetcher();
      setRows(pageCache.set(cacheKey, response.data || []));
    } catch (error) {
      notify(`Could not load sales: ${error.message}`);
      setRows([]);
    }
  }, [cacheKey, fetcher, notify]);
  useEffect(() => { if (live) load(); }, [live, load]);
  return { live, rows };
};

/** The payments of one sale, opened from the "Payments" button of a sales row. */
function SalePaymentsModal({ sale, close }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let alive = true;
    actions.agentSalePayments()
      .then((r) => alive && setRows((r.data || []).filter((p) => p.booking_number === sale.booking_number)))
      .catch(() => alive && setRows([]));
    return () => { alive = false; };
  }, [sale.booking_number]);
  const total = (rows || []).reduce((t, p) => t + Number(p.amount), 0);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal modal-wide" role="dialog" aria-modal="true" aria-label={`Payments of sale ${sale.booking_number}`}>
        <div className="modal-head">
          <div>
            <span className="modal-kicker">SALE {sale.booking_number} · {sale.project} · PLOT {sale.plot}</span>
            <h2>Payments</h2>
            <p>{sale.customer} · sold by {bp(sale)} · paid ₹{money(sale.paid)} of ₹{money(sale.total)}</p>
          </div>
          <button type="button" className="modal-close" onClick={close} aria-label="Close"><X size={16} /></button>
        </div>
        {rows === null ? <p className="empty-note">Loading…</p> : (
          <Table
            label="payments"
            headers={['#', 'RECEIPT NO.', 'RECEIPT DATE', 'DATE', 'MODE', 'REF. NO.', 'AMOUNT']}
            empty="No payment has been received on this sale yet."
            rows={[...rows.map((p, i) => [i + 1, p.receipt_number || '—', dmy(p.receipt_date), dmy(p.received_on), label(p.mode), p.reference || '—', money(p.amount)]),
              ...(rows.length ? [['', '', '', '', '', <b key="t">Total</b>, <b key="a">{money(total)}</b>]] : [])]}
          />
        )}
      </div>
    </div>
  );
}

const STATUS_FILTERS = [['ALL', 'ALL STATUS'], ['PENDING_APPROVAL', 'PENDING APPROVAL'], ['CONFIRMED', 'CONFIRMED'], ['AGREEMENT', 'AGREEMENT'],
  ['REGISTERED', 'REGISTERED'], ['CANCELLED', 'CANCELLED'], ['REJECTED', 'REJECTED']];

/**
 * Direct Sale / Team Sale (sales agent): one line per booking. Direct = the agent's own deals; team = the deals
 * of every agent below them, with the selling agent shown as BP and the customer's name masked.
 */
export function AgentSales({ kind = 'direct', company = '', notify }) {
  const fetcher = useCallback(() => actions.agentSales(kind), [kind]);
  const { live, rows } = useList(`agent-sales-${kind}`, fetcher, notify);
  const [status, setStatus] = useState('ALL');
  const [query, setQuery] = useState('');
  const [needle, setNeedle] = useState('');
  const [paymentsOf, setPaymentsOf] = useState(null);
  useEffect(() => { setStatus('ALL'); setQuery(''); setNeedle(''); }, [kind]);

  const text = needle.trim().toLowerCase();
  const shown = useMemo(() => (rows || []).filter((r) => (status === 'ALL' || r.status === status)
    && (!text || [r.booking_number, dmy(r.booking_date), r.project, r.phase, r.plot, bp(r), r.customer, label(r.status)].join(' ').toLowerCase().includes(text))), [rows, status, text]);

  if (!live) return <p className="empty-note panel">Your sales are available when you are connected to the server.</p>;
  if (rows === null) return <p className="empty-note panel">Loading your sales…</p>;

  const live_ = shown.filter((r) => !['CANCELLED', 'REJECTED'].includes(r.status));
  const sum = (key) => live_.reduce((t, r) => t + Number(r[key]), 0);
  return (
    <>
      <div className="mini-stats four">
        <Mini title={kind === 'team' ? 'TEAM SALES' : 'MY SALES'} value={live_.length} />
        <Mini title="TOTAL VALUE" value={`₹${money(sum('total'))}`} />
        <Mini title="PAID" value={`₹${money(sum('paid'))}`} color="green-text" />
        <Mini title="BALANCE" value={`₹${money(sum('balance'))}`} color="amber-text" />
      </div>
      <div className="panel section-panel">
        <Filters
          options={STATUS_FILTERS} value={status} onChange={setStatus} query={query} setQuery={setQuery}
          apply={(value) => setNeedle(value === undefined ? query : value)} placeholder="Search…"
        />
        <Table
          label={kind === 'team' ? 'team sales' : 'direct sales'}
          headers={['PAYMENTS', '#', 'SALE ID', 'DATE', 'STATUS', 'COMPANY', 'PROJECT', 'PHASE', 'PLOT', 'BP', 'NAME', 'DOWN PAY', 'AREA', 'RATE', 'PLC', 'TOTAL', 'PAID', 'BALANCE']}
          empty={text || status !== 'ALL' ? 'No sale matches your search.' : (kind === 'team' ? 'No sale has been made by your team yet.' : 'You have not made a sale yet.')}
          rows={shown.map((r, i) => [
            <button className="icon-action" title={`Payments of ${r.booking_number}`} aria-label={`Payments of ${r.booking_number}`} onClick={() => setPaymentsOf(r)}><Eye size={15} /></button>,
            i + 1, r.booking_number, dmy(r.booking_date), <Badge>{label(r.status)}</Badge>, company || '—', r.project, r.phase || '—', r.plot, bp(r), r.customer || '—',
            money(r.down_payment), money(r.area_sqft), money(r.rate), money(r.plc), money(r.total), money(r.paid), money(r.balance),
          ])}
        />
      </div>
      {paymentsOf && <SalePaymentsModal sale={paymentsOf} close={() => setPaymentsOf(null)} />}
    </>
  );
}

const KIND_FILTERS = [['ALL', 'ALL SALES'], ['DIRECT', 'DIRECT SALES'], ['TEAM', 'TEAM SALES']];

/** Sale Payments (sales agent): every payment received on the agent's own and team's sales, with its receipt. */
export function AgentSalePayments({ notify }) {
  const fetcher = useCallback(() => actions.agentSalePayments(), []);
  const { live, rows } = useList('agent-sale-payments', fetcher, notify);
  const [kind, setKind] = useState('ALL');
  const [query, setQuery] = useState('');
  const [needle, setNeedle] = useState('');

  const text = needle.trim().toLowerCase();
  const shown = useMemo(() => (rows || []).filter((r) => (kind === 'ALL' || (kind === 'TEAM') === r.is_team)
    && (!text || [r.receipt_number, dmy(r.receipt_date), r.booking_number, dmy(r.booking_date), r.project, r.plot, bp(r), r.customer, dmy(r.received_on), r.mode, r.reference].join(' ').toLowerCase().includes(text))), [rows, kind, text]);

  if (!live) return <p className="empty-note panel">Your sale payments are available when you are connected to the server.</p>;
  if (rows === null) return <p className="empty-note panel">Loading sale payments…</p>;

  const total = shown.reduce((t, r) => t + Number(r.amount), 0);
  return (
    <>
      <div className="mini-stats four">
        <Mini title="PAYMENTS" value={shown.length} />
        <Mini title="AMOUNT RECEIVED" value={`₹${money(total)}`} color="green-text" />
        <Mini title="ON MY SALES" value={`₹${money(shown.filter((r) => !r.is_team).reduce((t, r) => t + Number(r.amount), 0))}`} />
        <Mini title="ON TEAM SALES" value={`₹${money(shown.filter((r) => r.is_team).reduce((t, r) => t + Number(r.amount), 0))}`} />
      </div>
      <div className="panel section-panel">
        <Filters
          options={KIND_FILTERS} value={kind} onChange={setKind} query={query} setQuery={setQuery}
          apply={(value) => setNeedle(value === undefined ? query : value)} placeholder="Search…"
        />
        <Table
          label="sale payments"
          headers={['#', 'RECEIPT NO.', 'RECEIPT DATE', 'SALE', 'STATUS', 'PROJECT', 'PLOT', 'BP', 'NAME', 'DOWN PAY', 'DATE', 'MODE', 'REF. NO.', 'AMOUNT']}
          empty={text || kind !== 'ALL' ? 'No payment matches your search.' : 'No payment has been received on your sales yet.'}
          rows={shown.map((r, i) => [
            i + 1, r.receipt_number || '—', dmy(r.receipt_date),
            <span>{r.booking_number}<small className="muted-text"> ({dmy(r.booking_date)})</small></span>,
            <Badge>{label(r.status)}</Badge>, r.project, r.plot, bp(r), r.customer || '—', money(r.down_payment),
            dmy(r.received_on), label(r.mode), r.reference || '—', <b>{money(r.amount)}</b>,
          ])}
        />
      </div>
    </>
  );
}
