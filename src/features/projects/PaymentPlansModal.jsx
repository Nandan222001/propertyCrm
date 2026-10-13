import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ModalShell } from '../../components/common/ModalShell';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { Badge } from '../../components/common/Badge';
import { actions } from '../../api';
import { fmtINR, parseAmt } from '../../utils';
import { PlanBreakdown } from './PlanBreakdown';

const KINDS = [
  ['OUTRIGHT', 'Outright — the whole balance in one payment within some days'],
  ['EMI', 'EMI — the balance in equal monthly instalments'],
  ['EMI_SPECIAL', 'EMI with special EMIs — regular EMIs plus larger ones in chosen months'],
];
const BLANK = {
  name: '', kind: 'EMI', application_fee: '', enrollment_fee: '', allotment_amount: '', discount_percent: '',
  outright_days: '30', emi_count: '', special_count: '', special_percent: '', special_months: '', is_active: true,
};

const toForm = (p) => ({
  name: p.name, kind: p.kind, application_fee: String(Number(p.application_fee) || ''), enrollment_fee: String(Number(p.enrollment_fee) || ''),
  allotment_amount: String(Number(p.allotment_amount) || ''), discount_percent: String(Number(p.discount_percent) || ''),
  outright_days: p.outright_days ? String(p.outright_days) : '30', emi_count: p.emi_count ? String(p.emi_count) : '',
  special_count: p.special_count ? String(p.special_count) : '', special_percent: p.special_percent ? String(Number(p.special_percent)) : '',
  special_months: (p.special_months || []).join(', '), is_active: p.is_active,
});

const toBody = (f) => {
  const num = (v) => (String(v).trim() === '' ? 0 : parseAmt(v));
  const body = {
    name: f.name.trim(), kind: f.kind, application_fee: num(f.application_fee), enrollment_fee: num(f.enrollment_fee),
    allotment_amount: num(f.allotment_amount), discount_percent: Number(f.discount_percent) || 0, is_active: f.is_active,
  };
  if (f.kind === 'OUTRIGHT') body.outright_days = Number(f.outright_days) || undefined;
  else body.emi_count = Number(f.emi_count) || undefined;
  if (f.kind === 'EMI_SPECIAL') {
    body.special_count = Number(f.special_count) || undefined;
    body.special_percent = Number(f.special_percent) || undefined;
    body.special_months = String(f.special_months).split(/[\s,]+/).filter(Boolean).map(Number);
  }
  return body;
};

/** A ready-made answer for "which EMI numbers are special": `count` numbers spread evenly across 1..total. */
const suggestMonths = (count, total) => {
  if (!(count >= 1) || !(total >= count)) return [];
  const step = total / count;
  const months = Array.from({ length: count }, (_, i) => Math.min(total, Math.max(1, Math.round((i + 1) * step))));
  return [...new Set(months)].length === count ? months : Array.from({ length: count }, (_, i) => total - count + 1 + i);
};
const parseMonths = (text) => String(text).split(/[\s,]+/).filter(Boolean).map(Number);

/** What is still missing before the scheme can be calculated (checked here so the server is only asked when it can answer). */
const missingFor = (f) => {
  if (f.kind === 'OUTRIGHT') return Number(f.outright_days) >= 1 ? '' : 'enter within how many days the balance is paid.';
  const emis = Number(f.emi_count);
  if (!(emis >= 1)) return 'enter the number of monthly EMIs.';
  if (f.kind !== 'EMI_SPECIAL') return '';
  const count = Number(f.special_count);
  if (!(count >= 1 && count <= emis)) return `enter how many special EMIs there are (1 to ${emis}).`;
  const share = Number(f.special_percent);
  if (!(share > 0 && share < 100)) return 'enter the share of the balance paid as special EMIs (between 0 and 100).';
  const months = parseMonths(f.special_months);
  if (months.length !== count || new Set(months).size !== count || months.some((m) => !(m >= 1 && m <= emis))) {
    return `choose exactly ${count} different EMI numbers between 1 and ${emis} for the special EMIs.`;
  }
  return '';
};

const summary = (p) => {
  const bits = [];
  if (p.kind === 'OUTRIGHT') bits.push(`balance within ${p.outright_days} days`);
  else bits.push(`${p.emi_count} monthly EMIs`);
  if (p.kind === 'EMI_SPECIAL') bits.push(`${p.special_count} special EMIs`);
  if (Number(p.discount_percent) > 0) bits.push(`${Number(p.discount_percent)}% discount`);
  return bits.join(' · ');
};

