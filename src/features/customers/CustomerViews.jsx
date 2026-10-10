import React from 'react';
import { Eye, Printer, MessageCircle, Download, FileText, Check, X as XIcon, Plus } from 'lucide-react';
import { COMPANY, REGISTRY_STEPS } from '../../data/seedData';
import { parseAmt, fmtINR, openWhatsApp, isAdmin, canCreateCustomer, canApprove } from '../../utils';

const statusClass = (s) => {
  const t = String(s).toLowerCase();
  return t.includes('paid') || t.includes('confirmed') || t === 'approved' || t === 'registered' ? 'badge-green'
    : t.includes('overdue') || t === 'rejected' ? 'badge-red'
    : t.includes('pending') || t.includes('processing') || t.includes('hold') ? 'badge-amber' : 'badge-indigo';
};
export const StatusBadge = ({ children }) => <span className={`badge ${statusClass(children)}`}>{children}</span>;

function Avatar({ name }) {
  return <div className="avatar avatar-indigo">{(name || 'NA').split(' ').slice(0, 2).map(x => x[0]).join('').toUpperCase()}</div>;
}

function Table({ headers, rows, empty = 'Nothing to show' }) {
  if (!rows.length) return <p className="empty-note">{empty}</p>;
  return (
    <div className="table-scroll data-table">
      <table>
        <thead><tr>{headers.map(h => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------ customers list
export function CustomersPage({ customers, bookings, role, search, project, onOpen, onAdd, onApprove, onReject, onWhatsApp }) {
  const rows = customers.filter(c => {
    // A customer belongs to a project if it was added for it, or has a booking in it.
    const inProject = project === 'All projects'
      || c.project === project
      || bookings.some(b => b[2] === project && (c.id != null && b[11] != null ? b[11] === c.id : b[1] === c.name));
    return inProject && Object.values(c).join(' ').toLowerCase().includes(search.toLowerCase());
  });
  const pending = rows.filter(c => c.status === 'Pending Approval').length;

  return (
    <>
      <div className="mini-stats four">
        <div className="mini-stat"><small>TOTAL CUSTOMERS</small><b>{rows.length}</b></div>
        <div className="mini-stat"><small>APPROVED</small><b className="green-text">{rows.filter(c => c.status === 'Approved').length}</b></div>
        <div className="mini-stat"><small>AWAITING ADMIN APPROVAL</small><b className="amber-text">{pending}</b></div>
        <div className="mini-stat"><small>WITH ACTIVE PLOTS</small><b>{new Set(bookings.filter(b => b[7] !== 'Rejected' && (project === 'All projects' || b[2] === project)).map(b => b[1])).size}</b></div>
      </div>

      <div className="panel section-panel">
        <div className="crud-heading">
          <div>
            <h2>Customer directory</h2>
            <p>{canCreateCustomer(role) ? 'You can add customers; the admin approves each one.' : 'New customers are created by sales agents and approved by the admin.'}</p>
          </div>
          {canCreateCustomer(role) && (
            <button className="button button-primary small-btn" onClick={onAdd}><Plus size={13} /> Add Customer</button>
          )}
        </div>
        <Table
          headers={['CUSTOMER', 'MOBILE', 'PLOTS', 'AGENT', 'STATUS', 'ACTIONS']}
          empty="No customers yet"
          rows={rows.map(c => [
            <div className="customer-cell"><Avatar name={c.name} /><b>{c.name}</b></div>,
            c.mobile,
            bookings.filter(b => b[1] === c.name && b[7] !== 'Rejected').map(b => b[3]).join(', ') || '—',
            c.agent,
            <StatusBadge>{c.status}</StatusBadge>,
            <div className="row-actions">
              <button className="icon-action" title="Open profile" onClick={() => onOpen(c)}><Eye size={14} /></button>
              <button className="icon-action wa-icon" title="WhatsApp" onClick={() => onWhatsApp(c)}><MessageCircle size={14} /></button>
              {canApprove(role) && c.status === 'Pending Approval' && (
                <>
                  <button className="button button-primary small-btn" onClick={() => onApprove(c)}><Check size={12} /> Approve</button>
                  <button className="button button-white small-btn" onClick={() => onReject(c)}><XIcon size={12} /> Reject</button>
                </>
              )}
            </div>
          ])}
        />
      </div>
    </>
  );
}

// ------------------------------------------------- profile (staff + portal)
export function CustomerProfile({
  customer, bookings, pays, receipts, registry, portal, role,
  onRegistry, onOpenBill, onPrintBooking, notify
}) {
  const mine = bookings.filter(b => b[1] === customer.name && b[7] !== 'Rejected');
  const ledger = pays.filter(p => p[0] === customer.name);
  const bills = receipts.filter(r => r.customer === customer.name && (!portal || r.shared));
  const total = mine.reduce((s, b) => s + parseAmt(b[5]), 0);
  const paid = mine.reduce((s, b) => s + parseAmt(b[6]), 0);
  const agentName = mine[0]?.[8] || customer.agent;

  return (
    <div className="customer-detail">
      <div className="panel customer-summary">
        <Avatar name={customer.name} />
        <div>
          <span className="eyebrow">{portal ? 'MY ACCOUNT' : 'CUSTOMER PROFILE'}</span>
          <h2>{customer.name}</h2>
          <p>{customer.mobile} · {customer.email || 'no email'} · {customer.address || 'no address'}</p>
        </div>
        {portal && <span className="view-only-tag">VIEW ONLY</span>}
        {!portal && (
          <button className="button whatsapp-btn" onClick={() => openWhatsApp(customer.mobile, `Hello ${customer.name}, this is ${COMPANY.name} regarding your plot booking.`)}>
            <MessageCircle size={14} /> WhatsApp
          </button>
        )}
      </div>

      <div className="mini-stats four" style={{ marginTop: 14 }}>
        <div className="mini-stat"><small>PLOTS OWNED / BOOKED</small><b>{mine.length}</b></div>
        <div className="mini-stat"><small>TOTAL VALUE</small><b>₹{fmtINR(total)}</b></div>
        <div className="mini-stat"><small>PAID</small><b className="green-text">₹{fmtINR(paid)}</b></div>
        <div className="mini-stat"><small>PENDING</small><b className="amber-text">₹{fmtINR(total - paid)}</b></div>
      </div>

      <h3 className="sheet-h">{portal ? 'My plots & registry status' : 'Plots & registry status'}</h3>
      {mine.length === 0 && <p className="empty-note panel">No plots booked yet.</p>}
      <div className="portal-grid">
        {mine.map(b => {
          const reg = registry[b[0]] || 'Not started';
          const idx = Math.max(0, REGISTRY_STEPS.indexOf(reg));
          const pct = parseAmt(b[5]) ? Math.min(100, Math.round(parseAmt(b[6]) / parseAmt(b[5]) * 100)) : 0;
          return (
            <article className="panel plot-card" key={b[0]}>
              <div className="panel-head">
                <div><h3>Plot {b[3]}</h3><p>{b[2]} · {b[0]}</p></div>
                <StatusBadge>{b[7]}</StatusBadge>
              </div>
              <div className="pay-bar"><span style={{ width: `${pct}%` }} /></div>
              <div className="pay-nums">
                <div><small>Final price</small><b>₹{b[5]}</b></div>
                <div><small>Paid ({pct}%)</small><b className="green-text">₹{b[6]}</b></div>
                <div><small>Pending</small><b className="amber-text">₹{fmtINR(parseAmt(b[5]) - parseAmt(b[6]))}</b></div>
              </div>
              <div className="reg-steps" title={reg}>{REGISTRY_STEPS.map((s, i) => <i key={s} className={i <= idx && reg !== 'Not started' ? 'done' : ''} />)}</div>
              <div className="reg-label">
                <b>Registry:</b>{' '}
                {!portal && isAdmin(role) ? (
                  <select value={reg} onChange={e => onRegistry(b[0], e.target.value)}>
                    {REGISTRY_STEPS.map(s => <option key={s}>{s}</option>)}
                  </select>
                ) : reg}
              </div>
              <div className="row-actions" style={{ marginTop: 10 }}>
                <button className="button button-white small-btn" onClick={() => onPrintBooking(b)}><Printer size={12} /> Booking form</button>
              </div>
            </article>
          );
        })}
      </div>

      <div className="overview-grid" style={{ marginTop: 14 }}>
        <div className="panel">
          <div className="panel-head"><div><h2>Pending payments</h2><p>Balance due on each plot</p></div></div>
          {ledger.filter(p => p[5] !== '0').length === 0 && <p className="empty-note">Nothing pending. All dues are clear.</p>}
          {ledger.filter(p => p[5] !== '0').map(p => (
            <div className="due-row" key={p[1]}>
              <div><b>Plot {p[1]}</b><br /><small>Next due: {p[6]}</small></div>
              <div><b>₹{p[5]}</b></div>
              <StatusBadge>{p[7]}</StatusBadge>
            </div>
          ))}
        </div>

        <div className="panel">
          <div className="panel-head"><div><h2>Bills &amp; receipts</h2><p>{portal ? 'Receipts shared with you' : 'All receipts issued'}</p></div></div>
          {bills.length === 0 && <p className="empty-note">No bills yet.</p>}
          {bills.map(r => (
            <div className="due-row" key={r.no}>
              <div><b>{r.no}</b><br /><small>{r.date} · Plot {r.plot} · {r.mode}</small></div>
              <div><b>₹{r.amount}</b></div>
              <button className="icon-action" title="View / print bill" onClick={() => onOpenBill(r)}><Eye size={14} /></button>
            </div>
          ))}
        </div>
      </div>

      {portal && (
        <div className="panel contact-card">
          <div><b>Need help?</b><br /><small>Your property consultant: {agentName}</small></div>
          <button className="button whatsapp-btn" onClick={() => openWhatsApp('9876500001', `Hello, I am ${customer.name}. I have a question about my plot.`)}>
            <MessageCircle size={14} /> WhatsApp office
          </button>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------ documents page
export function DocumentsPage({ docs, notify, onOpenDocument }) {
  return (
    <div className="panel section-panel">
      <div className="panel-head">
        <div><h2>Documents</h2><p>Generated from bookings and receipts</p></div>
      </div>
      {docs.length === 0 && <p className="empty-note">No documents available.</p>}
      <div className="documents-list">
        {docs.map(d => (
          <div className="document-row" key={d.key}>
            <FileText size={18} className="indigo-text" />
            <div><b>{d.title}</b><small>{d.sub}</small></div>
            <span className="doc-date">{d.date}</span>
            <StatusBadge>{d.kind}</StatusBadge>
            <button
              className="icon-action"
              title="Open"
              onClick={() => (onOpenDocument
                ? onOpenDocument(d)
                : (d.open ? d.open() : notify(`${d.title} will be issued at the ${d.kind.toLowerCase()} stage.`)))}
            >
              <Eye size={14} />
            </button>
            {(onOpenDocument || d.open) && (
              <button className="icon-action" title="Print / Save as PDF" onClick={onOpenDocument ? () => onOpenDocument(d) : d.open}>
                <Download size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
