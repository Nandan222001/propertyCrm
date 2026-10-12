import React, { useState } from 'react';
import { ModalShell } from '../../components/common/ModalShell';
import { parseAmt } from '../../utils';

/** Edit a booking: payment plan and notes for everyone allowed; the agreed price only for an approver. */
export function EditBookingModal({ booking, canPrice, close, save }) {
  const [form, setForm] = useState({ price: String(parseAmt(booking[5]) || ''), plan: '', notes: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const changes = {};
    if (canPrice && Number(form.price) > 0 && Number(form.price) !== parseAmt(booking[5])) changes.final_price = Number(form.price);
    if (form.plan.trim()) changes.payment_plan = form.plan.trim();
    if (form.notes.trim()) changes.notes = form.notes.trim();
    if (!Object.keys(changes).length) return close();
    setBusy(true);
    const problem = await save(booking, changes);
    setBusy(false);
    if (problem) setError(problem); else close();
  };

  return (
    <ModalShell title={`Edit booking ${booking[0]}`} subtitle={`${booking[1]} · ${booking[2]} · Plot ${booking[3]}`} onClose={close}>
      <form onSubmit={submit} noValidate>
        <div className="form-grid">
          {canPrice && <label>Agreed price (₹)<input value={form.price} onChange={set('price')} inputMode="numeric" /></label>}
          <label>Payment plan<input value={form.plan} onChange={set('plan')} placeholder="e.g. 20:80 — leave empty to keep" /></label>
          <label>Notes<input value={form.notes} onChange={set('notes')} placeholder="Leave empty to keep the existing notes" /></label>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button button-white" onClick={close}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
        </div>
      </form>
    </ModalShell>
  );
}
