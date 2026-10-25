import React, { useEffect, useMemo, useState } from 'react';
import { X, ChevronRight } from 'lucide-react';
import { api, actions, hasSession } from '../../api';
import { PlanBreakdown } from '../projects/PlanBreakdown';
import { parseAmt, fmtINR, isAdmin, isValidMobile, normaliseMobile, MOBILE_HINT } from '../../utils';
import { limitMobile, MOBILE_INPUT } from '../../utils/phone';

function Shell({ kicker, title, sub, close, children, wide = false }) {
  return (
    <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && close()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`.trim()}>
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
export function BookingModal({ role, agentName, customers, plots, projects = [], close, save, preset }) {
  // The agents this tenant really has (taken from its own customers).
  const fromCustomers = [...new Set(customers.map((c) => c.agent).filter(Boolean))].sort();
  const agentOptions = fromCustomers;
  const agentMode = role === 'SALES AGENT';
  const priceLocked = !isAdmin(role);   // the server enforces the same rule: only an approver can set a different price
  // Live data is already limited to the agent's own customers by the server; offline we match by name.
  const myCustomers = customers.filter(c => c.status === 'Approved' && (!agentMode || hasSession() || c.agent === agentName));
  // Chosen by id: two customers can share a name (e.g. one removed and added again).
  const keyOf = (c) => String(c.id ?? c.name);
  const [customerKey, setCustomerKey] = useState(myCustomers[0] ? keyOf(myCustomers[0]) : '');
  const chosen = myCustomers.find((c) => keyOf(c) === customerKey) || null;
  const customer = chosen?.name || '';
  const [project, setProject] = useState(preset?.project || projects[0]?.[0] || '');
  const free = useMemo(() => plots.filter(p => p[8] === project && p[5] === 'AVAILABLE'), [plots, project]);
  const [plotNo, setPlotNo] = useState(preset?.plot || '');
  const selected = free.find(p => p[0] === plotNo) || free[0];
  const [price, setPrice] = useState('');
  const [error, setError] = useState('');

  // The project's payment schemes (the brochure's "outright / 6 months EMI / 44 months …"), and what the chosen
  // one works out to on this plot. Everything — price, amount due at booking, schedule — comes from them.
  const projectId = projects.find(p => p[0] === project)?.[6];
  const [plans, setPlans] = useState([]);
  const [planId, setPlanId] = useState('');
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState('');
  const [tokenEdit, setTokenEdit] = useState(null);
  useEffect(() => {
    setPlans([]); setPlanId(''); setQuote(null);
    if (typeof projectId !== 'number' || !hasSession()) return undefined;
    let live = true;
    actions.projectPlans(projectId).then((r) => {
      if (!live) return;
      setPlans((r.data || []).filter(p => p.is_active));   // offered, never forced: the booking starts with no scheme
    }).catch(() => {});
    return () => { live = false; };
  }, [projectId]);
  const plotApiId = selected?.[9];
  useEffect(() => {
    setQuote(null); setQuoteError(''); setTokenEdit(null);
    if (!planId || typeof plotApiId !== 'number') return undefined;
    let live = true;
    actions.quotePlan({ plan_id: Number(planId), plot_id: plotApiId })
      .then((r) => { if (live) setQuote(r.data); })
      .catch((e) => { if (live) setQuoteError(e.message); });
    return () => { live = false; };
  }, [planId, plotApiId]);
  const hasPlans = plans.length > 0;
  const plan = plans.find(p => String(p.id) === planId);

  const finalPrice = price || (plan ? (quote ? fmtINR(Number(quote.total_payable)) : '') : (selected?.[10] ?? selected?.[4])) || '';
  const tokenValue = tokenEdit ?? (plan ? (quote ? fmtINR(Number(quote.upfront_total)) : '') : '');

  function submit(e) {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget));
    if (!customer) return setError('Select an approved customer first. Agents add customers from the Customers page.');
    if (!selected) return setError('No available plot in this project.');
    if (plan && !quote) return setError(quoteError || 'Wait for the payment scheme to be calculated.');
    if (parseAmt(finalPrice) <= 0) return setError('Enter the final price.');
    if (parseAmt(tokenValue) > parseAmt(finalPrice)) return setError('The amount paid at booking cannot exceed the final price.');
    save({
      customer, customerId: typeof chosen?.id === 'number' ? chosen.id : undefined, project, plot: selected[0], amount: fmtINR(parseAmt(finalPrice)), paid: fmtINR(parseAmt(tokenValue)),
      mode: d.mode || 'UPI', txn: (d.txn || '').trim(), plan: plan?.name || 'Standard', planId: plan ? plan.id : undefined, agent: agentMode ? agentName : d.agent,
    });
  }

  return (
    <Shell
      kicker="ERP · BOOKINGS"
      title="Create Sales Booking"
      sub={agentMode ? 'Your booking is sent to the admin for approval. The plot is held until then.' : 'Admin bookings are confirmed immediately.'}
      close={close}
      wide={Boolean(plan)}
    >
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="Customer" hint={agentMode ? 'Only your approved customers' : undefined}>
            <select value={customerKey} onChange={e => setCustomerKey(e.target.value)}>
              {myCustomers.length === 0 && <option value="">No approved customers</option>}
              {myCustomers.map(c => <option key={keyOf(c)} value={keyOf(c)}>{c.name} · {c.mobile}</option>)}
            </select>
          </Field>
          <Field label="Project">
            <select value={project} onChange={e => { setProject(e.target.value); setPlotNo(''); setPrice(''); }}>
              {projects.map(p => <option key={p[0]}>{p[0]}</option>)}
            </select>
          </Field>
          <Field label="Plot (available)" hint={selected ? `${selected[2]} sq.ft · ${selected[3]} facing · ₹${selected[10] ?? selected[4]}${selected[11] > 0 ? ` (incl. ₹${fmtINR(selected[11])} premium)` : ''}` : undefined}>
            <select value={selected?.[0] || ''} onChange={e => { setPlotNo(e.target.value); setPrice(''); }}>
              {free.length === 0 && <option value="">No available plots in this project — the admin adds plots under Projects &amp; plots → Add Plots</option>}
              {free.map(p => <option key={p[0]} value={p[0]}>{p[0]} · ₹{p[10] ?? p[4]}</option>)}
            </select>
          </Field>
          <Field label="Final price for customer (₹)" hint={priceLocked ? (plan ? 'Fixed by the payment scheme — only the admin can change it' : 'Fixed at the plot\'s listed price — only the admin can change it') : undefined}>
            <input value={finalPrice} onChange={e => setPrice(e.target.value)} inputMode="numeric" readOnly={priceLocked} />
          </Field>
          <Field label={plan ? 'Due at booking (₹)' : 'Amount paid at booking (₹)'} hint={plan ? (priceLocked ? 'Application fee + enrollment + allotment of the chosen scheme' : 'Application fee + enrollment + allotment (admin may adjust)') : undefined}>
            <input name="paid" value={tokenValue} onChange={e => setTokenEdit(e.target.value)} inputMode="numeric" readOnly={Boolean(plan) && priceLocked} placeholder="0" />
          </Field>
          <Field label="Payment mode" hint="Shown on the payment receipt">
            <select name="mode" defaultValue="UPI">{['UPI', 'NEFT', 'RTGS', 'Cheque', 'Cash', 'Card'].map(x => <option key={x}>{x}</option>)}</select>
          </Field>
          <Field label="Transaction details" hint="UPI / bank transaction id or cheque number — shown on the receipt">
            <input name="txn" maxLength={80} placeholder="e.g. TXN123456" />
          </Field>
          {hasPlans ? (
            <Field label="Payment scheme (optional)" hint={plan ? 'Every amount below follows this scheme' : 'Only choose a scheme if the customer wants one; otherwise the plot is booked at its full price.'}>
              <select value={planId} onChange={e => { setPlanId(e.target.value); setPrice(''); }}>
                <option value="">No payment scheme — full price</option>
                {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
          ) : (
            <Field label="Payment scheme" hint="This project has no payment scheme yet — the admin sets them from the project's wallet icon. The plot is booked at its full price.">
              <input value="Standard (full price)" readOnly />
            </Field>
          )}
          {agentMode ? (
            <Field label="Sales agent"><input value={agentName} readOnly /></Field>
          ) : (
            <Field label="Sales agent">
              <select name="agent" defaultValue={agentOptions[0] || ''}>{agentOptions.map(name => <option key={name}>{name}</option>)}</select>
            </Field>
          )}
        </div>
        {plan && quoteError && <p className="form-error">{quoteError}</p>}
        {plan && quote && <PlanBreakdown quote={quote} />}
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
    <Shell kicker="ERP · ACCOUNTS" title="Record Customer Payment" sub="Select the plot. A bill (office + customer copy) is generated after saving." close={close}>
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
          <Field label="Transaction details" hint="UPI / bank transaction id or cheque number — shown on the receipt"><input name="reference" maxLength={80} placeholder="e.g. TXN123456" /></Field>
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
export function CustomerModal({ agentName, byAdmin = false, customers, projects = [], defaultProject = '', close, save }) {
  const [error, setError] = useState('');
  const [agents, setAgents] = useState([]);                 // the admin may tag the customer to an agent
  useEffect(() => {
    if (!byAdmin || !hasSession()) return;
    api.agents.list({ page_size: 200 }).then((r) => setAgents((r.data || []).filter((a) => a.is_active !== false))).catch(() => {});
  }, [byAdmin]);
  function submit(e) {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget));
    if (!isValidMobile(d.mobile)) return setError(MOBILE_HINT);
    const mobile = normaliseMobile(d.mobile);
    if (customers.some(c => c.mobile === mobile)) return setError('A customer with this mobile number already exists.');
    if (projects.length && !d.project) return setError('Choose the project this customer is for.');
    save({ name: d.name.trim(), mobile, email: d.email.trim(), address: d.address.trim(), agent: byAdmin ? '' : agentName, agentCode: byAdmin ? (d.agent || '') : '', project: d.project || '' });
  }
  return (
    <Shell kicker="ERP · CUSTOMERS" title="Add New Customer" sub={byAdmin ? 'Added by the admin: the customer is approved straight away.' : 'Sales agents add customers. The admin approves every new customer.'} close={close}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="Full name"><input name="name" required placeholder="Full name" /></Field>
          <Field label="Mobile (WhatsApp)"><input name="mobile" required {...MOBILE_INPUT} onInput={(e) => { e.target.value = limitMobile(e.target.value); }} placeholder="10-digit mobile number" /></Field>
          <Field label="Email"><input name="email" type="email" required placeholder="E-mail address" /></Field>
          {byAdmin ? (
            <Field label="Sales agent (optional)">
              <select name="agent" defaultValue="">
                <option value="">No agent</option>
                {agents.map((a) => <option key={a.id} value={a.code}>{a.name} ({a.code})</option>)}
              </select>
            </Field>
          ) : <Field label="Sales agent"><input value={agentName} readOnly /></Field>}
          {projects.length > 0 && (
            <Field label="Project">
              <select name="project" defaultValue={defaultProject}>
                <option value="">Select project…</option>
                {projects.map((p) => <option key={p[0]} value={p[0]}>{p[0]}</option>)}
              </select>
            </Field>
          )}
          <Field label="Address" wide><input name="address" placeholder="Area, City" /></Field>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button button-white" onClick={close}>Cancel</button>
          <button type="submit" className="button button-primary">{byAdmin ? 'Add Customer' : 'Submit for Approval'} <ChevronRight size={14} /></button>
        </div>
      </form>
    </Shell>
  );
}
