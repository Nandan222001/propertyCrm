import React, { useEffect, useState } from 'react';
import { ModalShell } from '../../components/common/ModalShell';
import { api } from '../../api';
import { parseAmt } from '../../utils';

const MODES = ['UPI', 'NEFT', 'RTGS', 'Cheque', 'Cash', 'Card', 'TOKEN_ADVANCE'];
const MODE_LABEL = { TOKEN_ADVANCE: 'Token advance' };
const norm = (v) => (v == null ? '' : String(v));

/**
 * Edit a booking. Every editable field is shown, pre-filled with its current value:
 * agreed price and discount (approvers only), booking date, payment plan, agent, notes and the
 * details of the amount paid at booking. Only fields that changed are sent.
 */
export function EditBookingModal({ booking, canPrice, close, save }) {
  const [original, setOriginal] = useState(null);
  const [form, setForm] = useState(null);
  const [agents, setAgents] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    api.bookings.get(booking[10])
      .then((r) => {
        if (!live) return;
        const b = r.data || r;
        const start = {
          final_price: norm(b.final_price ? Number(b.final_price) : ''),
          discount_amount: norm(Number(b.discount_amount || 0)),
          booking_date: norm(b.booking_date),
          payment_plan: norm(b.payment_plan),
          agent_code: norm(b.agent_code),
          notes: norm(b.notes),
          token_payment_mode: norm(b.token_payment_mode),
          token_payment_paid_to: norm(b.token_payment_paid_to),
          token_payment_reference: norm(b.token_payment_reference),
          token_payment_bank_name: norm(b.token_payment_bank_name),
          token_payment_instrument_date: norm(b.token_payment_instrument_date),
        };
        setOriginal(start); setForm(start);
      })
      .catch((e) => live && setError(e.message || 'Could not load the booking.'));
    api.agents.list({ page_size: 200 }).then((r) => live && setAgents(r.data || [])).catch(() => {});
    return () => { live = false; };
  }, [booking]);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const changes = {};
    for (const key of Object.keys(form)) {
      if (form[key] === original[key]) continue;
      if ((key === 'final_price' || key === 'discount_amount')) {
        if (!canPrice) continue;
        const n = parseAmt(form[key]);
        if (key === 'final_price' && !(n > 0)) return setError('Enter a valid agreed price.');
        changes[key] = n;
      } else if (form[key] !== '' || original[key] !== '') {
        // an emptied field is not sent (the server keeps the existing value)
        if (form[key] !== '') changes[key] = form[key].trim();
      }
    }
    if (!Object.keys(changes).length) return close();
    setBusy(true);
    const problem = await save(booking, changes);
    setBusy(false);
    if (problem) setError(problem); else close();
  };

  const isCheque = form?.token_payment_mode === 'Cheque';

  return (
    <ModalShell title={`Edit booking ${booking[0]}`} subtitle={`${booking[1]} · ${booking[2]} · Plot ${booking[3]}`} onClose={close}>
      {!form ? (
        error ? <p className="form-error">{error}</p> : <p className="empty-note">Loading booking…</p>
      ) : (
        <form onSubmit={submit} noValidate>
          <div className="form-grid">
            <label>Customer<input value={booking[1]} readOnly disabled /></label>
            <label>Project &amp; plot<input value={`${booking[2]} · ${booking[3]}`} readOnly disabled /></label>
            <label>Agreed price (₹){!canPrice && <small className="field-hint"> Only an approver can change this</small>}
              <input value={form.final_price} onChange={set('final_price')} inputMode="numeric" disabled={!canPrice} />
            </label>
            <label>Discount (₹){!canPrice && <small className="field-hint"> Only an approver can change this</small>}
              <input value={form.discount_amount} onChange={set('discount_amount')} inputMode="numeric" disabled={!canPrice} />
            </label>
            <label>Booking date<input type="date" value={form.booking_date} onChange={set('booking_date')} /></label>
            <label>Payment plan<input value={form.payment_plan} onChange={set('payment_plan')} maxLength={80} placeholder="e.g. 20:80" /></label>
            <label>Sales agent
              <select value={form.agent_code} onChange={set('agent_code')} disabled={!canPrice}>
                <option value="">{form.agent_code ? '' : '— none —'}</option>
                {agents.map((a) => <option key={a.id} value={a.code}>{a.name} ({a.code})</option>)}
              </select>
            </label>
            <label>Booking amount paid via
              <select value={form.token_payment_mode} onChange={set('token_payment_mode')}>
                <option value="">—</option>
                {MODES.map((m) => <option key={m} value={m}>{MODE_LABEL[m] || m}</option>)}
              </select>
            </label>
            <label>{isCheque ? 'Cheque number' : 'Transaction details'}
              <input value={form.token_payment_reference} onChange={set('token_payment_reference')} maxLength={80} />
            </label>
            <label>Paid to<input value={form.token_payment_paid_to} onChange={set('token_payment_paid_to')} maxLength={80} /></label>
            {isCheque && <>
              <label>Bank name<input value={form.token_payment_bank_name} onChange={set('token_payment_bank_name')} maxLength={80} /></label>
              <label>Cheque receiving date<input type="date" value={form.token_payment_instrument_date} onChange={set('token_payment_instrument_date')} /></label>
            </>}
            <label style={{ gridColumn: '1 / -1' }}>Notes
              <textarea rows={3} value={form.notes} onChange={set('notes')} maxLength={2000} style={{ width: '100%' }} />
            </label>
          </div>
          {error && <p className="form-error">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="button button-white" onClick={close}>Cancel</button>
            <button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
          </div>
        </form>
      )}
    </ModalShell>
  );
}
