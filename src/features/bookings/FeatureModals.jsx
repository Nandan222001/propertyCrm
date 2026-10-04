import React, { useMemo, useState } from 'react';
import { X, ChevronRight } from 'lucide-react';
import { projects, agents } from '../../data/seedData';
import { parseAmt, fmtINR, isAdmin } from '../../utils';

function Shell({ kicker, title, sub, close, children }) {
  return (
    <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && close()}>
      <div className="modal">
        <div className="modal-head">
          <div>
            <span className="modal-kicker">{kicker}</span>
            <h2>{title}</h2>
            <p>{sub}</p>
          </div>
          <button className="modal-close" onClick={close}><X size={17} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

const Field = ({ label, children, hint, wide }) => (
  <label className={wide ? 'span-2' : ''}>
    {label}
    {children}
    {hint && <small className="field-hint">{hint}</small>}
  </label>
);

// ---------------------------------------------------------------- booking
export function BookingModal({ role, agentName, customers, plots, close, save, preset }) {
  const agentMode = role === 'SALES AGENT';
  const myCustomers = customers.filter(c => c.status === 'Approved' && (!agentMode || c.agent === agentName));
  const [customer, setCustomer] = useState(myCustomers[0]?.name || '');
  const [project, setProject] = useState(preset?.project || projects[0][0]);
  const free = useMemo(() => plots.filter(p => p[8] === project && p[5] === 'AVAILABLE'), [plots, project]);
  const [plotNo, setPlotNo] = useState(preset?.plot || '');
  const selected = free.find(p => p[0] === plotNo) || free[0];
  const [price, setPrice] = useState('');
  const [error, setError] = useState('');

  const finalPrice = price || selected?.[4] || '';

  function submit(e) {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget));
    if (!customer) return setError('Select an approved customer first. Agents add customers from the Customers page.');
    if (!selected) return setError('No available plot in this project.');
    if (parseAmt(finalPrice) <= 0) return setError('Enter the final price.');
    if (parseAmt(d.paid) > parseAmt(finalPrice)) return setError('Token advance cannot exceed the final price.');
    save({ customer, project, plot: selected[0], amount: fmtINR(parseAmt(finalPrice)), paid: fmtINR(parseAmt(d.paid)), plan: d.plan, agent: agentMode ? agentName : d.agent });
  }

  return (
    <Shell
      kicker="Lalita ERP · BOOKINGS"
      title="Create Sales Booking"
      sub={agentMode ? 'Your booking is sent to the admin for approval. The plot is held until then.' : 'Admin bookings are confirmed immediately.'}
      close={close}
    >
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="Customer" hint={agentMode ? 'Only your approved customers' : undefined}>
            <select value={customer} onChange={e => setCustomer(e.target.value)}>
              {myCustomers.length === 0 && <option value="">No approved customers</option>}
              {myCustomers.map(c => <option key={c.id} value={c.name}>{c.name} · {c.mobile}</option>)}
            </select>
          </Field>
          <Field label="Project">
            <select value={project} onChange={e => { setProject(e.target.value); setPlotNo(''); setPrice(''); }}>
              {projects.map(p => <option key={p[0]}>{p[0]}</option>)}
            </select>
          </Field>
          <Field label="Plot (available)" hint={selected ? `${selected[2]} sq.ft · ${selected[3]} facing · list ₹${selected[4]}` : undefined}>
            <select value={selected?.[0] || ''} onChange={e => { setPlotNo(e.target.value); setPrice(''); }}>
              {free.length === 0 && <option value="">No available plots</option>}
              {free.map(p => <option key={p[0]} value={p[0]}>{p[0]} · ₹{p[4]}</option>)}
            </select>
          </Field>
          <Field label="Final price for customer (₹)">
            <input value={finalPrice} onChange={e => setPrice(e.target.value)} inputMode="numeric" />
          </Field>
          <Field label="Token advance (₹)">
            <input name="paid" defaultValue="2,00,000" inputMode="numeric" />
          </Field>
          <Field label="Installment plan">
            <select name="plan" defaultValue="12 monthly installments">
              {['12 monthly installments', '6 monthly installments', 'Paid in full'].map(x => <option key={x}>{x}</option>)}
            </select>
          </Field>
          {agentMode ? (
            <Field label="Sales agent"><input value={agentName} readOnly /></Field>
          ) : (
            <Field label="Sales agent">
              <select name="agent" defaultValue={agents[0][0]}>{agents.map(a => <option key={a[0]}>{a[0]}</option>)}</select>
            </Field>
          )}
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button button-white" onClick={close}>Cancel</button>
          <button type="submit" className="button button-primary">
            {isAdmin(role) ? 'Confirm Booking' : 'Submit for Approval'} <ChevronRight size={14} />
          </button>
        </div>
      </form>
    </Shell>
  );
}