/** Admin: the payment schemes of one project — the brochure's "Outright / 6 months EMI / 44 months …" choices. */
export function PaymentPlansModal({ project, plots = [], close, notify }) {
  const projectId = project[6];
  const [plans, setPlans] = useState(null);
  const [editing, setEditing] = useState(null);          // null = list, 'new' or a plan
  const [form, setForm] = useState(BLANK);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [sample, setSample] = useState('');               // plot apiId, or '' = custom price
  const [samplePrice, setSamplePrice] = useState('');
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState('');
  const myPlots = useMemo(() => plots.filter((p) => p[8] === project[0] && typeof p[9] === 'number'), [plots, project]);
  useEffect(() => { if (!sample && myPlots.length && samplePrice === '') setSample(String(myPlots[0][9])); }, [myPlots]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    try { setPlans((await actions.projectPlans(projectId)).data || []); }
    catch (e) { setPlans([]); setError(e.message); }
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const open = (plan) => { setEditing(plan); setForm(plan === 'new' ? BLANK : toForm(plan)); setError(''); setQuote(null); };

  // Live preview: the same calculation the booking will use, on a sample plot or price.
  useEffect(() => {
    if (!editing) return undefined;
    const price = sample ? undefined : parseAmt(samplePrice);
    const missing = missingFor(form);
    if (missing) { setQuote(null); setQuoteError(missing); return undefined; }
    if (!sample && !(price > 0)) { setQuote(null); setQuoteError('pick a sample plot or type a plot price.'); return undefined; }
    const timer = setTimeout(async () => {
      try {
        const body = { plan: toBody(form), ...(sample ? { plot_id: Number(sample) } : { price }) };
        setQuote((await actions.quotePlan(body)).data); setQuoteError('');
      } catch (e) { setQuote(null); setQuoteError(e.message); }
    }, 450);
    return () => clearTimeout(timer);
  }, [editing, form, sample, samplePrice]);

  const wantCount = Number(form.special_count) || 0;
  const wantTotal = Number(form.emi_count) || 0;
  const enteredMonths = parseMonths(form.special_months);
  const suggested = suggestMonths(wantCount, wantTotal);
  const monthsOk = wantCount > 0 && enteredMonths.length === wantCount && new Set(enteredMonths).size === wantCount
    && enteredMonths.every((m) => m >= 1 && m <= wantTotal);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const body = toBody(form);
      if (editing === 'new') await actions.createPlan(projectId, body); else await actions.updatePlan(editing.id, body);
      notify(`Payment scheme ${body.name} saved`);
      setEditing(null); await load();
    } catch (err) { setError(err.message || 'Could not save the scheme.'); }
    setBusy(false);
  };

  const toggle = async (plan) => {
    try { await actions.updatePlan(plan.id, { is_active: !plan.is_active }); await load(); }
    catch (err) { notify(err.message); }
  };

  return (
    <ModalShell title={`Payment schemes · ${project[0]}`} subtitle="The ways a customer can pay for a plot in this project. Agents choose one when booking; every amount comes from here." onClose={close} wide>
      {editing === null && (
        <>
          {plans === null && <p className="empty-note">Loading…</p>}
          {plans && plans.length === 0 && <p className="empty-note">No payment scheme yet. Add the schemes from your brochure — an outright scheme, an EMI scheme, and so on. You choose every number: how many EMIs, the fees, the discount.</p>}
          <div className="plan-list">
            {(plans || []).map((p) => (
              <div className="plan-card" key={p.id}>
                <div>
                  <b>{p.name}</b> <Badge>{p.is_active ? 'Active' : 'Hidden'}</Badge>
                  <p className="muted-text">{summary(p)}</p>
                  <p className="muted-text">Due at booking: ₹{fmtINR(Number(p.application_fee) + Number(p.enrollment_fee) + Number(p.allotment_amount))}</p>
                </div>
                <div className="table-actions-cell">
                  <button type="button" className="button button-white small-btn" onClick={() => toggle(p)}>{p.is_active ? 'Hide' : 'Show'}</button>
                  <button type="button" className="button button-white small-btn" onClick={() => open(p)}>Edit</button>
                  <button type="button" className="button button-white small-btn" onClick={() => setRemoving(p)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
          {error && <p className="form-error">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="button button-white" onClick={close}>Close</button>
            <button type="button" className="button button-primary" onClick={() => open('new')}>+ Add scheme</button>
          </div>
        </>
      )}

      {editing !== null && (
        <form onSubmit={save} noValidate>
          <div className="form-grid">
            <label className="span-2">Scheme name<input value={form.name} onChange={set('name')} placeholder="e.g. 6 Months EMI Scheme" autoFocus />
              <small className="field-hint">The name agents and customers see when choosing how to pay.</small></label>
            <label className="span-2">How is the balance paid?
              <select value={form.kind} onChange={set('kind')}>{KINDS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
              <small className="field-hint">The balance is the plot price minus the enrollment and allotment amounts below.</small></label>
            <label>Application fee (₹) — extra<input value={form.application_fee} onChange={set('application_fee')} inputMode="numeric" placeholder="e.g. 500" />
              <small className="field-hint">Charged on top of the plot price. Leave blank for none.</small></label>
            <label>Enrollment (₹)<input value={form.enrollment_fee} onChange={set('enrollment_fee')} inputMode="numeric" placeholder="e.g. 5,000" />
              <small className="field-hint">Paid at booking. Counts towards the plot price.</small></label>
            <label>Allotment amount (₹)<input value={form.allotment_amount} onChange={set('allotment_amount')} inputMode="numeric" placeholder="e.g. 1,00,000" />
              <small className="field-hint">Paid at booking. Counts towards the plot price.</small></label>
            <label>Discount on the balance (%)<input value={form.discount_percent} onChange={set('discount_percent')} inputMode="decimal" placeholder="e.g. 10 (or leave blank)" />
              <small className="field-hint">Taken off the balance for this scheme only. 0 or blank = no discount.</small></label>
            {form.kind === 'OUTRIGHT' && <label>Pay the balance within (days)<input value={form.outright_days} onChange={set('outright_days')} inputMode="numeric" placeholder="e.g. 30" />
              <small className="field-hint">The whole balance is due this many days after booking.</small></label>}
            {form.kind !== 'OUTRIGHT' && <label>Number of monthly EMIs<input value={form.emi_count} onChange={set('emi_count')} inputMode="numeric" placeholder="any number, e.g. 12 or 24" />
              <small className="field-hint">Set this to whatever the scheme needs (1 to 360). One payment a month, starting a month after booking.</small></label>}
            {form.kind === 'EMI_SPECIAL' && (
              <>
                <label>How many special EMIs<input value={form.special_count} onChange={set('special_count')} inputMode="numeric" placeholder="e.g. 10" />
                  <small className="field-hint">How many of the EMIs are bigger "special" ones (not more than the number of EMIs).</small></label>
                <label>Share of the balance paid as special EMIs (%)<input value={form.special_percent} onChange={set('special_percent')} inputMode="decimal" placeholder="e.g. 33" />
                  <small className="field-hint">For example 33 means about one third of the balance is paid through the special EMIs; the rest through the regular ones.</small></label>
                <label className="span-2">Which EMI numbers are special?
                  <input value={form.special_months} onChange={set('special_months')} placeholder={suggested.length ? `e.g. ${suggested.join(', ')}` : 'e.g. 4, 8, 12, 16, 20'} />
                  <small className={`field-hint ${monthsOk ? '' : 'field-warn'}`}>
                    {wantCount && wantTotal
                      ? `You need exactly ${wantCount} different numbers between 1 and ${wantTotal} (you have entered ${enteredMonths.length}).`
                      : 'First fill in the number of EMIs and how many are special — then this tells you how many numbers to enter.'}
                    {suggested.length > 0 && !monthsOk && (
                      <> <button type="button" className="text-button" onClick={() => setForm({ ...form, special_months: suggested.join(', ') })}>Fill in evenly: {suggested.join(', ')}</button></>
                    )}
                  </small>
                </label>
              </>
            )}
            <label className="check-row span-2"><input type="checkbox" checked={form.is_active} onChange={set('is_active')} /> <span>Offer this scheme when booking <small className="field-hint">(untick to hide it from agents without deleting it)</small></span></label>
          </div>

          <div className="plan-preview">
            <h3>Preview <small>(the same calculation the booking will use)</small></h3>
            <div className="form-grid">
              <label>Sample plot
                <select value={sample} onChange={(e) => setSample(e.target.value)}>
                  <option value="">Type a price instead</option>
                  {myPlots.map((p) => <option key={p[9]} value={p[9]}>{p[0]} · {p[2]} sq.ft · ₹{p[10] ?? p[4]}</option>)}
                </select>
              </label>
              {!sample && <label>Plot price (₹)<input value={samplePrice} onChange={(e) => setSamplePrice(e.target.value)} inputMode="numeric" placeholder="e.g. 11,00,000" />
                <small className="field-hint">Only used for this preview. It must be more than enrollment + allotment.</small></label>}
            </div>
            {quoteError && <p className="form-error">To see the preview, {quoteError.charAt(0).toLowerCase() + quoteError.slice(1)}</p>}
            {quote ? <PlanBreakdown quote={quote} /> : !quoteError && <p className="muted-text">Calculating…</p>}
          </div>

          {error && <p className="form-error">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="button button-white" onClick={() => setEditing(null)}>Back</button>
            <button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Saving…' : 'Save scheme'}</button>
          </div>
        </form>
      )}

      {removing && (
        <ConfirmDialog
          title="Delete scheme"
          message={`Delete "${removing.name}"? Bookings already made on it keep their own copy of its terms and schedule.`}
          onConfirm={async () => {
            try { await actions.deletePlan(removing.id); notify(`Scheme ${removing.name} deleted`); await load(); return ''; }
            catch (e) { return e.message; }
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </ModalShell>
  );
}