// ---------------------------------------------------------------- payment
export function PaymentModal({ bookings, pays, close, save }) {
  const open = bookings.filter(b => b[7] !== 'Pending Approval' && b[7] !== 'Rejected');
  const [sel, setSel] = useState(open[0]?.[0] || '');
  const b = open.find(x => x[0] === sel);
  const [price, setPrice] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  const finalPrice = parseAmt(price || b?.[5]);
  const paidBefore = b ? parseAmt(b[6]) : 0;
  const balanceBefore = finalPrice - paidBefore;
  const balanceAfter = balanceBefore - parseAmt(amount);

  function pick(id) { setSel(id); setPrice(''); setAmount(''); setError(''); }

  function submit(e) {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget));
    if (!b) return setError('Select a plot.');
    if (finalPrice <= 0) return setError('Enter the final price.');
    if (finalPrice < paidBefore) return setError('Final price cannot be below the amount already paid.');
    if (parseAmt(amount) <= 0) return setError('Enter the amount received.');
    if (parseAmt(amount) > balanceBefore) return setError(`Amount exceeds the balance of ₹${fmtINR(balanceBefore)}.`);
    save({ booking: b, finalPrice, amount: parseAmt(amount), mode: d.mode, reference: d.reference, due: d.due });
  }

  return (
    <Shell kicker="Lalita ERP · ACCOUNTS" title="Record Customer Payment" sub="Select the plot. A bill (office + customer copy) is generated after saving." close={close}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="Plot" wide>
            <select value={sel} onChange={e => pick(e.target.value)}>
              {open.length === 0 && <option value="">No bookings available</option>}
              {open.map(x => <option key={x[0]} value={x[0]}>{x[3]} · {x[1]} · {x[2]}</option>)}
            </select>
          </Field>
          <Field label="Customer"><input value={b?.[1] || ''} readOnly /></Field>
          <Field label="Project"><input value={b?.[2] || ''} readOnly /></Field>
          <Field label="Final price for customer (₹)" hint="Agreed price; updates the booking if changed">
            <input value={price || b?.[5] || ''} onChange={e => setPrice(e.target.value)} inputMode="numeric" />
          </Field>
          <Field label="Already paid (₹)"><input value={fmtINR(paidBefore)} readOnly /></Field>
          <Field label="Amount received now (₹)" hint={`Balance before: ₹${fmtINR(balanceBefore)}`}>
            <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="numeric" placeholder="2,00,000" />
          </Field>
          <Field label="Balance after this payment (₹)"><input value={fmtINR(Math.max(balanceAfter, 0))} readOnly /></Field>
          <Field label="Payment mode">
            <select name="mode" defaultValue="UPI">{['UPI', 'NEFT', 'Cheque', 'Cash', 'Card'].map(x => <option key={x}>{x}</option>)}</select>
          </Field>
          <Field label="Reference / cheque no."><input name="reference" placeholder="TXN123456" /></Field>
          <Field label="Next due date"><input name="due" type="date" /></Field>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button button-white" onClick={close}>Cancel</button>
          <button type="submit" className="button button-primary">Record &amp; Generate Bill <ChevronRight size={14} /></button>
        </div>
      </form>
    </Shell>
  );
}

// --------------------------------------------------------------- customer
export function CustomerModal({ agentName, customers, close, save }) {
  const [error, setError] = useState('');
  function submit(e) {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget));
    const mobile = d.mobile.replace(/\D/g, '').slice(-10);
    if (mobile.length !== 10) return setError('Enter a valid 10-digit mobile number.');
    if (customers.some(c => c.mobile === mobile)) return setError('A customer with this mobile number already exists.');
    save({ name: d.name.trim(), mobile, email: d.email.trim(), address: d.address.trim(), agent: agentName });
  }
  return (
    <Shell kicker="Lalita ERP · CUSTOMERS" title="Add New Customer" sub="Only sales agents add customers. The admin approves every new customer." close={close}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="Full name"><input name="name" required placeholder="Neha Kapoor" /></Field>
          <Field label="Mobile (WhatsApp)"><input name="mobile" required inputMode="tel" placeholder="98765 43210" /></Field>
          <Field label="Email"><input name="email" type="email" placeholder="name@email.com" /></Field>
          <Field label="Sales agent"><input value={agentName} readOnly /></Field>
          <Field label="Address" wide><input name="address" placeholder="Area, City" /></Field>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button button-white" onClick={close}>Cancel</button>
          <button type="submit" className="button button-primary">Submit for Approval <ChevronRight size={14} /></button>
        </div>
      </form>
    </Shell>
  );
}
